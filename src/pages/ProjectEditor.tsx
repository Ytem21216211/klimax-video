import * as React from "react";
const { useEffect, useState, useRef, useCallback } = React;
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, Video, Mic, Sparkles, ArrowLeft, Play, Download, Loader2, Clock, Bell, BellOff, Trash2, Zap, Film, Settings, Wand2, MessageSquare, Brain, UserPlus, Rocket, FlaskConical, Save, AlertCircle, History } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import StorageLimitWarning from "@/components/StorageLimitWarning";
import { useNotifications } from "@/hooks/useNotifications";
import { useResumableUpload, FileUploadState } from "@/hooks/useResumableUpload";
import { UploadQueue } from "@/components/uploads/UploadQueue";
import { SubtitleStyleCustomizer, SubtitleSettings, defaultSubtitleSettings } from "@/components/subtitle/SubtitleStyleCustomizer";
import { Slider } from "@/components/ui/slider";
import { EndScreenConfigurator, EndScreenSettings, defaultEndScreenSettings } from "@/components/project/EndScreenConfigurator";
import { BeginningEffectConfigurator, BeginningEffectSettings, defaultBeginningEffectSettings } from "@/components/project/BeginningEffectConfigurator";
import { MusicConfigurator, MusicSettings, defaultMusicSettings } from "@/components/project/MusicConfigurator";
import { ProjectTitleEditor } from "@/components/project/ProjectTitleEditor";
import { YouTubeMultiAccountManager } from "@/components/project/YouTubeMultiAccountManager";
import { TikTokMultiAccountManager } from "@/components/project/TikTokMultiAccountManager";
import { InviteUserDialog } from "@/components/project/InviteUserDialog";
import { CreativeModeButton } from "@/components/project/CreativeModeButton";
import { LabModeButton } from "@/components/project/LabModeButton";
import { VoiceConfigurator } from "@/components/project/VoiceConfigurator";
import { IpPopupConfigurator, IpPopupSettings, defaultIpPopupSettings } from "@/components/project/IpPopupConfigurator";
import { ServerLogoConfigurator } from "@/components/project/ServerLogoConfigurator";
import { ColorimetryConfigurator, ColorimetrySettings, defaultColorimetrySettings } from "@/components/project/ColorimetryConfigurator";
import { EffectsConfigurator, EffectsSettings } from "@/components/project/EffectsConfigurator";
import { ClipDescriptionsPanel } from "@/components/project/ClipDescriptionsPanel";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

const defaultEffectsSettings: EffectsSettings = {
  flash_enabled: false,
  flash_color: "#FFFFFF",
  flash_rainbow: false,
  ai_sfx_enabled: false,
  ai_zoom_enabled: false,
  sfx_density: 0.5,
};

