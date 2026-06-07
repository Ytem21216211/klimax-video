export type KlimaxAssetCategory = "music" | "broll" | "image" | "video";
export type KlimaxClipStage = "intro" | "reply";
export type KlimaxVideoPart = "person1" | "person2";

export type KlimaxBankAsset = {
  id: string;
  category: KlimaxAssetCategory;
  title: string;
  note: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  fileUrl?: string;
  pinned?: boolean;
  groupId?: string;
  groupTitle?: string;
  videoPart?: KlimaxVideoPart;
};

export type KlimaxVideoGroup = {
  id: string;
  title: string;
  note: string;
  person1: KlimaxBankAsset | null;
  person2: KlimaxBankAsset | null;
};

export type KlimaxProjectClip = {
  id: string;
  stage: KlimaxClipStage;
  sourceVideoId: string | null;
  title: string;
  hookText: string;
  subtitle: string;
  musicId: string | null;
  brollId: string | null;
  imageId: string | null;
  videoTransform?: {
    scale: number;
    x: number;
    y: number;
  };
  hookPosition?: {
    x: number;
    y: number;
  };
  hookSize?: {
    width: number;
    height: number;
  };
  subtitlePosition?: {
    x: number;
    y: number;
  };
  logoPosition?: {
    x: number;
    y: number;
  };
  logoSize?: number;
  imageTransform?: {
    scale: number;
    x: number;
    y: number;
  };
};

export type KlimaxProjectSource = {
  videoId: string;
  videoIds?: string[];
  groupId?: string;
  title: string;
  note: string;
};

const BANK_STORAGE_KEY = "klimax:asset-bank:v1";
const TAILLE_TEST_SEED_KEY = "klimax:taille-test-seeded:v1";
const PROJECT_CLIPS_PREFIX = "klimax:project-clips:v1:";
const PROJECT_SOURCE_PREFIX = "klimax:project-source:v1:";

const SEEDED_ASSET_IDS = new Set([
  "music-noir-drive",
  "music-clean-pulse",
  "music-slow-burn",
  "broll-swipe-screen",
  "broll-reaction-app",
  "image-brand-logo",
  "image-proof-shot",
  "video-hook-part",
  "video-reply-part",
]);

const safeRead = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const safeWrite = (key: string, value: unknown) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures in private mode / quota limits.
  }
};

const tailleTestVideoAssets: KlimaxBankAsset[] = [
  {
    id: "video-taille-test-person1",
    category: "video",
    title: "taille 1.mp4",
    note: "Test vidéo: taille 1 + taille 2",
    fileName: "taille 1.mp4",
    fileSize: 1193824,
    mimeType: "video/mp4",
    fileUrl: "/klimax-videos/taille-1.mp4",
    groupId: "video-group-taille-test",
    groupTitle: "taille 1 + taille 2",
    videoPart: "person1",
  },
  {
    id: "video-taille-test-person2",
    category: "video",
    title: "taille 2.mp4",
    note: "Test vidéo: taille 1 + taille 2",
    fileName: "taille 2.mp4",
    fileSize: 41008735,
    mimeType: "video/mp4",
    fileUrl: "/klimax-videos/taille-2.mp4",
    groupId: "video-group-taille-test",
    groupTitle: "taille 1 + taille 2",
    videoPart: "person2",
  },
];

export const loadKlimaxBankAssets = () => {
  const assets = safeRead<KlimaxBankAsset[]>(BANK_STORAGE_KEY, []);
  const filteredAssets = assets.filter((asset) => !SEEDED_ASSET_IDS.has(asset.id));

  if (typeof window === "undefined") return filteredAssets;

  const alreadySeeded = window.localStorage.getItem(TAILLE_TEST_SEED_KEY) === "true";
  const alreadyInBank = filteredAssets.some((asset) => asset.groupId === "video-group-taille-test");

  if (!alreadySeeded && !alreadyInBank) {
    const nextAssets = [...tailleTestVideoAssets, ...filteredAssets];
    safeWrite(BANK_STORAGE_KEY, nextAssets);
    window.localStorage.setItem(TAILLE_TEST_SEED_KEY, "true");
    return nextAssets;
  }

  return filteredAssets;
};

