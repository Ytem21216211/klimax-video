import { spawn } from 'child_process';
import { writeFile, mkdir, rm } from 'fs/promises';
import { existsSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { RenderSpec, RenderResult, WorkerConfig, ClipSpec } from '../types.js';
import { buildClipFilterChain, calculateTransitionOffsets, FLASH_COLORS } from './transitions.js';
import { buildAudioFilterChain, detectSilences, remapSpecTimestamps } from './audio.js';
import { generateASSSubtitles, generateGlowLayer, generateKeywordMask, generateIpPopupSubtitles } from './subtitles.js';
import { downloadFile } from '../api.js';
import pLimit from 'p-limit';

export class FFmpegRenderer {
  private config: WorkerConfig;
  private workDir: string = '';
  private readonly GHOST_SIZE = 14556; // The exact size of a Supabase 404 error page

  constructor(config: WorkerConfig) {
    this.config = config;
  }

  async render(spec: RenderSpec, onProgress?: (progress: number) => void): Promise<RenderResult> {
    const startTime = Date.now();
    this.workDir = path.join(this.config.tempDir, uuidv4());
    await mkdir(this.workDir, { recursive: true });

    try {
      console.log(`\n[Worker v3.2] 🚀 STARTING JOB: ${spec.project_id}`);


      let assets = await this.downloadAssets(spec);

      let videoDuration = await this.calculateVideoDuration(spec, assets);

      // --- SILENCE REMOVAL & TIMESTAMP REMAPPING ---
      if (spec.audio.removeSilence && assets.voiceover) {
        console.log(`[Worker] Detect silences in VO...`);
        const silences = await detectSilences(assets.voiceover, this.config.ffmpegPath);
        if (silences.length > 0) {
          console.log(`[Worker] Removing ${silences.length} silence periods. Remapping timestamps...`);
          const totalSilence = silences.reduce((acc, s) => acc + s.duration, 0);
          spec = remapSpecTimestamps(spec, silences);
          videoDuration -= totalSilence;
          console.log(`[Worker] Total silence removed: ${totalSilence.toFixed(2)}s. New duration: ${videoDuration.toFixed(2)}s`);
        }
      }

      console.log(`[Worker] Target video duration: ${videoDuration.toFixed(2)}s`);

      const subtitleFiles = await this.generateSubtitleFiles(spec, videoDuration, assets.customFont);

      // @ts-ignore
      const actualClipDurations = assets.clipDurations || [];
      const { command, outputPath } = await this.buildCommand(spec, assets, subtitleFiles, videoDuration, actualClipDurations);

      console.log(`[Worker] FFmpeg Command: ffmpeg ${command.join(' ')}`);

      await this.executeFFmpeg(command, videoDuration, (time) => {
        const percent = Math.min(98, 70 + (time / videoDuration) * 28);
        if (onProgress) onProgress(Math.round(percent));
      });

      const thumbnailPath = await this.generateThumbnail(outputPath);
      const duration = (Date.now() - startTime) / 1000;
      console.log(`[Worker] ✅ Success! Render took ${duration.toFixed(1)}s`);

      return { success: true, outputPath, thumbnailPath, duration };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`\n[Worker] ❌ FATAL ERROR: ${message}`);
      return { success: false, error: message };
    }
  }

  async cleanup(): Promise<void> {
    if (this.workDir && existsSync(this.workDir)) {
      await rm(this.workDir, { recursive: true, force: true });
    }
  }

  private async calculateVideoDuration(spec: RenderSpec, assets: any): Promise<number> {
    if (assets.voiceover) {
      try {
        const d = await this.getMediaDuration(assets.voiceover);
        if (d > 0) return d;
      } catch (e) { }
    }
    return spec.clips.reduce((acc, c) => acc + c.duration, 0);
  }

  private async hasAudioStream(filePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const args = ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', filePath];
      const proc = spawn(this.config.ffprobePath, args);
      let out = '';
      proc.stdout.on('data', (d) => out += d.toString());
      proc.on('close', (c) => resolve(c === 0 && out.trim().includes('audio')));
      proc.on('error', () => resolve(false));
    });
  }

  private async getMediaDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const args = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath];
      const proc = spawn(this.config.ffprobePath, args);
      let out = '';
      proc.stdout.on('data', d => out += d.toString());
      proc.on('close', c => c === 0 ? resolve(parseFloat(out.trim())) : reject(new Error(`ffprobe failed for ${path.basename(filePath)}`)));
      proc.on('error', reject);
    });
  }

  private validateAsset(filePath: string, label: string): void {
    const size = statSync(filePath).size;
    // Common Supabase error page sizes observed in logs
    const ERROR_SIZES = [this.GHOST_SIZE, 11904, 1895, 14286, 14556];

    if (ERROR_SIZES.includes(size) || size < 20000) {
      const content = readFileSync(filePath, { encoding: 'utf8', flag: 'r' }).slice(0, 1000); // Check first 1KB
      if (
        content.includes('<!DOCTYPE html>') ||
        content.includes('{"code"') ||
        content.includes('AccessDenied') ||
        content.includes('<html') ||
        content.includes('"code":"404"') ||
        content.includes('Object not found')
      ) {
        throw new Error(`CRITICAL: ${label} is a dead link (Supabase error page instead of media). Size: ${size} bytes. Content preview: ${content.substring(0, 50)}`);
      }
    }

    if (size < 100) {
      throw new Error(`CRITICAL: ${label} is empty or too small (${size} bytes).`);
    }
  }

  private async downloadAssets(spec: RenderSpec): Promise<any> {
    const assets: any = { clips: [], sfx: [], hasAudioMap: {} };
    const limit = pLimit(5);

    console.log(`[Worker] Downloading ${spec.clips.length} background clips...`);
    const clipPromises = spec.clips.map((clip, i) => limit(async () => {
      const lp = path.join(this.workDir, `clip_${i}.${this.getExtension(clip.url)}`);
      await writeFile(lp, await downloadFile(clip.url));
      this.validateAsset(lp, `Clip ${i}`);

      let d = 0;
      try { d = await this.getMediaDuration(lp); } catch (e) {
        throw new Error(`CRITICAL: Clip ${i} is not a valid video file (ffprobe failed).`);
      }
      console.log(`[Worker]   - Clip ${i} ready (${d.toFixed(1)}s)`);
      return { path: lp, duration: d };
    }));

    const res = await Promise.all(clipPromises);
    assets.clips = res.map(r => r.path);
    assets.clipDurations = res.map(r => r.duration);

    if (spec.audio.voiceover?.url) {
      assets.voiceover = path.join(this.workDir, 'vo.mp3');
      await writeFile(assets.voiceover, await downloadFile(spec.audio.voiceover.url));
      this.validateAsset(assets.voiceover, 'Voiceover');
      assets.hasAudioMap.voiceover = await this.hasAudioStream(assets.voiceover);
    }

    if (spec.audio.music?.url) {
      assets.music = path.join(this.workDir, 'music.mp3');
      try {
        await writeFile(assets.music, await downloadFile(spec.audio.music.url));
        this.validateAsset(assets.music, 'Music');
        assets.hasAudioMap.music = await this.hasAudioStream(assets.music);
      } catch (e: any) {
        console.warn(`[Worker] Music download failed, skipping: ${e.message}`);
        assets.music = null;
      }
    }

    if (spec.audio.music2?.url) {
      assets.music2 = path.join(this.workDir, 'music2.mp3');
      try {
        await writeFile(assets.music2, await downloadFile(spec.audio.music2.url));
        this.validateAsset(assets.music2, 'Music 2');
        assets.hasAudioMap.music2 = await this.hasAudioStream(assets.music2);
      } catch (e: any) {
        console.warn(`[Worker] Music 2 download failed, skipping: ${e.message}`);
        assets.music2 = null;
      }
    }

    if (spec.audio.sfx) {
      for (let i = 0; i < spec.audio.sfx.length; i++) {
        const lp = path.join(this.workDir, `sfx_${i}.mp3`);
        try {
          await writeFile(lp, await downloadFile(spec.audio.sfx[i].url));
          this.validateAsset(lp, `SFX ${i}`);
          assets.sfx.push(lp);
          assets.hasAudioMap[`sfx${i}`] = await this.hasAudioStream(lp);
        } catch (e: any) {
          console.warn(`[Worker] SFX ${i} failed, skipping: ${e.message}`);
          // Don't push to assets.sfx, so it's skipped in buildCommand
        }
      }
    }

    if (spec.beginningEffect?.enabled && spec.beginningEffect.sfx) {
      assets.beginningSfx = path.join(this.workDir, 'beg_sfx.mp3');
      try {
        await writeFile(assets.beginningSfx, await downloadFile(spec.beginningEffect.sfx));
        this.validateAsset(assets.beginningSfx, 'Beginning SFX');
        assets.hasAudioMap.beginningSfx = await this.hasAudioStream(assets.beginningSfx);
      } catch (e) { }
    }

    if (spec.beginningEffect?.enabled && spec.beginningEffect.image) {
      assets.beginningImage = path.join(this.workDir, 'beg_img.png');
      try {
        await writeFile(assets.beginningImage, await downloadFile(spec.beginningEffect.image));
        this.validateAsset(assets.beginningImage, 'Beg Image');
      } catch (e: any) {
        console.warn(`[Worker] Beginning Image failed, skipping: ${e.message}`);
        assets.beginningImage = null;
      }
    }

    const logoUrl = spec.endScreen?.logo || spec.serverLogoPopups?.[0]?.url;
    if (logoUrl) {
      assets.logo = path.join(this.workDir, 'logo.png');
      try {
        await writeFile(assets.logo, await downloadFile(logoUrl));
        this.validateAsset(assets.logo, 'Logo');
      } catch (e: any) {
        console.warn(`[Worker] Logo failed, skipping: ${e.message}`);
        assets.logo = null;
      }
    }

    if (spec.commentOverlay?.avatar_url) {
      assets.avatar = path.join(this.workDir, 'avatar.png');
      try {
        await writeFile(assets.avatar, await downloadFile(spec.commentOverlay.avatar_url));
        this.validateAsset(assets.avatar, 'Comment Avatar');
      } catch (e: any) {
        console.warn(`[Worker] Avatar download failed: ${e.message}`);
        assets.avatar = null;
      }
    }

    if (spec.ipPopup?.enabled) {
      if (spec.ipPopup.image1?.url) {
        assets.ipPopupImage1 = path.join(this.workDir, 'ip_img1.png');
        try {
          await writeFile(assets.ipPopupImage1, await downloadFile(spec.ipPopup.image1.url));
          this.validateAsset(assets.ipPopupImage1, 'IP Popup Image 1');
        } catch (e: any) {
          console.warn(`[Worker] IP Popup Image 1 download failed: ${e.message}`);
          assets.ipPopupImage1 = null;
        }
      }
      if (spec.ipPopup.image2?.url) {
        assets.ipPopupImage2 = path.join(this.workDir, 'ip_img2.png');
        try {
          await writeFile(assets.ipPopupImage2, await downloadFile(spec.ipPopup.image2.url));
          this.validateAsset(assets.ipPopupImage2, 'IP Popup Image 2');
        } catch (e: any) {
          console.warn(`[Worker] IP Popup Image 2 download failed: ${e.message}`);
          assets.ipPopupImage2 = null;
        }
      }
      if (spec.ipPopup.sfx) {
        assets.ipPopupSfx = path.join(this.workDir, 'ip_sfx.mp3');
        try {
          await writeFile(assets.ipPopupSfx, await downloadFile(spec.ipPopup.sfx));
          this.validateAsset(assets.ipPopupSfx, 'IP Popup SFX');
          assets.hasAudioMap.ipPopupSfx = await this.hasAudioStream(assets.ipPopupSfx);
        } catch (e: any) {
          console.warn(`[Worker] IP Popup SFX download failed: ${e.message}`);
          assets.ipPopupSfx = null;
        }
      }
    }

    await this.downloadCustomFont(spec, assets);
    return assets;
  }

  private async downloadCustomFont(spec: RenderSpec, assets: any) {
    if (spec.subtitles?.settings?.customFontUrl) {
      try {
        let url = spec.subtitles.settings.customFontUrl;
        if (url.startsWith('custom:')) url = url.slice(7);
        const buf = await downloadFile(url);
        if (buf.length > 500) {
          const fontsDir = path.join(this.workDir, 'fonts');
          await mkdir(fontsDir, { recursive: true });
          const fp = path.join(fontsDir, 'font.ttf');
          await writeFile(fp, buf);
          this.validateAsset(fp, 'Custom Font');
          assets.customFont = fp;
        }
      } catch (e: any) {
        console.warn(`[Worker] Custom font download failed, using fallback: ${e.message}`);
        assets.customFont = null;
      }
    }

    if (spec.subtitles?.settings?.keywordFontUrl) {
      try {
        let url = spec.subtitles.settings.keywordFontUrl;
        if (url.startsWith('custom:')) url = url.slice(7);
        const buf = await downloadFile(url);
        if (buf.length > 500) {
          const fontsDir = path.join(this.workDir, 'fonts');
          await mkdir(fontsDir, { recursive: true });
          const fp = path.join(fontsDir, 'keyword_font.ttf');
          await writeFile(fp, buf);
          this.validateAsset(fp, 'Keyword Font');
          assets.keywordFont = fp;
        }
      } catch (e: any) {
        console.warn(`[Worker] Keyword font download failed, using fallback: ${e.message}`);
        assets.keywordFont = null;
      }
    }
  }

  private async generateSubtitleFiles(spec: RenderSpec, videoDuration: number, fontPath?: string): Promise<any> {
    const files: any = {};
    if (spec.subtitles && spec.subtitles.chunks.length > 0) {
      const { width, height } = spec.output;

      // Calculate end screen start time to cap subtitles
      let subtitleCap = videoDuration - 0.1;
      if (spec.endScreen?.enabled) {
        const ed = spec.endScreen.duration || 2;
        subtitleCap = Math.max(0, videoDuration - ed - 0.1);
      }

      const filtered = {
        ...spec.subtitles,
        chunks: spec.subtitles.chunks.map(c => ({
          ...c, end: Math.min(c.end, subtitleCap),
          words: c.words?.map((w: any) => ({ ...w, end: Math.min(w.end, subtitleCap) }))
        }))
      };
      const mc = generateASSSubtitles(filtered, width, height, fontPath);
      const mp = path.join(this.workDir, 'subtitles.ass');
      await writeFile(mp, mc);
      files.main = mp;

      // Generate Keyword ALPHA MASKS for Rainbow Spectral Effect (Body and Glow)
      if (spec.subtitles.settings.visualModeEnabled) {
        // 1. Sharp Body Mask
        const bodyMaskAss = generateKeywordMask(filtered, width, height, fontPath, 'body');
        const bodyMaskPath = path.join(this.workDir, 'subtitles-mask.ass');
        await writeFile(bodyMaskPath, bodyMaskAss);
        files.mask = bodyMaskPath;

        // 2. Volumetric Glow Mask
        if (spec.subtitles.settings.innerGlowEnabled) {
          const glowMaskAss = generateKeywordMask(filtered, width, height, fontPath, 'glow');
          const glowMaskPath = path.join(this.workDir, 'subtitles-glow-mask.ass');
          await writeFile(glowMaskPath, glowMaskAss);
          files.glowMask = glowMaskPath;
        }
      }
    }

    if (spec.ipPopup?.enabled && spec.ipPopup.text) {
      const { width, height } = spec.output;
      const ipAss = generateIpPopupSubtitles(spec.ipPopup, width, height);
      if (ipAss) {
        const ipp = path.join(this.workDir, 'ip_popup.ass');
        await writeFile(ipp, ipAss);
        files.ipPopup = ipp;
      }
    }

    return files;
  }

  private async buildCommand(spec: RenderSpec, assets: any, subtitleFiles: any, videoDuration: number, actualDurations: number[]): Promise<any> {
    const outputPath = path.join(this.workDir, 'output.mp4');
    const { width, height, fps = 30 } = spec.output;
    const args = ['-hide_banner', '-v', 'warning', '-y'];

    // 1. Add background clip inputs
    for (const clipPath of assets.clips) {
      if (clipPath && existsSync(clipPath)) {
        args.push('-i', clipPath);
      }
    }

    const flashColorSetting = spec.subtitles?.settings?.flashColor;
    const globalTransitionType = (spec.subtitles?.settings?.transition || 'none') as any;
    const transitionSuit = spec.subtitles?.settings?.transitionSuit || [];

    const transitions = spec.clips.slice(0, -1).map((c, i) => {
      let type = c.transition?.type || globalTransitionType;

      // Rotate through suit if 'suit' is selected
      if (type === 'suit') {
        const suit = transitionSuit.length > 0
          ? transitionSuit
          : ['whip-pan', 'zoom-punch', 'camera-lens', 'glitch-grid'];
        type = suit[Math.floor(Math.random() * suit.length)];
      }

      let color = c.transition?.color;

      // If color is not explicitly set on the clip, use the global setting for Flash
      if (!color && type === 'flash' && flashColorSetting) {
        if (flashColorSetting === 'random') {
          color = FLASH_COLORS[Math.floor(Math.random() * FLASH_COLORS.length)];
        } else {
          color = flashColorSetting;
        }
      }

      return {
        type,
        duration: type === 'none' ? 0 : (c.transition?.duration || 0.4),
        offset: 0,
        color
      };
    });
    const offsets = calculateTransitionOffsets(spec.clips, transitions.map(t => t.duration), actualDurations);
    transitions.forEach((t, i) => t.offset = offsets[i]);

    const inputIdxMap: any = { sfx: [] };
    let currentInputIdx = assets.clips.length;

    if (assets.voiceover && existsSync(assets.voiceover)) {
      args.push('-i', assets.voiceover);
      inputIdxMap.voiceover = currentInputIdx++;
    }

    if (assets.music && existsSync(assets.music)) {
      args.push('-i', assets.music);
      inputIdxMap.music = currentInputIdx++;
    }

    if (assets.music2 && existsSync(assets.music2)) {
      args.push('-i', assets.music2);
      inputIdxMap.music2 = currentInputIdx++;
    }

    assets.sfx.forEach((s: string) => {
      if (s && existsSync(s)) {
        args.push('-i', s);
        inputIdxMap.sfx.push(currentInputIdx++);
      }
    });

    if (assets.beginningImage && existsSync(assets.beginningImage)) {
      args.push('-loop', '1', '-i', assets.beginningImage);
      inputIdxMap.beginningImage = currentInputIdx++;
    }

    if (assets.beginningSfx && existsSync(assets.beginningSfx)) {
      args.push('-i', assets.beginningSfx);
      inputIdxMap.beginningSfx = currentInputIdx++;
    }

    const hasLogo = !!(spec.endScreen?.logo && assets.logo && existsSync(assets.logo));
    if (hasLogo) {
      inputIdxMap.logo = currentInputIdx++;
      args.push('-i', assets.logo);
    }

    if (assets.avatar && existsSync(assets.avatar)) {
      inputIdxMap.avatar = currentInputIdx++;
      args.push('-i', assets.avatar);
    }

    if (assets.ipPopupImage1 && existsSync(assets.ipPopupImage1)) {
      inputIdxMap.ipPopupImage1 = currentInputIdx++;
      args.push('-loop', '1', '-i', assets.ipPopupImage1);
    }

    if (assets.ipPopupImage2 && existsSync(assets.ipPopupImage2)) {
      inputIdxMap.ipPopupImage2 = currentInputIdx++;
      args.push('-loop', '1', '-i', assets.ipPopupImage2);
    }

    if (assets.ipPopupSfx && existsSync(assets.ipPopupSfx)) {
      inputIdxMap.ipPopupSfx = currentInputIdx++;
      args.push('-i', assets.ipPopupSfx);
    }

    const filterParts: string[] = [];
    filterParts.push(...buildClipFilterChain(spec.clips, transitions, width, height, actualDurations));
    filterParts.push(`[vout]tpad=stop_mode=clone:stop_duration=5,trim=0:${videoDuration},fps=30,settb=1/30,setpts=PTS-STARTPTS[vtrimmed]`);

    let curV = 'vtrimmed';

    if (inputIdxMap.beginningImage !== undefined) {
      const dur = 0.6;
      // --- HARDCODED DEFAULT: White diagonal shine sweep (Premiere Pro "vasko_shine_1" replica) ---
      const begShineD = `(X+Y-(W+H)*(T-0.3))`;
      const begShineS = `max(0,1-sqrt(${begShineD}*${begShineD})/80)`;
      const defaultBegShine = `format=rgba,geq=r='clip(p(X,Y)+255*${begShineS},0,255)':g='clip(p(X,Y)+255*${begShineS},0,255)':b='clip(p(X,Y)+255*${begShineS},0,255)':a='p(X,Y)'`;

      filterParts.push(`[${inputIdxMap.beginningImage}:v]format=yuva420p,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},zoompan=z='max(1.0,min(zoom+0.005,1.5))':d=1:s=${width}x${height}:fps=30,settb=1/30,setpts=PTS-STARTPTS,format=rgba,${defaultBegShine},fade=t=in:st=0:d=0.15:alpha=1,fade=t=out:st=0.15:d=0.4:alpha=1,colorchannelmixer=aa=0.7[vbeg]`);
      filterParts.push(`[${curV}][vbeg]overlay=0:0:enable='between(t,0,${dur})'[vwithbeg]`);
      curV = 'vwithbeg';
    }

    if (spec.endScreen?.enabled) {
      const ed = spec.endScreen.duration || 2;
      const es = Math.max(0, videoDuration - ed);
      const isVertical = spec.endScreen.layout === 'vertical';

      // --- END SCREEN BACKGROUND ---
      // This is much more robust than using complex 'if(between(t...))' which causes FFmpeg Eval errors
      filterParts.push(`[${curV}]split=2[v_orig][v_take]`);
      let endEff = `[v_take]trim=start=${es}:end=${videoDuration},setpts=PTS-STARTPTS,zoompan=z='zoom+0.0005':d=1:s=${width}x${height}:fps=30,settb=1/30,setpts=PTS-STARTPTS+${es}/TB`;

      if (spec.endScreen.blur) {
        filterParts.push(`[v_take]trim=start=${es}:end=${videoDuration},setpts=PTS-STARTPTS,zoompan=z='zoom+0.0005':d=1:s=${width}x${height}:fps=30,settb=1/30,setpts=PTS-STARTPTS+${es}/TB,boxblur=5[v_end_bg_blur]`);
        filterParts.push(`[v_orig][v_end_bg_blur]overlay=0:0:enable='between(t,${es},${videoDuration})'[v_bg_final]`);
      } else {
        filterParts.push(`[v_take]trim=start=${es}:end=${videoDuration},setpts=PTS-STARTPTS,zoompan=z='zoom+0.0005':d=1:s=${width}x${height}:fps=30,settb=1/30,setpts=PTS-STARTPTS+${es}/TB[v_end_bg_no_blur]`);
        filterParts.push(`[v_orig][v_end_bg_no_blur]overlay=0:0:enable='between(t,${es},${videoDuration})'[v_bg_final]`);
      }
      curV = 'v_bg_final';


      if (hasLogo || spec.endScreen.ipText) {
        const ls = spec.endScreen.logoScale || 0.35;
        const lw = Math.floor(width * ls / 2) * 2;
        const lh = Math.floor((lw * height) / width / 2) * 2;

        const ips = spec.endScreen.ipSettings || {} as any;
        const fontSize = Math.round((ips.fontSize || 6) * 11);
        const charWidth = fontSize * 0.62; 
        const textW = spec.endScreen.ipText ? (spec.endScreen.ipText.length * charWidth) : 0;
        const gap = Math.round(width * 0.005); // Tighter gap
        const boxPadding = Math.round(width * 0.012); // Tighter padding

        // AUTO-SCALE: If the assembly is too wide (>85% of screen), scale it down
        let finalLw = lw;
        let finalLh = lh;
        let finalFontSize = fontSize;
        let finalGap = gap;
        const maxW = width * 0.85;
        const rawTotalW = isVertical ? Math.max(lw, textW) : (hasLogo ? lw + gap : 0) + textW;

        if (rawTotalW > maxW) {
          const ratio = maxW / rawTotalW;
          finalLw = Math.floor(lw * ratio / 2) * 2;
          finalLh = Math.floor(lh * ratio / 2) * 2;
          finalFontSize = Math.floor(fontSize * ratio);
          finalGap = Math.floor(gap * ratio);
        }

        const finalTextW = spec.endScreen.ipText ? (spec.endScreen.ipText.length * (finalFontSize * 0.62)) : 0;
        const finalTotalW = (hasLogo ? finalLw + finalGap : 0) + finalTextW;

        // Positioning the Scaled Unit
        let lx, ly, tx, ty, boxX, boxY, boxW, boxH;

        if (isVertical) {
          const textH = finalFontSize;
          const totalH = (hasLogo ? finalLh : 0) + (spec.endScreen.ipText ? (finalGap + textH) : 0);
          
          const textContainerW = finalTextW + boxPadding * 2;
          const textContainerH = textH + boxPadding * 2;
          
          boxW = textContainerW;
          boxH = textContainerH;
          boxX = (width - boxW) / 2;
          
          const overallY = (height - totalH) / 2;
          
          lx = (width - finalLw) / 2;
          ly = overallY;

          boxW = finalTextW + boxPadding * 2;
          boxH = textH + boxPadding * 2;
          boxX = (width - boxW) / 2;
          boxY = ly + (hasLogo ? finalLh + finalGap : 0);
          
          tx = (width - finalTextW) / 2;
          ty = boxY + boxPadding + (textH / 2);
        } else {
          const textContainerW = finalTextW + boxPadding * 2;
          const textContainerH = finalFontSize + boxPadding * 2;
          const overallW = (hasLogo ? finalLw + finalGap : 0) + textContainerW;
          
          boxW = textContainerW;
          boxH = textContainerH;
          boxX = (width - overallW) / 2 + (hasLogo ? finalLw + finalGap : 0);
          boxY = (height - boxH) / 2;

          lx = (width - overallW) / 2;
          ly = boxY + (boxH - finalLh) / 2;
          tx = boxX + boxPadding;
          ty = boxY + boxH / 2;
        }

        // 1. Draw the Container Box (Opacity 0.4 as requested)
        filterParts.push(`[${curV}]drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=black@0.4:t=fill:enable='between(t,${es},${videoDuration})'[v_with_box]`);
        curV = 'v_with_box';

        if (inputIdxMap.logo !== undefined) {
          // ANIMATION: Scale-down pop (120% -> 100%) + fade-in over 0.7s with ease-out
          const animDur = 0.7; // animation duration in seconds
          const overscale = 1.2; // start at 120% of final size
          const totalFrames = Math.round(animDur * 30);
          const logoZoomExpr = `if(lte(on,1),${overscale},${overscale}-(${overscale}-1)*min(1,on/${totalFrames})*min(1,on/${totalFrames})*(3-2*min(1,on/${totalFrames})))`;

          // --- HARDCODED DEFAULT: White diagonal shine sweep (Premiere Pro "vasko_shine_1" replica) ---
          // 225° directional light, 45px feather, 100% intensity, animated mask sweep
          const endShineD = `(X+Y-(W+H)*(T-0.5))`;
          const endShineS = `max(0,1-sqrt(${endShineD}*${endShineD})/80)`;
          const defaultEndShine = `format=rgba,geq=r='clip(p(X,Y)+255*${endShineS},0,255)':g='clip(p(X,Y)+255*${endShineS},0,255)':b='clip(p(X,Y)+255*${endShineS},0,255)':a='p(X,Y)'`;

          // Optional additional effects from AI Effects panel (on top of the default shine)
          const effects = spec.effects || { flash_enabled: false, flash_color: '#ffffff', flash_rainbow: false };
          let logoEffectFilter = '';

          if (effects.flash_rainbow) {
            // --- RAINBOW SPECTRAL LOGO SHINE (Safe Built-in Functions) ---
            const rExpr = `'255*clip(sqrt(((X/W)*6-3)*((X/W)*6-3))-1,0,1)'`;
            const gExpr = `'255*clip(2-sqrt(((X/W)*6-2)*((X/W)*6-2)),0,1)'`;
            const bExpr = `'255*clip(2-sqrt(((X/W)*6-4)*((X/W)*6-4)),0,1)'`;
            const opExpr = `'max(0,1-sqrt((t-1)*(t-1)))'`;
            logoEffectFilter = `split=2[le_orig][le_rainbow_src];[le_rainbow_src]geq=r=${rExpr}:g=${gExpr}:b=${bExpr}[le_rainbow];[le_rainbow][le_orig]alphamerge[le_rainbow_logo];[le_orig][le_rainbow_logo]overlay=0:0:opacity=${opExpr}`;
          } else if (effects.flash_enabled) {
            const fc = effects.flash_color.replace('#', '');
            const fr = parseInt(fc.substring(0, 2), 16) || 255;
            const fg = parseInt(fc.substring(2, 4), 16) || 255;
            const fb = parseInt(fc.substring(4, 6), 16) || 255;
            const d2 = `(X+Y-(W+H)*(T-0.8))`;
            const s2 = `max(0,1-sqrt(${d2}*${d2})/80)`;
            logoEffectFilter = `format=rgba,geq=r='clip(p(X,Y)+${fr}*${s2},0,255)':g='clip(p(X,Y)+${fg}*${s2},0,255)':b='clip(p(X,Y)+${fb}*${s2},0,255)':a='p(X,Y)'`;
          }

          // Build the logo filter chain: always includes the default shine sweep
          const allEndLogoFilters = logoEffectFilter
            ? `${defaultEndShine},${logoEffectFilter}`
            : defaultEndShine;

          filterParts.push(`[${inputIdxMap.logo}:v]loop=loop=-1:size=1,scale=${finalLw}:${finalLh}:force_original_aspect_ratio=decrease,pad=${finalLw}:${finalLh}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba,zoompan=z='${logoZoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${ed * 30}:s=${finalLw}x${finalLh}:fps=30,settb=1/30,format=rgba,fade=t=in:st=0:d=${animDur}:alpha=1,${allEndLogoFilters},setpts=PTS-STARTPTS+${es}/TB[elogo]`);
          filterParts.push(`[${curV}][elogo]overlay=x=${lx}:y=${ly}:enable='between(t,${es},${videoDuration})'[vlogo]`);
          curV = 'vlogo';
        }

        if (spec.endScreen.ipText) {
          const fontColor = ips.textColor?.replace('#', '') || 'FFFFFF';
          const fontPath = assets.customFont ? assets.customFont.replace(/\\/g, '/').replace(/:/g, '\\\\:') : 'Arial';

          // ANIMATION: Slide-up (40px) + fade-in over 0.7s with ease-out cubic
          const textAnimDur = 0.7;
          const slideDistance = 40;
          const tRatio = `min(t/${textAnimDur},1)`;
          const yExpr = `${ty}-th/2+${slideDistance}*pow(1-${tRatio}\\,3)`;
          const alphaExpr = `1-pow(1-${tRatio}\\,3)`;

          if (spec.endScreen.rainbowEnabled) {
            // --- RAINBOW SPECTRAL END SCREEN TEXT ---
            // 1. Render the text on a transparent layer
            filterParts.push(`color=c=black@0:s=${width}x${height}:d=${videoDuration},drawtext=text='${spec.endScreen.ipText.replace(/'/g, "'\\\\''")}':fontfile='${fontPath}':fontsize=${finalFontSize}:fontcolor=white:x=${tx}:y=${ty}-th/2:alpha='${alphaExpr}',format=rgba,setpts=PTS-STARTPTS+${es}/TB[es_text_white_raw]`);

            // 2. Generate Rainbow and Alpha Merge
            filterParts.push(`color=c=black:s=${width}x${height}:d=${videoDuration},format=rgb24,geq=r='255*( 0 > (sqrt(( (X/W)*6-3 )*( (X/W)*6-3 ))-1) ? 0 : (sqrt(( (X/W)*6-3 )*( (X/W)*6-3 ))-1 < 1 ? sqrt(( (X/W)*6-3 )*( (X/W)*6-3 ))-1 : 1) )' : g='255*( 0 > (2-sqrt(( (X/W)*6-2 )*( (X/W)*6-2 ))) ? 0 : (2-sqrt(( (X/W)*6-2 )*( (X/W)*6-2 )) < 1 ? 2-sqrt(( (X/W)*6-2 )*( (X/W)*6-2 )) : 1) )' : b='255*( 0 > (2-sqrt(( (X/W)*6-4 )*( (X/W)*6-4 ))) ? 0 : (2-sqrt(( (X/W)*6-4 )*( (X/W)*6-4 )) < 1 ? 2-sqrt(( (X/W)*6-4 )*( (X/W)*6-4 )) : 1) )' : a=255[es_rainbow_src_raw]`);

            // SPLIT: Must split streams consumed more than once
            filterParts.push(`[es_text_white_raw]split=2[es_text_body_src][es_text_glow_src]`);
            filterParts.push(`[es_rainbow_src_raw]split=2[es_rainbow_body_src][es_rainbow_glow_src]`);

            // Mask must be generated for the end screen text (simplified sharp mask)
            filterParts.push(`[es_text_body_src]format=gray,geq=lum='if(gt(lum(X,Y),20),255,0)'[es_mask_body]`);
            filterParts.push(`[es_rainbow_body_src][es_mask_body]alphamerge[es_rainbow_text]`);

            // Add Inner Glow for End Screen
            filterParts.push(`[es_text_glow_src]boxblur=10,geq=lum='lum(X,Y)*1.5'[es_mask_glow]`);
            filterParts.push(`[es_rainbow_glow_src][es_mask_glow]alphamerge[es_rainbow_glow]`);

            filterParts.push(`[${curV}][es_rainbow_glow]overlay=0:0:enable='between(t,${es},${videoDuration})'[v_with_es_glow]`);
            filterParts.push(`[v_with_es_glow][es_rainbow_text]overlay=0:0:enable='between(t,${es},${videoDuration})'[v_with_es_rainbow]`);
            curV = 'v_with_es_rainbow';
          } else {
            // Standard centered text
            filterParts.push(`color=c=black@0:s=${width}x${height},drawtext=text='${spec.endScreen.ipText.replace(/'/g, "'\\\\''")}':fontfile='${fontPath}':fontsize=${finalFontSize}:fontcolor='${fontColor}':x=${tx}:y='${yExpr}':alpha='${alphaExpr}',format=rgba,setpts=PTS-STARTPTS+${es}/TB[etext]`);
            filterParts.push(`[${curV}][etext]overlay=x=0:y=0:enable='between(t,${es},${videoDuration})'[vtext]`);
            curV = 'vtext';
          }
        }
      }
    }

    // 3.5 Subtitles (Burned in BEFORE logos so logos physically cover them)
    if (subtitleFiles.main) {
      const fontsDir = path.join(this.workDir, 'fonts').replace(/\\/g, '/').replace(/:/g, '\\\\:');
      const subPath = subtitleFiles.main.replace(/\\/g, '/').replace(/:/g, '\\:');

      if (subtitleFiles.mask) {
        const maskPath = subtitleFiles.mask.replace(/\\/g, '/').replace(/:/g, '\\:');
        // RAINBOW SPECTRAL PIPELINE (Ultra-Vivid Dual-Layer Composite)
        // 1. Render base subtitles (Sharp foundation)
        filterParts.push(`[${curV}]subtitles='${subPath}':fontsdir='${fontsDir}'[v_subbed]`);

        // 2. Ultra-Vivid Rainbow Spectrum Generator (High-Saturation Linear RGB)
        // Uses a precise hue-to-rgb segment formula for vibrant greens, yellows, and oranges.
        filterParts.push(`color=c=black:s=${width}x${height}:d=${videoDuration},format=rgb24,geq=r='255*clip(abs((X/W)*6-3)-1,0,1)':g='255*clip(2-abs((X/W)*6-2),0,1)':b='255*clip(2-abs((X/W)*6-4),0,1)':a=255[v_rainbow_src]`);

        // 3. Dual Mask Generation (Body & Volumetric Glow)
        filterParts.push(`color=c=black:s=${width}x${height}:d=${videoDuration},subtitles='${maskPath}':fontsdir='${fontsDir}',format=gray,geq=lum='if(gt(lum(X,Y),20),255,0)'[v_mask_body]`);

        if (subtitleFiles.glowMask) {
          const glowMaskPath = subtitleFiles.glowMask.replace(/\\/g, '/').replace(/:/g, '\\:');
          filterParts.push(`color=c=black:s=${width}x${height}:d=${videoDuration},subtitles='${glowMaskPath}':fontsdir='${fontsDir}',format=gray,geq=lum='max(0,(lum(X,Y)-16)*255/(235-16))'[v_mask_glow]`);

          // SPLIT: We must clone the rainbow stream to consume it twice (once for glow, once for body)
          filterParts.push(`[v_rainbow_src]split=2[vr_glow_src][vr_body_src]`);

          // Overlay Glow first, then Body
          filterParts.push(`[vr_glow_src][v_mask_glow]alphamerge[v_rainbow_glow]`);
          filterParts.push(`[vr_body_src][v_mask_body]alphamerge[v_rainbow_body]`);
          filterParts.push(`[v_subbed][v_rainbow_glow]overlay=x=0:y=0:enable='between(t,0,${videoDuration})'[v_with_glow]`);
          filterParts.push(`[v_with_glow][v_rainbow_body]overlay=x=0:y=0:enable='between(t,0,${videoDuration})'[vs]`);
        } else {
          filterParts.push(`[v_rainbow_src][v_mask_body]alphamerge[v_rainbow_body]`);
          filterParts.push(`[v_subbed][v_rainbow_body]overlay=x=0:y=0:enable='between(t,0,${videoDuration})'[vs]`);
        }
      } else {
        filterParts.push(`[${curV}]subtitles='${subPath}':fontsdir='${fontsDir}'[vs]`);
      }
      curV = 'vs';
    }

    // 3.6 IP Popup Overlay (Physical overlays + dynamic ASS)
    if (spec.ipPopup?.enabled) {
      const ip = spec.ipPopup;
      const ips = ip.start;
      const ipd = ip.duration;
      const fadeDur = 0.5;

      // 1. Render IP Popup Images
      if (inputIdxMap.ipPopupImage1 !== undefined && assets.ipPopupImage1) {
        const img = ip.image1!;
        const iw = Math.floor(width * (img.scale / 100));
        const ih = -1; // Auto height
        const ix = Math.floor((img.x / 100) * width);
        const iy = Math.floor((img.y / 100) * height);
        const opacity = img.opacity ?? 1;

        filterParts.push(`[${inputIdxMap.ipPopupImage1}:v]scale=${iw}:${ih},format=rgba,fade=t=in:st=0:d=${fadeDur}:alpha=1,fade=t=out:st=${ipd - fadeDur}:d=${fadeDur}:alpha=1,colorchannelmixer=aa=${opacity},setpts=PTS-STARTPTS+${ips}/TB[ipimg1]`);
        filterParts.push(`[${curV}][ipimg1]overlay=x=${ix}:y=${iy}:enable='between(t,${ips},${ips + ipd})'[vip1]`);
        curV = 'vip1';
      }

      if (inputIdxMap.ipPopupImage2 !== undefined && assets.ipPopupImage2) {
        const img = ip.image2!;
        const iw = Math.floor(width * (img.scale / 100));
        const ih = -1;
        const ix = Math.floor((img.x / 100) * width);
        const iy = Math.floor((img.y / 100) * height);
        const opacity = img.opacity ?? 1;

        filterParts.push(`[${inputIdxMap.ipPopupImage2}:v]scale=${iw}:${ih},format=rgba,fade=t=in:st=0:d=${fadeDur}:alpha=1,fade=t=out:st=${ipd - fadeDur}:d=${fadeDur}:alpha=1,colorchannelmixer=aa=${opacity},setpts=PTS-STARTPTS+${ips}/TB[ipimg2]`);
        filterParts.push(`[${curV}][ipimg2]overlay=x=${ix}:y=${iy}:enable='between(t,${ips},${ips + ipd})'[vip2]`);
        curV = 'vip2';
      }

      // 2. Burn IP Popup Subtitles (Text)
      if (subtitleFiles.ipPopup) {
        const ipPath = subtitleFiles.ipPopup.replace(/\\/g, '/').replace(/:/g, '\\:');
        filterParts.push(`[${curV}]subtitles='${ipPath}'[v_ip_text]`);
        curV = 'v_ip_text';
      }
    }

    // 4. Logo Recognition Popups
    // Automatically overlay the server logo when the name is spoken
    if (spec.serverLogoPopups && spec.serverLogoPopups.length > 0 && inputIdxMap.logo !== undefined) {
      const effects = spec.effects || { flash_enabled: false, flash_color: '#ffffff', flash_rainbow: false };
      const ratio = 0.50;

      for (let i = 0; i < spec.serverLogoPopups.length; i++) {
        const popup = spec.serverLogoPopups[i];
        const ps = popup.start;
        const pd = popup.duration;

        // Size: 45% of width for a strong branding moment
        const lw = Math.floor(width * 0.45 / 2) * 2;
        const lh = Math.floor((lw * height) / width / 2) * 2;

        const lx = Math.round((width - lw) / 2);
        const ly = Math.round(height * ratio - (lh / 2));

        const fadeDur = 0.25;
        const zoomFrames = Math.ceil(pd * fps);
        const label = `rlogo${i}`;

        // --- HARDCODED DEFAULT: White diagonal shine sweep (Premiere Pro "vasko_shine_1" replica) ---
        // 225° directional light, feathered, animated mask sweep
        const popupShineD = `(X+Y-(W+H)*(T-0.12))`;
        const popupShineS = `max(0,1-sqrt(${popupShineD}*${popupShineD})/80)`;
        const defaultPopupShine = `format=rgba,geq=r='clip(p(X,Y)+255*${popupShineS},0,255)':g='clip(p(X,Y)+255*${popupShineS},0,255)':b='clip(p(X,Y)+255*${popupShineS},0,255)':a='p(X,Y)'`;

        // Optional additional effects from AI Effects panel
        let effectFilter = '';
        if (effects.flash_rainbow) {
          // --- RAINBOW SPECTRAL LOGO SHINE (Safe Built-in Functions) ---
          const rExpr = `'255*clip(sqrt(((X/W)*6-3)*((X/W)*6-3))-1,0,1)'`;
          const gExpr = `'255*clip(2-sqrt(((X/W)*6-2)*((X/W)*6-2)),0,1)'`;
          const bExpr = `'255*clip(2-sqrt(((X/W)*6-4)*((X/W)*6-4)),0,1)'`;
          const opExpr = `'max(0,1-sqrt((t-(${ps + pd / 2}))*(t-(${ps + pd / 2})))/(${pd / 2}))'`;
          effectFilter = `split=2[l_orig][l_rainbow_src];[l_rainbow_src]geq=r=${rExpr}:g=${gExpr}:b=${bExpr}[l_rainbow];[l_rainbow][l_orig]alphamerge[l_rainbow_logo];[l_orig][l_rainbow_logo]overlay=0:0:opacity=${opExpr}`;
        } else if (effects.flash_enabled) {
          const fc = effects.flash_color.replace('#', '');
          const fr = parseInt(fc.substring(0, 2), 16) || 255;
          const fg = parseInt(fc.substring(2, 4), 16) || 255;
          const fb = parseInt(fc.substring(4, 6), 16) || 255;
          const d2 = `(X+Y-(W+H)*(T-0.25))`;
          const s2 = `max(0,1-sqrt(${d2}*${d2})/80)`;
          effectFilter = `format=rgba,geq=r='clip(p(X,Y)+${fr}*${s2},0,255)':g='clip(p(X,Y)+${fg}*${s2},0,255)':b='clip(p(X,Y)+${fb}*${s2},0,255)':a='p(X,Y)'`;
        }

        // Build popup filter chain: always includes the default shine sweep
        const allPopupFilters = effectFilter
          ? `${defaultPopupShine},${effectFilter}`
          : defaultPopupShine;

        filterParts.push(`[${inputIdxMap.logo}:v]loop=loop=-1:size=${zoomFrames},scale=${lw * 2}:${lh * 2}:force_original_aspect_ratio=decrease,pad=${lw * 2}:${lh * 2}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba,zoompan=z='1.0+0.2*on/${zoomFrames}':d=1:fps=${fps}:s=${lw}x${lh}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)',settb=1/${fps},fade=t=in:st=0:d=${fadeDur}:alpha=1,${allPopupFilters},setpts=PTS-STARTPTS+${ps}/TB[${label}]`);
        filterParts.push(`[${curV}][${label}]overlay=x=${lx}:y=${ly}:enable='between(t,${ps},${ps + pd})'[vrl${i}]`);
        curV = `vrl${i}`;
      }
    }

    // 5. TikTok Style Comment Overlay (Redesigned)
    if (spec.commentOverlay) {
      const co = spec.commentOverlay;
      const cs = co.start_time;
      const cd = co.duration;
      const fadeDur = 0.4;

      // --- LAYOUT & TYPOGRAPHY ---
      const boxW = Math.floor(width * 0.88);
      const padding = Math.floor(width * 0.035);
      const avatarSize = Math.floor(width * 0.11);
      const nameSize = Math.round(width * 0.032);
      const contentSize = Math.round(width * 0.042);
      const lineSpacing = 1.25;

      const fontPath = assets.customFont ? assets.customFont.replace(/\\/g, '/').replace(/:/g, '\\\\:') : 'Arial';

      // Heuristic text wrapping for vertical expansion
      const wrapText = (text: string, maxChars: number) => {
        const words = text.split(/\s+/);
        let lines = [];
        let currentLine = '';
        words.forEach(word => {
          if ((currentLine + word).length > maxChars) {
            if (currentLine) lines.push(currentLine.trim());
            currentLine = word + ' ';
          } else {
            currentLine += word + ' ';
          }
        });
        if (currentLine) lines.push(currentLine.trim());
        return lines;
      };

      const contentRaw = co.content || '';
      const wrappedLines = wrapText(contentRaw, Math.floor(width / (contentSize * 0.55)));
      const lineCount = wrappedLines.length;

      const nameY = padding * 1.1;
      const contentStartY = nameY + nameSize + (padding * 0.4);
      const boxH = Math.max(avatarSize + padding * 2, contentStartY + (lineCount * contentSize * lineSpacing) + padding);

      const boxX = Math.floor((width - boxW) / 2);
      const boxY = Math.floor(height * 0.12);

      // Escape text for FFmpeg
      const headerText = `Reply to ${(co.name || 'User')}'s comment`.replace(/'/g, "'\\\\'").replace(/:/g, '\\:');

      // --- 1. Prepare Base Bubble (White Rounded Box with Tail) ---
      const radius = 24;
      const tailSize = 18;
      // White box with alpha mask for rounded corners AND the speech bubble tail
      // NOTE: lum='p(X,Y)' is mandatory in geq filter to pass through the color while modifying alpha
      let bubbleChain = `color=c=white:s=${boxW}x${boxH + tailSize}:d=${cd},format=rgba,geq=lum='p(X,Y)':a='`;
      bubbleChain += `if(lte(Y,${boxH}),`; // Inside main bubble box
      bubbleChain += `if(lte(X,${radius})*lte(Y,${radius}), if(gt(sqrt((${radius}-X)*(${radius}-X)+(${radius}-Y)*(${radius}-Y)),${radius}),0,255),`; // TL
      bubbleChain += `if(gte(X,${boxW}-${radius})*lte(Y,${radius}), if(gt(sqrt((X-(${boxW}-${radius}))*(X-(${boxW}-${radius}))+(${radius}-Y)*(${radius}-Y)),${radius}),0,255),`; // TR
      bubbleChain += `if(gte(X,${boxW}-${radius})*gte(Y,${boxH}-${radius}), if(gt(sqrt((X-(${boxW}-${radius}))*(X-(${boxW}-${radius}))+(Y-(${boxH}-${radius}))*(Y-(${boxH}-${radius}))),${radius}),0,255),`; // BR
      bubbleChain += `if(lte(X,${radius})*gte(Y,${boxH}-${radius}), if(gt(sqrt((${radius}-X)*(${radius}-X)+(Y-(${boxH}-${radius}))*(Y-(${boxH}-${radius}))),${radius}),0,255),`; // BL
      bubbleChain += `255))))`; // Mid
      bubbleChain += `,if(lte(X,${radius * 1.5})*lte(Y,${boxH + tailSize})*gte(X, ${radius * 1.5}-(Y-${boxH})*0.8), 255, 0))`; // The tail triangle
      bubbleChain += `'[bubble_base];`;

      // --- 2. Add Header ("Reply to...") ---
      bubbleChain += `[bubble_base]drawtext=text='${headerText}':fontfile='${fontPath}':fontsize=${nameSize}:fontcolor='#737373':x=${avatarSize + padding * 1.5}:y=${nameY}[bubble_h];`;

      // --- 3. Add Message Body (Wrapped Lines) ---
      let lastTag = 'bubble_h';
      wrappedLines.forEach((line, i) => {
        const escapedLine = line.replace(/'/g, "'\\\\'").replace(/:/g, '\\:');
        const nextTag = `bubble_l${i}`;
        bubbleChain += `[${lastTag}]drawtext=text='${escapedLine}':fontfile='${fontPath}':fontsize=${contentSize}:fontcolor=black:x=${avatarSize + padding * 1.5}:y=${contentStartY + i * contentSize * lineSpacing}[${nextTag}];`;
        lastTag = nextTag;
      });

      // --- 4. Add Avatar (Circular or Gray Persona) ---
      const avX = padding;
      const avY = padding; // Centered vertically in a better way would be (boxH-avatarSize)/2 but padding is fine
      if (inputIdxMap.avatar !== undefined) {
        bubbleChain += `[${inputIdxMap.avatar}:v]scale=${avatarSize}:${avatarSize}:force_original_aspect_ratio=increase,crop=${avatarSize}:${avatarSize},format=rgba,geq=lum='lum(X,Y)':a='lt(sqrt(pow(X-${avatarSize / 2},2)+pow(Y-${avatarSize / 2},2)),${avatarSize / 2})*255'[av_round];`;
        bubbleChain += `[${lastTag}][av_round]overlay=x=${avX}:y=${avY}[bubble_av];`;
      } else {
        // --- TikTok Default "Gray Persona" (Procedural) ---
        const avR = avatarSize / 2;
        const hC = avR * 0.78; // head center y
        const hR = avR * 0.32; // head radius
        const bC = avR * 1.75; // body center y
        const bR = avR * 0.65; // body radius

        bubbleChain += `color=s=${avatarSize}x${avatarSize}:d=${cd},format=rgba,geq=` +
          `r='if(lt(sqrt((X-${avR})*(X-${avR})+(Y-${avR})*(Y-${avR})),${avR}),if(lt(sqrt((X-${avR})*(X-${avR})+(Y-${hC})*(Y-${hC})),${hR})+lt(sqrt((X-${avR})*(X-${avR})+(Y-${bC})*(Y-${bC})),${bR}),255,226),0)':` +
          `g='if(lt(sqrt((X-${avR})*(X-${avR})+(Y-${avR})*(Y-${avR})),${avR}),if(lt(sqrt((X-${avR})*(X-${avR})+(Y-${hC})*(Y-${hC})),${hR})+lt(sqrt((X-${avR})*(X-${avR})+(Y-${bC})*(Y-${bC})),${bR}),255,226),0)':` +
          `b='if(lt(sqrt((X-${avR})*(X-${avR})+(Y-${avR})*(Y-${avR})),${avR}),if(lt(sqrt((X-${avR})*(X-${avR})+(Y-${hC})*(Y-${hC})),${hR})+lt(sqrt((X-${avR})*(X-${avR})+(Y-${bC})*(Y-${bC})),${bR}),255,226),0)':` +
          `a='if(lt(sqrt((X-${avR})*(X-${avR})+(Y-${avR})*(Y-${avR})),${avR}),255,0)'[av_persona];`;
        bubbleChain += `[${lastTag}][av_persona]overlay=x=${avX}:y=${avY}[bubble_av];`;
      }

      // --- 5. Final Assembly with Animation ---
      bubbleChain += `[bubble_av]format=rgba,fade=t=in:st=0:d=${fadeDur}:alpha=1,fade=t=out:st=${cd - fadeDur}:d=${fadeDur}:alpha=1,setpts=PTS-STARTPTS+${cs}/TB[c_final]`;

      filterParts.push(bubbleChain);
      filterParts.push(`[${curV}][c_final]overlay=x=${boxX}:y=${boxY}:eof_action=pass[vcomment]`);
      curV = 'vcomment';
    }

    filterParts.push(...buildAudioFilterChain(spec.audio, videoDuration, inputIdxMap, spec.ipPopup, assets.hasAudioMap, spec));

    args.push('-filter_complex', filterParts.join(';'), '-map', `[${curV}]`, '-map', '[aout]', '-t', String(videoDuration));
    if (this.config.useNvenc) args.push('-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '23');
    else args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23');
    args.push('-c:a', 'aac', '-b:a', '192k', '-pix_fmt', 'yuv420p', '-s', `${width}x${height}`, outputPath);

    return { command: args, outputPath };
  }

  private executeFFmpeg(args: string[], totalDur: number, onProgress: (t: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.ffmpegPath, args);
      let stderr = '';
      proc.stderr.on('data', (d) => {
        const line = d.toString();
        stderr += line;
        const match = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (match) onProgress(parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]));
      });
      proc.on('close', (c) => {
        if (c === 0) return resolve();

        // SMART LOG SCAN: Find the actual error line that caused the crash
        const lines = stderr.split('\n');
        const errorLines = lines.filter(l =>
          l.toLowerCase().includes('error') ||
          l.toLowerCase().includes('invalid') ||
          l.toLowerCase().includes('failed') ||
          l.toLowerCase().includes('matches no streams') ||
          l.toLowerCase().includes('not found')
        );

        // Capture Head/Tail but prioritize filtered Error Lines
        const head = stderr.slice(0, 1500);
        const tail = stderr.slice(-1000);

        let diagnostic = errorLines.length > 0
          ? `\n[SPECIFIC ERRORS DETECTED]:\n${errorLines.slice(0, 5).join('\n')}\n`
          : '';

        const errMsg = stderr.length > 2500
          ? `${head}\n...[truncated]...\n${diagnostic}\n...[truncated]...\n${tail}`
          : stderr + diagnostic;

        reject(new Error(`FFmpeg exited with code ${c}: ${errMsg}`));
      });
    });
  }

  private async generateThumbnail(v: string): Promise<string> {
    const p = path.join(this.workDir, 'thumbnail.jpg');
    return new Promise((resolve) => {
      const proc = spawn(this.config.ffmpegPath, ['-i', v, '-ss', '1', '-vframes', '1', '-y', p]);
      proc.on('close', (c) => resolve(c === 0 ? p : ''));
      proc.on('error', () => resolve(''));
    });
  }

  private getExtension(url: string): string {
    return url.match(/\.(\w+)(?:\?|$)/)?.[1] || 'mp4';
  }
}
