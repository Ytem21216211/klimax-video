import type { KlimaxAssetTranscript, KlimaxBankAsset, KlimaxProjectClip, KlimaxVideoGroup } from "@/lib/klimaxStorage";

export const LOCAL_KLIMAX_API = import.meta.env.VITE_LOCAL_KLIMAX_API || "http://127.0.0.1:8787";

export type LocalSubtitleStyleSettings = {
  stylePreset?: string;
  fontFamily?: string;
  fontSize?: number;
  textColor?: string;
  strokeEnabled?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowOpacity?: number;
  shadowDistance?: number;
  shadowBlur?: number;
  animationPreset?: "none" | "pop" | "bounce" | "rise" | "fade" | "zoom" | "slide" | "shake" | "typewriter" | "flicker" | "elastic";
  wordsPerLine?: number;
  introVerticalPosition?: "lower" | "middle";
  replyVerticalPosition?: "lower" | "middle";
  fontWeight?: number;
  fontScaleX?: number;
  keywordHighlightEnabled?: boolean;
  keywordColor?: string;
  keywordSecondaryColor?: string;
  keywordTerms?: string;
  uppercase?: boolean;
  activeWordColor?: string;
  // TikTok-style background box (rendered as ASS BorderStyle=4 by the local backend)
  boxEnabled?: boolean;
  boxColor?: string;
  boxOpacity?: number;
  boxPadding?: number;
};

export type LocalHookStyleSettings = {
  bubbleColor?: string;
  textColor?: string;
  fontFamily?: string;
  fontSize?: number;
};

export type LocalKlimaxExport = {
  status: string;
  url?: string;
  error?: string;
  createdAt?: string;
  path?: string;
  duration?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
  log?: string;
};

export type LocalKlimaxTranscriptionCue = {
  start: number;
  end: number;
  text: string;
};

export type LocalKlimaxLogoMoment = {
  term: string;
  start: number;
  end: number;
};

export type LocalKlimaxTranscriptionClip = {
  clipId: string;
  sourceVideoId: string | null;
  stage: string;
  language: string;
  duration: number;
  cues: LocalKlimaxTranscriptionCue[];
  words?: Array<{ start: number; end: number; word: string }>;
  logoMoments?: LocalKlimaxLogoMoment[];
};

export type LocalKlimaxProject = {
  id: string;
  title: string;
  description: string;
  status: string;
  render_progress?: number;
  created_at: string;
  updated_at?: string;
  sourceGroupId: string | null;
  sourceGroup?: KlimaxVideoGroup | null;
  clips: KlimaxProjectClip[];
  settings: {
    hookText?: string;
    subtitleSize?: number;
    musicId?: string | null;
    musicEnabled?: boolean;
    musicVolumeDb?: number;
    videoVolumeDb?: number;
    videoFilterKey?: string;
    brollEnabled?: boolean;
    autoSfxEnabled?: boolean;
    autoZoomEnabled?: boolean;
    autoZoomMode?: string;
    autoZoomBoostPercent?: number;
    autoZoomDurationSeconds?: number;
    introZoomOutEnabled?: boolean;
    replyZoomOutEnabled?: boolean;
    zoomOutStartPercent?: number;
    zoomOutDurationSeconds?: number;
    klimaxLogoEnabled?: boolean;
    clipTransitionsEnabled?: boolean;
    clipTransitionType?: "random" | "opacity" | "camera_flash";
    mirrorEnabled?: boolean;
    brollShutterMode?: boolean;
    brollAnimIn?: "fade" | "none";
    brollAnimOut?: "fade" | "none";
    logoTriggerWord?: string;
    subtitleStyle?: LocalSubtitleStyleSettings;
    hookStyle?: LocalHookStyleSettings;
    [key: string]: unknown;
  };
  export?: LocalKlimaxExport | null;
  exports?: LocalKlimaxExport[];
  transcription?: {
    status: string;
    generatedAt?: string | null;
    sourceFingerprint?: string | null;
    error?: string;
    clips: LocalKlimaxTranscriptionClip[];
  } | null;
};

const parseResponse = async <T,>(response: Response): Promise<T> => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Erreur backend local");
  }
  return data as T;
};

