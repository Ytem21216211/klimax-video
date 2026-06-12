import * as React from "react";
const { useEffect, useMemo, useState } = React;
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Brain, CheckCircle2, GraduationCap, Loader2, RefreshCw, Send, Sparkles, Wand2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  localKlimaxApi,
  type LocalAutoJob,
  type LocalAutoItem,
  type LocalLearnedRule,
  type LocalTrainingState,
} from "@/lib/localKlimaxApi";

const CATEGORY_LABELS: Record<string, string> = {
  hooks: "Hooks", broll: "B-roll", general: "Général",
  subtitles: "Sous-titres", zoom: "Zoom", music: "Musique", splitscreen: "Split-screen",
};

// One render = one training round. We always vary everything so the user sees the
// engine's full range of decisions to critique.
const ALL_VARIED = { broll: true, subtitles: true, hook: true, sfx: true, zooms: true, music: true };

const DecisionRow = ({ label, value }: { label: string; value: React.ReactNode }) =>
  value === null || value === undefined || value === "" ? null : (
    <div className="flex items-center justify-between gap-3 py-1 text-[12px]">
      <span className="text-white/40">{label}</span>
      <span className="font-medium text-white/80">{value}</span>
    </div>
  );

const RuleChip = ({ rule, onDelete }: { rule: LocalLearnedRule; onDelete: (id: string) => void }) => (
  <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
    <Badge variant="outline" className="shrink-0 border-white/15 text-[10px] text-white/60">
      {CATEGORY_LABELS[rule.category] || rule.category}
    </Badge>
    <span className="flex-1 text-[12px] leading-snug text-white/80">
      {rule.kind === "text" ? rule.text : <code className="text-amber-300/90">{rule.param} = {JSON.stringify(rule.value)}</code>}
    </span>
    <button onClick={() => onDelete(rule.id)} className="shrink-0 text-white/30 transition hover:text-red-400" title="Oublier cette règle">
      <X className="h-3.5 w-3.5" />
    </button>
  </div>
);

