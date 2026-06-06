import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
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
} from "@/components/ui/dialog";
import {
  Trash2,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Pencil,
  RefreshCw,
  Save,
  Expand,
  Wand2,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

type DescriptionStatus = "pending" | "processing" | "ready" | "failed" | "edited";

export interface ClipVideo {
  id: string;
  project_id?: string;
  source_url: string;
  file_url?: string | null;
  file_name?: string | null;
  description?: string | null;
  description_status?: DescriptionStatus | null;
  description_error?: string | null;
  description_model?: string | null;
  description_generated_at?: string | null;
  ai_zoom_type?: 'in' | 'out' | 'none';
  ai_zoom_scale?: number;
  ai_zoom_duration?: number;
}

interface Props {
  projectId: string;
  videos: ClipVideo[];
  onDelete: (videoId: string) => void | Promise<void>;
  onVideosChanged: (updater: (prev: ClipVideo[]) => ClipVideo[]) => void;
}

function statusBadge(status: DescriptionStatus | null | undefined) {
  switch (status) {
    case "ready":
      return (
        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[9px] h-4 py-0 gap-1">
          <CheckCircle2 className="w-2.5 h-2.5" /> Described
        </Badge>
      );
    case "edited":
      return (
        <Badge variant="secondary" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[9px] h-4 py-0 gap-1">
          <Pencil className="w-2.5 h-2.5" /> Edited
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="secondary" className="bg-[#b638fc]/10 text-[#b638fc] border-[#b638fc]/30 text-[9px] h-4 py-0 gap-1">
          <Loader2 className="w-2.5 h-2.5 animate-spin" /> Describing
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="secondary" className="bg-red-500/10 text-red-400 border-red-500/30 text-[9px] h-4 py-0 gap-1">
          <AlertCircle className="w-2.5 h-2.5" /> Failed
        </Badge>
      );
    case "pending":
    default:
      return (
        <Badge variant="secondary" className="bg-white/5 text-white/40 border-white/10 text-[9px] h-4 py-0 gap-1">
          Queued
        </Badge>
      );
  }
}

export function ClipDescriptionsPanel({ projectId, videos, onDelete, onVideosChanged }: Props) {
  const { toast } = useToast();
  const [analyzing, setAnalyzing] = useState(false);
  const [retryingIds, setRetryingIds] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingIds, setEditingIds] = useState<Record<string, boolean>>({});
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const [fullscreenDraft, setFullscreenDraft] = useState("");
  const [fullscreenIsSaving, setFullscreenIsSaving] = useState(false);
  const [fullscreenIsRegenerating, setFullscreenIsRegenerating] = useState(false);
  const [fullscreenPlaybackUrl, setFullscreenPlaybackUrl] = useState<string | null>(null);
  const [fullscreenPlaybackError, setFullscreenPlaybackError] = useState<string | null>(null);
  const [ratedVideoIds, setRatedVideoIds] = useState<Record<string, 'like' | 'dislike'>>({});

  const fullscreenVideo = useMemo(
    () => (fullscreenId ? videos.find((v) => v.id === fullscreenId) || null : null),
    [fullscreenId, videos]
  );

  // Resolve a playable URL for the fullscreen clip. Most stored source_url
  // values are bare storage paths (e.g. "<userid>/<projectid>/<file>.mp4"),
  // which the browser cannot play directly. We generate a time-limited signed
  // URL via Supabase Storage when the dialog opens.
  useEffect(() => {
    if (!fullscreenId || !fullscreenVideo) {
      setFullscreenPlaybackUrl(null);
      setFullscreenPlaybackError(null);
      return;
    }
    const raw = fullscreenVideo.file_url || fullscreenVideo.source_url || "";

    // Already a playable absolute URL (full public/signed URL with token)
    if (raw.startsWith("http") && raw.includes("token=")) {
      setFullscreenPlaybackUrl(raw);
      setFullscreenPlaybackError(null);
      return;
    }

    const KNOWN_BUCKETS = new Set(["video-clips", "voiceovers", "project-assets"]);
    let bucket = "video-clips";
    let path = raw;

    if (raw.startsWith("http") && raw.includes("/storage/v1/object/public/")) {
      const afterPublic = raw.split("/storage/v1/object/public/")[1];
      const parts = afterPublic.split("/");
      bucket = parts[0];
      path = decodeURIComponent(afterPublic.substring(bucket.length + 1));
    } else {
      const first = raw.split("/")[0];
      if (KNOWN_BUCKETS.has(first)) {
        bucket = first;
        path = decodeURIComponent(raw.substring(bucket.length + 1));
      } else {
        path = decodeURIComponent(raw);
      }
    }

    let cancelled = false;
    setFullscreenPlaybackUrl(null);
    setFullscreenPlaybackError(null);
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) {
          setFullscreenPlaybackError(error?.message || "Could not load clip");
          setFullscreenPlaybackUrl(null);
        } else {
          setFullscreenPlaybackUrl(data.signedUrl);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setFullscreenPlaybackError(e instanceof Error ? e.message : "Could not load clip");
      });
    return () => {
      cancelled = true;
    };
    // fullscreenVideo identity changes on every render; we intentionally depend
    // only on the id + the playable URL fields we actually consume here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreenId, fullscreenVideo?.source_url, fullscreenVideo?.file_url]);

  // Seed the editable draft whenever a new clip is opened in fullscreen,
  // OR when the underlying description refreshes (e.g. regenerate just finished).
  useEffect(() => {
    if (!fullscreenId) return;
    const v = videos.find((x) => x.id === fullscreenId);
    if (!v) return;
    if ((v.description_status === "ready" || v.description_status === "edited") && fullscreenDraft === "") {
      setFullscreenDraft(v.description || "");
    } else if (fullscreenDraft === "" && (v.description || "").length > 0) {
      setFullscreenDraft(v.description || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreenId, fullscreenVideo?.description, fullscreenVideo?.description_status]);

  const stats = useMemo(() => {
    const s = { ready: 0, edited: 0, processing: 0, failed: 0, pending: 0 };
    for (const v of videos) {
      const st = (v.description_status || "pending") as DescriptionStatus;
      s[st as keyof typeof s] = (s[st as keyof typeof s] || 0) + 1;
    }
    return s;
  }, [videos]);

  // Realtime subscription: keep descriptions fresh as the queue completes.
  const onVideosChangedRef = useRef(onVideosChanged);
  onVideosChangedRef.current = onVideosChanged;

  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`videos:${projectId}`)
      // Supabase realtime overload typing is unstable across versions; the
      // string literal is not carried through to callback types. Cast locally.
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "public",
          table: "videos",
          filter: `project_id=eq.${projectId}`,
        },
        (payload: { new: ClipVideo }) => {
          const next = payload.new;
          if (!next?.id) return;
          onVideosChangedRef.current((prev) =>
            prev.map((v) => (v.id === next.id ? { ...v, ...next } : v))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  const startEdit = (video: ClipVideo) => {
    setDrafts((d) => ({ ...d, [video.id]: video.description || "" }));
    setEditingIds((e) => ({ ...e, [video.id]: true }));
  };

  const cancelEdit = (videoId: string) => {
    setEditingIds((e) => ({ ...e, [videoId]: false }));
    setDrafts((d) => {
      const next = { ...d };
      delete next[videoId];
      return next;
    });
  };

  const saveEdit = async (video: ClipVideo) => {
    const text = (drafts[video.id] ?? "").trim();
    setSavingIds((s) => ({ ...s, [video.id]: true }));
    try {
      const { error } = await supabase
        .from("videos")
        .update({
          description: text || null,
          description_status: "edited",
          description_error: null,
        })
        .eq("id", video.id);
      if (error) throw error;
      onVideosChanged((prev) =>
        prev.map((v) =>
          v.id === video.id
            ? { ...v, description: text || null, description_status: "edited" as DescriptionStatus }
            : v
        )
      );
      setEditingIds((e) => ({ ...e, [video.id]: false }));
      toast({ title: "Description saved" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not update description.";
      toast({ variant: "destructive", title: "Failed to save", description: message });
    } finally {
      setSavingIds((s) => ({ ...s, [video.id]: false }));
    }
  };

  const retryOne = async (video: ClipVideo) => {
    setRetryingIds((r) => ({ ...r, [video.id]: true }));
    try {
      // Flip status optimistically; queue worker will set 'processing' shortly.
      onVideosChanged((prev) =>
        prev.map((v) =>
          v.id === video.id
            ? { ...v, description_status: "pending" as DescriptionStatus, description_error: null }
            : v
        )
      );
      const { error } = await supabase.functions.invoke("describe-clips-batch", {
        body: { projectId, force: false },
      });
      if (error) throw error;
      toast({ title: "Queued for re-analysis" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not enqueue clip.";
      toast({ variant: "destructive", title: "Retry failed", description: message });
    } finally {
      setRetryingIds((r) => ({ ...r, [video.id]: false }));
    }
  };

  const rateZoom = async (video: ClipVideo, rating: 'like' | 'dislike') => {
    if (ratedVideoIds[video.id]) return;
    
    setRatedVideoIds(prev => ({ ...prev, [video.id]: rating }));
    try {
      const { error } = await supabase
        .from('ai_zoom_feedback')
        .insert({
          project_id: projectId,
          video_id: video.id,
          clip_index: videos.indexOf(video),
          zoom_type: video.ai_zoom_type || 'none',
          scale: video.ai_zoom_scale || 1.35,
          rating: rating,
        });

      if (error) throw error;
      toast({ 
        title: rating === 'like' ? "🚀 AI Synchronized" : "⚠️ Calibration Received", 
        description: rating === 'like' ? "The AI will double down on this style." : "The AI will avoid this trajectory next time." 
      });
    } catch (e) {
      console.error("Feedback error:", e);
      toast({ variant: "destructive", title: "Feedback Offline", description: "Could not save neural calibration." });
    }
  };

  const analyzeAll = async (force: boolean) => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("describe-clips-batch", {
        body: { projectId, force, includeEdited: false },
      });
      if (error) throw error;
      const d = (data || {}) as {
        queued?: number;
        alreadyReady?: number;
        skippedEdited?: number;
        alreadyQueued?: number;
      };
      toast({
        title: d.queued ? `Queued ${d.queued} clip${d.queued === 1 ? "" : "s"}` : "Nothing new to analyze",
        description: [
          d.alreadyReady ? `${d.alreadyReady} already described` : null,
          d.skippedEdited ? `${d.skippedEdited} skipped (user-edited)` : null,
          d.alreadyQueued ? `${d.alreadyQueued} already in queue` : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not start analysis.";
      toast({ variant: "destructive", title: "Analyze failed", description: message });
    } finally {
      setAnalyzing(false);
    }
  };

  if (videos.length === 0) return null;

  return (
    <div className="space-y-3 pt-4 border-t border-white/5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">
          Saved Clips ({videos.length})
          {(stats.processing > 0 || stats.pending > 0) && (
            <span className="ml-2 text-[10px] font-normal text-white/30 normal-case">
              · {stats.processing + stats.pending} being described
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => analyzeAll(false)}
            disabled={analyzing}
            className="h-7 px-3 text-[10px] font-bold text-[#b638fc] hover:text-white hover:bg-[#b638fc]/20 border border-[#b638fc]/30 rounded-lg gap-1"
          >
            {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Analyze all clips
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                disabled={analyzing}
                className="h-7 px-2 text-[10px] font-bold text-white/40 hover:text-white hover:bg-white/10 rounded-lg gap-1"
                title="Re-describe every clip (skips user edits)"
              >
                <RefreshCw className="w-3 h-3" />
                Re-run
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Re-describe every clip?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will overwrite AI descriptions for every clip in this project.
                  Clips you edited manually will <strong>not</strong> be touched.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => analyzeAll(true)}>
                  Re-describe all
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-h-[480px] overflow-y-auto pr-1">
        {videos.map((video) => {
          const status = (video.description_status || "pending") as DescriptionStatus;
          const isEditing = !!editingIds[video.id];
          const draft = drafts[video.id] ?? video.description ?? "";
          const isSaving = !!savingIds[video.id];
          const isRetrying = !!retryingIds[video.id];

          return (
            <div
              key={video.id}
              className="group rounded-xl border border-white/10 bg-white/[0.03] p-3 flex gap-3 min-w-0"
            >
              <button
                type="button"
                onClick={() => setFullscreenId(video.id)}
                className="relative flex-shrink-0 w-28 h-20 rounded-lg overflow-hidden bg-black group/thumb cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#b638fc]/60"
                title="Open clip in fullscreen"
              >
                <video
                  src={video.file_url || video.source_url}
                  className="w-full h-full object-cover pointer-events-none"
                  muted
                  playsInline
                  preload="metadata"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                  <Expand className="w-4 h-4 text-white" />
                  <div
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(video.id);
                    }}
                    className="h-6 px-2 text-[10px] bg-red-500 hover:bg-red-600 rounded-md flex items-center"
                  >
                    <Trash2 className="w-3 h-3" />
                  </div>
                </div>
              </button>

              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 justify-between">
                  <p className="text-[11px] text-white/70 truncate font-medium" title={video.file_name || undefined}>
                    {video.file_name || "clip"}
                  </p>
                  {statusBadge(status)}
                </div>

                {status === "failed" && video.description_error && (
                  <p className="text-[10px] text-red-400/80 line-clamp-2" title={video.description_error}>
                    {video.description_error}
                  </p>
                )}

                {isEditing ? (
                  <>
                    <Textarea
                      value={draft}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [video.id]: e.target.value }))
                      }
                      placeholder="Describe this clip..."
                      className="min-h-[64px] text-[11px] bg-black/40 border-white/10 resize-none"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelEdit(video.id)}
                        disabled={isSaving}
                        className="h-6 px-2 text-[10px] text-white/60 hover:text-white hover:bg-white/10"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveEdit(video)}
                        disabled={isSaving}
                        className="h-6 px-3 text-[10px] bg-[#b638fc] hover:bg-[#b638fc]/90 text-white gap-1"
                      >
                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Save
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p
                      className={cn(
                        "text-[11px] leading-snug",
                        video.description ? "text-white/80" : "text-white/30 italic"
                      )}
                    >
                      {video.description || (
                        status === "processing" || status === "pending"
                          ? "Description coming soon..."
                          : "No description yet."
                      )}
                    </p>
                    <div className="flex items-center justify-end gap-1 pt-0.5">
                      {status === "failed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => retryOne(video)}
                          disabled={isRetrying || analyzing}
                          className="h-6 px-2 text-[10px] text-white/60 hover:text-white hover:bg-white/10 gap-1"
                        >
                          {isRetrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Retry
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEdit(video)}
                        className="h-6 px-2 text-[10px] text-white/60 hover:text-white hover:bg-white/10 gap-1"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </Button>
                    </div>

                    {video.ai_zoom_type && video.ai_zoom_type !== 'none' && (
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[9px] bg-[#b638fc]/5 text-[#b638fc] border-[#b638fc]/20 px-1.5 h-4 uppercase font-black italic">
                            AI-Zoom: {video.ai_zoom_type} ({video.ai_zoom_scale}x)
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => rateZoom(video, 'like')}
                            disabled={!!ratedVideoIds[video.id]}
                            className={cn(
                              "h-6 w-6 p-0 rounded-md transition-all",
                              ratedVideoIds[video.id] === 'like' ? "bg-emerald-500/20 text-emerald-400" : "text-white/40 hover:text-white hover:bg-white/10"
                            )}
                          >
                            <ThumbsUp className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => rateZoom(video, 'dislike')}
                            disabled={!!ratedVideoIds[video.id]}
                            className={cn(
                              "h-6 w-6 p-0 rounded-md transition-all",
                              ratedVideoIds[video.id] === 'dislike' ? "bg-red-500/20 text-red-400" : "text-white/40 hover:text-white hover:bg-white/10"
                            )}
                          >
                            <ThumbsDown className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {renderFullscreenDialog()}
    </div>
  );

  function closeFullscreen() {
    setFullscreenId(null);
    setFullscreenDraft("");
  }

  async function saveFullscreen() {
    if (!fullscreenVideo) return;
    setFullscreenIsSaving(true);
    try {
      const text = fullscreenDraft.trim();
      const { error } = await supabase
        .from("videos")
        .update({
          description: text || null,
          description_status: "edited",
          description_error: null,
        })
        .eq("id", fullscreenVideo.id);
      if (error) throw error;
      onVideosChanged((prev) =>
        prev.map((v) =>
          v.id === fullscreenVideo.id
            ? { ...v, description: text || null, description_status: "edited" as DescriptionStatus }
            : v
        )
      );
      toast({ title: "Description saved" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not update description.";
      toast({ variant: "destructive", title: "Failed to save", description: message });
    } finally {
      setFullscreenIsSaving(false);
    }
  }

  async function regenerateFullscreen() {
    if (!fullscreenVideo) return;
    setFullscreenIsRegenerating(true);
    try {
      onVideosChanged((prev) =>
        prev.map((v) =>
          v.id === fullscreenVideo.id
            ? {
                ...v,
                description_status: "pending" as DescriptionStatus,
                description_error: null,
              }
            : v
        )
      );
      const { error } = await supabase.functions.invoke("describe-clips-batch", {
        body: {
          projectId,
          videoId: fullscreenVideo.id,
          force: true,
          includeEdited: true,
        },
      });
      if (error) throw error;
      setFullscreenDraft("");
      toast({ title: "Regenerating description", description: "Results arrive within ~1 minute." });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not queue regeneration.";
      toast({ variant: "destructive", title: "Regenerate failed", description: message });
    } finally {
      setFullscreenIsRegenerating(false);
    }
  }

  function renderFullscreenDialog() {
    const v = fullscreenVideo;
    const status = (v?.description_status || "pending") as DescriptionStatus;
    const isProcessing = status === "pending" || status === "processing";

    return (
      <Dialog open={!!fullscreenId} onOpenChange={(o) => !o && closeFullscreen()}>
        <DialogContent
          className="max-w-6xl w-[95vw] h-[90vh] p-0 bg-[#0c0916] border-white/10 overflow-hidden"
          onInteractOutside={(e) => {
            if (fullscreenIsSaving || fullscreenIsRegenerating) e.preventDefault();
          }}
        >
          {v && (
            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] w-full h-full">
              <div className="relative bg-black flex items-center justify-center min-h-0">
                {fullscreenPlaybackUrl ? (
                  <video
                    key={fullscreenPlaybackUrl}
                    src={fullscreenPlaybackUrl}
                    className="w-full h-full object-contain"
                    controls
                    autoPlay
                    loop
                    playsInline
                  />
                ) : fullscreenPlaybackError ? (
                  <div className="text-center p-6 space-y-2">
                    <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
                    <p className="text-sm text-red-300">Could not load clip</p>
                    <p className="text-[11px] text-white/40 break-all">{fullscreenPlaybackError}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-white/40">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <p className="text-[11px] uppercase tracking-wider">Loading clip...</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col min-h-0 border-l border-white/5">
                <div className="p-5 border-b border-white/5 space-y-2">
                  <div className="flex items-center gap-2 justify-between">
                    <p
                      className="text-sm text-white/80 font-semibold truncate"
                      title={v.file_name || undefined}
                    >
                      {v.file_name || "clip"}
                    </p>
                    {statusBadge(status)}
                  </div>
                  {v.description_model && (
                    <p className="text-[10px] text-white/30 uppercase tracking-wider">
                      Model: {v.description_model}
                      {v.description_generated_at &&
                        ` · ${new Date(v.description_generated_at).toLocaleString()}`}
                    </p>
                  )}
                  {status === "failed" && v.description_error && (
                    <p className="text-[11px] text-red-400/80" title={v.description_error}>
                      {v.description_error}
                    </p>
                  )}
                </div>

                <div className="flex-1 p-5 overflow-y-auto space-y-3 min-h-0">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                    Description
                  </label>
                  <Textarea
                    value={fullscreenDraft}
                    onChange={(e) => setFullscreenDraft(e.target.value)}
                    placeholder={
                      isProcessing
                        ? "Description is being generated..."
                        : "Describe this clip..."
                    }
                    disabled={fullscreenIsSaving || fullscreenIsRegenerating}
                    className="min-h-[180px] text-sm bg-black/40 border-white/10 resize-none"
                  />
                  <p className="text-[10px] text-white/30 leading-snug">
                    Editing and saving marks this clip as <strong>Edited</strong>. The "Re-run"
                    button on the clip list won&apos;t overwrite edited clips. Use{" "}
                    <strong>Regenerate</strong> here to force a new AI description for this one
                    clip.
                  </p>
                </div>

                <div className="p-5 border-t border-white/5 flex items-center justify-between gap-2 flex-wrap">
                  <Button
                    variant="ghost"
                    onClick={regenerateFullscreen}
                    disabled={fullscreenIsRegenerating || fullscreenIsSaving || isProcessing}
                    className="h-9 px-3 text-xs font-bold text-[#b638fc] hover:text-white hover:bg-[#b638fc]/20 border border-[#b638fc]/30 rounded-lg gap-1.5"
                  >
                    {fullscreenIsRegenerating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="w-3.5 h-3.5" />
                    )}
                    Regenerate
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      onClick={closeFullscreen}
                      disabled={fullscreenIsSaving}
                      className="h-9 px-4 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded-lg"
                    >
                      Close
                    </Button>
                    <Button
                      onClick={saveFullscreen}
                      disabled={
                        fullscreenIsSaving ||
                        fullscreenIsRegenerating ||
                        fullscreenDraft.trim() === (v.description || "").trim()
                      }
                      className="h-9 px-5 text-xs font-bold bg-[#b638fc] hover:bg-[#b638fc]/90 text-white rounded-lg gap-1.5"
                    >
                      {fullscreenIsSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }
}
