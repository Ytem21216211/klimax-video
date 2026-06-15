import * as React from "react";
const { useEffect, useMemo, useState } = React;
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Save, Trash2, Wand2, Loader2, FolderCog, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { localKlimaxApi, type StudioProject, type StudioOverrides } from "@/lib/localKlimaxApi";

type VaryKey = "broll" | "subtitles" | "hook" | "sfx" | "zooms" | "music";
const VARY_KEYS: { key: VaryKey; label: string }[] = [
  { key: "subtitles", label: "Sous-titres" },
  { key: "hook", label: "Hook" },
  { key: "broll", label: "B-roll" },
  { key: "music", label: "Musique" },
  { key: "sfx", label: "SFX" },
  { key: "zooms", label: "Zooms" },
];
const FILTER_KEYS = ["clean_boost", "warm_viral", "cold_crisp", "contrast_punch", "soft_glow", "grain_light", "mono_noir", "green_tint", "pink_pop", "vhs_lite"];
const PRESET_KEYS = ["impact", "clean", "highlight", "capcut", "punch", "neon", "quickFade", "orangeThe", "proQuick", "yellowPop", "pinkPunch", "cyanGlow", "whiteBox", "creatorClean", "hormozi", "bebasGold", "iceBlue", "redAlert", "mintBounce", "cleanMinimal", "invertBox", "purpleNeon", "tiktokWhite", "tiktokBlack", "tiktokRed", "capcutYellow", "capcutKaraoke", "karaokeGreen", "tiktokOutline", "bebasCaps"];
const cleanName = (t?: string | null) => String(t || "").replace(/\.[a-z0-9]+$/i, "").trim() || "—";

const blankDraft = (): StudioProject => ({
  id: "",
  name: "",
  description: "",
  videoGroupIds: [],
  variantsPerVideo: 6,
  varied: { broll: true, subtitles: true, hook: true, sfx: true, zooms: true, music: true },
  lockSplitScreen: false,
  overrides: { twoSpeakerRatio: 0.6, splitRatioMin: 0.25, splitRatioMax: 0.75, subtitleSizeMin: 62, subtitleSizeMax: 94, logoSizeMin: 850, logoSizeMax: 920, zoomMaxBoostPercent: 22, allowedSubtitlePresets: [], filterDenylist: [] },
  assetPools: { brollIds: null, imageIds: null, musicIds: null, speakerIds: null },
  hookBank: [],
  createdAt: "",
  updatedAt: "",
});

const Num = ({ label, value, onChange, min, max, step = 1, suffix }: { label: string; value: number | undefined; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string }) => (
  <label className="flex items-center justify-between gap-3 py-1 text-xs">
    <span className="text-white/55">{label}</span>
    <span className="flex items-center gap-1">
      <input type="number" value={Number.isFinite(value as number) ? value : ""} min={min} max={max} step={step}
        onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))}
        className="w-24 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-right font-black text-white outline-none focus:border-white/30" />
      {suffix ? <span className="w-5 text-white/30">{suffix}</span> : null}
    </span>
  </label>
);