export const localKlimaxApi = {
  async health() {
    return parseResponse<{ ok: boolean; ffmpeg: string; dataRoot: string }>(await fetch(`${LOCAL_KLIMAX_API}/api/health`));
  },

  async listAssets() {
    return parseResponse<{ assets: KlimaxBankAsset[]; videoGroups: KlimaxVideoGroup[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/assets`)
    );
  },

  async uploadVideoPair(person1: File, person2: File, note = "") {
    const formData = new FormData();
    formData.append("person1", person1);
    formData.append("person2", person2);
    formData.append("note", note);
    return parseResponse<{ added?: KlimaxBankAsset[]; assets: KlimaxBankAsset[]; videoGroups: KlimaxVideoGroup[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/assets/video-pair`, {
        method: "POST",
        body: formData,
      })
    );
  },

  // Multi-rush: upload N ordered rush videos -> assembles an N-clip project (P1/P2…).
  // If studioProjectId is given, the montage is attached to that studio project.
  async uploadMultirushProject(files: File[], name = "Multi-rush", studioProjectId?: string) {
    const formData = new FormData();
    files.forEach((f) => formData.append("rushes", f));
    formData.append("name", name);
    if (studioProjectId) formData.append("studioProjectId", studioProjectId);
    return parseResponse<{ projectId: string; sourceGroupId: string; clipCount: number; stages: string[]; studioProjectId?: string }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/projects/multirush-upload`, { method: "POST", body: formData })
    );
  },

  async uploadSingleRush(rush: File, note = "") {
    const formData = new FormData();
    formData.append("person1", rush);
    formData.append("note", note);
    return parseResponse<{ added?: KlimaxBankAsset[]; assets: KlimaxBankAsset[]; videoGroups: KlimaxVideoGroup[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/assets/single-rush`, {
        method: "POST",
        body: formData,
      })
    );
  },

  async uploadAsset(category: "music" | "broll" | "image" | "speaker", file: File, note = "") {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("note", note);
    return parseResponse<{ asset: KlimaxBankAsset; assets: KlimaxBankAsset[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/assets/${category}`, {
        method: "POST",
        body: formData,
      })
    );
  },

  async deleteAsset(assetOrGroupId: string) {
    return parseResponse<{ ok: boolean; assets: KlimaxBankAsset[]; videoGroups: KlimaxVideoGroup[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/assets/${assetOrGroupId}`, { method: "DELETE" })
    );
  },

  // Per-asset transcript (computed at upload, reused by renders, user-editable).
  async getAssetTranscript(assetId: string) {
    return parseResponse<{ transcript: KlimaxAssetTranscript }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/assets/${assetId}/transcript`)
    );
  },

  async transcribeAsset(assetId: string) {
    return parseResponse<{ transcript: KlimaxAssetTranscript }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/assets/${assetId}/transcribe`, { method: "POST" })
    );
  },

  async updateAssetTranscript(assetId: string, text: string) {
    return parseResponse<{ transcript: KlimaxAssetTranscript }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/assets/${assetId}/transcript`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
    );
  },

  // Delete a project RECORD (never its source assets).
  async deleteProject(projectId: string) {
    return parseResponse<{ ok: boolean }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/projects/${projectId}`, { method: "DELETE" })
    );
  },

  async renameAsset(assetId: string, title: string) {
    return parseResponse<{ ok: boolean; asset: KlimaxBankAsset; assets: KlimaxBankAsset[]; videoGroups: KlimaxVideoGroup[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      })
    );
  },

  // Per-rush viral hook: used as the hook text when this rush is the hook clip (clip 1).
  // Empty string clears it (back to auto/AI hook).
  async setAssetCustomHook(assetId: string, customHook: string) {
    return parseResponse<{ ok: boolean; asset: KlimaxBankAsset; assets: KlimaxBankAsset[]; videoGroups: KlimaxVideoGroup[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customHook }),
      })
    );
  },

  // Edit the b-roll's note (its description used by the placement brain).
  async updateAssetNote(assetId: string, note: string) {
    return parseResponse<{ ok: boolean; asset: KlimaxBankAsset; assets: KlimaxBankAsset[]; videoGroups: KlimaxVideoGroup[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      })
    );
  },

  // How this b-roll is composited: "fullscreen" (fills 9:16) or "square" (centred
  // square below the text). Manual per b-roll for now; auto can set it later.
  async updateAssetPlacement(assetId: string, placement: "fullscreen" | "square") {
    return parseResponse<{ ok: boolean; asset: KlimaxBankAsset; assets: KlimaxBankAsset[]; videoGroups: KlimaxVideoGroup[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placement }),
      })
    );
  },

  async listProjects() {
    return parseResponse<{ projects: LocalKlimaxProject[] }>(await fetch(`${LOCAL_KLIMAX_API}/api/projects`));
  },

  async createProject(input: { sourceGroupId?: string | null; title?: string; description?: string }) {
    return parseResponse<{ project: LocalKlimaxProject }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
    );
  },

  async getProject(projectId: string) {
    return parseResponse<{ project: LocalKlimaxProject }>(await fetch(`${LOCAL_KLIMAX_API}/api/projects/${projectId}`));
  },

  async saveProject(projectId: string, input: { settings?: Record<string, unknown>; clips?: KlimaxProjectClip[] }) {
    return parseResponse<{ project: LocalKlimaxProject }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
    );
  },

  async transcribeProject(projectId: string, settings?: Record<string, unknown>) {
    return parseResponse<{ project: LocalKlimaxProject }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/projects/${projectId}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      })
    );
  },

  async renderProject(projectId: string, settings: Record<string, unknown>) {
    return parseResponse<{ project: LocalKlimaxProject; export: LocalKlimaxExport }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/projects/${projectId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      })
    );
  },

  // Auto-frame the split-screen bands on each speaker's face. clipId omitted = all
  // dual-speaker clips in the project.
  async centerFaces(projectId: string, clipId?: string) {
    return parseResponse<{ project: LocalKlimaxProject; centered: number; noFace: number; clips: number }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/projects/${projectId}/center-faces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipId }),
      })
    );
  },

  async autoPickBrolls(projectId: string) {
    return parseResponse<{ picks: { clipId: string; brollId: string | null; reason: string }[]; project: LocalKlimaxProject }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/projects/${projectId}/auto-brolls`, { method: "POST" })
    );
  },

  // Automatic Mode — batch variant generation
  async startAutoBatch(payload: {
    projectIds?: string[];
    videoGroupIds?: string[];
    variantsPerVideo: number;
    varied: Record<string, boolean>;
    lockSplitScreen?: boolean;
    subtitleSizePx?: number;
  }) {
    return parseResponse<{ jobId: string; total: number; items: LocalAutoItem[]; achievablePerVideo: LocalAutoAchievable[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/auto/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );
  },
  async getAutoJob(jobId: string) {
    return parseResponse<{ job: LocalAutoJob }>(await fetch(`${LOCAL_KLIMAX_API}/api/auto/jobs/${jobId}`));
  },
  async listAutoJobs() {
    return parseResponse<{ jobs: LocalAutoJob[] }>(await fetch(`${LOCAL_KLIMAX_API}/api/auto/jobs`));
  },
  autoJobDownloadUrl(jobId: string) {
    return `${LOCAL_KLIMAX_API}/api/auto/jobs/${jobId}/download`;
  },
  // Plan-only (mode paramètre): same deterministic planning as startAutoBatch but
  // renders nothing — returns full per-variant settings/clips + source URLs.
  async planAutoBatch(payload: {
    projectIds?: string[];
    videoGroupIds?: string[];
    variantsPerVideo: number;
    varied: Record<string, boolean>;
    lockSplitScreen?: boolean;
    subtitleSizePx?: number;
  }) {
    return parseResponse<{ projects: AutoPlanProject[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/auto/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );
  },

  // Studio projects (reusable per-podcast config profiles)
  async listStudioProjects() {
    return parseResponse<{ projects: StudioProject[] }>(await fetch(`${LOCAL_KLIMAX_API}/api/studio/projects`));
  },
  async saveStudioProject(project: Partial<StudioProject> & { name: string }) {
    return parseResponse<{ project: StudioProject; projects: StudioProject[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/studio/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      })
    );
  },
  async deleteStudioProject(id: string) {
    return parseResponse<{ projects: StudioProject[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/studio/projects/${id}`, { method: "DELETE" })
    );
  },
  async runStudioProject(id: string, variantsPerVideo?: number) {
    return parseResponse<{ jobId: string; total: number; items: LocalAutoItem[]; achievablePerVideo: LocalAutoAchievable[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/studio/projects/${id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantsPerVideo }),
      })
    );
  },
  // Mode vidéo AI: a plain-language request -> Claude maps it to a batch -> generates.
  async aiVideoRequest(payload: { prompt: string; studioProjectId?: string | null; videoGroupIds?: string[]; projectIds?: string[]; variantsPerVideo?: number }) {
    return parseResponse<{ jobId: string; total: number; items: LocalAutoItem[]; summary?: string; config?: unknown }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/auto/ai-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );
  },

  // Auto-mode batch presets (config + planification quotidienne)
  async listAutoPresets() {
    return parseResponse<{ presets: LocalAutoPreset[] }>(await fetch(`${LOCAL_KLIMAX_API}/api/auto/presets`));
  },
  async saveAutoPreset(preset: Partial<LocalAutoPreset> & { name: string }) {
    return parseResponse<{ presets: LocalAutoPreset[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/auto/presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preset),
      })
    );
  },
  async deleteAutoPreset(id: string) {
    return parseResponse<{ presets: LocalAutoPreset[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/auto/presets/${id}`, { method: "DELETE" })
    );
  },
  async runAutoPreset(id: string) {
    return parseResponse<{ jobId: string; total: number; items: LocalAutoItem[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/auto/presets/${id}/run`, { method: "POST" })
    );
  },

  // Training mode — learned-rules feedback loop
  async getTrainingRules() {
    return parseResponse<LocalTrainingState>(await fetch(`${LOCAL_KLIMAX_API}/api/training/rules`));
  },
  async submitTrainingFeedback(payload: { feedback: string; jobId?: string | null; itemId?: string | null; decisions?: LocalAutoDecisions | null }) {
    return parseResponse<LocalTrainingState & { added: string[]; removed: string[]; distilled: unknown }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/training/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );
  },
  async deleteTrainingRule(id: string) {
    return parseResponse<{ rules: LocalLearnedRule[]; overrides: Record<string, unknown> }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/training/rules/${id}`, { method: "DELETE" })
    );
  },
  async clearTrainingRules() {
    return parseResponse<{ rules: LocalLearnedRule[]; overrides: Record<string, unknown> }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/training/rules/clear`, { method: "POST" })
    );
  },

  // Presets
  async listPresets() {
    return parseResponse<{ presets: LocalKlimaxPreset[] }>(await fetch(`${LOCAL_KLIMAX_API}/api/presets`));
  },
  async createPreset(payload: { name: string; [k: string]: unknown }) {
    return parseResponse<{ preset: LocalKlimaxPreset }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );
  },
  async updatePreset(id: string, payload: Record<string, unknown>) {
    return parseResponse<{ preset: LocalKlimaxPreset }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/presets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );
  },
  async deletePreset(id: string) {
    return parseResponse<{ ok: boolean; removed: number }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/presets/${id}`, { method: "DELETE" })
    );
  },

  // SFX library
  async listSfx() {
    return parseResponse<{ sfx: LocalKlimaxSfx[] }>(await fetch(`${LOCAL_KLIMAX_API}/api/sfx`));
  },
  async uploadSfx(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return parseResponse<{ sfx: LocalKlimaxSfx[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/sfx/upload`, { method: "POST", body: formData })
    );
  },
  async deleteSfx(key: string) {
    return parseResponse<{ sfx: LocalKlimaxSfx[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/sfx/${encodeURIComponent(key)}`, { method: "DELETE" })
    );
  },
  async setProjectSfx(projectId: string, payload: { transitionKey?: string | null; clipSfx?: Record<string, string | null> }) {
    return parseResponse<{ project: LocalKlimaxProject }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/projects/${projectId}/sfx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );
  },
};

export type LocalKlimaxSfx = {
  key: string;
  type: "transition" | "effect" | "riser";
  label: string;
  description: string;
  file: string;
  durationMs: number;
  ready: boolean;
  user?: boolean;
};

export type LocalKlimaxPreset = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  settings: Record<string, unknown>;
};

export type LocalAutoDecisions = {
  hookText?: string | null;
  splitScreen?: boolean;
  splitRatio?: number | null;
  subtitlePreset?: string | null;
  subtitleSize?: number | null;
  videoFilter?: string | null;
  brollStyle?: string | null;
  brollId?: string | null;
  musicId?: string | null;
  musicVolumeDb?: number | null;
  zoomMode?: string | null;
  zoomBoostPercent?: number | null;
  mirror?: boolean;
};

export type LocalAutoItem = {
  id: string;
  projectId: string;
  source: string;
  index?: number;
  combo: string;
  decisions?: LocalAutoDecisions;
  status: "queued" | "rendering" | "ready" | "failed";
  url: string | null;
  error?: string;
};

// "Mode paramètre" (plan-only, no render): the full per-variant data so the frontend
// can draw a parametric preview and let the user inspect/edit every random value.
export type AutoPlanSource = { id: string; title: string; fileUrl: string };
export type AutoPlanSources = {
  person1: AutoPlanSource | null;
  person2: AutoPlanSource | null;
  speakers: AutoPlanSource[];
};
export type AutoPlanClip = {
  id?: string;
  stage: "intro" | "reply";
  sourceVideoId?: string | null;
  videoTransform?: { x: number; y: number; scale: number };
  dualSpeakerEnabled?: boolean;
  dualSpeakerSource?: string | null;
  dualSpeakerPosition?: "top" | "bottom";
  dualSpeakerSplitRatio?: number;
  dualSpeakerMainZoom?: number;
  dualSpeakerMainCropX?: number;
  dualSpeakerMainCropY?: number;
  dualSpeakerAddedZoom?: number;
  dualSpeakerAddedCropX?: number;
  dualSpeakerAddedCropY?: number;
  hookText?: string;
  hookPosition?: { x: number; y: number };
  hookSize?: { width: number; height: number };
  subtitlePosition?: { x: number; y: number };
  brollId?: string | null;
  logoSize?: number;
  logoCenter?: boolean;
};
export type AutoPlanSettings = {
  mirrorEnabled?: boolean;
  videoFilterKey?: string;
  subtitleSize?: number;
  subtitleStyle?: LocalSubtitleStyleSettings;
  hookText?: string;
  hookStyle?: LocalHookStyleSettings;
  autoZoomMode?: string;
  autoZoomBoostPercent?: number;
  brollStyle?: string;
  musicId?: string | null;
  musicVolumeDb?: number;
  [key: string]: unknown;
};
export type AutoPlanVariant = {
  index: number;
  combo: string;
  decisions?: LocalAutoDecisions;
  settings: AutoPlanSettings;
  clips: AutoPlanClip[];
};
export type AutoPlanProject = {
  projectId: string;
  source: string;
  sources: AutoPlanSources;
  subtitleSamples: { intro: string; reply: string };
  variants: AutoPlanVariant[];
};

// Studio projects — reusable, fully-configurable per-podcast project profiles.
export type StudioOverrides = {
  twoSpeakerRatio?: number;
  splitRatioMin?: number;
  splitRatioMax?: number;
  subtitleSizeMin?: number;
  subtitleSizeMax?: number;
  logoSizeMin?: number;
  logoSizeMax?: number;
  zoomMaxBoostPercent?: number;
  musicVolumeMaxDb?: number;
  allowedSubtitlePresets?: string[];
  filterDenylist?: string[];
};
export type StudioAssetPools = {
  brollIds: string[] | null;
  imageIds: string[] | null;
  musicIds: string[] | null;
  speakerIds: string[] | null;
};
export type StudioProject = {
  id: string;
  name: string;
  description: string;
  videoGroupIds: string[];
  variantsPerVideo: number;
  varied: Record<string, boolean>;
  lockSplitScreen: boolean;
  overrides: StudioOverrides;
  assetPools: StudioAssetPools;
  hookBank: string[];
  renderProjectId?: string | null;
  renderClipStages?: string[];
  createdAt: string;
  updatedAt: string;
};

// Training mode (learned-rules feedback loop)
export type LocalLearnedRule = {
  id: string;
  category: "hooks" | "broll" | "general" | "subtitles" | "zoom" | "music" | "splitscreen";
  kind: "text" | "param";
  text?: string;
  param?: string;
  value?: unknown;
  weight?: number;
  source?: string;
  createdAt?: string;
};

export type LocalTrainingHistory = {
  id: string;
  jobId: string | null;
  itemId: string | null;
  feedback: string;
  addedRuleIds: string[];
  removedRuleIds: string[];
  createdAt: string;
};

export type LocalTrainingState = {
  rules: LocalLearnedRule[];
  overrides: Record<string, unknown>;
  history: LocalTrainingHistory[];
  updatedAt?: string | null;
};

export type LocalAutoAchievable = {
  projectId: string;
  source?: string;
  achievable: number;
  requested: number;
};

export type LocalAutoJob = {
  id: string;
  createdAt: string;
  finishedAt: string | null;
  total: number;
  done: number;
  items: LocalAutoItem[];
  drive?: {
    status: "uploading" | "done" | "failed" | "skipped";
    uploaded: number;
    total: number;
    link: string | null;
    error: string | null;
  };
};

export type LocalAutoPreset = {
  id: string;
  name: string;
  videoGroupIds: string[];
  variantsPerVideo: number;
  varied: Record<string, boolean>;
  lockSplitScreen?: boolean;
  schedule?: { enabled: boolean; time: string };
  lastRunDate?: string | null;
};
