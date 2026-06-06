export type KlimaxVideoTemplate = {
  id: string;
  title: string;
  description: string;
  clipCount: number;
};

export const KLIMAX_VIDEO_TEMPLATES: KlimaxVideoTemplate[] = [];

export const KLIMAX_LEGACY_TITLE_RE = /^(?!klimax\b).+/i;
