import * as React from "react";
const { useEffect, useState } = React;
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Wand2, FolderCog, Play, Settings2, Library, Sparkles, LogOut, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { localKlimaxApi, type StudioProject } from "@/lib/localKlimaxApi";
import AiVideoDialog from "@/components/AiVideoDialog";

const ProjectsHome = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [hub, setHub] = useState<StudioProject | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { if (!session) navigate("/auth"); });
    localKlimaxApi.listStudioProjects().then(({ projects }) => setProjects(projects || [])).catch(() => {}).finally(() => setLoading(false));
  }, [navigate]);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ambient glow */}
      <div className="pointer-events-none fixed left-1/2 top-1/3 -z-0 h-[60vh] w-[80vw] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.06)_0%,transparent_70%)] blur-[140px]" />

      <header className="relative z-10 flex h-16 items-center justify-between border-b border-white/10 bg-black/70 px-6 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 overflow-hidden rounded-full bg-white"><img src="/klimax-logo.jpeg" alt="Klimax" className="h-full w-full object-cover" /></div>
          <span className="text-lg font-black uppercase tracking-tight">Klimax · Accueil</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("/asset-bank")} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/70 transition hover:bg-white hover:text-black"><Library className="h-4 w-4" /> Banque</button>
          <button onClick={() => supabase.auth.signOut().then(() => navigate("/auth"))} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-white/60 hover:bg-white hover:text-black"><LogOut className="h-4 w-4" /></button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        {/* AI video — hero */}
        <button onClick={() => setAiOpen(true)} className="group mb-10 flex w-full items-center justify-between gap-6 overflow-hidden rounded-[28px] border border-white/15 bg-gradient-to-r from-[#e324ff]/15 via-[#b638fc]/10 to-[#3b38fc]/15 p-6 text-left transition hover:border-white/30">
          <div className="flex items-center gap-5">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-black"><Wand2 className="h-7 w-7" /></div>
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tight">Mode vidéo AI</h2>
              <p className="mt-1 max-w-xl text-sm text-white/55">Crée des vidéos avec l'IA — à partir de nouveaux rushs ou reliées à un projet. Décris ce que tu veux, l'IA règle tout.</p>
            </div>
          </div>
          <Sparkles className="h-6 w-6 text-white/40 transition group-hover:text-white" />
        </button>

        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white/55">Mes projets</h3>
          <span className="text-xs text-white/35">{projects.length} projet{projects.length > 1 ? "s" : ""}</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* create new */}
          <button onClick={() => navigate("/studio?new=1")} className="group flex min-h-[150px] flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-white/15 bg-white/[0.02] p-6 text-center transition hover:border-white/40 hover:bg-white/[0.05]">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-white text-black transition group-hover:scale-110"><Plus className="h-6 w-6" /></div>
            <span className="text-sm font-black uppercase tracking-wide">Créer un nouveau projet</span>
          </button>

          {loading ? (
            <div className="col-span-full grid place-items-center py-10 text-white/40"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            projects.map((p) => (
              <button key={p.id} onClick={() => setHub(p)} className="flex min-h-[150px] flex-col justify-between rounded-[24px] border border-white/10 bg-white/[0.03] p-6 text-left transition hover:border-white/30 hover:bg-white/[0.07]">
                <div>
                  <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/5"><FolderCog className="h-5 w-5" /></div>
                  <h4 className="truncate text-lg font-black">{p.name}</h4>
                  {p.description ? <p className="mt-1 line-clamp-2 text-xs text-white/45">{p.description}</p> : null}
                </div>
                <p className="mt-3 text-[10px] font-black uppercase tracking-wide text-white/35">{p.videoGroupIds.length} paire(s) · {p.variantsPerVideo} variantes</p>
              </button>
            ))
          )}
        </div>
      </main>

      <AiVideoDialog open={aiOpen} onOpenChange={setAiOpen} />

      {/* PROJECT HUB — Paramètre vs Commencer */}
      <Dialog open={!!hub} onOpenChange={(v) => !v && setHub(null)}>
        <DialogContent className="max-w-lg bg-black border border-white/10 text-white rounded-[32px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">{hub?.name}</DialogTitle>
            <DialogDescription className="text-white/45">{hub?.description || "Configure le projet, ou commence à travailler."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <button onClick={() => { if (hub) navigate(`/studio?id=${hub.id}`); }} className="flex flex-col items-center justify-center gap-3 rounded-[24px] border border-white/15 bg-white/[0.04] p-8 text-center transition hover:bg-white/[0.09]">
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/5"><Settings2 className="h-7 w-7" /></div>
              <span className="text-base font-black uppercase tracking-wide">Paramètre</span>
              <span className="text-[11px] text-white/45">Tous les réglages aléatoires, pools & presets</span>
            </button>
            <button onClick={() => navigate("/dashboard")} className="flex flex-col items-center justify-center gap-3 rounded-[24px] border border-white/15 bg-white p-8 text-center text-black transition hover:bg-white/90">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-black text-white"><Play className="h-7 w-7 fill-current" /></div>
              <span className="text-base font-black uppercase tracking-wide">Commencer</span>
              <span className="text-[11px] text-black/55">Ouvre l'espace de travail (montage, auto…)</span>
            </button>
          </div>
          <button onClick={() => { setHub(null); setAiOpen(true); }} className={cn("mt-1 flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white/70 transition hover:bg-white hover:text-black")}>
            <Wand2 className="h-4 w-4" /> Générer avec l'IA sur ce projet
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectsHome;
