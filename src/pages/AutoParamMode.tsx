import * as React from "react";
const { useEffect, useMemo, useState } = React;
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw, FlipHorizontal2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { localKlimaxApi, type AutoPlanProject, type AutoPlanVariant } from "@/lib/localKlimaxApi";
import { AutoVariantCanvas, KLIMAX_PREVIEW_KEYFRAMES } from "@/lib/klimaxPreview";

type VaryKey = "broll" | "subtitles" | "hook" | "sfx" | "zooms" | "music";
const VARY_KEYS: { key: VaryKey; label: string }[] = [
  { key: "subtitles", label: "Sous-titres" },
  { key: "hook", label: "Hook" },
  { key: "broll", label: "B-roll" },
  { key: "music", label: "Musique" },
  { key: "sfx", label: "SFX" },
  { key: "zooms", label: "Zooms" },
];

const FILTER_KEYS = ["none", "clean_boost", "warm_viral", "cold_crisp", "contrast_punch", "soft_glow", "grain_light", "mono_noir", "green_tint", "pink_pop", "vhs_lite"];
const PRESET_KEYS = ["impact", "clean", "highlight", "capcut", "punch", "neon", "quickFade", "orangeThe", "proQuick", "yellowPop", "pinkPunch", "cyanGlow", "whiteBox", "creatorClean", "hormozi", "bebasGold", "iceBlue", "redAlert", "mintBounce", "cleanMinimal", "invertBox", "purpleNeon", "tiktokWhite", "tiktokBlack", "tiktokRed", "capcutYellow", "capcutKaraoke", "karaokeGreen", "tiktokOutline", "bebasCaps"];
const ANIM_KEYS = ["pop", "bounce", "rise", "fade", "zoom", "slide", "shake", "typewriter", "flicker", "elastic", "none"];

const cleanName = (title?: string | null) => String(title || "").replace(/\.[a-z0-9]+$/i, "").trim() || "—";

// --- tiny field primitives (native, robust) ---
const Num = ({ label, value, onChange, min, max, step = 1, suffix }: {
  label: string; value: number | undefined; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string;
}) => (
  <label className="flex items-center justify-between gap-3 py-1 text-xs">
    <span className="text-white/55">{label}</span>
    <span className="flex items-center gap-1">
      <input
        type="number"
        value={Number.isFinite(value as number) ? value : ""}
        min={min}
        max={max}
        step={step}
        onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))}
        className="w-24 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-right font-black text-white outline-none focus:border-white/30"
      />
      {suffix ? <span className="w-4 text-white/30">{suffix}</span> : null}
    </span>
  </label>
);

const Sel = ({ label, value, onChange, options }: {
  label: string; value: string | undefined; onChange: (v: string) => void; options: string[];
}) => (
  <label className="flex items-center justify-between gap-3 py-1 text-xs">
    <span className="text-white/55">{label}</span>
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-40 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 font-black text-white outline-none focus:border-white/30"
    >
      {options.map((o) => (
        <option key={o} value={o} className="bg-neutral-900">
          {o}
        </option>
      ))}
    </select>
  </label>
);

