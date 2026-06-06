import type { TransitionType, TransitionSpec } from '../types.js';

export const FLASH_COLORS = [
  "#FF3B3E", // Light Red
  "#FBE73D", // Bright Yellow
  "#6DD7FF", // Sky Blue
  "#DB9E61", // Light Brown / Caramel
  "#42FF30", // Neon Green
  "#DE77FD", // Light Purple
  "#F0AE69", // Peach / Light Orange
  "#F7203F", // Dark Pinkish Red
  "#307EEE", // Royal Blue
  "#F71A4F", // Pinkish Red
  "#70A8CB", // Steel Blue / Blue Gray
  "#F25055", // Warm Red
];

export function getXfadeTransition(type: TransitionType): string {
  const mapping: Record<TransitionType, string> = {
    'none': 'fade', // No xfade needed actually, but 'fade' with 0s duration is fine if possible
    'whip-pan': 'smoothright',
    'zoom-punch': 'fadeblack',
    'glitch-grid': 'pixelize',
    'luma-wipe': 'distance',
    'radial-blur': 'radial',
    'wipe-left': 'wipeleft',
    'wipe-right': 'wiperight',
    'camera-lens': 'circleopen',
    'swipe-up': 'wipeup',
    'swipe-down': 'wipedown',
    'lens-flare': 'dissolve',
    'pixel-glitch': 'pixelize',
    'circle-crop': 'circleopen',
    'radial-zoom': 'radial',
    'swoosh': 'smoothright',
    'woosh': 'zoomin',
    'flash': 'fade',
    'suit': 'fade',
  };

  return mapping[type] || 'fade';
}

export function buildXfadeFilter(
  input1: string,
  input2: string,
  output: string,
  transitionType: TransitionType,
  duration: number,
  offset: number,
  color?: string
): string {
  let xfadeType = getXfadeTransition(transitionType);
  let colorParam = '';

  if (transitionType === 'flash') {
    xfadeType = 'fade';
  }

  // Round to 3 decimal places for stability
  return `[${input1}][${input2}]xfade=transition=${xfadeType}:duration=${duration.toFixed(3)}:offset=${offset.toFixed(3)}[${output}]`;
}

import type { ClipSpec } from '../types.js';

