import * as React from "react";
const { useEffect, useMemo, useState } = React;
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Captions,
  CheckCircle2,
  Clock,
  Download,
  Film,
  Layers,
  Loader2,
  Music,
  Plus,
  Sparkles,
  Type,
  Users,
  Wand2,
  Waves,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  localKlimaxApi,
  type LocalKlimaxProject,
  type LocalAutoJob,
  type LocalAutoItem,
  type LocalAutoPreset,
} from "@/lib/localKlimaxApi";

// The 6 step-2 dimensions (a 7th "split-screen" lock is handled separately below).
type VaryKey = "broll" | "subtitles" | "hook" | "sfx" | "zooms" | "music";
type VaryDimension = { key: VaryKey; label: string; icon: React.ReactNode; lockedHint: string; variedHint: string };

const VARY_DIMENSIONS: VaryDimension[] = [
  { key: "subtitles", label: "Style de sous-titres", icon: <Captions className="h-4 w-4" />, lockedHint: "Conserve le preset de sous-titres d'origine.", variedHint: "Alterne preset, police, couleurs et filtre couleur." },
  { key: "hook", label: "Hook texte", icon: <Type className="h-4 w-4" />, lockedHint: "Réutilise le même hook partout.", variedHint: "Génère un hook distinct (lié au contenu) par variante." },
  { key: "broll", label: "B-roll", icon: <Film className="h-4 w-4" />, lockedHint: "Garde le b-roll d'origine.", variedHint: "Pioche un b-roll + style (carré / entier) par variante." },
  { key: "music", label: "Musique", icon: <Music className="h-4 w-4" />, lockedHint: "Garde la musique d'origine.", variedHint: "Change de piste + ajuste légèrement les niveaux." },
  { key: "sfx", label: "SFX / transitions", icon: <Waves className="h-4 w-4" />, lockedHint: "Garde les transitions d'origine.", variedHint: "Varie le type de transition entre clips." },
  { key: "zooms", label: "Zooms", icon: <ZoomIn className="h-4 w-4" />, lockedHint: "Aucun zoom punch-in (effet désactivé).", variedHint: "Varie mode (cut/smooth) et intensité du zoom punch-in." },
];

// Google Drive tricolor logo (inline SVG so we can animate it).
const DriveLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 87.3 78" className={className} aria-hidden>
    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
    <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47" />
    <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.798l5.852 11.5z" fill="#ea4335" />
    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
    <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
  </svg>
);

const SectionShell = ({ step, title, subtitle, icon, action, children }: {
  step: number; title: string; subtitle: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode;
}) => (
  <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 lg:p-6">
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-4 min-w-0">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-black">{icon}</div>
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

const StatusBadge = ({ status }: { status: LocalAutoItem["status"] }) => {
  if (status === "ready")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
        <CheckCircle2 className="h-3 w-3" /> Prêt
      </span>
    );
  if (status === "rendering")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">
        <Wand2 className="h-3 w-3 animate-pulse" /> Rendu…
      </span>
    );
  if (status === "failed")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-red-300">
        Échec
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
      <Clock className="h-3 w-3" /> En attente
    </span>
  );
};