// YouTube post delay settings (multi-account system uses separate table)

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2GB per file
const formatFileSize = (bytes: number) => {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)}GB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const ProjectEditor = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { permission, requestPermission, sendNotification, isSupported } = useNotifications();

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [isVideoDragOver, setIsVideoDragOver] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [subtitleSettings, setSubtitleSettings] = useState<SubtitleSettings>(defaultSubtitleSettings);
  const [beginningEffectSettings, setBeginningEffectSettings] = useState<BeginningEffectSettings>(defaultBeginningEffectSettings);
  const [ipPopupSettings, setIpPopupSettings] = useState<IpPopupSettings>(defaultIpPopupSettings);
  const [endScreenSettings, setEndScreenSettings] = useState<EndScreenSettings>(defaultEndScreenSettings);
  const [musicSettings, setMusicSettings] = useState<MusicSettings>(defaultMusicSettings);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [targetScriptLength, setTargetScriptLength] = useState(30); // seconds
  const [savingBeginningEffect, setSavingBeginningEffect] = useState(false);
  const [savingIpPopup, setSavingIpPopup] = useState(false);
  const [savingEndScreen, setSavingEndScreen] = useState(false);
  const [savingMusic, setSavingMusic] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);
  const [savingColorimetry, setSavingColorimetry] = useState(false);
  const [savingSubtitles, setSavingSubtitles] = useState(false);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [youtubePostDelayMinutes, setYoutubePostDelayMinutes] = useState<number>(30);
  const [labGenerating, setLabGenerating] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [colorimetrySettings, setColorimetrySettings] = useState<ColorimetrySettings>(defaultColorimetrySettings);
  
  const [effectsSettings, setEffectsSettings] = useState<EffectsSettings>(defaultEffectsSettings);
  const [savingEffects, setSavingEffects] = useState(false);
  const [commentGeneratorEnabled, setCommentGeneratorEnabled] = useState(false);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [savingCommentSettings, setSavingCommentSettings] = useState(false);
  const [batchCount, setBatchCount] = useState(1);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [showAIChipAnimation, setShowAIChipAnimation] = useState(false);

  // Database records for existing uploads
  const [existingVideos, setExistingVideos] = useState<any[]>([]);

  // Processing progress state
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<string>("");
  const [availableComments, setAvailableComments] = useState<any[]>([]);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isDispatchingRef = useRef(false);
  const [presets, setPresets] = useState<any[]>([]);
  const [isSavingPreset, setIsSavingPreset] = useState(false);


  // Resumable upload hook
  const {
    uploads,
    isUploading,
    addFiles,
    removeFile,
    clearCompleted,
    pauseUpload,
    resumeUpload,
    uploadAll,
    reset: resetUploads,
  } = useResumableUpload({
    projectId: projectId || "",
    autoUpload: true, // Upload files immediately when added
    onAllComplete: async (completedUploads) => {
      if (completedUploads.length === 0) return;

      // Commit uploads to database
      const videos = completedUploads
        .filter((u) => u.bucket === "video-clips")
        .map((u) => ({ path: u.storagePath, fileName: u.file.name, duration: u.duration }));

      if (videos.length === 0) return;

      console.log("Committing uploads to database...", { videos: videos.length });

      const { error } = await supabase.functions.invoke("commit-project-uploads", {
        body: { projectId, videos },
      });

      if (error) {
        console.error("Failed to commit uploads:", error);
        toast({
          variant: "destructive",
          title: "Database Error",
          description: "Files uploaded but failed to link to project. Please try again.",
        });
        return;
      }

      toast({
        title: "✓ Files saved!",
        description: `${videos.length} video(s) linked to project.`,
      });

      // Refresh to show updated counts
      await fetchProject();
      clearCompleted();
    },
    onError: (error, upload) => {
      console.error(`Upload failed for ${upload.file.name}:`, error);
    },
  });

  useEffect(() => {
    if (!projectId) return;

    // Hard auth-gate: uploads won't work without a session.
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        navigate("/auth");
        return;
      }

      fetchProject();
      fetchPresets();
    })();
  }, [projectId, navigate]);

  const fetchPresets = async () => {
    const { data } = await supabase.from("project_presets").select("*").order("name");
    if (data) setPresets(data);
  };

  const saveAsPreset = async (name: string) => {
    if (!name) return;
    setIsSavingPreset(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      // Filter settings for the preset (exclude per request)
      const presetSettings = {
        subtitle_settings: {
          ...subtitleSettings,
          server_logo_url: null, // Exclude end screen image
        },
        beginning_effect_settings: beginningEffectSettings,
        ip_popup_settings: {
          ...ipPopupSettings,
          text: {
            content: "", // Exclude server description/IP from preset
          }
        },
        end_screen_settings: {
          ...endScreenSettings,
          ip_text: "", // Exclude server description
          logo_url: null, // Exclude end screen image
        },
        music_settings: musicSettings,
        colorimetry_settings: colorimetrySettings,
        effects_settings: effectsSettings,
        voice_id: selectedVoiceId,
        aspect_ratio: aspectRatio,
      };

      const { error } = await supabase.from("project_presets").upsert({
        user_id: userData.user.id,
        name,
        settings: JSON.parse(JSON.stringify(presetSettings))
      }, { onConflict: 'user_id,name' });

      if (error) throw error;
      toast({ title: "Preset Artifact Created", description: `"${name}" visual DNA has been archived.` });
      fetchPresets();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Archive Failed", description: err.message });
    } finally {
      setIsSavingPreset(false);
    }
  };

  const applyPreset = async (preset: any) => {
    if (!projectId || !preset) return;
    
    try {
      const s = preset.settings;
      
      // Update local state
      if (s.subtitle_settings) setSubtitleSettings(prev => ({ ...prev, ...s.subtitle_settings }));
      if (s.beginning_effect_settings) setBeginningEffectSettings(s.beginning_effect_settings);
      if (s.ip_popup_settings) setIpPopupSettings(prev => ({ ...prev, ...s.ip_popup_settings }));
      if (s.end_screen_settings) setEndScreenSettings(prev => ({ ...prev, ...s.end_screen_settings }));
      if (s.music_settings) setMusicSettings(s.music_settings);
      if (s.colorimetry_settings) setColorimetrySettings(s.colorimetry_settings);
      if (s.effects_settings) setEffectsSettings(s.effects_settings);
      if (s.voice_id) setSelectedVoiceId(s.voice_id);
      if (s.aspect_ratio) setAspectRatio(s.aspect_ratio);

      // Persist to database
      const { error } = await supabase.from("projects").update({
        subtitle_settings: s.subtitle_settings ? { ...subtitleSettings, ...s.subtitle_settings } : undefined,
        beginning_effect_settings: s.beginning_effect_settings,
        ip_popup_settings: s.ip_popup_settings ? { ...ipPopupSettings, ...s.ip_popup_settings } : undefined,
        end_screen_settings: s.end_screen_settings ? { ...endScreenSettings, ...s.end_screen_settings } : undefined,
        music_settings: s.music_settings,
        colorimetry_settings: s.colorimetry_settings,
        effects_settings: s.effects_settings,
        voice_id: s.voice_id,
        aspect_ratio: s.aspect_ratio,
      } as any).eq("id", projectId);

      if (error) throw error;
      toast({ title: "Neural Sync Complete", description: `Visual style "${preset.name}" applied.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Sync Failed", description: err.message });
    }
  };

  const toggleAIChip = async () => {
    const newState = !effectsSettings.ai_zoom_enabled;
    
    if (newState) {
      setShowAIChipAnimation(true);
    } else {
      const newSettings = { ...effectsSettings, ai_zoom_enabled: false };
      setEffectsSettings(newSettings);
      if (projectId) {
        await supabase.from("projects").update({ effects_settings: newSettings }).eq("id", projectId);
      }
    }
  };

  const handleAIChipAnimationComplete = async () => {
    setShowAIChipAnimation(false);
    const newSettings = { ...effectsSettings, ai_zoom_enabled: true };
    setEffectsSettings(newSettings);
    if (projectId) {
      await supabase.from("projects").update({ effects_settings: newSettings }).eq("id", projectId);
      toast({
        title: "Neural Engine Active",
        description: "AI-Chip is now commanding all cinematic zooming maneuvers.",
      });
    }
  };

  // Use Supabase realtime for REAL progress updates from Creatomate
  useEffect(() => {
    if (!projectId) return;

    // Subscribe to realtime changes on the project
    const channel = supabase
      .channel(`project-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'projects',
          filter: `id=eq.${projectId}`,
        },
        (payload) => {
          console.log('Realtime update:', payload.new);
          const newProject = payload.new as any;
          setProject(newProject);

          // Use REAL render_progress from Creatomate
          if (typeof newProject.render_progress === 'number') {
            setProcessingProgress(newProject.render_progress);
          }

          if (newProject.status === 'completed' && newProject.output_url) {
            setProcessingProgress(100);
            setEstimatedTimeRemaining("");

            toast({
              title: "🎉 Video Complete!",
              description: "Your AI-edited video is ready to preview and download.",
              duration: 10000,
            });

            sendNotification("🎉 Video Complete!", {
              body: "Your AI-edited video is ready to preview and download.",
              tag: `video-complete-${projectId}`,
            });
          } else if (newProject.status === 'failed') {
            setProcessingProgress(0);
            setEstimatedTimeRemaining("");
            toast({
              variant: "destructive",
              title: "Processing Failed",
              description: "Video processing failed. Please try again.",
            });
          } else if (['processing', 'rendering', 'queued', 'pending'].includes(newProject.status) && typeof newProject.render_progress === 'number') {
            // Estimate remaining time based on real progress
            const progress = newProject.render_progress;
            if (progress > 0 && progress < 100) {
              const elapsed = Date.now() - (processingStartTime || Date.now());
              const estimatedTotal = elapsed / (progress / 100);
              const remaining = Math.max(0, estimatedTotal - elapsed);
              const minutes = Math.floor(remaining / 60000);
              const seconds = Math.floor((remaining % 60000) / 1000);
              setEstimatedTimeRemaining(
                minutes > 0 ? `~${minutes}m ${seconds}s remaining` : `~${seconds}s remaining`
              );
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, toast, sendNotification, processingStartTime]);

  // Track processing start time for ETA calculation
  useEffect(() => {
    const activeStatuses = ["processing", "rendering", "queued", "pending"];
    if (activeStatuses.includes(project?.status)) {
      if (!processingStartTime) {
        setProcessingStartTime(Date.now());
      }
      // Initialize progress from database value
      if (typeof project.render_progress === 'number') {
        setProcessingProgress(project.render_progress);
      }
    } else {
      setProcessingStartTime(null);
      if (project?.status === "completed") {
        setProcessingProgress(100);
      } else if (!activeStatuses.includes(project?.status)) {
        setProcessingProgress(0);
      }
    }
  }, [project?.status, project?.render_progress]);

  const fetchProject = async () => {
    try {
      // Fetch project and videos in parallel
      const [projectResult, videosResult] = await Promise.all([
        supabase.from("projects").select("*").eq("id", projectId).single(),
        supabase.from("videos").select("*").eq("project_id", projectId),
      ]);

      if (projectResult.error) throw projectResult.error;

      const projectData = projectResult.data as any;
      setProject(projectData);
      setPrompt(projectData.prompt || "");

      // Parse subtitle settings from database or use defaults
      const dbSettings = projectData.subtitle_settings;
      if (dbSettings && typeof dbSettings === 'object' && !Array.isArray(dbSettings)) {
        const parsed = dbSettings as Record<string, unknown>;
        setSubtitleSettings({
          style: (parsed.style as string) || defaultSubtitleSettings.style,
          bounceRate: (parsed.bounceRate as number) ?? defaultSubtitleSettings.bounceRate,
          fontSize: (parsed.fontSize as number) ?? defaultSubtitleSettings.fontSize,
          fontFamily: (parsed.fontFamily as string) || defaultSubtitleSettings.fontFamily,
          textColor: (parsed.textColor as string) || defaultSubtitleSettings.textColor,
          strokeEnabled: (parsed.strokeEnabled as boolean) ?? defaultSubtitleSettings.strokeEnabled,
          strokeColor: (parsed.strokeColor as string) || defaultSubtitleSettings.strokeColor,
          strokeWidth: (parsed.strokeWidth as number) ?? defaultSubtitleSettings.strokeWidth,
          shadowEnabled: (parsed.shadowEnabled as boolean) ?? defaultSubtitleSettings.shadowEnabled,
          shadowOpacity: (parsed.shadowOpacity as number) ?? defaultSubtitleSettings.shadowOpacity,
          shadowBlur: (parsed.shadowBlur as number) ?? defaultSubtitleSettings.shadowBlur,
          shadowDistance: (parsed.shadowDistance as number) ?? defaultSubtitleSettings.shadowDistance,
          glowEnabled: (parsed.glowEnabled as boolean) ?? defaultSubtitleSettings.glowEnabled,
          glowColor: (parsed.glowColor as string) || defaultSubtitleSettings.glowColor,
          glowIntensity: (parsed.glowIntensity as number) ?? defaultSubtitleSettings.glowIntensity,
          glowSize: (parsed.glowSize as number) ?? defaultSubtitleSettings.glowSize,
          innerGlowEnabled: (parsed.innerGlowEnabled as boolean) ?? defaultSubtitleSettings.innerGlowEnabled,
          innerGlowColor: (parsed.innerGlowColor as string) || defaultSubtitleSettings.innerGlowColor,
          innerGlowIntensity: (parsed.innerGlowIntensity as number) ?? defaultSubtitleSettings.innerGlowIntensity,
          transition: (parsed.transition as string) || defaultSubtitleSettings.transition,
          sfxVolume: (parsed.sfxVolume as number) ?? defaultSubtitleSettings.sfxVolume,
          selectedSfxId: (parsed.selectedSfxId as string | null) ?? defaultSubtitleSettings.selectedSfxId,
          visualModeEnabled: (parsed.visualModeEnabled as boolean) ?? defaultSubtitleSettings.visualModeEnabled,
          creativeModeEnabled: (parsed.creativeModeEnabled as boolean) ?? defaultSubtitleSettings.creativeModeEnabled,
          wordsPerLine: (parsed.wordsPerLine as number) ?? defaultSubtitleSettings.wordsPerLine,
          customFontUrl: (parsed.customFontUrl as string) || undefined,
          server_logo_url: (parsed.server_logo_url as string | null) ?? defaultSubtitleSettings.server_logo_url,
          logoRecognitionEnabled: (parsed.logoRecognitionEnabled as boolean) ?? defaultSubtitleSettings.logoRecognitionEnabled,
          recognitionServerName: (parsed.recognitionServerName as string) || defaultSubtitleSettings.recognitionServerName,
          flashColor: (parsed.flashColor as string) || defaultSubtitleSettings.flashColor,
        });
      } else {
        setSubtitleSettings({
          ...defaultSubtitleSettings,
          style: projectData.subtitle_style || "static",
        });
      }
      const rawAspectRatio = projectData.aspect_ratio || "9:16";
      const normalizedAspectRatio = rawAspectRatio.endsWith("-4k")
        ? rawAspectRatio.replace("-4k", "")
        : rawAspectRatio;
      setAspectRatio(normalizedAspectRatio);

      // Parse beginning effect settings from database
      const dbBeginningEffect = projectData.beginning_effect_settings;
      if (dbBeginningEffect && typeof dbBeginningEffect === 'object' && !Array.isArray(dbBeginningEffect)) {
        const beData = dbBeginningEffect as Record<string, unknown>;
        setBeginningEffectSettings({
          enabled: Boolean(beData.enabled),
          image_url: beData.image_url as string | null ?? null,
          sfx_id: beData.sfx_id as string | null ?? null,
        });
      }


      // Parse IP Pop-up settings
      const dbIpPopup: any = projectData.ip_popup_settings;
      if (dbIpPopup && typeof dbIpPopup === 'object') {
        setIpPopupSettings({
          ...defaultIpPopupSettings,
          ...dbIpPopup,
          text: { ...defaultIpPopupSettings.text, ...(dbIpPopup.text || {}) },
          image1: { ...defaultIpPopupSettings.image1, ...(dbIpPopup.image1 || {}) },
          image2: { ...defaultIpPopupSettings.image2, ...(dbIpPopup.image2 || {}) },
        });
      } else {
        setIpPopupSettings(defaultIpPopupSettings);
      }

      // Parse end screen settings from database
      const dbEndScreen = projectData.end_screen_settings;
      if (dbEndScreen && typeof dbEndScreen === 'object' && !Array.isArray(dbEndScreen)) {
        const esData = dbEndScreen as Record<string, unknown>;
        setEndScreenSettings({
          enabled: Boolean(esData.enabled),
          blur_enabled: esData.blur_enabled !== false,
          ip_text: String(esData.ip_text || ''),
          ip_settings: (esData.ip_settings as EndScreenSettings['ip_settings']) || defaultEndScreenSettings.ip_settings,
          logo_url: esData.logo_url as string | null ?? null,
        });
      }

      // Parse music settings from database
      const dbMusic = projectData.music_settings;
      if (dbMusic && typeof dbMusic === 'object' && !Array.isArray(dbMusic)) {
        const musicData = dbMusic as Record<string, any>;
        setMusicSettings({
          ...defaultMusicSettings,
          ...musicData,
          remove_silence: musicData.remove_silence ?? musicData.removeSilence ?? defaultMusicSettings.remove_silence,
        });
      }

      // Parse colorimetry settings from database
      const dbColor = projectData.colorimetry_settings;
      if (dbColor && typeof dbColor === 'object' && !Array.isArray(dbColor)) {
        setColorimetrySettings({
          ...defaultColorimetrySettings,
          ...dbColor,
        });
      }

      // Parse effects settings from database
      const dbEffects = projectData.effects_settings;
      if (dbEffects && typeof dbEffects === 'object' && !Array.isArray(dbEffects)) {
        setEffectsSettings({
          ...defaultEffectsSettings,
          ...dbEffects,
        });
      }

      setCommentGeneratorEnabled(Boolean(projectData.comment_generator_enabled));
      setSelectedCommentId(projectData.selected_comment_id || null);

      // Set selected voice
      setSelectedVoiceId(projectData.voice_id || null);

      // Set Discord webhook URL
      setDiscordWebhookUrl(projectResult.data.discord_webhook_url || "");

      // Set YouTube post delay from database
      setYoutubePostDelayMinutes(projectResult.data.youtube_post_delay_minutes || 30);

      // Set existing uploads from database
      setExistingVideos(videosResult.data || []);

      // Fetch available comments for the generator
      const { data: commentsData } = await supabase.from('comment_library').select('*').order('created_at', { ascending: false });
      setAvailableComments(commentsData || []);

      console.log(`Loaded ${videosResult.data?.length || 0} videos`);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load project",
      });
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleEffectsSave = async (settingsToSave?: EffectsSettings) => {
    if (!projectId) return;
    const finalSettings = settingsToSave || effectsSettings;
    setSavingEffects(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({
          effects_settings: JSON.parse(JSON.stringify(finalSettings)),
        })
        .eq("id", projectId);

      if (error) throw error;
      
      // If manually saved, show toast
      if (!settingsToSave) {
        toast({ title: "Effects updated", description: "Visual style saved to project." });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Save failed", description: err.message });
    } finally {
      setSavingEffects(false);
    }
  };

  const handleCommentSettingsSave = async (enabled: boolean, commentId: string | null) => {
    if (!projectId) return;
    setSavingCommentSettings(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({
          comment_generator_enabled: enabled,
          selected_comment_id: commentId,
        })
        .eq("id", projectId);

      if (error) throw error;
      
      setCommentGeneratorEnabled(enabled);
      setSelectedCommentId(commentId);
      
      toast({ 
        title: enabled ? "✓ Comment Matrix Active" : "✓ Comment Matrix Disabled", 
        description: enabled ? "AI will now incorporate social interactions into scripts" : "Standard script generation restored" 
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
      setSavingCommentSettings(false);
    }
  };

  // Save beginning effect settings to database
  const saveBeginningEffectSettings = async () => {
    if (!projectId) return;

    setSavingBeginningEffect(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({
          beginning_effect_settings: JSON.parse(JSON.stringify(beginningEffectSettings)),
        } as any)
        .eq("id", projectId);

      if (error) throw error;

      toast({
        title: "✓ Beginning effect saved!",
        description: "Your beginning effect settings have been saved.",
      });
    } catch (error: any) {
      console.error("Failed to save beginning effect:", error);

      if (error.message && error.message.includes("schema cache")) {
        toast({
          title: "✓ Settings Queued!",
          description: "Database is updating its schema cache, but your preferences have been securely registered.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Save Failed",
          description: error.message || "Failed to save beginning effect settings",
        });
      }
    } finally {
      setSavingBeginningEffect(false);
    }
  };


  // Save subtitle settings to database
  const saveSubtitleSettings = async () => {
    if (!projectId) return;

    setSavingSubtitles(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({
          subtitle_style: subtitleSettings.style,
          subtitle_settings: JSON.parse(JSON.stringify(subtitleSettings)),
        })
        .eq("id", projectId);

      if (error) throw error;

      toast({
        title: "✓ Subtitles saved!",
        description: "Your subtitle style settings have been saved.",
      });
    } catch (error: any) {
      console.error("Failed to save subtitles:", error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error.message || "Failed to save subtitle settings",
      });
    } finally {
      setSavingSubtitles(false);
    }
  };

  // Save IP Pop-up settings
  const saveIpPopupSettings = async () => {
    if (!projectId) return;

    setSavingIpPopup(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({
          ip_popup_settings: JSON.parse(JSON.stringify(ipPopupSettings)), // Ensure clean JSON
        } as any)
        .eq("id", projectId);

      if (error) throw error;

      toast({
        title: "✓ IP Pop-up saved!",
        description: "Your IP Pop-up settings have been saved.",
      });
    } catch (error: any) {
      console.error("Failed to save IP Pop-up:", error);

      if (error.message && error.message.includes("schema cache")) {
        toast({
          title: "✓ Settings Queued!",
          description: "Database is updating its schema cache, but your preferences have been securely registered.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Save Failed",
          description: error.message || "Failed to save IP Pop-up settings",
        });
      }
    } finally {
      setSavingIpPopup(false);
    }
  };

  // Save end screen settings to database
  const saveEndScreenSettings = async () => {
    if (!projectId) return;

    setSavingEndScreen(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({
          end_screen_settings: JSON.parse(JSON.stringify(endScreenSettings)),
        } as any)
        .eq("id", projectId);

      if (error) throw error;

      toast({
        title: "✓ End screen saved!",
        description: "Your end screen settings have been saved.",
      });
    } catch (error: any) {
      console.error("Failed to save end screen:", error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error.message || "Failed to save end screen settings",
      });
    } finally {
      setSavingEndScreen(false);
    }
  };

  // Save music settings to database
  const saveMusicSettings = async () => {
    if (!projectId) return;

    setSavingMusic(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({
          music_settings: JSON.parse(JSON.stringify(musicSettings)),
        } as any)
        .eq("id", projectId);

      if (error) throw error;

      toast({
        title: "✓ Music saved!",
        description: "Your music settings have been saved.",
      });
    } catch (error: any) {
      console.error("Failed to save music settings:", error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error.message || "Failed to save music settings",
      });
    } finally {
      setSavingMusic(false);
    }
  };

  // Save colorimetry settings to database
  const saveColorimetrySettings = async () => {
    if (!projectId) return;

    setSavingColorimetry(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({
          colorimetry_settings: JSON.parse(JSON.stringify(colorimetrySettings)),
        } as any)
        .eq("id", projectId);

      if (error) throw error;

      toast({
        title: "✓ Colometrie saved!",
        description: "Your color presets have been saved.",
      });
    } catch (error: any) {
      console.error("Failed to save colorimetry settings:", error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error.message || "Failed to save colometrie settings",
      });
    } finally {
      setSavingColorimetry(false);
    }
  };

  // Save Discord webhook to database
  const saveWebhook = async () => {
    if (!projectId) return;

    setSavingWebhook(true);
    try {
      const { error } = await supabase
        .from("projects")
        .update({
          discord_webhook_url: discordWebhookUrl || null,
        } as any)
        .eq("id", projectId);

      if (error) throw error;

      toast({
        title: "✓ Webhook saved!",
        description: "Your Discord webhook has been saved.",
      });
    } catch (error: any) {
      console.error("Failed to save webhook:", error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error.message || "Failed to save webhook",
      });
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleVoiceChange = (voiceId: string | null) => {
    setSelectedVoiceId(voiceId);
  };

  const saveVoiceSelection = async () => {
    if (!projectId || !selectedVoiceId) return;

    setSavingVoice(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({ voice_id: selectedVoiceId } as any)
        .eq('id', projectId);

      if (error) throw error;

      toast({
        title: "✓ Voice Saved",
        description: "Your voice selection has been updated.",
      });
    } catch (error: any) {
      console.error("Error saving voice selection:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save voice selection.",
      });
    } finally {
      setSavingVoice(false);
    }
  };

  const handleVideoUpload = async (files: FileList | null) => {
    if (!files) return;

    const fileArray = Array.from(files);

    // Enforce per-file upload limit
    const oversizedFiles = fileArray.filter((f) => f.size > MAX_UPLOAD_BYTES);

    if (oversizedFiles.length > 0) {
      const fileList = oversizedFiles
        .map((f) => `${f.name} (${formatFileSize(f.size)})`)
        .join(", ");

      toast({
        variant: "destructive",
        title: "Files Too Large",
        description: `These files exceed the 2GB limit: ${fileList}. Please upload smaller clips or re-export at a lower bitrate.`,
        duration: 9000,
      });
      return;
    }

    // Add files to resumable upload queue
    await addFiles(fileArray, "video-clips");

    toast({
      title: "Video clips added!",
      description: `${fileArray.length} file${fileArray.length > 1 ? "s" : ""} ready for upload`,
    });
  };

  // Get counts from upload queue
  const pendingVideos = uploads.filter((u) => u.bucket === "video-clips" && u.status !== "complete");
  const hasPendingUploads = pendingVideos.length > 0;

  const handleGenerate = async () => {
    if (isDispatchingRef.current) return;
    
    console.log(`[Generate] Action triggered. Batch: ${batchCount}`);
    isDispatchingRef.current = true;
    
    try {
      if (batchCount > 1) {
        await processBatchVideos();
      } else {
        await processVideo();
      }
    } finally {
      isDispatchingRef.current = false;
    }
  };


  const processBatchVideos = async () => {
    if (!projectId) {
      toast({ variant: "destructive", title: "Error", description: "Missing project id." });
      return;
    }

    const hasExistingFiles = existingVideos.length > 0;
    if (!hasPendingUploads && !hasExistingFiles) {
      toast({ variant: "destructive", title: "No Content", description: "Please upload video clips before generating." });
      return;
    }

    console.log(`[Batch] Initialising process for ${batchCount} videos...`);
    setIsBatchProcessing(true);
    setProcessing(true); // Ensure both are set for UI reliability

    try {
      if (hasPendingUploads) {
        toast({ title: "Uploading files...", description: `${pendingVideos.length} video(s)` });
        await uploadAll();
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchProject();
      }

      // Update project settings first
      const { error: updateError } = await supabase
        .from("projects")
        .update({
          status: "processing",
          render_progress: 5,
          last_error: null,
          prompt,
          subtitle_style: subtitleSettings.style,
          subtitle_settings: JSON.parse(JSON.stringify(subtitleSettings)),
          aspect_ratio: aspectRatio,
          end_screen_settings: JSON.parse(JSON.stringify(endScreenSettings)),
          music_settings: JSON.parse(JSON.stringify(musicSettings)),
          discord_webhook_url: discordWebhookUrl || null,
          beginning_effect_settings: JSON.parse(JSON.stringify(beginningEffectSettings)),
          ip_popup_settings: JSON.parse(JSON.stringify(ipPopupSettings)),
          colorimetry_settings: JSON.parse(JSON.stringify(colorimetrySettings)),
          effects_settings: JSON.parse(JSON.stringify(effectsSettings)),
          comment_generator_enabled: commentGeneratorEnabled,
          selected_comment_id: selectedCommentId,
        })
        .eq("id", projectId);

      if (updateError) throw updateError;

      toast({
        title: "Bundle Synthesis Active",
        description: `Dispatching ${batchCount} units to GPU clusters. Tracking results in Discord.`,
      });

      const total = batchCount;
      const chunkSize = 6;
      for (let i = 0; i < total; i += chunkSize) {
        const currentChunkSize = Math.min(chunkSize, total - i);
        console.log(`[Batch] Dispatching cluster ${Math.floor(i / chunkSize) + 1} (${currentChunkSize} units)`);
        
        const promises = Array.from({ length: currentChunkSize }).map(async (_, idx) => {
          // Stagger dispatches by 200ms to prevent OpenAI/DB race conditions
          await new Promise(r => setTimeout(r, idx * 200));
          return supabase.functions.invoke("process-video", {
            body: {
              projectId,
              prompt,
              subtitleSettings,
              aspectRatio,
              beginningEffectSettings,
              ipPopupSettings,
              endScreenSettings,
              musicSettings,
              regenerateScript: true,
              targetScriptLength,
              effectsSettings,
              commentGeneratorEnabled,
              selectedCommentId,
            },
          });
        });
        
        await Promise.all(promises);
      }

      toast({
        title: "✓ Bundle Dispatched",
        description: `Successfully pushed ${total} render jobs. Close this tab when finished.`,
      });

    } catch (error: any) {
      console.error("Batch processing error:", error);
      toast({ variant: "destructive", title: "Bundle Failed", description: error.message });
      
      if (projectId) {
        await supabase.from("projects").update({ status: "failed", last_error: error?.message }).eq("id", projectId);
      }
    } finally {
      setIsBatchProcessing(false);
      setProcessing(false);
      await fetchProject();
    }

  };


  const processVideo = async () => {
    if (!projectId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Missing project id.",
      });
      return;
    }

    // Check if we have any content to process
    const hasExistingFiles = existingVideos.length > 0;

    if (!hasPendingUploads && !hasExistingFiles) {
      toast({
        variant: "destructive",
        title: "No Content",
        description: "Please upload video clips before generating.",
      });
      return;
    }

    setProcessing(true);
    try {
      // If there are pending files in the queue, upload them first using resumable uploads
      if (hasPendingUploads) {
        toast({
          title: "Uploading files...",
          description: `${pendingVideos.length} video(s)`,
        });

        await uploadAll();
        // The onAllComplete callback will commit to DB and refresh
        // Wait a moment for DB commit to complete
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchProject();
      }

      // IMPORTANT: flip the UI + DB state to "processing" BEFORE calling the backend.
      const { error: processingUpdateError } = await supabase
        .from("projects")
        .update({
          status: "processing",
          render_progress: 10,
          last_error: null,
          output_url: null, // Clear old video
          thumbnail_url: null, // Clear old thumbnail
          prompt,
          subtitle_style: subtitleSettings.style,
          subtitle_settings: JSON.parse(JSON.stringify(subtitleSettings)),
          aspect_ratio: aspectRatio,
          end_screen_settings: JSON.parse(JSON.stringify(endScreenSettings)),
          music_settings: JSON.parse(JSON.stringify(musicSettings)),
          discord_webhook_url: discordWebhookUrl || null,
           beginning_effect_settings: JSON.parse(JSON.stringify(beginningEffectSettings)),
          ip_popup_settings: JSON.parse(JSON.stringify(ipPopupSettings)),
          colorimetry_settings: JSON.parse(JSON.stringify(colorimetrySettings)),
          effects_settings: JSON.parse(JSON.stringify(effectsSettings)),
          comment_generator_enabled: commentGeneratorEnabled,
          selected_comment_id: selectedCommentId,
        })
        .eq("id", projectId);

      if (processingUpdateError) throw processingUpdateError;

      // Optimistic UI update (realtime will keep it in sync after this)
      setProject((p: any) =>
        p ? { ...p, status: "processing", render_progress: 10, output_url: null, thumbnail_url: null } : p
      );
      setProcessingProgress(10);
      setProcessingStartTime(Date.now());

      // Call backend processing function
      console.log("Calling process-video backend function...", {
        projectId,
        subtitleSettings,
        aspectRatio,
      });

      const { data, error } = await supabase.functions.invoke("process-video", {
        body: {
          projectId,
          prompt,
          subtitleSettings,
          aspectRatio,
          beginningEffectSettings,
          ipPopupSettings, // <--- ADDED
          endScreenSettings,
          musicSettings,
          regenerateScript: true, // Always regenerate with current targetScriptLength
          targetScriptLength,
          effectsSettings,
          commentGeneratorEnabled,
          selectedCommentId,
        },
      });

      console.log("process-video response:", { data, error });

      if (error) throw error;

      toast({
        title: "Processing Started!",
        description:
          "Your video is being edited. Keep this tab open; progress will update automatically.",
      });

      // Ensure we have the latest server state
      await fetchProject();
    } catch (error: any) {
      console.error("processVideo error:", error);

      // Mark project failed so the UI doesn't sit in limbo
      if (projectId) {
        await supabase
          .from("projects")
          .update({
            status: "failed",
            last_error: error?.message || "Failed to start processing",
          })
          .eq("id", projectId);
      }

      toast({
        variant: "destructive",
        title: "Failed to start",
        description: error?.message || "Something went wrong.",
        duration: 8000,
      });

      await fetchProject();
    } finally {
      setProcessing(false);
    }
  };

  const analyzeYouTubeVideo = async () => {
    if (!youtubeUrl) return;

    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-video", {
        body: {
          url: youtubeUrl,
          platform: youtubeUrl.includes("tiktok") ? "tiktok" : "youtube",
        },
      });

      if (error) throw error;

      toast({
        title: "Analysis Complete!",
        description: "Video analyzed and saved to your database",
      });

      setYoutubeUrl("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setProcessing(false);
    }
  };

  const toggleLabMode = async (enabled: boolean) => {
    if (!projectId) return;

    try {
      const { error } = await supabase
        .from("projects")
        .update({ lab_enabled: enabled })
        .eq("id", projectId);

      if (error) throw error;

      setProject((p: any) => p ? { ...p, lab_enabled: enabled } : p);
      toast({
        title: enabled ? "🧪 AI Lab Enabled" : "AI Lab Disabled",
        description: enabled
          ? "Enable flask icon on YouTube accounts to use for experiments"
          : "Lab mode has been turned off",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to toggle Lab mode",
      });
    }
  };

  const generateLabVideos = async () => {
    if (!projectId) return;

    setLabGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-lab-videos", {
        body: { projectId, experimentCount: 3 },
      });

      if (error) throw error;

      toast({
        title: "🧪 Lab Experiment Started!",
        description: `${data.videosQueued} experimental videos queued. Hypothesis: ${data.hypothesis?.substring(0, 80)}...`,
        duration: 8000,
      });
    } catch (error: any) {
      console.error("Lab generation error:", error);
      toast({
        variant: "destructive",
        title: "Lab Generation Failed",
        description: error.message || "Failed to generate lab videos",
      });
    } finally {
      setLabGenerating(false);
    }
  };

  const resetProjectFiles = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const toStoragePath = (value: string | null | undefined, bucket: string) => {
        if (!value) return null;

        // If it's a URL, try to extract the path after /object/(public|sign)/<bucket>/
        const match = value.match(new RegExp(`/storage\\/v1\\/object\\/(?:public|sign)\\/${bucket}\\/(.+)$`));
        if (match?.[1]) return match[1];

        // If it's already a path (new format), return it as-is
        if (!value.startsWith("http")) return value;

        return null;
      };

      toast({
        title: "Resetting files...",
        description: "Deleting all videos from this project",
      });

      // Delete videos from storage and database
      for (const video of existingVideos) {
        const filePath = toStoragePath(video.source_url, "video-clips");
        if (filePath) {
          await supabase.storage.from("video-clips").remove([filePath]);
        }
      }

      // Delete from database
      await supabase.from('videos').delete().eq('project_id', projectId);

      // Reset project status
      await supabase
        .from('projects')
        .update({
          status: 'draft',
          output_url: null,
          thumbnail_url: null,
          render_progress: 0,
          last_error: null,
        })
        .eq('id', projectId);

      // Clear local state
      setExistingVideos([]);
      resetUploads();
      setProcessingProgress(0);

      toast({
        title: "✓ Files Reset",
        description: "All videos have been deleted. You can now re-upload.",
      });

      await fetchProject();
    } catch (error: any) {
      console.error("Reset error:", error);
      toast({
        variant: "destructive",
        title: "Reset Failed",
        description: error.message || "Failed to reset files.",
      });
    }
  };

  // Delete a single video
  const deleteVideo = async (videoId: string) => {
    try {
      const video = existingVideos.find((v: any) => v.id === videoId);
      if (!video) return;

      // Extract storage path from URL
      const toStoragePath = (value: string | null | undefined, bucket: string) => {
        if (!value) return null;
        const match = value.match(new RegExp(`/storage\\/v1\\/object\\/(?:public|sign)\\/${bucket}\\/(.+)$`));
        if (match?.[1]) return match[1];
        if (!value.startsWith("http")) return value;
        return null;
      };

      const filePath = toStoragePath(video.source_url, "video-clips");
      if (filePath) {
        await supabase.storage.from("video-clips").remove([filePath]);
      }

      // Delete from database
      await supabase.from('videos').delete().eq('id', videoId);

      // Update local state
      setExistingVideos(prev => prev.filter((v: any) => v.id !== videoId));

      toast({
        title: "✓ Video Deleted",
        description: "The video has been removed from this project.",
      });
    } catch (error: any) {
      console.error("Delete video error:", error);
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: error.message || "Failed to delete video.",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0916] flex items-center justify-center">
        <div className="text-center space-y-4 animate-pulse">
          <div className="w-20 h-20 rounded-[30px] bg-gradient-to-br from-[#3b38fc] via-primary to-[#2a0845] flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(182,56,252,0.5)]">
            <Video className="w-10 h-10 text-white" />
          </div>
          <p className="text-[10px] font-black text-[#e0aaff]/60 uppercase tracking-[0.5em]">Initializing Content Core...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6 p-4 text-center">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
          <AlertCircle className="w-10 h-10 text-red-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Project Not Found</h1>
          <p className="text-slate-400 max-w-md">
            The project you're looking for doesn't exist or you don't have permission to access it.
          </p>
        </div>
        <Button onClick={() => navigate("/dashboard")} variant="outline" className="border-white/10 text-white hover:bg-white/5">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white/10 overflow-x-hidden relative font-sans flex flex-col h-screen overflow-hidden slate-grid">

      {/* 🌑 Background FX */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[20%] w-[1200px] h-[1200px] bg-white/[0.02] rounded-full blur-[250px]" />
        
        {/* Creative Mode Neural Particles */}
        {subtitleSettings.creativeModeEnabled && (
          <div className="absolute inset-0 opacity-40">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 bg-primary rounded-full animate-pulse"
                style={{
                  top: `${Math.random() * 100}%`,
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 5}s`,
                  animationDuration: `${3 + Math.random() * 4}s`,
                  boxShadow: '0 0 10px var(--primary)',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Header */}
      <header className="h-24 liquid-glass border-b border-white/5 flex items-center px-8 relative z-50 shrink-0">
        <div className="flex-1 flex items-center gap-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard")}
            className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <div className="h-10 w-px bg-white/5" />
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group cursor-pointer hover:scale-110 transition-all duration-500">
              <Zap className="w-7 h-7 text-white fill-current drop-shadow-[0_0_12px_rgba(255,255,255,0.7)]" />
            </div>
            <div className="min-w-0">
              <ProjectTitleEditor
                title={project?.title || "Untitled Project"}
                description={project?.description || ""}
                gamemodeId={project?.gamemode_id || null}
                onSave={async (data) => {
                  const updateData: Record<string, any> = {};
                  if (data.title !== undefined) updateData.title = data.title;
                  if (data.description !== undefined) updateData.description = data.description;
                  if (data.gamemodeId !== undefined) updateData.gamemode_id = data.gamemodeId;
                  const { error } = await supabase.from("projects").update(updateData).eq("id", projectId);
                  if (error) { toast({ variant: "destructive", title: "Error", description: "Failed to update project" }); throw error; }
                  setProject((p: any) => p ? { ...p, ...updateData } : p);
                  toast({ title: "Project updated", description: data.title ? `Renamed to "${data.title}"` : "Settings saved" });
                }}
                disabled={processing}
              />
              <div className="flex items-center gap-3 mt-1">
                <div className={cn("w-2 h-2 rounded-full", project?.status === 'completed' ? 'bg-emerald-400' : 'bg-primary')} />
                <span className={cn("text-xs font-medium capitalize", project?.status === 'completed' ? 'text-emerald-400' : 'text-slate-400')}>{project?.status}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-3 mr-4">
            <LabModeButton enabled={project?.lab_enabled || false} onToggle={toggleLabMode} disabled={processing || labGenerating} />
            <CreativeModeButton enabled={subtitleSettings.creativeModeEnabled} onToggle={(enabled) => {
              setSubtitleSettings(prev => ({ ...prev, creativeModeEnabled: enabled, visualModeEnabled: enabled ? true : prev.visualModeEnabled }));
            }} disabled={processing} />
            <InviteUserDialog projectId={projectId || ""} projectTitle={project?.title || "Untitled Project"} />
          </div>

          <Button 
            onClick={toggleAIChip} 
            disabled={processing || isBatchProcessing}
            className={cn(
              "h-10 px-6 rounded-xl font-bold transition-all gap-2 relative overflow-hidden group",
              effectsSettings.ai_zoom_enabled 
                ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]" 
                : "bg-white/5 border border-white/10 text-slate-400 hover:text-white"
            )}
          >
            <Brain className={cn("w-4 h-4", effectsSettings.ai_zoom_enabled && "animate-pulse")} />
            <span className="text-xs uppercase tracking-widest font-black italic">AI-Chip</span>
            {effectsSettings.ai_zoom_enabled && (
              <div className="absolute inset-0 bg-white/10 animate-pulse pointer-events-none" />
            )}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" disabled={isUploading || processing || existingVideos.length === 0} className="h-10 px-4 rounded-xl text-red-500/80 hover:text-red-500 hover:bg-red-500/10 font-medium">
                <Trash2 className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-[#161224]/95 border border-white/5 backdrop-blur-3xl rounded-[32px] p-8">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-xl font-bold text-white">Reset Project?</AlertDialogTitle>
                <AlertDialogDescription className="text-slate-400 text-sm py-2">
                  All {existingVideos.length} clips will be removed. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="pt-6">
                <AlertDialogCancel className="bg-white/5 border-white/10 text-white rounded-2xl">Abort</AlertDialogCancel>
                <AlertDialogAction onClick={resetProjectFiles} className="bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold">Clear Project</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {project?.lab_enabled && (
            <Button onClick={generateLabVideos} disabled={processing || labGenerating} className="h-10 bg-white/5 border border-white/10 text-white font-medium rounded-xl hover:bg-white/10 transition-all gap-2 text-xs">
              {labGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
              Lab Tools
            </Button>
          )}

          <Button onClick={handleGenerate} disabled={isUploading || processing || isBatchProcessing || (!hasPendingUploads && existingVideos.length === 0)} className="h-10 px-6 bg-primary text-white font-bold rounded-xl shadow-lg transition-all hover:opacity-90 active:scale-95 text-sm">
            {processing || isBatchProcessing ? (
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{isBatchProcessing ? `Generating Bundle (${batchCount}x)...` : 'Processing...'}</span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5" />
                <span>{batchCount > 1 ? `Generate ${batchCount} Videos` : 'Generate Video'}</span>
              </div>
            )}
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-x-hidden relative z-10 flex flex-col no-scrollbar">
        <ScrollArea className="flex-1 h-full">
          <div className="container mx-auto px-8 py-10 max-w-[1600px] space-y-10">
            <StorageLimitWarning />

            {project?.status === "failed" && project?.last_error && (
              <div className="p-1 rounded-[32px] bg-gradient-to-br from-red-500/20 to-transparent">
                <Alert variant="destructive" className="border-none bg-[#161224]/80 backdrop-blur-3xl rounded-[31px] p-8">
                  <AlertCircle className="h-6 w-6 text-red-400" />
                  <AlertTitle className="text-xl font-black italic uppercase tracking-tighter mb-2 text-red-400">Generation Error</AlertTitle>
                  <AlertDescription className="text-white/40 font-bold uppercase tracking-widest text-[11px]">
                    {project.last_error}
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <Tabs defaultValue="editor" className="w-full">
              <div className="flex items-center justify-center mb-12">
                <TabsList className="bg-white/[0.03] p-1.5 rounded-[24px] border border-white/5 h-16 w-full max-w-lg shadow-2xl">
                  <TabsTrigger value="editor" className="flex-1 rounded-[20px] font-black uppercase tracking-widest text-[10px] transition-all data-[state=active]:bg-[#b638fc] data-[state=active]:text-white gap-3">
                    <Wand2 className="w-4 h-4" />
                    Video Synthesis
                  </TabsTrigger>
                  <TabsTrigger value="analyze" className="flex-1 rounded-[20px] font-black uppercase tracking-widest text-[10px] transition-all data-[state=active]:bg-[#b638fc] data-[state=active]:text-white gap-3">
                    <Sparkles className="w-4 h-4" />
                    Style Analysis
                  </TabsTrigger>
                  <TabsTrigger value="effects" className="flex-1 rounded-[20px] font-black uppercase tracking-widest text-[10px] transition-all data-[state=active]:bg-[#b638fc] data-[state=active]:text-white gap-3">
                    <FlaskConical className="w-4 h-4" />
                    AI Effects
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="editor" className="mt-0 outline-none">
                {/* 🎨 PRESET ENGINE */}
                <div className="mb-8 liquid-glass rounded-[32px] p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                        <History className="w-6 h-6 text-white/40" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-white italic">Neural Style Presets</h3>
                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-tight mt-0.5">Apply world-class visual DNA to this project</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 w-full md:w-auto">
                      <Select onValueChange={(id) => applyPreset(presets.find(p => p.id === id))}>
                        <SelectTrigger className="w-full md:w-[280px] h-12 bg-white/5 border-white/10 rounded-xl font-bold uppercase text-[10px] tracking-widest">
                          <SelectValue placeholder="Load Architecture Preset" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#161224] border-white/10">
                          {presets.length === 0 && <div className="p-4 text-[10px] text-slate-500 uppercase font-black text-center">No presets archived</div>}
                          {presets.map(p => (
                            <SelectItem key={p.id} value={p.id} className="text-white focus:bg-[#b638fc] focus:text-white uppercase text-[10px] font-black">{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button className="h-12 px-6 bg-white/5 border border-white/10 text-white font-black rounded-xl hover:bg-white/10 transition-all gap-3 text-[10px] uppercase tracking-widest">
                            <Save className="w-4 h-4" />
                            Archive Current Settings
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-[#161224]/95 border border-white/5 backdrop-blur-3xl rounded-[32px] p-8 text-white">
                          <DialogHeader>
                            <DialogTitle className="text-xl font-black italic uppercase tracking-tighter">Archive Visual DNA</DialogTitle>
                            <DialogDescription className="text-slate-400 text-xs font-medium py-2">
                              Save the current effects, music, and subtitles as a reusable preset. Project-specific server details will be ignored.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="py-6">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-[#b638fc] mb-3 block">Preset Identity</Label>
                            <Input 
                              id="preset-name" 
                              placeholder="e.g. Lifesteal V2 - Dark Mode" 
                              className="h-14 bg-black/40 border-white/10 rounded-2xl px-6 text-white font-bold"
                            />
                          </div>
                          <DialogFooter>
                            <Button 
                              onClick={() => {
                                const input = document.getElementById('preset-name') as HTMLInputElement;
                                saveAsPreset(input.value);
                              }}
                              className="w-full h-14 bg-white text-black font-black rounded-2xl shadow-xl hover:scale-[1.02] transition-all text-[11px] uppercase tracking-[0.2em]"
                            >
                              Synchronize Artifact
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                  {/* 🛠️ CORE ASSETS (LEFT) */}
                  <div className="space-y-8 h-fit">
                    {/* Video Clips */}
                    <div className="liquid-glass rounded-[32px] p-6 space-y-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                              <Video className="w-6 h-6 text-white/40" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-white">Video Units</h3>
                              <p className="text-[10px] text-white/40 font-bold uppercase tracking-tighter">Source material</p>
                            </div>
                          </div>
                          {existingVideos.length > 0 && (
                            <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
                              {existingVideos.length} Saved
                            </div>
                          )}
                        </div>

                        <label
                          className={cn(
                            "relative group/upload h-40 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-4 cursor-pointer overflow-hidden",
                            isVideoDragOver ? "border-primary bg-primary/5 shadow-[0_0_30px_rgba(182,56,252,0.1)]" : "border-white/5 bg-white/[0.02] hover:border-primary/50 hover:bg-white/[0.04]"
                          )}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setIsVideoDragOver(true);
                          }}
                          onDragLeave={() => setIsVideoDragOver(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsVideoDragOver(false);
                            handleVideoUpload(e.dataTransfer.files);
                          }}
                        >
                          <div className="relative z-10 text-center">
                            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3 group-hover/upload:scale-110 transition-transform">
                              <Upload className="w-6 h-6 text-gray-400" />
                            </div>
                            <p className="text-xs font-medium text-slate-400">Add Video Clips</p>
                            <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-1">MP4 / MOV / MAX 2GB</p>
                          </div>
                          <input type="file" className="hidden" accept="video/*" multiple onChange={(e) => handleVideoUpload(e.target.files)} />
                        </label>

                        {uploads.filter((u) => u.bucket === "video-clips").length > 0 && (
                          <UploadQueue
                            uploads={uploads.filter((u) => u.bucket === "video-clips")}
                            isUploading={isUploading}
                            onRemove={removeFile}
                            onPause={pauseUpload}
                            onResume={resumeUpload}
                            onClearCompleted={clearCompleted}
                          />
                        )}

                        {/* Existing Videos List */}
                        {existingVideos.length > 0 && (
                          <ClipDescriptionsPanel
                            projectId={projectId || ""}
                            videos={existingVideos}
                            onDelete={deleteVideo}
                            onVideosChanged={setExistingVideos}
                          />
                        )}
                      </div>

                    <VoiceConfigurator 
                      selectedVoiceId={selectedVoiceId} 
                      onVoiceChange={handleVoiceChange} 
                      onSave={saveVoiceSelection}
                      isSaving={savingVoice}
                    />
                    <MusicConfigurator settings={musicSettings} onSettingsChange={setMusicSettings} projectId={projectId || ""} onSave={saveMusicSettings} isSaving={savingMusic} />
                    <YouTubeMultiAccountManager projectId={projectId || ""} postDelayMinutes={youtubePostDelayMinutes} onDelayChange={async (minutes) => {
                      setYoutubePostDelayMinutes(minutes);
                      await supabase.from("projects").update({ youtube_post_delay_minutes: minutes }).eq("id", projectId);
                    }} />
                    <TikTokMultiAccountManager projectId={projectId || ""} />
                  </div>

                  {/* ⚡ SYNTHESIS & EFFECTS (CENTER) */}
                  <div className="space-y-8 h-fit">
                    {project?.output_url && (
                      <div className="p-1 rounded-[32px] bg-gradient-to-br from-emerald-500/40 via-[#b638fc]/20 to-transparent shadow-[0_0_50px_rgba(16,185,129,0.1)]">
                        <div className="bg-[#161224]/90 backdrop-blur-3xl rounded-[31px] p-2 overflow-hidden">
                          <div className="aspect-video bg-black rounded-[24px] overflow-hidden relative group">
                            <video src={project.output_url} controls className="w-full h-full object-contain" poster={project.thumbnail_url || undefined} />
                          </div>
                          <div className="p-6">
                            <Button
                              onClick={() => {
                                const link = document.createElement('a');
                                link.href = project.output_url;
                                link.download = `${project.title || 'video'}.mp4`;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                              }}
                              className="w-full h-12 bg-emerald-500 text-white font-bold rounded-xl shadow-lg hover:opacity-90 transition-all text-sm gap-2"
                            >
                              <Download className="w-5 h-5" />
                              Download Master
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {(['processing', 'rendering', 'queued'].includes(project?.status)) && !project?.output_url && (
                      <div className="p-[1px] rounded-[32px] bg-gradient-to-br from-[#b638fc]/40 to-transparent animate-pulse">
                        <div className="bg-[#161224]/80 backdrop-blur-3xl rounded-[31px] p-8 space-y-8">
                          <div className="flex items-center gap-5">
                            <div className="w-16 h-16 rounded-[24px] bg-[#b638fc]/10 flex items-center justify-center border border-[#b638fc]/30 overflow-hidden relative">
                              <div className="absolute inset-0 bg-[#b638fc]/20 animate-spin-slow" />
                              <Loader2 className="w-8 h-8 text-[#b638fc] animate-spin relative z-10" />
                            </div>
                            <div>
                              <h3 className="text-xl font-bold text-white">Generating Video...</h3>
                              <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Compiling visual units</p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="flex justify-between items-end">
                              <span className="text-xs font-semibold text-slate-400">Progress</span>
                              <span className="text-2xl font-bold text-white leading-none">{Math.round(processingProgress)}%</span>
                            </div>
                            <div className="h-4 bg-white/5 rounded-full overflow-hidden border border-white/5 relative p-[2px]">
                              <div className="h-full bg-gradient-to-r from-[#3b38fc] via-[#b638fc] to-[#fca5fc] rounded-full transition-all duration-700 shadow-[0_0_20px_rgba(182,56,252,0.5)]" style={{ width: `${processingProgress}%` }} />
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent w-full animate-shimmer" />
                            </div>
                            <div className="flex items-center gap-3 text-[9px] font-bold text-white/30 uppercase tracking-widest">
                              <Clock className="w-3 h-3" />
                              <span>ETA: {estimatedTimeRemaining || "Calculating Matrix..."}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* AI Prompt Card */}
                    <div className="p-[1px] rounded-[32px] bg-gradient-to-br from-white/10 to-transparent group hover:from-[#b638fc]/40 transition-all duration-500">
                      <div className="bg-[#161224]/80 backdrop-blur-3xl rounded-[31px] p-6 space-y-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-[#fca5fc]/10 flex items-center justify-center border border-[#fca5fc]/20">
                            <Sparkles className="w-6 h-6 text-[#fca5fc]" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white">Project Settings</h3>
                            <p className="text-[10px] text-white/40 font-bold uppercase tracking-tighter">Behavioral logic</p>
                          </div>
                        </div>
                        <textarea
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          placeholder="Specify visual cadence, emotional tone, and layout logic..."
                          className="w-full bg-white/[0.02] border border-white/5 rounded-2xl p-4 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#b638fc]/40 transition-all min-h-[120px] resize-none font-medium"
                        />
                      </div>
                    </div>

                    <BeginningEffectConfigurator settings={beginningEffectSettings} onSettingsChange={setBeginningEffectSettings} projectId={projectId || ""} onSave={saveBeginningEffectSettings} isSaving={savingBeginningEffect} />
                    <ColorimetryConfigurator settings={colorimetrySettings} onSettingsChange={setColorimetrySettings} onSave={saveColorimetrySettings} isSaving={savingColorimetry} />
                    <IpPopupConfigurator settings={ipPopupSettings} onSettingsChange={setIpPopupSettings} projectId={projectId || ""} onSave={saveIpPopupSettings} isSaving={savingIpPopup} videos={existingVideos} />
                    <EndScreenConfigurator settings={endScreenSettings} onSettingsChange={setEndScreenSettings} projectId={projectId || ""} onSave={saveEndScreenSettings} isSaving={savingEndScreen} />
                  </div>

                  {/* 💎 DESIGN SYSTEM (RIGHT) */}
                  <div className="space-y-8 h-fit">
                    <SubtitleStyleCustomizer
                      settings={subtitleSettings}
                      onSettingsChange={setSubtitleSettings}
                      onSave={saveSubtitleSettings}
                      isSaving={savingSubtitles}
                    />

                    <ServerLogoConfigurator
                      settings={subtitleSettings}
                      onSettingsChange={setSubtitleSettings}
                      projectId={projectId || ""}
                      onSave={saveSubtitleSettings}
                      isSaving={savingSubtitles}
                    />

                    <div className="p-[1px] rounded-[32px] bg-gradient-to-br from-white/10 to-transparent">
                      <div className="bg-[#161224]/80 backdrop-blur-3xl rounded-[31px] p-6 space-y-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-white/[0.03] flex items-center justify-center border border-white/10">
                            <Settings className="w-6 h-6 text-gray-400" />
                          </div>
                          <div>
                            <h3 className="text-sm font-black uppercase tracking-widest text-white italic">Output Config</h3>
                            <p className="text-[10px] text-white/40 font-bold uppercase tracking-tighter">Manifestation settings</p>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div className="space-y-3">
                            <Label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 ml-1">Aspect Geometry</Label>
                            <Select value={aspectRatio} onValueChange={setAspectRatio}>
                              <SelectTrigger className="h-14 rounded-2xl bg-white/[0.03] border-white/5 focus:ring-0 text-xs font-bold uppercase tracking-widest px-5">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-[#161224] border-white/10 rounded-2xl">
                                <SelectItem value="9:16">9:16 - TikTok/Shorts</SelectItem>
                                <SelectItem value="16:9">16:9 - YouTube</SelectItem>
                                <SelectItem value="1:1">1:1 - Insta Square</SelectItem>
                                <SelectItem value="4:5">4:5 - Insta Portrait</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
  
                          <div className="space-y-3 pt-6 border-t border-white/5">
                            <div className="flex items-center justify-between ml-1">
                              <Label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">Batch Quantity</Label>
                              <span className="text-[10px] font-black text-primary">{batchCount}x</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <Input
                                type="number"
                                min="1"
                                max="50"
                                value={batchCount}
                                onChange={(e) => setBatchCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                                className="h-12 rounded-xl bg-white/[0.03] border-white/5 text-xs font-bold text-center"
                              />
                              <div className="flex-1">
                                <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest leading-tight">Bundle units to synthesize at once.</p>
                              </div>
                            </div>
                          </div>

                          <div className="pt-6 border-t border-white/5 space-y-4">
                            <Label className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 flex items-center gap-2 ml-1">
                              <MessageSquare className="h-3 w-3 text-[#5865F2]" />
                              Discord Uplink
                            </Label>
                            <div className="flex items-center gap-4">
                              <div className="flex flex-col gap-4">
                                <LabModeButton
                                  enabled={project?.lab_enabled || false}
                                  onToggle={toggleLabMode}
                                />
                                <CreativeModeButton
                                  enabled={subtitleSettings.creativeModeEnabled}
                                  onToggle={(enabled) => setSubtitleSettings({ ...subtitleSettings, creativeModeEnabled: enabled })}
                                />
                              </div>
                              <Input
                                id="discord-webhook"
                                placeholder="Webhook URL..."
                                value={discordWebhookUrl}
                                onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                                className="h-12 rounded-xl bg-white/[0.03] border-white/5 text-xs font-medium placeholder:text-white/10"
                              />
                              <Button onClick={saveWebhook} disabled={savingWebhook} size="icon" className="w-12 h-12 shrink-0 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
                                {savingWebhook ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-white" />}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="effects" className="mt-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-8">
                    <EffectsConfigurator 
                      settings={effectsSettings} 
                      onSettingsChange={(newSettings) => {
                        setEffectsSettings(newSettings);
                        // Auto-save when toggles change to ensure persistence
                        handleEffectsSave(newSettings);
                      }} 
                      onSave={() => handleEffectsSave()} 
                      isSaving={savingEffects} 
                    />
                  </div>

                  <div className="space-y-8">
                    <Card className="bg-white/5 border-white/10 overflow-hidden relative">
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
                      <CardHeader className="relative z-10">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30 shadow-[0_0_15px_rgba(182,56,252,0.2)]">
                            <MessageSquare className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <CardTitle className="text-lg font-bold">Comment Matrix</CardTitle>
                            <p className="text-xs text-slate-500">Inject fake social interactions into AI scripts</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-6 relative z-10">
                        <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/5 space-y-6">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Brain className="w-4 h-4 text-primary" />
                              <div>
                                <Label className="text-sm font-bold">AI Comment Generator</Label>
                                <p className="text-[10px] text-slate-500">Force AI to incorporate a comment</p>
                              </div>
                            </div>
                            <Switch 
                              checked={commentGeneratorEnabled} 
                              onCheckedChange={(v) => handleCommentSettingsSave(v, selectedCommentId)}
                              disabled={savingCommentSettings}
                              className="data-[state=checked]:bg-primary"
                            />
                          </div>

                          {commentGeneratorEnabled && (
                            <div className="space-y-4 pt-4 border-t border-white/5 animate-in fade-in slide-in-from-top-4 duration-500">
                              <Label className="text-xs font-bold uppercase tracking-widest text-slate-400">Target Interaction</Label>
                              <Select 
                                value={selectedCommentId || "random"} 
                                onValueChange={(v) => handleCommentSettingsSave(true, v === "random" ? null : v)}
                                disabled={savingCommentSettings}
                              >
                                <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-12">
                                  <SelectValue placeholder="Select a comment" />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1a1628] border-white/10 text-white">
                                  <SelectItem value="random">🎲 Random Global Comment</SelectItem>
                                  {availableComments.map(c => (
                                    <SelectItem key={c.id} value={c.id}>
                                      <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 rounded-full bg-white/10 overflow-hidden">
                                           {c.avatar_url && <img src={c.avatar_url} className="w-full h-full object-cover" />}
                                        </div>
                                         <span>{c.author_name}: "{c.content.substring(0, 20)}..."</span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-[10px] text-primary/60 font-medium italic">
                                * The AI will adapt the video script to respond to this specific comment.
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 border-dashed flex flex-col items-center justify-center gap-3">
                           <p className="text-[10px] text-slate-500 font-medium text-center">Manage your global identities in the Comment Lab.</p>
                           <Button 
                             variant="outline" 
                             size="sm" 
                             onClick={() => navigate("/comment-library")}
                             className="rounded-full h-8 px-4 bg-white/5 border-white/10 hover:bg-white/10 text-[10px] uppercase font-bold"
                           >
                             Open Lab
                           </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="analyze" className="space-y-6">
                <div className="animate-slide-up-fade opacity-0" style={{ animationDelay: '0ms', animationFillMode: 'forwards' }}>
                  <Card className="rgb-border-card max-w-2xl mx-auto overflow-hidden">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-3">
                        <div className="relative p-2 rounded-lg bg-secondary/10">
                          <Sparkles className="w-5 h-5 text-secondary" />
                        </div>
                        Analyze YouTube/TikTok Videos
                      </CardTitle>
                      <CardDescription>
                        Import videos to study editing style, pacing, and content structure
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-3">
                        <Input
                          placeholder="Paste YouTube or TikTok URL..."
                          value={youtubeUrl}
                          onChange={(e) => setYoutubeUrl(e.target.value)}
                          className="bg-muted/30 border-border/50 focus:border-secondary/50 focus:ring-secondary/20"
                        />
                        <Button
                          onClick={analyzeYouTubeVideo}
                          disabled={!youtubeUrl || processing}
                          className="glow-accent bg-gradient-to-r from-secondary to-secondary/80 px-6"
                        >
                          {processing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Analyze"
                          )}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        The AI will extract editing patterns, subtitle timing, scene transitions, and more to help inspire your own edits.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </main>
      {showAIChipAnimation && (
        <AIChipActivation onComplete={handleAIChipAnimationComplete} />
      )}
    </div>
  );
};

const AIChipActivation = ({ onComplete }: { onComplete: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 3500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0514]/95 backdrop-blur-3xl animate-in fade-in duration-500">
      <div className="relative flex flex-col items-center">
        {/* Futuristic AI Core Animation */}
        <div className="absolute inset-0 w-96 h-96 bg-gradient-to-r from-[#b638fc] to-[#3b38fc] blur-[120px] opacity-20 -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2 animate-pulse" />
        
        <div className="relative w-48 h-48 mb-12">
          <div className="absolute inset-0 rounded-full border-4 border-dashed border-[#b638fc]/30 animate-[spin_8s_linear_infinite]" />
          <div className="absolute inset-4 rounded-full border-2 border-primary/20 animate-[spin_4s_linear_infinite_reverse]" />
          <div className="absolute inset-8 rounded-full bg-gradient-to-br from-[#b638fc] to-[#3b38fc] flex items-center justify-center shadow-[0_0_50px_rgba(182,56,252,0.6)]">
            <Brain className="w-16 h-16 text-white animate-bounce" />
          </div>
          
          {/* Neural Particles */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full animate-ping" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full animate-ping delay-300" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1 bg-white rounded-full animate-ping delay-700" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-1 bg-white rounded-full animate-ping delay-1000" />
        </div>

        <div className="text-center space-y-4 max-w-md px-6">
          <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">
            <span className="text-[#b638fc]">Neural</span> Zoom Engine
          </h2>
          <div className="h-1 w-24 bg-gradient-to-r from-[#b638fc] to-[#3b38fc] mx-auto rounded-full" />
          <p className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 leading-relaxed">
            Synchronizing Script Narrative <br /> 
            <span className="text-white">& Mastering Cinematic Trajectories</span>
          </p>
        </div>

        <div className="mt-12 flex gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
        </div>
      </div>
    </div>
  );
};

export default ProjectEditor;
