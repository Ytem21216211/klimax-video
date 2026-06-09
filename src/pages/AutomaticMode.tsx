import * as React from "react";
const { useMemo, useState } = React;
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Captions,
  CheckCircle2,
  Clock,
  Download,
  Film,
  Layers,
  Music,
  Sparkles,
  Type,
  Wand2,
  Waves,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Mock data — UI only. No backend, no render logic.
// ---------------------------------------------------------------------------

type SourceVideo = {
  id: string;
  title: string;
  note: string;
};

const MOCK_VIDEOS: SourceVideo[] = [
  { id: "v1", title: "Podcast x Mindset", note: "Discipline et focus" },
  { id: "v2", title: "Podcast x Argent", note: "Investir tôt" },
  { id: "v3", title: "Podcast x Sport", note: "Routine matinale" },
  { id: "v4", title: "Podcast x Business", note: "Lancer sans budget" },
  { id: "v5", title: "Podcast x Réseaux", note: "Hook en 3 secondes" },
  { id: "v6", title: "Podcast x Productivité", note: "Deep work" },
  { id: "v7", title: "Podcast x Confiance", note: "Parler en public" },
  { id: "v8", title: "Podcast x Habitudes", note: "1% chaque jour" },
];

type VaryKey = "broll" | "subtitles" | "hook" | "sfx" | "zooms" | "music";

type VaryDimension = {
  key: VaryKey;
  label: string;
  icon: React.ReactNode;
  lockedHint: string;
  variedHint: string;
};

const VARY_DIMENSIONS: VaryDimension[] = [
  {
    key: "broll",
    label: "B-roll",
    icon: <Film className="h-4 w-4" />,
    lockedHint: "Garde le b-roll original de la vidéo source.",
    variedHint: "Pioche dans le pool de b-roll à chaque variante.",
  },
  {
    key: "subtitles",
    label: "Style de sous-titres",
    icon: <Captions className="h-4 w-4" />,
    lockedHint: "Conserve le preset de sous-titres d'origine.",
    variedHint: "Alterne les presets de sous-titres de la banque.",
  },
  {
    key: "hook",
    label: "Hook texte",
    icon: <Type className="h-4 w-4" />,
    lockedHint: "Réutilise le même hook texte partout.",
    variedHint: "Tire une variante de hook par export.",
  },
  {
    key: "sfx",
    label: "SFX / transitions",
    icon: <Waves className="h-4 w-4" />,
    lockedHint: "Garde les SFX et transitions d'origine.",
    variedHint: "Mélange les packs SFX et transitions.",
  },
  {
    key: "zooms",
    label: "Zooms",
    icon: <ZoomIn className="h-4 w-4" />,
    lockedHint: "Conserve les zooms de la vidéo source.",
    variedHint: "Varie l'intensité et le rythme des zooms.",
  },
  {
    key: "music",
    label: "Musique",
    icon: <Music className="h-4 w-4" />,
    lockedHint: "Garde la musique d'origine.",
    variedHint: "Change de piste depuis la banque musique.",
  },
];

type AssetBank = {
  key: string;
  label: string;
  icon: React.ReactNode;
  count: number;
  tags: string[];
};

const ASSET_BANKS: AssetBank[] = [
  {
    key: "broll",
    label: "Pool b-roll",
    icon: <Film className="h-4 w-4" />,
    count: 42,
    tags: ["urbain", "nature", "luxe", "gym", "abstrait"],
  },
  {
    key: "subtitles",
    label: "Presets de sous-titres",
    icon: <Captions className="h-4 w-4" />,
    count: 14,
    tags: ["jaune", "capcut", "punch", "clean"],
  },
  {
    key: "hook",
    label: "Variantes de hook",
    icon: <Type className="h-4 w-4" />,
    count: 23,
    tags: ["question", "choc", "promesse", "curiosité"],
  },
  {
    key: "sfx",
    label: "Packs SFX",
    icon: <Waves className="h-4 w-4" />,
    count: 18,
    tags: ["whoosh", "pop", "boom", "film roll"],
  },
  {
    key: "music",
    label: "Banque musique",
    icon: <Music className="h-4 w-4" />,
    count: 31,
    tags: ["lo-fi", "trap", "épique", "chill", "phonk"],
  },
];

