import type { KlimaxBankAsset, KlimaxProjectClip, KlimaxVideoGroup } from "@/lib/klimaxStorage";

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
  animationPreset?: "none" | "pop" | "bounce" | "rise" | "fade";
  wordsPerLine?: number;
  introVerticalPosition?: "lower" | "middle";
  replyVerticalPosition?: "lower" | "middle";
  fontWeight?: number;
  fontScaleX?: number;
  keywordHighlightEnabled?: boolean;
  keywordColor?: string;
  keywordSecondaryColor?: string;
  keywordTerms?: string;
};

export type LocalHookStyleSettings = {
  bubbleColor?: string;
  textColor?: string;
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
    musicEnabled?: boolean;
    musicVolumeDb?: number;
    videoVolumeDb?: number;
    brollEnabled?: boolean;
    autoSfxEnabled?: boolean;
    klimaxLogoEnabled?: boolean;
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
    return parseResponse<{ assets: KlimaxBankAsset[]; videoGroups: KlimaxVideoGroup[] }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/assets/video-pair`, {
        method: "POST",
        body: formData,
      })
    );
  },

  async uploadAsset(category: "music" | "broll" | "image", file: File, note = "") {
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

  async autoPickBrolls(projectId: string) {
    return parseResponse<{ picks: { clipId: string; brollId: string | null; reason: string }[]; project: LocalKlimaxProject }>(
      await fetch(`${LOCAL_KLIMAX_API}/api/projects/${projectId}/auto-brolls`, { method: "POST" })
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
  type: "transition" | "effect";
  label: string;
  description: string;
  file: string;
  durationMs: number;
  ready: boolean;
};

export type LocalKlimaxPreset = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  settings: Record<string, unknown>;
};