const TrainingMode = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [videoGroups, setVideoGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [variants, setVariants] = useState(2);
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState<LocalAutoJob | null>(null);

  const [training, setTraining] = useState<LocalTrainingState | null>(null);
  const [activeItem, setActiveItem] = useState<LocalAutoItem | null>(null);
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);

  const refreshRules = () => localKlimaxApi.getTrainingRules().then(setTraining).catch(() => {});

  useEffect(() => {
    localKlimaxApi.listAssets().then(({ videoGroups }) => setVideoGroups(videoGroups || [])).catch(() => {});
    refreshRules();
  }, []);

  // Poll the running job until every variant is rendered.
  useEffect(() => {
    if (!job?.id) return;
    if (job.finishedAt && job.done >= job.total) return;
    const t = setInterval(async () => {
      try {
        const { job: j } = await localKlimaxApi.getAutoJob(job.id);
        setJob((cur) => (cur?.id === j.id ? j : cur));
      } catch { /* backend may be restarting */ }
    }, 4000);
    return () => clearInterval(t);
  }, [job?.id, job?.finishedAt, job?.done, job?.total]);

  const selectable = useMemo(
    () => videoGroups.filter((g) => g.person1?.filePath && g.person2?.filePath),
    [videoGroups],
  );

  const readyItems = useMemo(() => (job?.items || []).filter((it) => it.status === "ready"), [job]);
  // Auto-focus the first ready variant for feedback once renders land.
  useEffect(() => {
    if (!activeItem && readyItems.length) setActiveItem(readyItems[0]);
  }, [readyItems, activeItem]);

  const rulesByCategory = useMemo(() => {
    const map: Record<string, LocalLearnedRule[]> = {};
    for (const r of training?.rules || []) (map[r.category] ||= []).push(r);
    return map;
  }, [training]);

  const runTrial = async () => {
    if (!selectedGroupId || starting) return;
    setStarting(true);
    setJob(null);
    setActiveItem(null);
    try {
      const res = await localKlimaxApi.startAutoBatch({
        videoGroupIds: [selectedGroupId],
        variantsPerVideo: variants,
        varied: ALL_VARIED,
      });
      const { job: j } = await localKlimaxApi.getAutoJob(res.jobId);
      setJob(j);
      toast({ title: "Essai lancé", description: `${res.total} variante(s) en cours de rendu…` });
    } catch (e: any) {
      toast({ title: "Échec du lancement", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setStarting(false);
    }
  };

  const sendFeedback = async () => {
    if (!feedback.trim() || sending) return;
    setSending(true);
    try {
      const res = await localKlimaxApi.submitTrainingFeedback({
        feedback: feedback.trim(),
        jobId: job?.id || null,
        itemId: activeItem?.id || null,
        decisions: activeItem?.decisions || null,
      });
      setTraining({ rules: res.rules, overrides: res.overrides, history: res.history, updatedAt: undefined });
      setFeedback("");
      const added = res.added?.length || 0;
      const removed = res.removed?.length || 0;
      toast({
        title: "L'IA a appris 🧠",
        description: added || removed
          ? `${added} règle(s) ajoutée(s)${removed ? `, ${removed} remplacée(s)` : ""}. Elles s'appliqueront au prochain essai.`
          : "Aucune nouvelle règle — le feedback était peut-être trop vague.",
      });
    } catch (e: any) {
      toast({ title: "Distillation échouée", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const deleteRule = async (id: string) => {
    try {
      const res = await localKlimaxApi.deleteTrainingRule(id);
      setTraining((cur) => (cur ? { ...cur, rules: res.rules, overrides: res.overrides } : cur));
    } catch (e: any) {
      toast({ title: "Suppression échouée", description: String(e?.message || e), variant: "destructive" });
    }
  };

  const d = activeItem?.decisions || {};
  const ruleCount = training?.rules.length || 0;

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="text-white/60 hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold">
                <GraduationCap className="h-6 w-6 text-violet-400" /> Mode entraînement
              </h1>
              <p className="text-sm text-white/45">
                Génère un essai, dis à l'IA ce qui ne va pas — elle apprend et s'améliore toute seule au prochain essai.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="border-violet-500/30 text-violet-300">
            <Brain className="mr-1.5 h-3.5 w-3.5" /> {ruleCount} règle{ruleCount > 1 ? "s" : ""} apprise{ruleCount > 1 ? "s" : ""}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* LEFT: trial + variants + feedback */}
          <div className="space-y-6">
            {/* 1. Pick a pair + launch */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
                <Sparkles className="h-4 w-4 text-violet-400" /> 1. Lance un essai
              </h2>
              <div className="flex flex-wrap gap-2">
                {selectable.length === 0 && (
                  <p className="text-[13px] text-white/40">
                    Aucune paire vidéo complète dans la banque. Importe une vidéo 1 + vidéo 2 d'abord.
                  </p>
                )}
                {selectable.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGroupId(g.id)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left text-[12px] transition",
                      selectedGroupId === g.id
                        ? "border-violet-500/60 bg-violet-500/10 text-white"
                        : "border-white/10 bg-white/[0.02] text-white/60 hover:border-white/25",
                    )}
                  >
                    <span className="block max-w-[180px] truncate font-medium">{g.title}</span>
                    <span className="block max-w-[180px] truncate text-[10px] text-white/40">
                      {g.person1?.title} + {g.person2?.title}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <label className="text-[12px] text-white/50">Variantes :</label>
                <input
                  type="number" min={1} max={6} value={variants}
                  onChange={(e) => setVariants(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
                  className="w-16 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-sm"
                />
                <Button onClick={runTrial} disabled={!selectedGroupId || starting} className="ml-auto bg-violet-600 hover:bg-violet-500">
                  {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  Générer l'essai
                </Button>
              </div>
            </section>

            {/* 2. Variants + decisions */}
            {job && (
              <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-white/80">
                  <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> 2. Résultats</span>
                  <span className="text-[11px] font-normal text-white/40">{job.done}/{job.total} rendus</span>
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {job.items.map((it) => (
                    <button
                      key={it.id}
                      onClick={() => it.status === "ready" && setActiveItem(it)}
                      className={cn(
                        "group relative overflow-hidden rounded-xl border bg-black/40 text-left transition",
                        activeItem?.id === it.id ? "border-violet-500/70" : "border-white/10 hover:border-white/25",
                      )}
                    >
                      <div className="flex aspect-[9/16] items-center justify-center">
                        {it.status === "ready" && it.url ? (
                          <video src={it.url} className="h-full w-full object-cover" muted playsInline
                            onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
                            onMouseLeave={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; }} />
                        ) : it.status === "failed" ? (
                          <span className="px-2 text-center text-[10px] text-red-400">{it.error || "échec"}</span>
                        ) : (
                          <Loader2 className="h-5 w-5 animate-spin text-white/40" />
                        )}
                      </div>
                      <div className="px-2 py-1.5 text-[10px] text-white/50">{it.combo}</div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* 3. Feedback */}
            {activeItem && (
              <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
                  <Send className="h-4 w-4 text-violet-400" /> 3. Dis ce qui ne va pas
                </h2>
                <div className="mb-3 rounded-xl border border-white/10 bg-black/30 p-3">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-white/35">Ce que l'IA a décidé sur cette variante</p>
                  <DecisionRow label="Hook" value={d.hookText} />
                  <DecisionRow label="Split-screen" value={d.splitScreen ? `oui (${Math.round((d.splitRatio || 0) * 100)}%)` : "non"} />
                  <DecisionRow label="Sous-titres" value={d.subtitlePreset && `${d.subtitlePreset} · ${d.subtitleSize}px`} />
                  <DecisionRow label="Filtre" value={d.videoFilter} />
                  <DecisionRow label="B-roll" value={d.brollStyle} />
                  <DecisionRow label="Musique" value={d.musicId ? `${d.musicVolumeDb} dB` : "aucune"} />
                  <DecisionRow label="Zoom" value={d.zoomMode ? `${d.zoomMode} · ${d.zoomBoostPercent}%` : null} />
                </div>
                <Textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Ex : le hook est trop vague, on ne comprend pas le sujet. La musique est trop forte. Les zooms sont trop violents."
                  className="min-h-[90px] resize-none border-white/10 bg-black/30 text-[13px]"
                />
                <div className="mt-3 flex justify-end">
                  <Button onClick={sendFeedback} disabled={!feedback.trim() || sending} className="bg-violet-600 hover:bg-violet-500">
                    {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
                    Apprendre de ce feedback
                  </Button>
                </div>
              </section>
            )}
          </div>

          {/* RIGHT: learned memory */}
          <aside className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white/80">
                  <Brain className="h-4 w-4 text-violet-400" /> Mémoire de l'IA
                </h2>
                <button onClick={refreshRules} className="text-white/30 hover:text-white/70" title="Rafraîchir">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>

              {ruleCount === 0 ? (
                <p className="text-[12px] text-white/40">
                  Aucune règle pour l'instant. Donne du feedback sur un essai et l'IA accumulera ici ce qu'elle apprend — appliqué automatiquement au mode automatique.
                </p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(rulesByCategory).map(([cat, rules]) => (
                    <div key={cat}>
                      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-white/35">
                        {CATEGORY_LABELS[cat] || cat}
                      </p>
                      <div className="space-y-1.5">
                        {rules.map((r) => <RuleChip key={r.id} rule={r} onDelete={deleteRule} />)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!!(training?.history?.length) && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <h2 className="mb-3 text-sm font-semibold text-white/80">Historique des retours</h2>
                <div className="space-y-2">
                  {training!.history.slice(0, 6).map((h) => (
                    <div key={h.id} className="rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-[11px] text-white/50">
                      <span className="line-clamp-2">{h.feedback}</span>
                      <span className="mt-1 block text-[10px] text-white/30">
                        +{h.addedRuleIds.length} règle(s){h.removedRuleIds.length ? `, -${h.removedRuleIds.length}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};

export default TrainingMode;