export const saveKlimaxBankAssets = (assets: KlimaxBankAsset[]) => {
  safeWrite(BANK_STORAGE_KEY, assets);
};

export const createKlimaxBankAsset = (asset: Omit<KlimaxBankAsset, "id">): KlimaxBankAsset => ({
  id: `${asset.category}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  ...asset,
});

export const createKlimaxVideoGroupAssets = ({
  title,
  note,
  person1Title,
  person2Title,
  person1File,
  person2File,
}: {
  title: string;
  note: string;
  person1Title: string;
  person2Title: string;
  person1File?: Pick<KlimaxBankAsset, "fileName" | "fileSize" | "mimeType" | "fileUrl">;
  person2File?: Pick<KlimaxBankAsset, "fileName" | "fileSize" | "mimeType" | "fileUrl">;
}): KlimaxBankAsset[] => {
  const groupId = `video-group-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const groupTitle = title.trim();
  const sharedNote = note.trim() || "Deux vidéos liées au même projet";

  return [
    createKlimaxBankAsset({
      category: "video",
      title: person1Title.trim(),
      note: sharedNote,
      groupId,
      groupTitle,
      videoPart: "person1",
      ...person1File,
    }),
    createKlimaxBankAsset({
      category: "video",
      title: person2Title.trim(),
      note: sharedNote,
      groupId,
      groupTitle,
      videoPart: "person2",
      ...person2File,
    }),
  ];
};

export const getKlimaxVideoGroups = (assets: KlimaxBankAsset[]): KlimaxVideoGroup[] => {
  const groups = new Map<string, KlimaxVideoGroup>();

  assets
    .filter((asset) => asset.category === "video")
    .forEach((asset) => {
      const groupId = asset.groupId || asset.id;
      const current = groups.get(groupId) || {
        id: groupId,
        title: asset.groupTitle || asset.title,
        note: asset.note,
        person1: null,
        person2: null,
      };

      current.title = asset.groupTitle || current.title;
      current.note = asset.note || current.note;

      if (asset.videoPart === "person2") {
        current.person2 = asset;
      } else {
        current.person1 = asset;
      }

      groups.set(groupId, current);
    });

  return Array.from(groups.values());
};

export const loadKlimaxProjectClips = (projectId?: string) => {
  if (!projectId) return [];
  return safeRead<KlimaxProjectClip[]>(`${PROJECT_CLIPS_PREFIX}${projectId}`, []);
};

export const saveKlimaxProjectClips = (projectId: string | undefined, clips: KlimaxProjectClip[]) => {
  if (!projectId) return;
  safeWrite(`${PROJECT_CLIPS_PREFIX}${projectId}`, clips);
};

export const loadKlimaxProjectSource = (projectId?: string) => {
  if (!projectId) return null;
  return safeRead<KlimaxProjectSource | null>(`${PROJECT_SOURCE_PREFIX}${projectId}`, null);
};

export const saveKlimaxProjectSource = (projectId: string | undefined, source: KlimaxProjectSource | null) => {
  if (!projectId) return;
  safeWrite(`${PROJECT_SOURCE_PREFIX}${projectId}`, source);
};

export const createKlimaxProjectClip = (
  stage: KlimaxClipStage,
  index: number,
  sourceVideoId: string | null = null
): KlimaxProjectClip => ({
  id: `${stage}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  stage,
  sourceVideoId,
  title: stage === "intro" ? `Personne 1 - segment ${index + 1}` : `Personne 2 - segment ${index + 1}`,
  hookText: stage === "intro" ? "Tu connais cette sensation ?" : "La suite arrive maintenant",
  subtitle:
    stage === "intro"
      ? "Sous-titres automatiques personne 1"
      : "Sous-titres automatiques personne 2",
  musicId: null,
  brollId: null,
  imageId: null,
  videoTransform: {
    scale: 100,
    x: 0,
    y: 0,
  },
  hookPosition: {
    x: 540,
    y: 1325,
  },
  hookSize: {
    width: 980,
    height: 120,
  },
  subtitlePosition: {
    x: 540,
    y: stage === "intro" ? 1500 : 1265,
  },
  logoPosition: {
    x: 540,
    y: 1385,
  },
  logoSize: 520,
  imageTransform: {
    scale: 100,
    x: 0,
    y: 0,
  },
});