const AutomaticMode = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [videoGroups, setVideoGroups] = useState<any[]>([]);
  const [bankCounts, setBankCounts] = useState({ speaker: 0, broll: 0, image: 0, music: 0, sfx: 0 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [varied, setVaried] = useState<Record<VaryKey, boolean>>({ broll: true, subtitles: true, hook: true, sfx: false, zooms: false, music: true });
  const [varySplit, setVarySplit] = useState(true); // split-screen is the primary lever; lock = !varySplit
  const [hookBrollSplit, setHookBrollSplit] = useState(false); // optional: hook split where band 2 = random b-roll(s)
  const [shake, setShake] = useState(false); // optional: subtle "sigma" hand-held shake over the whole video
  const [blurBg, setBlurBg] = useState(false); // optional: shrink montage centred over a big blurred copy (~1/2 variants)
  const [variantsPerVideo, setVariantsPerVideo] = useState(6);
  const [job, setJob] = useState<LocalAutoJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [presets, setPresets] = useState<LocalAutoPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [recentJobs, setRecentJobs] = useState<LocalAutoJob[]>([]);
  const [downloading, setDownloading] = useState<Set<string>>(new Set());

  useEffect(() => {
    localKlimaxApi.listAutoPresets().then(({ presets }) => setPresets(presets || [])).catch(() => {});
  }, []);

  // Au montage : recharge les lots récents. Un batch EN COURS continue de tourner
  // côté backend même si on a quitté la page — on se re-branche dessus (le polling
  // existant reprend tout seul) et les anciens lots restent consultables à gauche.
  const jobIsRunning = (j: LocalAutoJob) => !j.finishedAt || j.done < j.total || j.drive?.status === "uploading";
  useEffect(() => {
    localKlimaxApi
      .listAutoJobs()
      .then(({ jobs }) => {
        setRecentJobs(jobs || []);
        const running = (jobs || []).find(jobIsRunning);
        if (running) setJob(running);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Garde la liste de gauche en phase avec le job affiché (progression, nouveaux lots).
  useEffect(() => {
    if (!job) return;
    setRecentJobs((cur) =>
      cur.some((j) => j.id === job.id) ? cur.map((j) => (j.id === job.id ? job : j)) : [job, ...cur].slice(0, 10)
    );
  }, [job]);

  // Téléchargement DIRECT (fetch -> blob -> <a download>). Un simple href serait
  // cross-origin (front 4587, fichiers 4588) : l'attribut `download` est ignoré et
  // le navigateur NAVIGUE vers la vidéo — au retour, la page était réinitialisée.
  const downloadFile = async (url: string, filename: string, key: string) => {
    setDownloading((cur) => new Set(cur).add(key));
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch (e: any) {
      toast({ title: "Téléchargement échoué", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setDownloading((cur) => {
        const next = new Set(cur);
        next.delete(key);
        return next;
      });
    }
  };

  const savePreset = async () => {
    const name = presetName.trim() || `Preset ${presets.length + 1}`;
    try {
      const { presets: next } = await localKlimaxApi.saveAutoPreset({
        name,
        videoGroupIds: [...selectedIds],
        variantsPerVideo,
        varied,
        lockSplitScreen: !varySplit,
        schedule: { enabled: false, time: "09:00" },
      });
      setPresets(next);
      setPresetName("");
      toast({ title: "Preset sauvegardé", description: `${name} — ${selectedIds.size} vidéo(s), ${variantsPerVideo} variantes.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Preset", description: e?.message || "Sauvegarde impossible." });
    }
  };
  const updatePresetSchedule = async (presetId: string, patch: Partial<{ enabled: boolean; time: string }>) => {
    // Read the LATEST preset from state (not a render-time copy) so a quick
    // toggle + time edit can't round-trip stale values over each other.
    const current = presets.find((x) => x.id === presetId);
    if (!current) return;
    const schedule = { enabled: current.schedule?.enabled === true, time: current.schedule?.time || "09:00", ...patch };
    setPresets((cur) => cur.map((x) => (x.id === presetId ? { ...x, schedule } : x))); // optimistic
    try {
      const { presets: next } = await localKlimaxApi.saveAutoPreset({ ...current, schedule });
      setPresets(next);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Planification", description: e?.message || "Sauvegarde impossible." });
    }
  };
  const deletePreset = async (id: string) => {
    try {
      const { presets: next } = await localKlimaxApi.deleteAutoPreset(id);
      setPresets(next);
    } catch { /* keep current */ }
  };
  const [runningPresetId, setRunningPresetId] = useState<string | null>(null);
  const runPreset = async (p: LocalAutoPreset) => {
    if (runningPresetId) return; // no double-submit: one click = one batch
    setRunningPresetId(p.id);
    try {
      const res = await localKlimaxApi.runAutoPreset(p.id);
      setJob({ id: res.jobId, createdAt: new Date().toISOString(), finishedAt: null, total: res.total, done: 0, items: res.items });
      toast({ title: "Preset lancé", description: `${p.name} — ${res.total} variante(s) en file.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Preset", description: e?.message || "Lancement impossible." });
    } finally {
      setRunningPresetId(null);
    }
  };

  useEffect(() => {
    localKlimaxApi
      .listAssets()
      .then(({ assets, videoGroups }) => {
        setVideoGroups(videoGroups || []);
        const c = (cat: string) => assets.filter((a: any) => a.category === cat).length;
        setBankCounts((b) => ({ ...b, speaker: c("speaker"), broll: c("broll"), image: c("image"), music: c("music") }));
      })
      .catch(() => {});
    localKlimaxApi.listSfx().then(({ sfx }) => setBankCounts((b) => ({ ...b, sfx: sfx.length }))).catch(() => {});
  }, []);

  // Poll the running job until it finishes.
  useEffect(() => {
    if (!job?.id) return;
    // Keep polling through the Drive upload step (which starts AFTER finishedAt).
    const driveSettled = job.drive && job.drive.status !== "uploading";
    if (job.finishedAt && job.done >= job.total && driveSettled) return;
    const t = setInterval(async () => {
      try {
        const { job: j } = await localKlimaxApi.getAutoJob(job.id);
        // A late response for an OLD job must not clobber a newly-launched one.
        setJob((cur) => (cur?.id === j.id ? j : cur));
      } catch { /* backend may be restarting */ }
    }, 4000);
    return () => clearInterval(t);
  }, [job?.id, job?.finishedAt, job?.done, job?.total, job?.drive?.status]);

  // Any COMPLETE video pair (video 1 + video 2) from the bank can be auto-generated —
  // the auto pipeline assembles + transcribes + renders it A→Z (no project needed).
  const selectable = useMemo(
    () => videoGroups.filter((g) => g.person1?.filePath && g.person2?.filePath),
    [videoGroups]
  );
  const pending = useMemo(
    () => videoGroups.filter((g) => !(g.person1?.filePath && g.person2?.filePath)),
    [videoGroups]
  );

  const selectedCount = selectedIds.size;
  const allSelected = selectedCount > 0 && selectedCount === selectable.length;
  const totalOutput = selectedCount * variantsPerVideo;
  const variedCount = useMemo(() => Object.values(varied).filter(Boolean).length + (varySplit ? 1 : 0), [varied, varySplit]);

  const toggleVideo = (id: string) =>
    setSelectedIds((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelectedIds((cur) => (cur.size === selectable.length ? new Set() : new Set(selectable.map((p) => p.id))));
  const toggleVaried = (key: VaryKey) => setVaried((cur) => ({ ...cur, [key]: !cur[key] }));

  const generate = async () => {
    if (!selectedCount || starting) return;
    setStarting(true);
    try {
      const res = await localKlimaxApi.startAutoBatch({
        videoGroupIds: [...selectedIds],
        variantsPerVideo,
        varied,
        lockSplitScreen: !varySplit,
        hookBrollSplit,
        shake,
        blurBg,
      });
      setJob({ id: res.jobId, createdAt: new Date().toISOString(), finishedAt: null, total: res.total, done: 0, items: res.items });
      const capped = (res.achievablePerVideo || []).filter((a) => a.achievable < a.requested);
      if (capped.length) {
        toast({
          title: "Variantes uniques limitées",
          description: `Certaines vidéos ne peuvent produire que ${capped.map((c) => c.achievable).join(", ")} variantes uniques (banques d'assets trop petites).`,
        });
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Backend local", description: e?.message || "Génération impossible." });
    } finally {
      setStarting(false);
    }
  };

  const items = job?.items || [];
  const readyItems = items.filter((it) => it.status === "ready");

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black">

      <header className="relative z-20 flex items-center justify-between gap-4 border-b border-white/10 bg-black/80 px-6 py-5 backdrop-blur-xl">
        <div className="flex items-center gap-4 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="rounded-full border border-white/10 bg-white/[0.03] text-white hover:bg-white hover:text-black">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black uppercase tracking-tight">Mode automatique</h1>
            <p className="text-xs text-white/45">Génère des variantes uniques par lot, sans shadowban — même pipeline que le manuel</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Mode paramètre: inspecteur/testing — visualise et édite les valeurs
              aléatoires d'une variante (cadrage, logo, sous-titres, miroir…) sans rendre. */}
          <Button
            onClick={() => navigate("/auto-param-mode")}
            variant="ghost"
            className="gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 text-white hover:bg-white hover:text-black"
          >
            <Wand2 className="h-4 w-4" /> Mode paramètre
          </Button>
          {/* Nouveau lot: vide l'affichage du lot courant pour reconfigurer/relancer
              une génération. Le lot en cours N'EST PAS arrêté — il continue côté
              backend et reste consultable dans « Anciens lots » à gauche. */}
          <Button
            onClick={() => { setJob(null); setSelectedIds(new Set()); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="gap-2 rounded-full bg-white px-4 text-black hover:bg-white/90"
          >
            <Plus className="h-4 w-4" /> Nouveau lot
          </Button>
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 md:flex">
            <Layers className="h-4 w-4 text-white/45" />
            <span className="text-xs font-black uppercase tracking-[0.18em] text-white/60">{selectedCount} sél. · {variantsPerVideo} variantes</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start">
        {/* Anciens lots — l'historique des batchs (le backend garde les 10 derniers).
            Un lot en cours continue de tourner même si on quitte la page : il est
            re-affiché automatiquement au retour, pastille ambre animée. */}
        <aside className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 lg:sticky lg:top-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/50">Anciens lots</p>
          <div className="mt-3 grid gap-2">
            {recentJobs.length === 0 && (
              <p className="text-[11px] leading-relaxed text-white/35">Aucun lot pour l'instant. Lance une génération et elle restera consultable ici.</p>
            )}
            {recentJobs.map((j) => {
              const running = jobIsRunning(j);
              const d = new Date(j.createdAt);
              const label = `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
              return (
                <button
                  key={j.id}
                  onClick={() => setJob(j)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left transition",
                    job?.id === j.id ? "border-white/40 bg-white/10" : "border-white/10 bg-white/[0.03] hover:border-white/25"
                  )}
                >
                  <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-tight">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", running ? "animate-pulse bg-amber-400" : "bg-emerald-400")} />
                    {label}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-white/45">
                    {j.done}/{j.total} rendu(s){running ? " · en cours…" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="grid min-w-0 gap-6">
        {/* 1 — PROJECT SELECTION */}
        <SectionShell
          step={1}
          title="Sélection des projets"
          subtitle="Choisis les projets sources (P1 + P2 transcrits) à décliner en lot."
          icon={<Film className="h-5 w-5" />}
          action={
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-white/70">{selectedCount} sélectionné{selectedCount > 1 ? "s" : ""}</span>
              {selectable.length > 0 && (
                <Button onClick={toggleAll} className="rounded-full bg-white px-4 text-xs font-black uppercase tracking-[0.14em] text-black hover:bg-white/90">
                  {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
                </Button>
              )}
            </div>
          }
        >
          {selectable.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/40 p-6 text-sm text-white/55">
              Aucune paire de vidéos prête. Importe une <span className="font-bold text-white">vidéo 1 + vidéo 2</span> dans la banque — la paire apparaîtra ici (l'auto la transcrit et la monte toute seule).
              {pending.length > 0 && <span className="block mt-2 text-white/40">{pending.length} paire(s) incomplète(s).</span>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {selectable.map((p) => {
                const isSelected = selectedIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleVideo(p.id)}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl border bg-white/[0.03] p-3 text-left transition-all",
                      isSelected ? "border-white ring-2 ring-white" : "border-white/10 hover:border-white/30 hover:bg-white/[0.06]"
                    )}
                  >
                    <div className="relative grid aspect-[9/12] place-items-center overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02]">
                      <Film className="h-7 w-7 text-white/20" />
                      <div className={cn("absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border transition-all", isSelected ? "border-white bg-white text-black" : "border-white/30 bg-black/40 text-transparent group-hover:border-white/60")}>
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                    </div>
                    <p className="mt-3 truncate text-sm font-black uppercase tracking-tight">{p.title || p.id}</p>
                    <p className="mt-0.5 truncate text-[11px] text-white/45">{p.person1?.title} + {p.person2?.title}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-white/40">vidéo 1 + 2</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </SectionShell>

        {/* 2 — WHAT TO VARY */}
        <SectionShell
          step={2}
          title="Qu'est-ce qui varie ?"
          subtitle="Verrouillé garde l'original. Varié choisit une autre valeur PARMI celles du mode manuel."
          icon={<Layers className="h-5 w-5" />}
          action={<span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-white/70">{variedCount} variée{variedCount > 1 ? "s" : ""}</span>}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Primary lever: split-screen */}
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/15 bg-white/[0.05] p-4 sm:col-span-2">
              <div className="flex items-start gap-3 min-w-0">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70"><Users className="h-4 w-4" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase tracking-tight">Split-screen (2 speakers) · levier principal</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                    {varySplit
                      ? `Alterne 1 / 2 speakers (~60/40), position haut/bas, répartition et cadrage. Hook recentré sur la ligne. ${bankCounts.speaker} clip(s) "2e speaker" en banque.`
                      : "Garde le réglage split-screen d'origine du projet."}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Switch checked={varySplit} onCheckedChange={setVarySplit} />
                <span className={cn("text-[10px] font-black uppercase tracking-[0.16em]", varySplit ? "text-white" : "text-white/35")}>{varySplit ? "Varié" : "Verrouillé"}</span>
              </div>
            </div>
            {/* Hook b-roll split: 2nd band is one/several random b-rolls (full-bleed, no bars) */}
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/15 bg-white/[0.05] p-4 sm:col-span-2">
              <div className="flex items-start gap-3 min-w-0">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70"><Film className="h-4 w-4" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase tracking-tight">Split hook avec b-roll</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                    {hookBrollSplit
                      ? "Sur le HOOK uniquement : split-screen où la 2e bande est 1 ou plusieurs b-rolls (plein écran, sans bandes noires). Répartition, côté et nombre aléatoires par variante."
                      : "Désactivé : le hook garde son cadrage normal."}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Switch checked={hookBrollSplit} onCheckedChange={setHookBrollSplit} />
                <span className={cn("text-[10px] font-black uppercase tracking-[0.16em]", hookBrollSplit ? "text-white" : "text-white/35")}>{hookBrollSplit ? "Activé" : "Off"}</span>
              </div>
            </div>
            {/* Sigma shake: subtle hand-held tremble over the whole video */}
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/15 bg-white/[0.05] p-4 sm:col-span-2">
              <div className="flex items-start gap-3 min-w-0">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70"><Waves className="h-4 w-4" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase tracking-tight">Shake sigma</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                    {shake
                      ? "Léger tremblement caméra sur toute la vidéo. Valeurs différentes à chaque variante ; ~1/3 sans shake même activé."
                      : "Désactivé : image stable."}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Switch checked={shake} onCheckedChange={setShake} />
                <span className={cn("text-[10px] font-black uppercase tracking-[0.16em]", shake ? "text-white" : "text-white/35")}>{shake ? "Activé" : "Off"}</span>
              </div>
            </div>
            {/* Blur background: shrink the montage centred over a big blurred copy of itself */}
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/15 bg-white/[0.05] p-4 sm:col-span-2">
              <div className="flex items-start gap-3 min-w-0">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70"><Film className="h-4 w-4" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-black uppercase tracking-tight">Flou background</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                    {blurBg
                      ? "Le montage de base est réduit et centré, avec le même rendu en grand + flou derrière. Appliqué sur ~1/2 des variantes."
                      : "Désactivé : montage plein cadre normal."}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Switch checked={blurBg} onCheckedChange={setBlurBg} />
                <span className={cn("text-[10px] font-black uppercase tracking-[0.16em]", blurBg ? "text-white" : "text-white/35")}>{blurBg ? "Activé" : "Off"}</span>
              </div>
            </div>

            {VARY_DIMENSIONS.map((dim) => {
              const isVaried = varied[dim.key];
              return (
                <div key={dim.key} className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70">{dim.icon}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-black uppercase tracking-tight">{dim.label}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-white/45">{isVaried ? dim.variedHint : dim.lockedHint}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Switch checked={isVaried} onCheckedChange={() => toggleVaried(dim.key)} />
                    <span className={cn("text-[10px] font-black uppercase tracking-[0.16em]", isVaried ? "text-white" : "text-white/35")}>{isVaried ? "Varié" : "Verrouillé"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionShell>

        {/* 3 — ASSET BANKS (real counts) */}
        <SectionShell step={3} title="Banques d'assets" subtitle="Collections réelles dans lesquelles le mode automatique pioche." icon={<Sparkles className="h-5 w-5" />}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Clips 2e speaker", icon: <Users className="h-4 w-4" />, count: bankCounts.speaker },
              { label: "Pool b-roll", icon: <Film className="h-4 w-4" />, count: bankCounts.broll },
              { label: "Images", icon: <Sparkles className="h-4 w-4" />, count: bankCounts.image },
              { label: "Banque musique", icon: <Music className="h-4 w-4" />, count: bankCounts.music },
              { label: "SFX", icon: <Waves className="h-4 w-4" />, count: bankCounts.sfx },
              { label: "Sous-titres / filtres", icon: <Captions className="h-4 w-4" />, count: 14 },
            ].map((bank) => (
              <div key={bank.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/70">{bank.icon}</div>
                    <p className="truncate text-sm font-black uppercase tracking-tight">{bank.label}</p>
                  </div>
                  <span className="grid h-8 min-w-[2rem] place-items-center rounded-full bg-white px-2 text-xs font-black text-black">{bank.count}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionShell>

        {/* 4 — GENERATION SETTINGS + launch */}
        <SectionShell step={4} title="Réglages de génération" subtitle="Combien de variantes uniques par projet, puis lance le lot." icon={<Wand2 className="h-5 w-5" />}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-end justify-between gap-4">
                <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Variantes par projet</Label>
                <span className="text-3xl font-black leading-none">{variantsPerVideo}</span>
              </div>
              <div className="mt-5 flex items-center gap-4">
                <button type="button" onClick={() => setVariantsPerVideo((v) => Math.max(1, v - 1))} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-lg font-black text-white/70 hover:bg-white hover:text-black">−</button>
                <Slider value={[variantsPerVideo]} min={1} max={20} step={1} onValueChange={([n]) => setVariantsPerVideo(n)} className="flex-1" />
                <button type="button" onClick={() => setVariantsPerVideo((v) => Math.min(20, v + 1))} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-lg font-black text-white/70 hover:bg-white hover:text-black">+</button>
              </div>
              <div className="mt-3 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-white/35"><span>1 variante</span><span>20 variantes</span></div>

              {/* La taille des sous-titres est ALÉATOIRE par variante (62–94 px) — c'est
                  le principe du mode auto. Plus de réglage manuel ; pour fixer/inspecter
                  une valeur précise, passe par le « Mode paramètre ». */}
              <div className="mt-6 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[11px] font-black uppercase tracking-[0.15em] text-white/45">
                <Captions className="h-4 w-4 text-white/35" />
                Taille des sous-titres : aléatoire (62–94 px) par variante
              </div>
            </div>

            <div className="flex flex-col justify-center rounded-2xl border border-white/15 bg-white/[0.06] p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Volume total</p>
              <p className="mt-3 text-2xl font-black leading-none">{selectedCount} <span className="text-white/40">×</span> {variantsPerVideo}</p>
              <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-white/45">= {totalOutput} vidéo{totalOutput > 1 ? "s" : ""}</p>
              <Button onClick={generate} disabled={!selectedCount || starting} className="mt-4 rounded-full bg-white text-black font-black uppercase tracking-[0.14em] hover:bg-white/90 disabled:opacity-40">
                {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                {starting ? "Lancement…" : "Générer le lot"}
              </Button>
            </div>
          </div>
        </SectionShell>

        {/* 4b — PRESETS + PLANIFICATION */}
        <SectionShell
          step={5}
          title="Presets & planification"
          subtitle="Sauvegarde ta config (vidéos + variantes + dimensions) et lance-la en un clic, ou planifie-la chaque jour à heure fixe."
          icon={<Clock className="h-5 w-5" />}
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Nom du preset (ex: Batch quotidien)"
              className="h-10 flex-1 min-w-[220px] rounded-full border border-white/10 bg-black px-4 text-sm font-bold text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
            />
            <Button
              type="button"
              onClick={savePreset}
              disabled={!selectedCount}
              className="rounded-full bg-white text-black font-black uppercase tracking-[0.14em] hover:bg-white/90 disabled:opacity-40"
            >
              Sauvegarder la config actuelle
            </Button>
          </div>
          {presets.length > 0 && (
            <div className="mt-4 space-y-2">
              {presets.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black uppercase tracking-tight">{p.name}</p>
                    <p className="text-[11px] text-white/45">{p.videoGroupIds.length} vidéo(s) · {p.variantsPerVideo} variantes{p.lastRunDate ? ` · dernier run ${p.lastRunDate}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={p.schedule?.enabled === true}
                      onCheckedChange={(enabled) => updatePresetSchedule(p.id, { enabled })}
                    />
                    <input
                      type="time"
                      value={p.schedule?.time || "09:00"}
                      onChange={(e) => updatePresetSchedule(p.id, { time: e.target.value })}
                      className="h-9 rounded-full border border-white/10 bg-black px-3 text-xs font-bold text-white focus:outline-none"
                    />
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">/ jour</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" onClick={() => runPreset(p)} disabled={runningPresetId !== null} className="rounded-full bg-white text-black font-black uppercase tracking-[0.12em] hover:bg-white/90 disabled:opacity-40">
                      {runningPresetId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lancer"}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => deletePreset(p.id)} className="rounded-full border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/10">
                      Suppr.
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionShell>

        {/* 6 — GENERATION QUEUE (real) */}
        <SectionShell
          step={6}
          title="File de génération"
          subtitle="Chaque carte = une variante unique. Le rendu reprend tout seul si le backend redémarre."
          icon={<Clock className="h-5 w-5" />}
          action={
            job ? (
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-white/70">{job.done}/{job.total} · {readyItems.length} prêt(s)</span>
                {readyItems.length > 0 && (
                  <button
                    onClick={() => downloadFile(localKlimaxApi.autoJobDownloadUrl(job.id), `klimax-variantes-${job.id}.zip`, "zip")}
                    disabled={downloading.has("zip")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-black hover:bg-white/90 disabled:opacity-60"
                  >
                    {downloading.has("zip") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Tout télécharger
                  </button>
                )}
              </div>
            ) : null
          }
        >
          {items.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/5"><Film className="h-6 w-6 text-white/30" /></div>
              <h3 className="mt-4 text-lg font-black uppercase tracking-tight text-white/70">Aucune génération en cours</h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/45">Sélectionne des projets et clique « Générer le lot ».</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <div key={item.id} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="relative grid aspect-video place-items-center overflow-hidden rounded-xl border border-white/10 bg-black">
                    {item.status === "ready" && item.url ? (
                      <video src={item.url} className="absolute inset-0 h-full w-full object-contain" controls muted playsInline preload="metadata" />
                    ) : (
                      <Film className="h-7 w-7 text-white/20" />
                    )}
                    <div className="absolute left-2 top-2"><StatusBadge status={item.status} /></div>
                  </div>
                  <p className="mt-3 truncate text-sm font-black uppercase tracking-tight">{item.source}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/45">{item.combo}</p>
                  <button
                    onClick={() =>
                      item.status === "ready" && item.url &&
                      downloadFile(item.url, `${String(item.source || "variante").replace(/[^\w\- ]+/g, "").trim() || "variante"} - v${(item.index ?? 0) + 1}.mp4`, item.id)
                    }
                    disabled={!(item.status === "ready" && item.url) || downloading.has(item.id)}
                    className={cn(
                      "mt-3 inline-flex w-full items-center justify-center gap-1 rounded-full border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] transition",
                      item.status === "ready" && item.url ? "border-white/10 bg-white text-black hover:bg-white/90 disabled:opacity-60" : "pointer-events-none border-white/10 bg-white/[0.03] text-white/40"
                    )}
                  >
                    {downloading.has(item.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exporter
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Étape finale : envoi du lot sur Google Drive (un dossier par import). */}
          {job && job.drive?.status !== "skipped" && (job.drive || (job.finishedAt && readyItems.length > 0)) && (
            <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
              <DriveLogo
                className={cn(
                  "h-9 w-9 shrink-0",
                  job.drive?.status === "uploading" && "animate-bounce",
                  !job.drive && "animate-pulse opacity-60"
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black uppercase tracking-tight">Google Drive</p>
                <p className="text-xs text-white/50">
                  {!job.drive && "Préparation de l'envoi…"}
                  {job.drive?.status === "uploading" && `Envoi en cours — ${job.drive.uploaded}/${job.drive.total} vidéo(s)…`}
                  {job.drive?.status === "done" && `${job.drive.uploaded}/${job.drive.total} vidéo(s) envoyées dans le dossier du lot.`}
                  {job.drive?.status === "failed" && `Envoi échoué : ${job.drive.error || "erreur inconnue"}`}
                </p>
              </div>
              {job.drive?.status === "done" && job.drive.link && (
                <a
                  href={job.drive.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-black hover:bg-white/90"
                >
                  <DriveLogo className="h-4 w-4" /> Ouvrir le dossier
                </a>
              )}
            </div>
          )}
        </SectionShell>
        </div>
      </main>
    </div>
  );
};

export default AutomaticMode;