export function buildClipFilterChain(
  clips: ClipSpec[],
  transitions: Array<TransitionSpec & { offset: number }>,
  width: number = 1080,
  height: number = 1920,
  actualClipDurations: number[] = []
): string[] {
  const filters: string[] = [];
  // FFmpeg requirements: width/height must be even for H.264
  const evenW = Math.floor(width / 2) * 2;
  const evenH = Math.floor(height / 2) * 2;

  if (!transitions || transitions.length === 0) {
    transitions = [];
  }

  console.log(`[Transitions] Building filter chain for ${clips.length} clips, ${transitions.length} transitions`);
  console.log(`[Transitions] actualClipDurations:`, actualClipDurations);

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    let zoomFilter = '';

    if (!clip.zoom) {
      clip.zoom = { start: 1.0, end: 1.0, ease: 'linear' };
      console.log(`[Zoom] Clip ${i} had no zoom - applied identity zoom`);
    }

    const sourceOffset = clip.trim_start || 0;

    const maxAvailable = actualClipDurations[i] ? Math.max(0, actualClipDurations[i] - sourceOffset) : clip.duration;
    const safeDuration = Math.max(0.01, Math.min(clip.duration, maxAvailable));

    if (clip.zoom) {
      const { start: zs, end: ze, ease: easeRaw, duration: zoomDurSpec } = clip.zoom;
      const ease = easeRaw as any;
      // Use safeDuration (actual trimmed duration) for zoom timing
      // After trim+setpts, time runs 0 to safeDuration, not 0 to clip.duration
      const durationSeconds = safeDuration;
      
      // Calculate start time and duration for the zoom
      const zoomDuration = zoomDurSpec || durationSeconds;
      const zoomStart = Math.max(0, durationSeconds - zoomDuration);

      let easingExpr: string;

      if (ease === 'intense_start') {
        // Calculate the perfect exponent 'N' to guarantee exactly 90% of the zoom happens within the first 1.0 seconds.
        let N = 4.0;
        if (durationSeconds > 1.0) {
          const x1 = 1.0 / durationSeconds;
          N = Math.log(0.1) / Math.log(1 - x1);
        }
        N = Math.max(N, 4.0);
        easingExpr = `1-pow(1-min(time/${durationSeconds.toFixed(3)},1),${N.toFixed(3)})`;
      } else if (ease === 'linear') {
        // Linear zoom over the specified duration, starting at zoomStart
        easingExpr = `min(1, max(0, (time-${zoomStart.toFixed(3)})/${zoomDuration.toFixed(3)}))`;
      } else if (ease === 'cubic_out') {
        easingExpr = `(1-pow(1-min(1, max(0, (time-${zoomStart.toFixed(3)})/${zoomDuration.toFixed(3)})),3))`;
      } else if (ease === 'cubic_in') {
        easingExpr = `pow(min(1, max(0, (time-${zoomStart.toFixed(3)})/${zoomDuration.toFixed(3)})),3)`;
      } else if (ease === 'sine_in_out') {
        easingExpr = `0.5*(1-cos(min(1, max(0, (time-${zoomStart.toFixed(3)})/${zoomDuration.toFixed(3)}))*PI))`;
      } else if (ease === 'back_out') {
        // Slight overshoot/bounce effect
        const t = `min(1, max(0, (time-${zoomStart.toFixed(3)})/${zoomDuration.toFixed(3)}))`;
        easingExpr = `(1 + 2.70158 * pow(${t}-1, 3) + 1.70158 * pow(${t}-1, 2))`;
      } else if (ease === 'exponential') {
        // Extreme acceleration
        easingExpr = `pow(2, 10 * (min(1, max(0, (time-${zoomStart.toFixed(3)})/${zoomDuration.toFixed(3)})) - 1))`;
      } else if (ease === 'basic') {
        // "Basic": Zoom ONLY in the last 1.0 second of the clip (unless overridden by AI)
        const bDuration = zoomDurSpec || 0.8;
        const bStart = Math.max(0, durationSeconds - 1.5 - bDuration);
        easingExpr = `pow(min(1, max(0, (time-${bStart.toFixed(3)})/${bDuration.toFixed(3)})), 4)`;
      } else if (ease === 'cinematic') {
        // "Cinematic": Quick punch (40% of duration) then a very slow drift crawl
        const pDur = durationSeconds * 0.4;
        const driftDur = durationSeconds * 0.6;
        easingExpr = `if(lte(time,${pDur.toFixed(3)}), pow(time/${pDur.toFixed(3)}, 3) * 0.8, 0.8 + 0.2 * (time-${pDur.toFixed(3)})/${driftDur.toFixed(3)})`;
      } else if (ease === 'aggressive') {
        // High-order power for extremely fast snap
        easingExpr = `1-pow(1-min(time/${durationSeconds.toFixed(3)},1), 12)`;
      } else if (ease === 'smooth_step') {
        easingExpr = `(time/${durationSeconds.toFixed(3)})*(time/${durationSeconds.toFixed(3)})*(3-2*(time/${durationSeconds.toFixed(3)}))`;
      } else {
        easingExpr = `(1-pow(1-min(1, max(0, (time-${zoomStart.toFixed(3)})/${zoomDuration.toFixed(3)})),8))`;
      }

      // SAFETY: max(0.7, ...) allows zoom-outs (reveals) while preventing extreme small scales that show too much black
      // Add a tiny bit of "noise" via a sine wave for organic feel (micro-vibrations)
      const zoomExpr = `max(0.7, ${zs.toFixed(3)}+(${ze.toFixed(3)}-${zs.toFixed(3)})*(${easingExpr}))`;

      zoomFilter = `zoompan=z='${zoomExpr}':` +
        `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
        `d=1:s=${evenW}x${evenH}:fps=30,settb=1/30`;
    }

    let padFilter = '';
    // Only apply tpad to the LAST clip to extend end frame for smooth ending
    if (i === clips.length - 1) {
      padFilter = `tpad=stop_mode=clone:stop_duration=2,`;
    }

    const filterWithoutZoom = `[${i}:v]fps=30,scale=${evenW}:${evenH}:force_original_aspect_ratio=increase,crop=${evenW}:${evenH},setsar=1,format=yuv420p,` +
      `trim=start=${sourceOffset}:duration=${safeDuration.toFixed(3)},setpts=PTS-STARTPTS`;
    const zoomPart = zoomFilter ? ',' + zoomFilter : '';
    
    // Only apply tpad to the LAST clip to prevent ending on a black frame. 
    // Internal clips should NOT have tpad as it causes a 1s freeze during concat fallbacks.
    const padPart = (i === clips.length - 1) ? ',tpad=stop_mode=clone:stop_duration=2' : '';
    
    let blurPart = '';
    const outgoingTrans = transitions[i];
    const incomingTrans = i > 0 ? transitions[i - 1] : null;

    if (outgoingTrans && (outgoingTrans.type === 'wipe-left' || outgoingTrans.type === 'wipe-right' || outgoingTrans.type === 'swipe-up' || outgoingTrans.type === 'swipe-down')) {
      const nextClip = clips[i + 1];
      const nextRaw = actualClipDurations[i + 1] || nextClip?.duration || 0;
      const nextSafe = nextClip ? Math.max(0.01, Math.min(nextClip.duration, nextRaw - (nextClip.trim_start || 0))) : 0;
      const outXfadeDur = Math.min(outgoingTrans.duration, safeDuration * 0.5, nextSafe * 0.5);
      blurPart += `,boxblur=20:10:enable='between(t, ${safeDuration - outXfadeDur}, ${safeDuration})'`;
    }

    if (incomingTrans && (incomingTrans.type === 'wipe-left' || incomingTrans.type === 'wipe-right' || incomingTrans.type === 'swipe-up' || incomingTrans.type === 'swipe-down')) {
      const prevClip = clips[i-1];
      const prevRawDur = actualClipDurations[i-1] || prevClip.duration || 0;
      const prevSafeDuration = Math.max(0.01, Math.min(prevClip.duration, prevRawDur - (prevClip.trim_start || 0)));
      const inXfadeDur = Math.min(incomingTrans.duration, prevSafeDuration * 0.5, safeDuration * 0.5);
      blurPart += `,boxblur=20:10:enable='between(t, 0, ${inXfadeDur})'`;
    }

    if (outgoingTrans && outgoingTrans.type === 'camera-lens') {
      const nextClip = clips[i + 1];
      const nextRaw = actualClipDurations[i + 1] || nextClip?.duration || 0;
      const nextSafe = nextClip ? Math.max(0.01, Math.min(nextClip.duration, nextRaw - (nextClip.trim_start || 0))) : 0;
      const outXfadeDur = Math.min(outgoingTrans.duration, safeDuration * 0.5, nextSafe * 0.5);
      const st = safeDuration - outXfadeDur;
      // Exposure Bloom (Brightness 0 -> 0.25) + Lens Blur + Chromatic Aberration Pulse
      blurPart += `,eq=brightness='if(between(t\\,${st.toFixed(3)}\\,${safeDuration.toFixed(3)})\\, 0.25*(t-${st.toFixed(3)})/${outXfadeDur.toFixed(3)}\\, 0)':eval=frame`;
      // NOTE: rgbashift doesn't support per-frame expressions for 'rh/bh', so we use a high-impact static pulse.
      blurPart += `,rgbashift=rh=8:bh=-8:enable='between(t\\,${st.toFixed(3)}\\,${safeDuration.toFixed(3)})'`;
      blurPart += `,boxblur=20:10:enable='between(t\\,${st.toFixed(3)}\\,${safeDuration.toFixed(3)})'`;
    }

    if (outgoingTrans && outgoingTrans.type === 'flash') {
      const nextClip = clips[i + 1];
      const nextRaw = actualClipDurations[i + 1] || nextClip?.duration || 0;
      const nextSafe = nextClip ? Math.max(0.01, Math.min(nextClip.duration, nextRaw - (nextClip.trim_start || 0))) : 0;
      const outXfadeDur = Math.min(outgoingTrans.duration, safeDuration * 0.5, nextSafe * 0.5);
      const st = safeDuration - outXfadeDur;

      const flashColor = (outgoingTrans.color || '#ffffff');
      
      // SOPHISTICATED FLASH: Use the core 'fade' filter to color. 
      // This is extremely robust and provides a perfect smooth ramp.
      // We use quoted hex color for maximum FFmpeg compatibility across all versions.
      blurPart += `,fade=t=out:st=${st.toFixed(3)}:d=${outXfadeDur.toFixed(3)}:color='${flashColor}'`;
      // ULTRA-FLASH: Boost luminosity at the peak
      blurPart += `,colorlevels=rimax=0.6:gimax=0.6:bimax=0.6:enable='between(t,${st.toFixed(3)},${safeDuration.toFixed(3)})'`;
      blurPart += `,boxblur=15:5:enable='between(t,${st.toFixed(3)},${safeDuration.toFixed(3)})'`;
    }

    if (incomingTrans && incomingTrans.type === 'camera-lens') {
      const prevClip = clips[i - 1];
      const prevRawDur = actualClipDurations[i - 1] || prevClip.duration || 0;
      const prevSafeDuration = Math.max(0.01, Math.min(prevClip.duration, prevRawDur - (prevClip.trim_start || 0)));
      const inXfadeDur = Math.min(incomingTrans.duration, prevSafeDuration * 0.5, safeDuration * 0.5);
      // Exposure fading out + Lens Blur fading out + Chromatic Aberration pulse
      blurPart += `,eq=brightness='if(between(t\\,0\\,${inXfadeDur.toFixed(3)})\\, 0.25*(1-t/${inXfadeDur.toFixed(3)})\\, 0)':eval=frame`;
      blurPart += `,rgbashift=rh=8:bh=-8:enable='between(t\\,0\\,${inXfadeDur.toFixed(3)})'`;
      blurPart += `,boxblur=20:10:enable='between(t\\,0\\,${inXfadeDur.toFixed(3)})'`;
    }

    if (incomingTrans && incomingTrans.type === 'flash') {
      const prevClip = clips[i - 1];
      const prevRawDur = actualClipDurations[i - 1] || prevClip.duration || 0;
      const prevSafeDuration = Math.max(0.01, Math.min(prevClip.duration, prevRawDur - (prevClip.trim_start || 0)));
      const inXfadeDur = Math.min(incomingTrans.duration, prevSafeDuration * 0.5, safeDuration * 0.5);
      
      const flashColor = (incomingTrans.color || '#ffffff');

      // SOPHISTICATED FLASH: Fade in FROM the color.
      // We use quoted hex color for maximum FFmpeg compatibility across all versions.
      blurPart += `,fade=t=in:st=0:d=${inXfadeDur.toFixed(3)}:color='${flashColor}'`;
      // ULTRA-FLASH: Boost luminosity at the peak
      blurPart += `,colorlevels=rimax=0.6:gimax=0.6:bimax=0.6:enable='between(t,0,${inXfadeDur.toFixed(3)})'`;
      blurPart += `,boxblur=15:5:enable='between(t,0,${inXfadeDur.toFixed(3)})'`;
    }

    const filterWithAll = filterWithoutZoom + zoomPart + padPart + blurPart + `,settb=1/30,setpts=PTS-STARTPTS[v${i}]`;
    console.log(`[Transitions] Clip ${i} filter: ${filterWithAll}`);
    filters.push(filterWithAll);
  }

  const firstClip = clips[0];
  const firstRawDur = actualClipDurations[0] || firstClip.duration || 0;
  let currentTime = Math.max(0.01, Math.min(firstClip.duration, firstRawDur - (firstClip.trim_start || 0)));

  let currentOutput = 'v0';
  for (let i = 0; i < transitions.length; i++) {
    const { type, duration, offset } = transitions[i];
    const nextClip = `v${i + 1}`;
    const newOutput = i === transitions.length - 1 ? 'vout' : `t${i}`;

    const clip = clips[i];
    const sourceOffset = clip.trim_start || 0;
    const rawDur = actualClipDurations[i] || clip.duration || 0;
    // Subtract 50ms from rawDur to prevent xfade from hitting EOF due to container vs video stream duration mismatches
    const safeDuration = Math.max(0.01, Math.min(clip.duration, (rawDur - 0.05) - sourceOffset));

    const nextClipConfig = clips[i + 1];
    const nextClipRaw = actualClipDurations[i + 1] || nextClipConfig.duration || 0;
    const nextClipDur = Math.max(0.01, Math.min(nextClipConfig.duration, (nextClipRaw - 0.05) - (nextClipConfig.trim_start || 0)));

    // Use safeDuration (after trim) AND nextClipDur for mathematically perfect xfade calculations
    const safeXfadeDuration = Math.min(duration, safeDuration * 0.5, nextClipDur * 0.5);

    // FAIL-SAFE: If the transition is mathematically impossible, fallback to concat.
    // The first input stream ([currentOutput]) has duration [currentTime].
    const isPossible = offset > 0 && safeXfadeDuration > 0 && (offset + safeXfadeDuration) <= currentTime;

    console.log(`[Transitions] Clip ${i}: specDur=${clip.duration}, actualDur=${rawDur}, safeDur=${safeDuration}, nextDur=${nextClipDur}, xfade=${safeXfadeDuration}, offset=${offset}, possible=${isPossible}`);

    if (!isPossible || type === 'none') {
      if (!isPossible && type !== 'none') {
        console.warn(`[Transitions] Transition ${i} (${type}) is impossible at offset ${offset}. Falling back to concat.`);
      }
      filters.push(`[${currentOutput}][${nextClip}]concat=n=2:v=1:a=0,fps=30,settb=1/30,setpts=PTS-STARTPTS[${newOutput}]`);
      // Update cumulative time for concat
      currentTime += nextClipDur;
    } else {
      // Flash logic is already handled in per-clip filters (loop above)


      const xfilter = buildXfadeFilter(currentOutput, nextClip, `${newOutput}_pre`, type, safeXfadeDuration, offset);
      filters.push(xfilter);
      // Ensure the output of xfade also has clean PTS and normalized timebase to prevent "glitches"
      filters.push(`[${newOutput}_pre]fps=30,settb=1/30,setpts=PTS-STARTPTS[${newOutput}]`);
      // Update cumulative time for xfade (overlap reduces total duration)
      currentTime += nextClipDur - safeXfadeDuration;
    }
    currentOutput = newOutput;
  }

  if (transitions.length === 0) {
    if (clips.length > 1) {
      const concatInputs = clips.map((_, i) => `[v${i}]`).join('');
      filters.push(`${concatInputs}concat=n=${clips.length}:v=1:a=0,fps=30,settb=1/30,setpts=PTS-STARTPTS[vout]`);
    } else {
      filters.push(`[v0]null[vout]`);
    }
  }

  if (clips.length === 1) {
    filters.push('[v0]copy[vout]');
  }

  return filters;
}

export function calculateTransitionOffsets(
  clips: ClipSpec[],
  transitionDurations: number[],
  actualClipDurations: number[] = []
): number[] {
  const offsets: number[] = [];
  let currentTime = 0;

  for (let i = 0; i < clips.length - 1; i++) {
    const clip = clips[i];
    const sourceOffset = clip.trim_start || 0;
    const rawDur = actualClipDurations[i] || clip.duration || 0;
    const safeDuration = Math.max(0.01, Math.min(clip.duration, (rawDur - 0.05) - sourceOffset));
    
    const nextClipConfig = clips[i + 1];
    const nextClipRaw = actualClipDurations[i + 1] || nextClipConfig.duration || 0;
    const nextClipDur = Math.max(0.01, Math.min(nextClipConfig.duration, (nextClipRaw - 0.05) - (nextClipConfig.trim_start || 0)));

    const transitionDuration = transitionDurations[i] || 0;
    const safeTransitionDuration = Math.min(transitionDuration, safeDuration * 0.5, nextClipDur * 0.5);

    currentTime += safeDuration - safeTransitionDuration;
    offsets.push(currentTime);
  }

  return offsets;
}

export function buildGlitchFilter(input: string, output: string, duration: number): string {
  return `[${input}]split=3[g1][g2][g3];` +
    `[g1]colorbalance=rs=0.3:gs=-0.3:bs=0.3[g1o];` +
    `[g2]rgbashift=rh=5:gh=-5:bh=3[g2o];` +
    `[g3]noise=alls=30:allf=t[g3o];` +
    `[g1o][g2o]blend=all_mode=overlay:all_opacity=0.5[gtmp];` +
    `[gtmp][g3o]blend=all_mode=softlight:all_opacity=0.3[${output}]`;
}

export function buildShakeFilter(
  input: string,
  output: string,
  intensity: number = 10,
  frequency: number = 25
): string {
  const xShake = Math.floor(intensity / 2) * 2;
  const yShake = Math.floor((intensity * 0.7) / 2) * 2;

  return `[${input}]` +
    `crop=iw-${xShake * 2}:ih-${yShake * 2}:` +
    `'${xShake}+${xShake}*sin(t*${frequency})':'${yShake}+${yShake}*cos(t*${frequency}*1.2)',` +
    `scale=1080:1920[${output}]`;
}