type QueueStatus =
  | { kind: "queued" }
  | { kind: "rendering"; progress: number }
  | { kind: "ready" };

type QueueItem = {
  id: string;
  source: string;
  combo: string;
  status: QueueStatus;
};

const MOCK_QUEUE: QueueItem[] = [
  { id: "q1", source: "Podcast x Mindset", combo: "b-roll urbain · sous-titres jaunes · musique lo-fi", status: { kind: "ready" } },
  { id: "q2", source: "Podcast x Mindset", combo: "b-roll gym · sous-titres capcut · musique trap", status: { kind: "rendering", progress: 47 } },
  { id: "q3", source: "Podcast x Argent", combo: "b-roll luxe · sous-titres punch · musique épique", status: { kind: "rendering", progress: 81 } },
  { id: "q4", source: "Podcast x Argent", combo: "b-roll abstrait · sous-titres clean · musique chill", status: { kind: "queued" } },
  { id: "q5", source: "Podcast x Sport", combo: "b-roll gym · sous-titres jaunes · musique phonk", status: { kind: "ready" } },
  { id: "q6", source: "Podcast x Sport", combo: "b-roll nature · sous-titres capcut · musique lo-fi", status: { kind: "rendering", progress: 23 } },
  { id: "q7", source: "Podcast x Business", combo: "b-roll urbain · sous-titres punch · musique trap", status: { kind: "queued" } },
  { id: "q8", source: "Podcast x Business", combo: "b-roll luxe · sous-titres clean · musique épique", status: { kind: "queued" } },
];

// ---------------------------------------------------------------------------

const SectionShell = ({
  step,
  title,
  subtitle,
  icon,
  action,
  children,
}: {
  step: number;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 lg:p-6">
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-4 min-w-0">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-black">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/35">Étape {step}</p>
          <h2 className="mt-1 text-lg font-black uppercase tracking-tight">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-white/45">{subtitle}</p>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
    <div className="mt-5">{children}</div>
  </section>
);

const StatusBadge = ({ status }: { status: QueueStatus }) => {
  if (status.kind === "ready") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        Prêt
      </span>
    );
  }
  if (status.kind === "rendering") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">
        <Wand2 className="h-3 w-3 animate-pulse" />
        Rendu {status.progress}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
      <Clock className="h-3 w-3" />
      En attente
    </span>
  );
};