const Chip = ({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) => (
  <button type="button" onClick={onClick} className={cn("rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide transition", on ? "border-white/30 bg-white text-black" : "border-white/10 bg-white/[0.03] text-white/45 hover:bg-white/[0.08]")}>{label}</button>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
    <h4 className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-white/70">{title}</h4>
    {children}
  </div>
);

const StudioProjects = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [videoGroups, setVideoGroups] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [draft, setDraft] = useState<StudioProject | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const refresh = () => localKlimaxApi.listStudioProjects().then(({ projects }) => setProjects(projects || [])).catch(() => {});
  useEffect(() => {
    // Deep-link from the Accueil: ?id=<project> opens it, ?new=1 starts a blank draft.
    const params = new URLSearchParams(window.location.search);
    const wantId = params.get("id");
    const wantNew = params.get("new");
    localKlimaxApi.listStudioProjects().then(({ projects }) => {
      setProjects(projects || []);
      if (wantNew) setDraft(blankDraft());
      else if (wantId) { const p = (projects || []).find((x) => x.id === wantId); if (p) setDraft(structuredClone(p)); }
    }).catch(() => {});
    localKlimaxApi.listAssets().then(({ assets, videoGroups }) => {
      setAssets(assets || []);
      setVideoGroups((videoGroups || []).filter((g: any) => g.person1?.filePath && g.person2?.filePath));
    }).catch(() => {});
  }, []);

  const assetsByCat = useMemo(() => {
    const by: Record<string, any[]> = { broll: [], image: [], music: [], speaker: [] };
    for (const a of assets) if (by[a.category]) by[a.category].push(a);
    return by;
  }, [assets]);

  const edit = (p: StudioProject) => setDraft(structuredClone(p));
  const set = (patch: Partial<StudioProject>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setOv = (patch: Partial<StudioOverrides>) => setDraft((d) => (d ? { ...d, overrides: { ...d.overrides, ...patch } } : d));
  const toggleInList = (list: string[] | undefined, id: string) => {
    const arr = Array.isArray(list) ? [...list] : [];
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1); else arr.push(id);
    return arr;
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) { toast({ title: "Donne un nom au projet", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const { project } = await localKlimaxApi.saveStudioProject(draft);
      await refresh();
      setDraft(structuredClone(project));
      toast({ title: "Projet enregistré", description: project.name });
    } catch (e: any) {
      toast({ title: "Échec de l'enregistrement", description: String(e?.message || e), variant: "destructive" });
    } finally { setSaving(false); }
  };

  const run = async () => {
    if (!draft?.id) { toast({ title: "Enregistre d'abord le projet", variant: "destructive" }); return; }
    if (!draft.videoGroupIds.length) { toast({ title: "Choisis au moins une paire vidéo", variant: "destructive" }); return; }
    setRunning(true);
    try {
      const res = await localKlimaxApi.runStudioProject(draft.id);
      toast({ title: "Lot lancé 🚀", description: `${res.total} variantes — voir dans Mode automatique` });
      navigate("/automatic-mode");
    } catch (e: any) {
      toast({ title: "Échec du lancement", description: String(e?.message || e), variant: "destructive" });
    } finally { setRunning(false); }
  };

  const del = async () => {
    if (!draft?.id) { setDraft(null); return; }
    try { await localKlimaxApi.deleteStudioProject(draft.id); await refresh(); setDraft(null); toast({ title: "Projet supprimé" }); }
    catch (e: any) { toast({ title: "Échec suppression", description: String(e?.message || e), variant: "destructive" }); }
  };

  const ov = draft?.overrides || {};

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/10 bg-black/80 px-5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/projets")} className="rounded-full border border-white/10 bg-white/[0.03] hover:bg-white hover:text-black"><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="flex items-center gap-2 text-base font-black uppercase tracking-tight"><FolderCog className="h-4 w-4" /> Projets Studio</h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Configs réutilisables par podcast — toutes les variables</p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1300px] grid-cols-1 gap-6 p-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* project list */}
        <aside className="space-y-2">
          <Button onClick={() => setDraft(blankDraft())} className="w-full rounded-xl bg-white font-black text-black hover:bg-white/90"><Plus className="mr-2 h-4 w-4" /> Nouveau projet</Button>
          {projects.length === 0 ? <p className="px-1 pt-2 text-[11px] text-white/35">Aucun projet. Crée ton premier modèle réutilisable.</p> : null}
          {projects.map((p) => (
            <button key={p.id} onClick={() => edit(p)} className={cn("w-full rounded-xl border px-3 py-2 text-left transition", draft?.id === p.id ? "border-white/40 bg-white/[0.08]" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]")}>
              <p className="truncate text-sm font-black">{p.name}</p>
              <p className="truncate text-[10px] uppercase tracking-wide text-white/40">{p.videoGroupIds.length} paire(s) · {p.variantsPerVideo} variantes</p>
            </button>
          ))}
        </aside>

        {/* editor */}
        {!draft ? (
          <div className="grid place-items-center rounded-3xl border border-dashed border-white/10 p-16 text-center text-sm text-white/40">
            <span className="flex flex-col items-center gap-2"><Sparkles className="h-6 w-6 opacity-40" /> Sélectionne ou crée un projet</span>
          </div>
        ) : (
          <div className="space-y-4">
            <Section title="Identité">
              <div className="space-y-2">
                <input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Nom du projet (ex: Podcast Taille)" className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 font-black text-white outline-none focus:border-white/30" />
                <input value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="Description courte" className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/80 outline-none focus:border-white/30" />
              </div>
            </Section>

            <Section title="Paires vidéo (podcasts)">
              {videoGroups.length === 0 ? <p className="text-[11px] text-white/40">Aucune paire. Importe une personne 1 + personne 2 dans la Banque.</p> : (
                <div className="flex flex-wrap gap-2">
                  {videoGroups.map((g) => (
                    <Chip key={g.id} on={draft.videoGroupIds.includes(g.id)} label={`${cleanName(g.person1?.title)} + ${cleanName(g.person2?.title)}`} onClick={() => set({ videoGroupIds: toggleInList(draft.videoGroupIds, g.id) })} />
                  ))}
                </div>
              )}
            </Section>

            <Section title="Génération">
              <Num label="Variantes par podcast" value={draft.variantsPerVideo} onChange={(v) => set({ variantsPerVideo: Math.max(1, Math.min(20, Math.round(v))) })} min={1} max={20} />
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip on={!draft.lockSplitScreen} label={draft.lockSplitScreen ? "Split verrouillé" : "Split varié"} onClick={() => set({ lockSplitScreen: !draft.lockSplitScreen })} />
                {VARY_KEYS.map(({ key, label }) => (
                  <Chip key={key} on={draft.varied[key] !== false} label={label} onClick={() => set({ varied: { ...draft.varied, [key]: draft.varied[key] === false } })} />
                ))}
              </div>
            </Section>

            <Section title="Plages aléatoires">
              <div className="grid gap-x-6 md:grid-cols-2">
                <Num label="Fréquence split 2 speakers" value={Math.round((ov.twoSpeakerRatio ?? 0.6) * 100)} onChange={(v) => setOv({ twoSpeakerRatio: Math.max(0, Math.min(1, v / 100)) })} min={0} max={100} suffix="%" />
                <Num label="Split min" value={Math.round((ov.splitRatioMin ?? 0.25) * 100)} onChange={(v) => setOv({ splitRatioMin: Math.max(20, Math.min(80, v)) / 100 })} min={20} max={80} suffix="%" />
                <Num label="Split max" value={Math.round((ov.splitRatioMax ?? 0.75) * 100)} onChange={(v) => setOv({ splitRatioMax: Math.max(20, Math.min(80, v)) / 100 })} min={20} max={80} suffix="%" />
                <Num label="Sous-titres min" value={ov.subtitleSizeMin ?? 62} onChange={(v) => setOv({ subtitleSizeMin: Math.max(30, Math.min(120, v)) })} min={30} max={120} suffix="px" />
                <Num label="Sous-titres max" value={ov.subtitleSizeMax ?? 94} onChange={(v) => setOv({ subtitleSizeMax: Math.max(30, Math.min(120, v)) })} min={30} max={120} suffix="px" />
                <Num label="Logo min" value={ov.logoSizeMin ?? 850} onChange={(v) => setOv({ logoSizeMin: Math.max(200, Math.min(1080, v)) })} min={200} max={1080} suffix="px" />
                <Num label="Logo max" value={ov.logoSizeMax ?? 920} onChange={(v) => setOv({ logoSizeMax: Math.max(200, Math.min(1080, v)) })} min={200} max={1080} suffix="px" />
                <Num label="Zoom max (intensité)" value={ov.zoomMaxBoostPercent ?? 22} onChange={(v) => setOv({ zoomMaxBoostPercent: Math.max(0, Math.min(40, v)) })} min={0} max={40} suffix="%" />
                <Num label="Musique max (dB)" value={ov.musicVolumeMaxDb ?? -14} onChange={(v) => setOv({ musicVolumeMaxDb: Math.max(-30, Math.min(-8, v)) })} min={-30} max={-8} suffix="dB" />
              </div>
            </Section>

            <Section title="Presets de sous-titres autorisés">
              <p className="mb-2 text-[10px] uppercase tracking-wide text-white/35">{(ov.allowedSubtitlePresets?.length || 0) === 0 ? "Tous autorisés" : `${ov.allowedSubtitlePresets!.length} sélectionnés`}</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_KEYS.map((k) => (
                  <Chip key={k} on={(ov.allowedSubtitlePresets || []).includes(k)} label={k} onClick={() => setOv({ allowedSubtitlePresets: toggleInList(ov.allowedSubtitlePresets, k) })} />
                ))}
              </div>
            </Section>

            <Section title="Filtres couleur exclus">
              <div className="flex flex-wrap gap-1.5">
                {FILTER_KEYS.map((k) => (
                  <Chip key={k} on={(ov.filterDenylist || []).includes(k)} label={k} onClick={() => setOv({ filterDenylist: toggleInList(ov.filterDenylist, k) })} />
                ))}
              </div>
            </Section>

            {(["broll", "image", "music", "speaker"] as const).map((cat) => {
              const key = (cat === "broll" ? "brollIds" : cat === "image" ? "imageIds" : cat === "music" ? "musicIds" : "speakerIds") as keyof StudioProject["assetPools"];
              const pool = draft.assetPools[key];
              const list = assetsByCat[cat] || [];
              return (
                <Section key={cat} title={`Pool ${cat === "broll" ? "B-roll" : cat === "image" ? "Images" : cat === "music" ? "Musique" : "2e speakers"}`}>
                  <div className="mb-2 flex items-center gap-2">
                    <Chip on={pool === null} label="Tous" onClick={() => set({ assetPools: { ...draft.assetPools, [key]: null } })} />
                    <span className="text-[10px] uppercase tracking-wide text-white/35">{pool === null ? "toute la banque" : `${pool.length} sélectionné(s)`}</span>
                  </div>
                  {list.length === 0 ? <p className="text-[11px] text-white/30">Aucun asset dans cette catégorie.</p> : (
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((a) => (
                        <Chip key={a.id} on={pool !== null && pool.includes(a.id)} label={cleanName(a.title || a.note)} onClick={() => set({ assetPools: { ...draft.assetPools, [key]: toggleInList(pool || [], a.id) } })} />
                      ))}
                    </div>
                  )}
                </Section>
              );
            })}

            <Section title="Banque de hooks (1 par ligne)">
              <textarea value={(draft.hookBank || []).join("\n")} onChange={(e) => set({ hookBank: e.target.value.split("\n") })} rows={5} placeholder={"la taille ça change tout 🍆\ntenir longtemps au lit 🍆"} className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white/90 outline-none focus:border-white/30" />
              <p className="mt-1 text-[10px] text-white/35">Si rempli + dimension « Hook » activée, ces hooks sont utilisés. Sinon l'IA en génère depuis le transcript.</p>
            </Section>

            <div className="sticky bottom-0 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/80 p-3 backdrop-blur-xl">
              <Button onClick={save} disabled={saving} className="rounded-full bg-white font-black text-black hover:bg-white/90 disabled:opacity-40">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Enregistrer</Button>
              <Button onClick={run} disabled={running || !draft.id} variant="ghost" className="rounded-full border border-white/15 bg-white/[0.04] font-black text-white hover:bg-white hover:text-black disabled:opacity-40">{running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />} Lancer le lot</Button>
              <Button onClick={del} variant="ghost" className="ml-auto rounded-full border border-red-400/20 bg-red-400/5 font-black text-red-300 hover:bg-red-400/15"><Trash2 className="mr-2 h-4 w-4" /> {draft.id ? "Supprimer" : "Annuler"}</Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default StudioProjects;
