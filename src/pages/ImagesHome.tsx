import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { localKlimaxApi, type LocalCarouselJob } from "@/lib/localKlimaxApi";
import { settingsApi, type SettingsView } from "@/lib/settingsApi";

const card = "rounded-3xl border border-white/10 bg-white/[0.03] p-6";
const label = "text-xs font-black uppercase tracking-[0.18em] text-white/45";
const btn = "rounded-full border border-white/10 bg-white/[0.05] px-5 py-2.5 text-sm font-black uppercase tracking-[0.14em] text-white/80 hover:bg-white hover:text-black transition disabled:opacity-40";
const input = "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-white/30";

export default function ImagesHome() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [keyMsg, setKeyMsg] = useState<string>("");
  const [savingKey, setSavingKey] = useState(false);

  const [topicSource, setTopicSource] = useState<"auto" | "manual">("auto");
  const [manualPrompt, setManualPrompt] = useState("");
  const [slideMin, setSlideMin] = useState(2);
  const [slideMax, setSlideMax] = useState(4);
  const [count, setCount] = useState(3);
  const [background, setBackground] = useState<"random" | "anatomy" | "person_bed" | "person_city">("random");

  const [job, setJob] = useState<LocalCarouselJob | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState("");
  const pollRef = useRef<number | null>(null);

  useEffect(() => { settingsApi.get().then(setSettings).catch(() => {}); }, []);

  // Poll the running job.
  useEffect(() => {
    if (!jobId) return;
    const tick = async () => {
      try {
        const { job: j } = await localKlimaxApi.getCarouselJob(jobId);
        setJob(j);
        if (j.done >= j.total && pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      } catch { /* keep polling */ }
    };
    tick();
    pollRef.current = window.setInterval(tick, 2500);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); pollRef.current = null; };
  }, [jobId]);

  const hasKey = settings?.imageGen?.hasKey;

  const saveKey = async () => {
    if (!keyInput.trim()) return;
    setSavingKey(true); setKeyMsg("");
    try {
      await settingsApi.update({ imageGen: { apiKey: keyInput.trim() } });
      setKeyInput("");
      const test = await settingsApi.testImageGen();
      setSettings(await settingsApi.get());
      setKeyMsg(test.ok ? `✓ Clé OK (${test.model})` : `⚠ ${test.error || "test échoué"}`);
    } catch (e) { setKeyMsg(`⚠ ${String((e as Error).message).slice(0, 120)}`); }
    finally { setSavingKey(false); }
  };

  const generate = async () => {
    setErr(""); setStarting(true); setJob(null);
    try {
      const { jobId: id } = await localKlimaxApi.generateCarousels({
        topicSource,
        manualPrompt: topicSource === "manual" ? manualPrompt : undefined,
        slideCountMin: slideMin,
        slideCountMax: Math.max(slideMin, slideMax),
        carouselsPerBatch: count,
        style: { background },
      });
      setJobId(id);
    } catch (e) { setErr(String((e as Error).message).slice(0, 200)); }
    finally { setStarting(false); }
  };

  const running = job && job.done < job.total;
  const readyItems = useMemo(() => (job?.items || []).filter((it) => it.status === "ready"), [job]);

  return (
    <div className="min-h-screen bg-[#08070d] text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <button onClick={() => navigate("/projets")} className="text-xs font-black uppercase tracking-[0.18em] text-white/40 hover:text-white">← Accueil</button>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Mode Image · Carrousels</h1>
            <p className="mt-1 text-sm text-white/50">Posts photo IG/TikTok sur les exercices — fond IA + schéma + slide Klimax.</p>
          </div>
        </div>

        {/* API key */}
        {!hasKey && (
          <div className={`${card} mb-6 border-amber-400/20 bg-amber-400/[0.04]`}>
            <p className={label}>Clé API génération d'image (Google AI Studio / Gemini)</p>
            <p className="mb-3 mt-1 text-sm text-white/60">Nécessaire pour générer les visuels. Colle ta clé une fois — elle est stockée localement.</p>
            <div className="flex gap-2">
              <input className={input} type="password" placeholder="AIza…" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
              <button className={btn} onClick={saveKey} disabled={savingKey || !keyInput.trim()}>{savingKey ? "…" : "Enregistrer"}</button>
            </div>
            {keyMsg && <p className="mt-2 text-xs font-bold text-white/70">{keyMsg}</p>}
          </div>
        )}
        {hasKey && (
          <p className="mb-6 text-xs font-bold text-emerald-300/80">✓ Clé image configurée ({settings?.imageGen?.model}). <button className="underline opacity-60 hover:opacity-100" onClick={() => setSettings((s) => s ? { ...s, imageGen: { ...s.imageGen, hasKey: false } } : s)}>changer</button></p>
        )}

        {/* Generate form */}
        <div className={`${card} mb-6`}>
          <div className="mb-4 flex gap-2">
            <button className={`${btn} ${topicSource === "auto" ? "bg-white text-black" : ""}`} onClick={() => setTopicSource("auto")}>Sujets auto (vos vidéos)</button>
            <button className={`${btn} ${topicSource === "manual" ? "bg-white text-black" : ""}`} onClick={() => setTopicSource("manual")}>Sujet manuel</button>
          </div>
          {topicSource === "manual" && (
            <textarea className={`${input} mb-4 h-20`} placeholder="ex: exercices de kegel pour débutants" value={manualPrompt} onChange={(e) => setManualPrompt(e.target.value)} />
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className={label}>Carrousels</p>
              <input className={`${input} mt-1`} type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} />
            </div>
            <div>
              <p className={label}>Slides min</p>
              <input className={`${input} mt-1`} type="number" min={2} max={5} value={slideMin} onChange={(e) => setSlideMin(Number(e.target.value) || 2)} />
            </div>
            <div>
              <p className={label}>Slides max</p>
              <input className={`${input} mt-1`} type="number" min={2} max={5} value={slideMax} onChange={(e) => setSlideMax(Number(e.target.value) || 4)} />
            </div>
            <div>
              <p className={label}>Fond</p>
              <select className={`${input} mt-1`} value={background} onChange={(e) => setBackground(e.target.value as typeof background)}>
                <option value="random">Aléatoire</option>
                <option value="anatomy">Schéma anatomie</option>
                <option value="person_bed">Personne · lit</option>
                <option value="person_city">Personne · ville</option>
              </select>
            </div>
          </div>
          <p className="mt-3 text-xs text-white/40">= {count} carrousel{count > 1 ? "s" : ""} · {slideMin}-{slideMax} slides + 1 slide Klimax chacun. Dernière slide = logo Klimax CTA.</p>
          <div className="mt-4 flex items-center gap-3">
            <button className={`${btn} !bg-white !text-black`} onClick={generate} disabled={starting || (topicSource === "manual" && !manualPrompt.trim())}>{starting ? "Lancement…" : "Générer"}</button>
            {err && <span className="text-xs font-bold text-rose-400">{err}</span>}
          </div>
        </div>

        {/* Progress + results */}
        {job && (
          <div className={card}>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-black">{job.done}/{job.total} carrousel{job.total > 1 ? "s" : ""}{running ? " · génération…" : " · terminé"}</p>
              {readyItems.length > 0 && (
                <a className={btn} href={localKlimaxApi.carouselJobDownloadUrl(job.id)}>Tout télécharger (zip)</a>
              )}
            </div>
            <div className="space-y-6">
              {job.items.map((it) => (
                <div key={it.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-black">{it.topicLabel} <span className="text-white/40">· {it.status}</span></p>
                    {it.driveLink && <a className="text-xs font-bold text-sky-300 underline" href={it.driveLink} target="_blank" rel="noreferrer">Drive ↗</a>}
                  </div>
                  {it.status === "failed" && <p className="text-xs font-bold text-rose-400">{it.error}</p>}
                  {it.outputs && it.outputs.length > 0 && (
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {it.outputs.map((s, i) => (
                        <a key={i} href={s.url} target="_blank" rel="noreferrer" className="shrink-0">
                          <img src={s.url} alt={s.role} className="h-64 w-auto rounded-xl border border-white/10" />
                        </a>
                      ))}
                    </div>
                  )}
                  {it.status === "rendering" && (!it.outputs || it.outputs.length === 0) && <p className="text-xs text-white/40">Génération des visuels…</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