const AutomaticMode = () => {
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [varied, setVaried] = useState<Record<VaryKey, boolean>>({
    broll: true,
    subtitles: true,
    hook: true,
    sfx: false,
    zooms: false,
    music: true,
  });
  const [variantsPerVideo, setVariantsPerVideo] = useState(6);

  const selectedCount = selectedIds.size;
  const allSelected = selectedCount === MOCK_VIDEOS.length;
  const totalOutput = selectedCount * variantsPerVideo;

  const toggleVideo = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds((current) =>
      current.size === MOCK_VIDEOS.length ? new Set() : new Set(MOCK_VIDEOS.map((v) => v.id))
    );
  };

  const toggleVaried = (key: VaryKey) => {
    setVaried((current) => ({ ...current, [key]: !current[key] }));
  };

  const variedCount = useMemo(() => Object.values(varied).filter(Boolean).length, [varied]);

  const queue = selectedCount > 0 ? MOCK_QUEUE : [];

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black">
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)] bg-[size:72px_72px]" />
      <div className="fixed inset-x-0 top-0 h-64 pointer-events-none bg-gradient-to-b from-white/[0.07] to-transparent" />

      <header className="relative z-20 flex items-center justify-between gap-4 border-b border-white/10 bg-black/80 px-6 py-5 backdrop-blur-xl">
        <div className="flex items-center gap-4 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard")}
            className="rounded-full border border-white/10 bg-white/[0.03] text-white hover:bg-white hover:text-black"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black uppercase tracking-tight">Mode automatique</h1>
            <p className="text-xs text-white/45">Génère des dizaines de variantes uniques par lot, sans shadowban</p>
          </div>
        </div>

        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 md:flex">
          <Layers className="h-4 w-4 text-white/45" />
          <span className="text-xs font-black uppercase tracking-[0.18em] text-white/60">
            {selectedCount} sél. · {variantsPerVideo} variantes
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-6xl gap-6 px-6 py-6">
        {/* 1 — VIDEO SELECTION */}
        <SectionShell
          step={1}
          title="Sélection des vidéos"
          subtitle="Choisis les vidéos sources à traiter en lot. Chaque vidéo = 2 parties verrouillées."
          icon={<Film className="h-5 w-5" />}
          action={
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-white/70">
                {selectedCount} vidéo{selectedCount > 1 ? "s" : ""} sélectionnée{selectedCount > 1 ? "s" : ""}
              </span>
              <Button
                onClick={toggleAll}
                className="rounded-full bg-white px-4 text-xs font-black uppercase tracking-[0.14em] text-black hover:bg-white/90"
              >
                {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
              </Button>
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {MOCK_VIDEOS.map((video) => {
              const isSelected = selectedIds.has(video.id);
              return (
                <button
                  key={video.id}
                  type="button"
                  onClick={() => toggleVideo(video.id)}
                  className={cn(
                    "group relative overflow-hidden rounded-2xl border bg-white/[0.03] p-3 text-left transition-all",
                    isSelected
                      ? "border-white ring-2 ring-white"
                      : "border-white/10 hover:border-white/30 hover:bg-white/[0.06]"
                  )}
                >
                  <div className="relative grid aspect-[9/12] place-items-center overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02]">
                    <Film className="h-7 w-7 text-white/20" />
                    <div
                      className={cn(
                        "absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border transition-all",
                        isSelected
                          ? "border-white bg-white text-black"
                          : "border-white/30 bg-black/40 text-transparent group-hover:border-white/60"
                      )}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="mt-3 truncate text-sm font-black uppercase tracking-tight">{video.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-white/45">{video.note}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-white/40">
                      P1 · clip podcast
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-white/40">
                      P2 · réponse + hook
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </SectionShell>

        {/* 2 — WHAT TO VARY */}
        <SectionShell
          step={2}
          title="Qu'est-ce qui varie ?"
          subtitle="Verrouillé garde l'original. Varié pioche dans la banque d'assets de cette dimension."
          icon={<Layers className="h-5 w-5" />}
          action={
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-white/70">
              {variedCount} variée{variedCount > 1 ? "s" : ""}
            </span>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {VARY_DIMENSIONS.map((dim) => {
              const isVaried = varied[dim.key];
              return (
                <div
                  key={dim.key}
                  className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70">
                      {dim.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black uppercase tracking-tight">{dim.label}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                        {isVaried ? dim.variedHint : dim.lockedHint}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Switch checked={isVaried} onCheckedChange={() => toggleVaried(dim.key)} />
                    <span
                      className={cn(
                        "text-[10px] font-black uppercase tracking-[0.16em]",
                        isVaried ? "text-white" : "text-white/35"
                      )}
                    >
                      {isVaried ? "Varié" : "Verrouillé"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionShell>

        {/* 3 — ASSET BANKS */}
        <SectionShell
          step={3}
          title="Banques d'assets"
          subtitle="Collections taggées et réutilisables dans lesquelles le mode automatique pioche."
          icon={<Sparkles className="h-5 w-5" />}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ASSET_BANKS.map((bank) => (
              <div key={bank.key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70">
                      {bank.icon}
                    </div>
                    <p className="truncate text-sm font-black uppercase tracking-tight">{bank.label}</p>
                  </div>
                  <span className="grid h-8 min-w-[2rem] place-items-center rounded-full bg-white px-2 text-xs font-black text-black">
                    {bank.count}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {bank.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold lowercase tracking-wide text-white/55"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionShell>

        {/* 4 — GENERATION SETTINGS */}
        <SectionShell
          step={4}
          title="Réglages de génération"
          subtitle="Choisis combien de variantes uniques générer par vidéo source."
          icon={<Wand2 className="h-5 w-5" />}
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-end justify-between gap-4">
                <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
                  Variantes par vidéo
                </Label>
                <span className="text-3xl font-black leading-none">{variantsPerVideo}</span>
              </div>
              <div className="mt-5 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setVariantsPerVideo((v) => Math.max(1, v - 1))}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-lg font-black text-white/70 hover:bg-white hover:text-black"
                >
                  −
                </button>
                <Slider
                  value={[variantsPerVideo]}
                  min={1}
                  max={20}
                  step={1}
                  onValueChange={([next]) => setVariantsPerVideo(next)}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => setVariantsPerVideo((v) => Math.min(20, v + 1))}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-lg font-black text-white/70 hover:bg-white hover:text-black"
                >
                  +
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                <span>1 variante</span>
                <span>20 variantes</span>
              </div>
            </div>

            <div className="flex flex-col justify-center rounded-2xl border border-white/15 bg-white/[0.06] p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Volume total</p>
              <p className="mt-3 text-2xl font-black leading-none">
                {selectedCount} <span className="text-white/40">×</span> {variantsPerVideo}
              </p>
              <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-white/45">
                = {totalOutput} vidéo{totalOutput > 1 ? "s" : ""} à générer
              </p>
              {selectedCount === 0 ? (
                <p className="mt-3 text-[11px] leading-relaxed text-white/40">
                  Sélectionne des vidéos à l'étape 1 pour estimer le volume.
                </p>
              ) : null}
            </div>
          </div>
        </SectionShell>

        {/* 5 — GENERATION QUEUE */}
        <SectionShell
          step={5}
          title="File de génération"
          subtitle="Chaque carte = une variante unique avec sa propre combinaison d'assets."
          icon={<Clock className="h-5 w-5" />}
          action={
            <Button
              disabled={queue.length === 0}
              className="rounded-full bg-white px-4 text-xs font-black uppercase tracking-[0.14em] text-black hover:bg-white/90 disabled:opacity-40"
            >
              <Download className="mr-1 h-4 w-4" />
              Tout exporter
            </Button>
          }
        >
          {queue.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/5">
                <Film className="h-6 w-6 text-white/30" />
              </div>
              <h3 className="mt-4 text-lg font-black uppercase tracking-tight text-white/70">
                Aucune génération en cours
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/45">
                Sélectionne des vidéos pour lancer une génération.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {queue.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <div className="relative grid aspect-video place-items-center overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02]">
                    <Film className="h-7 w-7 text-white/20" />
                    <div className="absolute left-2 top-2">
                      <StatusBadge status={item.status} />
                    </div>
                  </div>
                  <p className="mt-3 truncate text-sm font-black uppercase tracking-tight">{item.source}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/45">{item.combo}</p>

                  {item.status.kind === "rendering" ? (
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-white transition-all"
                        style={{ width: `${item.status.progress}%` }}
                      />
                    </div>
                  ) : (
                    <div className="mt-3 h-1.5 w-full" />
                  )}

                  <Button
                    disabled={item.status.kind !== "ready"}
                    variant="ghost"
                    className={cn(
                      "mt-3 w-full rounded-full border text-xs font-black uppercase tracking-[0.14em]",
                      item.status.kind === "ready"
                        ? "border-white/10 bg-white text-black hover:bg-white/90"
                        : "border-white/10 bg-white/[0.03] text-white/40 hover:bg-white/[0.03] hover:text-white/40"
                    )}
                  >
                    <Download className="mr-1 h-4 w-4" />
                    Exporter
                  </Button>
                </div>
              ))}
            </div>
          )}
        </SectionShell>
      </main>
    </div>
  );
};

export default AutomaticMode;
