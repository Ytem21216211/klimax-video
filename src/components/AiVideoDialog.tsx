import * as React from "react";
const { useEffect, useRef, useState } = React;
import { useNavigate } from "react-router-dom";
import { Wand2, Loader2, Sparkles, Upload, Download, CheckCircle2, RotateCcw, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { localKlimaxApi, type StudioProject, type LocalAutoJob } from "@/lib/localKlimaxApi";

// Mode vidéo AI — describe a video, bind it to a studio project / a pair / fresh rushes,
// pick how many, then WATCH the renders appear and DOWNLOAD them right here (no need to
// leave for the automatic mode).
const AiVideoDialog = ({ open, onOpenChange, defaultProjectId }: { open: boolean; onOpenChange: (v: boolean) => void; defaultProjectId?: string }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [studioProjects, setStudioProjects] = useState<StudioProject[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [videoType, setVideoType] = useState<"podcast" | "rush" | "multi">("podcast");
  const [prompt, setPrompt] = useState("");
  const [vgId, setVgId] = useState("");
  const [count, setCount] = useState(6);
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [rushFile, setRushFile] = useState<File | null>(null);
  const [multiFiles, setMultiFiles] = useState<File[]>([]);
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  // results phase
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<LocalAutoJob | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) return;
    setProjectId(defaultProjectId || "");
    localKlimaxApi.listStudioProjects().then(({ projects }) => setStudioProjects(projects || [])).catch(() => {});
    localKlimaxApi.listAssets().then(({ videoGroups }) => setAllGroups(videoGroups || [])).catch(() => {});
  }, [open, defaultProjectId]);

  // Poll the launched job until every variant is rendered (and Drive done).
  useEffect(() => {
    if (!jobId || !open) return;
    let alive = true;
    const tick = async () => {
      try {
        const { job: j } = await localKlimaxApi.getAutoJob(jobId);
        if (!alive) return;
        setJob(j);
        const running = !j.finishedAt || (j.done ?? 0) < (j.total ?? 0) || j.drive?.status === "uploading";
        if (!running && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      } catch { /* keep polling */ }
    };
    tick();
    pollRef.current = setInterval(tick, 2500);
    return () => { alive = false; if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [jobId, open]);

  const podcastGroups = allGroups.filter((g: any) => g.person1?.filePath && g.person2?.filePath);
  const rushGroups = allGroups.filter((g: any) => g.person1?.filePath && !g.person2?.filePath);
  const videoGroups = videoType === "rush" ? rushGroups : podcastGroups;
  const fmtMB = (f: File | null) => (f ? `${(f.size / 1048576).toFixed(0)} Mo` : "");

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
      setDownloading((cur) => { const n = new Set(cur); n.delete(key); return n; });
    }
  };

  const resetToForm = () => { setJobId(null); setJob(null); setSummary(""); setPrompt(""); setFile1(null); setFile2(null); setRushFile(null); setMultiFiles([]); };

  const submit = async () => {
    if (!prompt.trim()) { toast({ title: "Décris la vidéo que tu veux", variant: "destructive" }); return; }
    const hasPair = file1 && file2;
    const hasRush = !!rushFile;
    const hasMulti = videoType === "multi" && multiFiles.length >= 2;
    if (!projectId && !vgId && !hasPair && !hasRush && !hasMulti) { toast({ title: "Choisis un projet, une source, ou envoie des vidéos", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      let videoGroupIds: string[] | undefined;
      let projectIds: string[] | undefined;
      if (!projectId && videoType === "multi" && hasMulti) {
        setStatus("Envoi des rushs + montage P1/P2…");
        const up = await localKlimaxApi.uploadMultirushProject(multiFiles, prompt.slice(0, 60) || "Multi-rush");
        if (!up.projectId) throw new Error("Montage multi-rush échoué.");
        projectIds = [up.projectId];
      } else if (!projectId && vgId) {
        videoGroupIds = [vgId];
      } else if (!projectId && videoType === "rush" && hasRush) {
        setStatus("Envoi du rush…");
        const up = await localKlimaxApi.uploadSingleRush(rushFile!, prompt.slice(0, 80));
        const newId = up.added?.[0]?.groupId || up.videoGroups[0]?.id;
        if (!newId) throw new Error("Upload effectué mais source introuvable.");
        videoGroupIds = [newId];
      } else if (!projectId && videoType === "podcast" && hasPair) {
        setStatus("Envoi des vidéos…");
        const up = await localKlimaxApi.uploadVideoPair(file1!, file2!, prompt.slice(0, 80));
        const newId = up.added?.[0]?.groupId
          || up.videoGroups.find((g) => g.person1?.fileName === file1!.name || g.person2?.fileName === file2!.name)?.id
          || up.videoGroups[up.videoGroups.length - 1]?.id;
        if (!newId) throw new Error("Upload effectué mais paire introuvable.");
        videoGroupIds = [newId];
      }
      setStatus("L'IA prépare le lot (transcription + réglages)…");
      const res = await localKlimaxApi.aiVideoRequest({ prompt, studioProjectId: projectId || null, videoGroupIds, projectIds, variantsPerVideo: count });
      setSummary(res.summary || "");
      setJobId(res.jobId); // -> switches to the results view; polling shows the videos
      toast({ title: "Génération lancée 🚀", description: `${res.total} vidéo(s) en cours…` });
    } catch (e: any) {
      toast({ title: "Échec", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setSubmitting(false);
      setStatus("");
    }
  };

  const items = job?.items || [];
  const readyCount = items.filter((i) => i.status === "ready").length;
  const total = job?.total ?? items.length;
  const allDone = !!job?.finishedAt && (job?.done ?? 0) >= total && job?.drive?.status !== "uploading";
  const itemName = (it: any) => `${String(it.source || "variante").replace(/[^\w\- ]+/g, "").trim() || "variante"} - v${(it.index ?? 0) + 1}.mp4`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("bg-black border border-white/10 text-white rounded-[32px]", jobId ? "max-w-3xl" : "max-w-xl")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl font-black uppercase tracking-tight"><Wand2 className="h-5 w-5" /> Mode vidéo AI</DialogTitle>
          <DialogDescription className="text-white/45">
            {jobId ? "Tes vidéos se génèrent — regarde-les et télécharge-les ici dès qu'elles sont prêtes." : "Décris ce que tu veux. L'IA règle le lot (variantes, hooks, sous-titres, cadrage…) et lance la génération."}
          </DialogDescription>
        </DialogHeader>

        {!jobId ? (
          // ---------- FORM ----------
          <div className="grid gap-4">
            <div>
              <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-white/45">Sur quel projet ?</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 font-black text-white outline-none focus:border-white/30">
                <option value="" className="bg-neutral-900">— Sans projet (rushs directs) —</option>
                {studioProjects.map((p) => <option key={p.id} value={p.id} className="bg-neutral-900">{p.name}</option>)}
              </select>
            </div>
            {!projectId ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-white/45">Type de vidéo</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([["podcast", "Podcast", "2 personnes"], ["rush", "Rush simple", "1 vidéo"], ["multi", "Multi-rush", "P1/P2/P1/P2…"]] as const).map(([key, label, hint]) => (
                      <button key={key} type="button" onClick={() => { setVideoType(key); setVgId(""); }}
                        className={`rounded-xl border px-2.5 py-2.5 text-left transition ${videoType === key ? "border-white/40 bg-white/[0.09]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}>
                        <div className="text-[13px] font-black">{label}</div>
                        <div className="text-[9px] uppercase tracking-wide text-white/40">{hint}</div>
                      </button>
                    ))}
                  </div>
                </div>
                {videoType !== "multi" ? (
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-white/45">{videoType === "rush" ? "Rush existant" : "Paire vidéo existante"}</label>
                    <select value={vgId} onChange={(e) => { setVgId(e.target.value); if (e.target.value) { setFile1(null); setFile2(null); setRushFile(null); } }} className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 font-black text-white outline-none focus:border-white/30">
                      <option value="" className="bg-neutral-900">{videoType === "rush" ? "— Choisir un rush —" : "— Choisir une paire —"}</option>
                      {videoGroups.map((g) => <option key={g.id} value={g.id} className="bg-neutral-900">{g.title}</option>)}
                    </select>
                  </div>
                ) : null}
                {!vgId && videoType === "podcast" ? (
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-white/45">…ou envoie 2 rushs (personne 1 + personne 2)</label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-2 py-3 text-center text-[11px] font-bold text-white/55 hover:bg-white/[0.06]">
                        <Upload className="h-4 w-4" />
                        {file1 ? <span className="truncate text-white/80">{file1.name} · {fmtMB(file1)}</span> : "Personne 1"}
                        <input type="file" accept="video/*" className="hidden" onChange={(e) => setFile1(e.target.files?.[0] || null)} />
                      </label>
                      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-2 py-3 text-center text-[11px] font-bold text-white/55 hover:bg-white/[0.06]">
                        <Upload className="h-4 w-4" />
                        {file2 ? <span className="truncate text-white/80">{file2.name} · {fmtMB(file2)}</span> : "Personne 2"}
                        <input type="file" accept="video/*" className="hidden" onChange={(e) => setFile2(e.target.files?.[0] || null)} />
                      </label>
                    </div>
                    <p className="mt-1 text-[10px] text-white/35">Pas de limite de taille stricte.</p>
                  </div>
                ) : null}
                {!vgId && videoType === "rush" ? (
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-white/45">…ou envoie 1 vidéo (rush)</label>
                    <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-2 py-4 text-center text-[11px] font-bold text-white/55 hover:bg-white/[0.06]">
                      <Upload className="h-4 w-4" />
                      {rushFile ? <span className="truncate text-white/80">{rushFile.name} · {fmtMB(rushFile)}</span> : "Choisir une vidéo"}
                      <input type="file" accept="video/*" className="hidden" onChange={(e) => setRushFile(e.target.files?.[0] || null)} />
                    </label>
                    <p className="mt-1 text-[10px] text-white/35">Pas de limite de taille stricte. Une seule vidéo = short solo (cadrage, sous-titres, zooms variés).</p>
                  </div>
                ) : null}
                {videoType === "multi" ? (
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-white/45">Rushs dans l'ordre (P1, P2, P1, P2…)</label>
                    <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-2 py-4 text-center text-[11px] font-bold text-white/55 hover:bg-white/[0.06]">
                      <Upload className="h-4 w-4" />
                      {multiFiles.length ? `${multiFiles.length} rush(s) sélectionnés` : "Choisir les vidéos (2 ou +)"}
                      <input type="file" accept="video/*" multiple className="hidden" onChange={(e) => setMultiFiles(Array.from(e.target.files || []))} />
                    </label>
                    {multiFiles.length ? (
                      <ol className="mt-2 space-y-1">
                        {multiFiles.map((f, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2 py-1 text-[10px] text-white/60">
                            <span className="truncate"><b className="text-white/80">{i === 0 ? "P1·intro" : i === 1 ? "P2·reply" : `clip ${i + 1}`}</b> — {f.name}</span>
                            <span className="shrink-0 text-white/30">{fmtMB(f)}</span>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                    <p className="mt-1 text-[10px] text-white/35">1er = hook (P1), 2e = réponse (P2), les suivants alternent (DA partagée, zoom par personne, shutter entre clips). Nomme les rushs de droite « vasko… ».</p>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div>
              <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.18em] text-white/45">Ta demande</label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="Ex : très punchy, sous-titres TikTok, beaucoup de split-screen, zooms légers" className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white/90 outline-none focus:border-white/30" />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45">Nombre de vidéos</span>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setCount((v) => Math.max(1, v - 1))} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.03] font-black text-white/70 hover:bg-white hover:text-black">−</button>
                <span className="w-6 text-center text-lg font-black">{count}</span>
                <button type="button" onClick={() => setCount((v) => Math.min(20, v + 1))} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.03] font-black text-white/70 hover:bg-white hover:text-black">+</button>
              </div>
            </div>
            <button onClick={submit} disabled={submitting} className="flex items-center justify-center gap-2 rounded-full bg-white px-4 py-3 font-black uppercase tracking-[0.14em] text-black transition hover:bg-white/90 disabled:opacity-40">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {submitting ? (status || "L'IA prépare le lot…") : "Générer la vidéo"}
            </button>
          </div>
        ) : (
          // ---------- RESULTS ----------
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-black">
                {allDone ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <Loader2 className="h-5 w-5 animate-spin text-white/70" />}
                <span>{readyCount}/{total} vidéo{total > 1 ? "s" : ""} prête{readyCount > 1 ? "s" : ""}</span>
              </div>
              {job?.drive?.status === "done" && job.drive.link ? (
                <a href={job.drive.link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-emerald-300 hover:underline">Drive <ExternalLink className="h-3 w-3" /></a>
              ) : job?.drive?.status === "uploading" ? (
                <span className="text-[11px] font-bold text-white/40">Upload Drive…</span>
              ) : null}
            </div>
            {summary ? <p className="-mt-1 px-1 text-[11px] text-white/45">{summary}</p> : null}

            <div className="grid max-h-[58vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
              {items.length === 0 ? <div className="col-span-full grid place-items-center py-8 text-white/40"><Loader2 className="h-5 w-5 animate-spin" /></div> : null}
              {items.map((it) => (
                <div key={it.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                  <div className="relative aspect-[9/16] bg-black">
                    {it.status === "ready" && it.url ? (
                      <video src={it.url} className="absolute inset-0 h-full w-full object-contain" controls muted playsInline preload="metadata" />
                    ) : it.status === "failed" ? (
                      <div className="grid h-full place-items-center p-2 text-center text-[10px] font-bold text-red-300">Échec</div>
                    ) : (
                      <div className="grid h-full place-items-center gap-1 text-white/40">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-[9px] uppercase tracking-wide">{it.status === "rendering" ? "rendu…" : "en file"}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => it.status === "ready" && it.url && downloadFile(it.url, itemName(it), it.id)}
                    disabled={!(it.status === "ready" && it.url) || downloading.has(it.id)}
                    className={cn("flex w-full items-center justify-center gap-1.5 py-2 text-[11px] font-black uppercase tracking-wide transition",
                      it.status === "ready" && it.url ? "bg-white text-black hover:bg-white/90 disabled:opacity-60" : "pointer-events-none text-white/40")}
                  >
                    {downloading.has(it.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} v{(it.index ?? 0) + 1}
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={() => downloadFile(localKlimaxApi.autoJobDownloadUrl(jobId), `klimax-${jobId}.zip`, "zip")} disabled={readyCount === 0 || downloading.has("zip")}
                className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-black transition hover:bg-white/90 disabled:opacity-40">
                {downloading.has("zip") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Tout télécharger
              </button>
              <button onClick={resetToForm} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white/70 transition hover:bg-white hover:text-black">
                <RotateCcw className="h-4 w-4" /> Nouvelle demande
              </button>
              <button onClick={() => { onOpenChange(false); navigate("/automatic-mode"); }} className="ml-auto flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white/70 transition hover:bg-white hover:text-black">
                Mode automatique <ExternalLink className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AiVideoDialog;