const ColorField = ({ label, value, onChange }: { label: string; value: string | undefined; onChange: (v: string) => void }) => (
  <label className="flex items-center justify-between gap-3 py-1 text-xs">
    <span className="text-white/55">{label}</span>
    <input
      type="color"
      value={/^#[0-9a-fA-F]{6}$/.test(String(value)) ? (value as string) : "#ffffff"}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-14 cursor-pointer rounded-lg border border-white/10 bg-transparent"
    />
  </label>
);

const Group = ({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
    <div className="mb-2 flex items-center gap-2">
      <h4 className="text-xs font-black uppercase tracking-[0.18em] text-white/70">{title}</h4>
      {badge ? <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.15em] text-cyan-300">{badge}</span> : null}
    </div>
    <div className="divide-y divide-white/5">{children}</div>
  </div>
);

const AutoParamMode = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [videoGroups, setVideoGroups] = useState<any[]>([]);
  const [groupId, setGroupId] = useState<string>("");
  const [variantsPerVideo, setVariantsPerVideo] = useState(6);
  const [varied, setVaried] = useState<Record<VaryKey, boolean>>({ broll: true, subtitles: true, hook: true, sfx: true, zooms: true, music: true });
  const [varySplit, setVarySplit] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [project, setProject] = useState<AutoPlanProject | null>(null);
  const [variants, setVariants] = useState<AutoPlanVariant[]>([]);
  const [vIdx, setVIdx] = useState(0);
  const [stage, setStage] = useState<"intro" | "reply">("intro");

  useEffect(() => {
    localKlimaxApi
      .listAssets()
      .then(({ videoGroups }) => {
        const usable = (videoGroups || []).filter((g: any) => g.person1?.filePath && g.person2?.filePath);
        setVideoGroups(usable);
        if (usable[0]) setGroupId((cur) => cur || usable[0].id);
      })
      .catch(() => {});
  }, []);

  const runPlan = async () => {
    if (!groupId) {
      toast({ title: "Choisis une paire vidéo", variant: "destructive" });
      return;
    }
    setPlanning(true);
    try {
      const { projects } = await localKlimaxApi.planAutoBatch({
        videoGroupIds: [groupId],
        variantsPerVideo,
        varied,
        lockSplitScreen: !varySplit,
      });
      const p = projects?.[0];
      if (!p || !p.variants.length) throw new Error("Aucune variante planifiable.");
      setProject(p);
      setVariants(p.variants.map((v) => structuredClone(v)));
      setVIdx(0);
      setStage("intro");
      toast({ title: `${p.variants.length} variantes planifiées`, description: p.source });
    } catch (e: any) {
      toast({ title: "Planification échouée", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setPlanning(false);
    }
  };

  const variant = variants[vIdx];

  const patchVariant = (mutator: (v: AutoPlanVariant) => void) => {
    setVariants((prev) => prev.map((v, i) => {
      if (i !== vIdx) return v;
      const copy = structuredClone(v);
      mutator(copy);
      return copy;
    }));
  };
  const setSettings = (patch: Record<string, unknown>) => patchVariant((v) => { v.settings = { ...v.settings, ...patch }; });
  const setSubStyle = (patch: Record<string, unknown>) => patchVariant((v) => { v.settings.subtitleStyle = { ...(v.settings.subtitleStyle || {}), ...patch }; });
  const setHookStyle = (patch: Record<string, unknown>) => patchVariant((v) => { v.settings.hookStyle = { ...(v.settings.hookStyle || {}), ...patch }; });
  const setClip = (st: "intro" | "reply", patch: Record<string, unknown>) => patchVariant((v) => {
    const c = v.clips.find((x) => x.stage === st);
    if (c) Object.assign(c, patch);
  });
  const setAllClips = (patch: Record<string, unknown>) => patchVariant((v) => { v.clips.forEach((c) => Object.assign(c, patch)); });

  const sources = project?.sources;
  const titleFor = (id?: string | null) => {
    if (!sources) return "—";
    const s = [sources.person1, sources.person2, ...sources.speakers].find((x) => x && x.id === id);
    return cleanName(s?.title || id);
  };

  const introClip = variant?.clips.find((c) => c.stage === "intro");
  const replyClip = variant?.clips.find((c) => c.stage === "reply");
  const split = introClip?.dualSpeakerEnabled === true;

  return (
    <div className="min-h-screen bg-black text-white">
      <style>{KLIMAX_PREVIEW_KEYFRAMES}</style>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/10 bg-black/80 px-5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/automatic-mode")} className="rounded-full border border-white/10 bg-white/[0.03] hover:bg-white hover:text-black">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-base font-black uppercase tracking-tight">Mode paramètre</h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Testing — visualise & édite l'aléatoire</p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
        {/* LEFT: config + params editor */}
        <div className="order-2 space-y-5 lg:order-1">
          {/* config */}
          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-white/70">Configuration</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-xs">
                <span className="mb-1 block text-white/55">Paire vidéo</span>
                <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 font-black text-white outline-none focus:border-white/30">
                  {videoGroups.length === 0 ? <option value="">Aucune paire disponible</option> : null}
                  {videoGroups.map((g) => (
                    <option key={g.id} value={g.id} className="bg-neutral-900">
                      {cleanName(g.person1?.title)} + {cleanName(g.person2?.title)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-1 gap-3">
                <Num label="Variantes" value={variantsPerVideo} onChange={(v) => setVariantsPerVideo(Math.max(1, Math.min(20, Math.round(v))))} min={1} max={20} />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => setVarySplit((s) => !s)}
                className={cn("rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-wide transition", varySplit ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-200" : "border-white/10 bg-white/[0.03] text-white/45")}
              >
                Split-screen {varySplit ? "varié" : "verrouillé"}
              </button>
              {VARY_KEYS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setVaried((cur) => ({ ...cur, [key]: !cur[key] }))}
                  className={cn("rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-wide transition", varied[key] ? "border-white/30 bg-white text-black" : "border-white/10 bg-white/[0.03] text-white/45")}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button onClick={runPlan} disabled={planning || !groupId} className="mt-4 rounded-full bg-white font-black text-black hover:bg-white/90 disabled:opacity-40">
              {planning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {planning ? "Planification…" : "Planifier (sans rendu)"}
            </Button>
          </section>

          {/* params editor */}
          {variant ? (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-[0.18em] text-white/70">Paramètres — variante {vIdx + 1}</h2>
                <div className="flex overflow-hidden rounded-full border border-white/10">
                  {(["intro", "reply"] as const).map((s) => (
                    <button key={s} onClick={() => setStage(s)} className={cn("px-3 py-1 text-[11px] font-black uppercase tracking-wide transition", stage === s ? "bg-white text-black" : "bg-white/[0.03] text-white/45")}>
                      {s === "intro" ? "Intro" : "Réponse"}
                    </button>
                  ))}
                </div>
              </div>

              <Group title="Global">
                <label className="flex items-center justify-between gap-3 py-1.5 text-xs">
                  <span className="flex items-center gap-2 text-white/55"><FlipHorizontal2 className="h-3.5 w-3.5" /> Miroir</span>
                  <Switch checked={variant.settings.mirrorEnabled === true} onCheckedChange={(c) => setSettings({ mirrorEnabled: c })} />
                </label>
                <Sel label="Filtre couleur" value={String(variant.settings.videoFilterKey || "none")} onChange={(v) => setSettings({ videoFilterKey: v })} options={FILTER_KEYS} />
                <Num label="Logo taille" value={introClip?.logoSize ?? 520} onChange={(v) => setAllClips({ logoSize: Math.max(200, Math.min(1080, v)) })} min={200} max={1080} suffix="px" />
                <label className="flex items-center justify-between gap-3 py-1.5 text-xs">
                  <span className="text-white/55">Logo centré</span>
                  <Switch checked={introClip?.logoCenter === true} onCheckedChange={(c) => setAllClips({ logoCenter: c })} />
                </label>
              </Group>

              {/* Intro clip framing */}
              <Group title={`Clip ${titleFor(introClip?.sourceVideoId)} (intro)`} badge={split ? "split-screen" : "solo"}>
                {split ? (
                  <>
                    <Num label="Répartition (haut)" value={Math.round((introClip?.dualSpeakerSplitRatio ?? 0.5) * 100)} onChange={(v) => setClip("intro", { dualSpeakerSplitRatio: Math.max(0.2, Math.min(0.8, v / 100)) })} min={20} max={80} suffix="%" />
                    <Sel label="2e speaker placé" value={introClip?.dualSpeakerPosition ?? "top"} onChange={(v) => setClip("intro", { dualSpeakerPosition: v })} options={["top", "bottom"]} />
                    <div className="pt-1 text-[10px] font-black uppercase tracking-wider text-white/35">Bande principale</div>
                    <Num label="Zoom" value={introClip?.dualSpeakerMainZoom ?? 100} onChange={(v) => setClip("intro", { dualSpeakerMainZoom: Math.max(100, Math.min(220, v)) })} min={100} max={220} suffix="%" />
                    <Num label="Crop X" value={introClip?.dualSpeakerMainCropX ?? 0} onChange={(v) => setClip("intro", { dualSpeakerMainCropX: Math.max(-480, Math.min(480, v)) })} min={-480} max={480} suffix="px" />
                    <Num label="Crop Y" value={introClip?.dualSpeakerMainCropY ?? 0} onChange={(v) => setClip("intro", { dualSpeakerMainCropY: Math.max(-480, Math.min(480, v)) })} min={-480} max={480} suffix="px" />
                    <div className="pt-1 text-[10px] font-black uppercase tracking-wider text-white/35">2e speaker — {titleFor(introClip?.dualSpeakerSource)}</div>
                    <Num label="Zoom" value={introClip?.dualSpeakerAddedZoom ?? 100} onChange={(v) => setClip("intro", { dualSpeakerAddedZoom: Math.max(100, Math.min(220, v)) })} min={100} max={220} suffix="%" />
                    <Num label="Crop X" value={introClip?.dualSpeakerAddedCropX ?? 0} onChange={(v) => setClip("intro", { dualSpeakerAddedCropX: Math.max(-480, Math.min(480, v)) })} min={-480} max={480} suffix="px" />
                    <Num label="Crop Y" value={introClip?.dualSpeakerAddedCropY ?? 0} onChange={(v) => setClip("intro", { dualSpeakerAddedCropY: Math.max(-480, Math.min(480, v)) })} min={-480} max={480} suffix="px" />
                  </>
                ) : (
                  <>
                    <Num label="X" value={introClip?.videoTransform?.x ?? 0} onChange={(v) => setClip("intro", { videoTransform: { ...(introClip?.videoTransform || { x: 0, y: 0, scale: 100 }), x: v } })} suffix="px" />
                    <Num label="Y" value={introClip?.videoTransform?.y ?? 0} onChange={(v) => setClip("intro", { videoTransform: { ...(introClip?.videoTransform || { x: 0, y: 0, scale: 100 }), y: v } })} suffix="px" />
                    <Num label="Zoom" value={introClip?.videoTransform?.scale ?? 100} onChange={(v) => setClip("intro", { videoTransform: { ...(introClip?.videoTransform || { x: 0, y: 0, scale: 100 }), scale: Math.max(100, Math.min(220, v)) } })} min={100} max={220} suffix="%" />
                  </>
                )}
              </Group>

              {/* Reply clip framing */}
              <Group title={`Clip ${titleFor(replyClip?.sourceVideoId)} (réponse)`} badge="solo">
                <Num label="X" value={replyClip?.videoTransform?.x ?? 0} onChange={(v) => setClip("reply", { videoTransform: { ...(replyClip?.videoTransform || { x: 0, y: 0, scale: 100 }), x: v } })} suffix="px" />
                <Num label="Y" value={replyClip?.videoTransform?.y ?? 0} onChange={(v) => setClip("reply", { videoTransform: { ...(replyClip?.videoTransform || { x: 0, y: 0, scale: 100 }), y: v } })} suffix="px" />
                <Num label="Zoom" value={replyClip?.videoTransform?.scale ?? 100} onChange={(v) => setClip("reply", { videoTransform: { ...(replyClip?.videoTransform || { x: 0, y: 0, scale: 100 }), scale: Math.max(100, Math.min(220, v)) } })} min={100} max={220} suffix="%" />
              </Group>

              {/* Subtitles */}
              <Group title={`Sous-titres (${stage === "intro" ? "intro" : "réponse"})`}>
                <Sel label="Preset" value={String(variant.settings.subtitleStyle?.stylePreset || "impact")} onChange={(v) => setSubStyle({ stylePreset: v })} options={PRESET_KEYS} />
                <Num label="Taille" value={variant.settings.subtitleStyle?.fontSize ?? variant.settings.subtitleSize ?? 53} onChange={(v) => setSubStyle({ fontSize: Math.max(30, Math.min(120, v)) })} min={30} max={120} suffix="px" />
                <Sel label="Animation" value={String(variant.settings.subtitleStyle?.animationPreset || "pop")} onChange={(v) => setSubStyle({ animationPreset: v })} options={ANIM_KEYS} />
                <Num
                  label="Position Y"
                  value={(stage === "intro" ? introClip : replyClip)?.subtitlePosition?.y ?? (stage === "intro" ? 1500 : 1265)}
                  onChange={(v) => setClip(stage, { subtitlePosition: { x: 540, y: Math.max(200, Math.min(1850, v)) } })}
                  min={200}
                  max={1850}
                  suffix="px"
                />
              </Group>

              {/* Hook */}
              <Group title="Hook (intro)">
                <label className="block py-1 text-xs">
                  <span className="mb-1 block text-white/55">Texte</span>
                  <input
                    type="text"
                    value={introClip?.hookText || (variant.settings.hookText as string) || ""}
                    onChange={(e) => { setClip("intro", { hookText: e.target.value }); setSettings({ hookText: e.target.value }); }}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1.5 font-black text-white outline-none focus:border-white/30"
                  />
                </label>
                <Num label="Position Y" value={introClip?.hookPosition?.y ?? 1325} onChange={(v) => setClip("intro", { hookPosition: { x: 540, y: Math.max(200, Math.min(1850, v)) } })} min={200} max={1850} suffix="px" />
                <ColorField label="Couleur bulle" value={variant.settings.hookStyle?.bubbleColor} onChange={(v) => setHookStyle({ bubbleColor: v })} />
                <ColorField label="Couleur texte" value={variant.settings.hookStyle?.textColor} onChange={(v) => setHookStyle({ textColor: v })} />
              </Group>

              <p className="px-1 text-[11px] leading-relaxed text-white/35">
                Combo généré : <span className="font-black text-white/55">{variant.combo}</span>
              </p>
            </section>
          ) : (
            <section className="rounded-3xl border border-dashed border-white/10 p-10 text-center text-sm text-white/40">
              {planning ? "Planification en cours…" : "Lance « Planifier » pour visualiser les variantes."}
            </section>
          )}
        </div>

        {/* RIGHT: preview + variant selector (sticky) */}
        <div className="order-1 lg:order-2">
          <div className="sticky top-20 space-y-4">
            {variant && project ? (
              <>
                <div className="mx-auto w-full max-w-[340px]">
                  <AutoVariantCanvas
                    variant={variant}
                    sources={project.sources}
                    clipStage={stage}
                    subtitleSample={project.subtitleSamples?.[stage] || ""}
                  />
                </div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {variants.map((v, i) => (
                    <button
                      key={i}
                      onClick={() => setVIdx(i)}
                      title={v.combo}
                      className={cn("h-8 w-8 rounded-lg text-[11px] font-black transition", i === vIdx ? "bg-white text-black" : "bg-white/[0.06] text-white/55 hover:bg-white/15")}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center text-[11px] text-white/45">
                  {project.source} · {variants.length} variantes · preview {stage === "intro" ? "intro" : "réponse"}
                </div>
              </>
            ) : (
              <div className="mx-auto grid aspect-[9/16] w-full max-w-[340px] place-items-center rounded-[24px] border border-white/10 bg-neutral-950 text-center text-xs text-white/30">
                <span className="flex flex-col items-center gap-2">
                  <Wand2 className="h-6 w-6 opacity-40" />
                  Aperçu de la variante
                </span>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AutoParamMode;
