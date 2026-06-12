import * as React from "react";
const { useEffect, useState } = React;
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import {
  Plus, Video, LogOut, Upload, ScrollText,
  BarChart3, Brain, Eye, Zap, ArrowRight, Library,
  ArrowDown, LayoutGrid, Settings,
  MessageSquare, Sparkles, ChevronRight, AudioLines, Clock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDevAssistantContext } from "@/components/devAssistant";
import { InvitationBanner } from "@/components/InvitationBanner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KLIMAX_LEGACY_TITLE_RE } from "@/lib/klimax";
import { localKlimaxApi, type LocalKlimaxProject } from "@/lib/localKlimaxApi";
import {
  getKlimaxVideoGroups,
  loadKlimaxBankAssets,
  saveKlimaxBankAssets,
  type KlimaxBankAsset,
  type KlimaxVideoGroup,
} from "@/lib/klimaxStorage";

const PROJECT_VAULT_RESET_KEY = "klimax:project-vault-cleared:v1";

type ChatIntentContext = {
  projectCount: number;
  mostRecentProjectTitle?: string;
  onCreateProject: () => void;
};

const CHAT_HELP_LINES = [
  "• « nouveau projet » — j'ouvre le formulaire de création",
  "• « ouvre mon dernier projet » — je t'emmène dans l'éditeur",
  "• « comment ajouter un b-roll » — banque d'assets → onglet B-rolls IA",
  "• « preset » — panneau Préréglages dans l'éditeur (icône dossier à droite)",
  "• « sfx / son / transition » — onglet SFX de la banque ou panneau SFX de l'éditeur",
  "• « exporte mon projet » — bouton Exporter dans l'éditeur",
  "• « sous-titres » — panneau Sous-titres dans l'éditeur",
];

const matchChatIntent = (raw: string, ctx: ChatIntentContext): string => {
  const prompt = raw.trim();
  if (!prompt) {
    return "Pose-moi une question ou demande-moi de créer un projet.";
  }

  // 1. Create / new project intents
  if (/\b(nouveau|nouvelle|nouvau|nvelle|nvel|cree|creer|creerun|creerunprojet|new|make|start|commence|commencer|lance|lancer|fait|fais)\b.*\b(projet|video|clip|reel|tiktok|shorts?|vlog|montage)\b/.test(prompt)
      || /\b(projet|video|clip|reel|tiktok|shorts?|vlog|montage)\b.*\b(nouveau|nouvelle|nvelle|nvel|cree|creer|new|start|make|commence|lancer)\b/.test(prompt)
      || /\b(nouveau projet|nouvelle video|nouvelle video|nouveau clip|new project|create project|start a video|start a project|make a video|faire une video|faire un projet)\b/.test(prompt)) {
    ctx.onCreateProject();
    const recent = ctx.mostRecentProjectTitle ? ` Ton dernier projet s'appelle « ${ctx.mostRecentProjectTitle} ».` : "";
    return `J'ouvre le formulaire de création.${recent} Donne un titre et un script, je m'occupe du reste.`;
  }

  // 2. Open the most recent project
  if (/\b(ouvre|ouvrir|open|go|vas|lance|aller|reprendre|continuer)\b.*\b(dernier|recent|reel|precedent|projet|project|video|clip|montage)\b/.test(prompt)
      || /\b(dernier projet|recent project|my project|mon projet|reprendre le montage)\b/.test(prompt)) {
    if (ctx.mostRecentProjectTitle) {
      return `Direction ton dernier projet « ${ctx.mostRecentProjectTitle} » — clique sur la carte "Dernier projet" sur le dashboard, ou dis « liste mes projets » pour voir toute la bibliothèque.`;
    }
    return `Tu n'as pas encore de projet. Dis « nouveau projet » pour en créer un.`;
  }

  // 3. Delete / clear intent (warn, never execute silently)
  if (/\b(supprime|supprimer|efface|effacer|delete|remove|reset|clear|wipe|nettoie|vider)\b/.test(prompt)) {
    return `Je ne supprime rien automatiquement. Dis-moi quel projet supprimer, ou utilise le menu ⋮ sur la carte du projet. Pour vider la banque d'assets, va dans Paramètres → Banque.`;
  }

  // 4. SFX / sound / transition
  if (/\b(sfx|son|sound|audio|effet|effect|transition|flash|whoosh|film roll|boom|pop|ding)\b/.test(prompt)) {
    return `Pour les SFX : onglet "SFX" dans la Banque d'assets, ou panneau "SFX" dans l'éditeur (à droite, sous Préréglages). Tu peux y choisir 1 transition visuelle pour tout le projet et 1 effet audio par clip.`;
  }

  // 5. Presets
  if (/\b(preset|prereg|preconfig|saved|template|modele|model)\b/.test(prompt)) {
    return `Les préréglages se gèrent dans le panneau "Préréglages" de l'éditeur (à droite, en haut). Tu peux sauvegarder les réglages actuels, les appliquer en un clic, et retrouver les presets partagés par la communauté.`;
  }

  // 6. B-roll / b-rolls IA
  if (/\b(b-?roll|broll|stock|footage|video libre|ia|intelligence|gemini|autopick|auto pick)\b/.test(prompt)) {
    return `Pour l'IA b-roll : ouvre un projet dans l'éditeur, puis le panneau "B-rolls IA" à droite. Bouton "Choisir les b-rolls via l'IA" — Gemini analyse ton script et choisit les meilleures vidéos par clip. La clé API Gemini se règle dans Paramètres.`;
  }

  // 7. Subtitles / transcription
  if (/\b(sous-?titre|subtitle|caption|whisper|transcript|transcription|dictation)\b/.test(prompt)) {
    return `Sous-titres & transcription : ouvre un projet, va dans le panneau "Sous-titres" (à droite). Tu peux générer les sous-titres via Whisper (réglages dans Paramètres) ou les écrire à la main.`;
  }

  // 8. Export / render
  if (/\b(export|exporte|render|telecharge|tlcharger|mp4|download)\b/.test(prompt)) {
    return `Bouton "Exporter" en haut à droite de l'éditeur. Le rendu prend quelques secondes et applique toutes tes options (sous-titres, b-rolls, SFX, musique).`;
  }

  // 9. Asset bank / media
  if (/\b(banque|asset|media|musique|music|image|video|logo)\b/.test(prompt)) {
    return `La Banque d'assets est accessible depuis le menu de gauche (catégorie "Banque") ou la carte "Banque" sur le dashboard. 5 onglets : B-rolls / Images / Musique / Vidéos / SFX.`;
  }

  // 10. Help / capabilities
  if (/\b(aide|help|que sais|what can|capacit|comment|how)\b/.test(prompt)) {
    return "Voici ce que je peux faire sans toucher à l'IA :\n" + CHAT_HELP_LINES.join("\n");
  }

  // 11. Project count / list
  if (/\b(combien|how many|liste|list|mes projets|my projects)\b/.test(prompt)) {
    if (ctx.projectCount === 0) return "Tu n'as pas encore de projet. Dis « nouveau projet » pour commencer.";
    if (ctx.projectCount === 1) return `Tu as 1 projet${ctx.mostRecentProjectTitle ? ` (« ${ctx.mostRecentProjectTitle} »)` : ""}.`;
    return `Tu as ${ctx.projectCount} projets${ctx.mostRecentProjectTitle ? `. Le plus récent s'appelle « ${ctx.mostRecentProjectTitle} »` : ""}.`;
  }

  // Fallthrough
  return "Je suis l'assistant local de Klimax (sans IA, j'utilise des mots-clés). Essaie :\n" + CHAT_HELP_LINES.join("\n");
};

const SidebarItem = ({ icon, text, onClick, active }: { icon: any, text: string, onClick: () => void, active?: boolean }) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm font-medium mb-1 group",
      active
        ? "bg-primary/10 text-primary"
        : "text-slate-400 hover:text-white hover:bg-white/5"
    )}
  >
    <div className={cn(
      "transition-all duration-300",
      active ? "text-primary" : "text-slate-500 group-hover:text-white"
    )}>
      {icon}
    </div>
    <span className="truncate">{text}</span>
  </button>
);

const SidebarProject = ({ project, onClick }: { project: any, onClick: () => void }) => {
  const isProcessing = ['processing', 'rendering', 'queued', 'pending'].includes(project.status);
  const progress = project.render_progress || 0;

  return (
    <button
      onClick={onClick}
      className="w-full flex flex-col items-start gap-1 px-4 py-4 rounded-[20px] text-slate-300 hover:text-white hover:bg-white/[0.04] transition-all text-sm font-medium mb-1 group border border-transparent hover:border-white/10 relative overflow-hidden"
    >
      <div className="flex items-center gap-3 w-full">
        <div className="w-9 h-9 rounded-xl bg-white/[0.03] flex items-center justify-center border border-white/[0.05] group-hover:border-[#b638fc]/30 group-hover:bg-[#b638fc]/5 transition-all shrink-0">
          <Video className="w-4 h-4 text-slate-500 group-hover:text-[#b638fc]" />
        </div>
        <div className="flex flex-col items-start flex-1 overflow-hidden">
          <div className="flex items-center justify-between w-full pr-1">
            <span className="truncate w-[80%] text-left font-medium text-white/90 group-hover:text-white transition-colors text-sm">{project.title}</span>
            {isProcessing && (
              <span className="text-[10px] font-black text-[#b638fc] animate-pulse">{Math.round(progress)}%</span>
            )}
          </div>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold opacity-60 mt-0.5">{new Date(project.created_at).toLocaleDateString()}</span>
        </div>
        <div className={cn(
          "w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-700",
          project.status === 'completed' ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]' :
            isProcessing ? 'bg-[#b638fc] animate-pulse shadow-[0_0_12px_rgba(182,56,252,0.6)]' :
              'bg-white/10'
        )} />
      </div>

      {isProcessing && (
        <div className="w-full h-[2px] bg-white/5 mt-3 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#3b38fc] to-[#fca5fc] transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </button>
  );
};

const DashboardShortcutCard = ({
  label,
  description,
  icon,
  onClick,
  disabled,
  subtle,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  subtle?: string | null;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "group relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] p-5 text-left transition-all duration-300",
      "hover:border-white/30 hover:bg-white/[0.08] hover:-translate-y-0.5 hover:shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]",
      "disabled:opacity-50 disabled:pointer-events-none"
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-black transition-transform duration-300 group-hover:scale-110">
        {icon}
      </div>
      <ChevronRight className="h-4 w-4 text-white/25 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-white" />
    </div>
    <h3 className="mt-5 text-lg font-black tracking-tight text-white">{label}</h3>
    <p className="mt-2 text-xs leading-relaxed text-white/50">{description}</p>
    {subtle && <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-white/30">{subtle}</p>}
  </button>
);

const formatRelativeDate = (iso?: string) => {
  if (!iso) return "récemment";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "récemment";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `il y a ${hr} h`;
  const day = Math.round(hr / 24);
  if (day < 30) return `il y a ${day} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
};

const Dashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [projects, setProjects] = useState<LocalKlimaxProject[]>([]);
  const [bankAssets, setBankAssets] = useState<KlimaxBankAsset[]>(() => loadKlimaxBankAssets());
  const [loading, setLoading] = useState(true);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projectCleanupDone, setProjectCleanupDone] = useState(false);

  const mostRecentProject = React.useMemo(() => {
    if (!projects || projects.length === 0) return null;
    return [...projects].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0] || null;
  }, [projects]);
  const [vaultClearDone, setVaultClearDone] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isEnabled: devAssistantEnabled, enable: enableDevAssistant, disable: disableDevAssistant } = useDevAssistantContext();

  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const uploadedVideoGroups = getKlimaxVideoGroups(bankAssets).filter((group) => group.person1 && group.person2);

  const handleSendChat = () => {
    if (!prompt.trim()) return;
    const currentPrompt = prompt;
    const newMessages = [...messages, { role: 'user' as const, content: currentPrompt }];
    setMessages(newMessages);
    setPrompt('');
    setIsTyping(true);

    // Pure keyword/regex intent matcher. No AI call — fast, deterministic, free.
    setTimeout(() => {
      const raw = currentPrompt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const aiResponse = matchChatIntent(raw, {
        projectCount: projects.length,
        mostRecentProjectTitle: mostRecentProject?.title,
        onCreateProject: () => setNewProjectOpen(true),
      });
      setMessages([...newMessages, { role: 'ai' as const, content: aiResponse }]);
      setIsTyping(false);
    }, 350);
  };

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setUser(session.user);
      await fetchProjects();
    };
    checkAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/auth");
      else setUser(session.user);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!user?.id || projectCleanupDone) return;

    const cleanupLegacyProjects = async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,title")
        .eq("user_id", user.id);

      if (error || !data?.length) {
        setProjectCleanupDone(true);
        return;
      }

      const legacyIds = data
        .filter((project) => KLIMAX_LEGACY_TITLE_RE.test(project.title || ""))
        .map((project) => project.id);

      if (legacyIds.length > 0) {
        await supabase.from("projects").delete().in("id", legacyIds);
        setProjects((current) => current.filter((project) => !legacyIds.includes(project.id)));
      }

      setProjectCleanupDone(true);
    };

    cleanupLegacyProjects();
  }, [user?.id, projectCleanupDone]);

  useEffect(() => {
    if (!user?.id || vaultClearDone) return;

    const resetKey = `${PROJECT_VAULT_RESET_KEY}:${user.id}`;
    if (window.localStorage.getItem(resetKey) === "true") {
      setVaultClearDone(true);
      return;
    }

    const clearProjectVault = async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,title")
        .eq("user_id", user.id);

      if (error) {
        setVaultClearDone(true);
        return;
      }

      const legacyIds = (data || [])
        .filter((project) => KLIMAX_LEGACY_TITLE_RE.test(project.title || ""))
        .map((project) => project.id);

      if (legacyIds.length > 0) {
        await supabase.from("projects").delete().in("id", legacyIds);
        setProjects((current) => current.filter((project) => !legacyIds.includes(project.id)));
      }

      window.localStorage.setItem(resetKey, "true");
      setVaultClearDone(true);
    };

    clearProjectVault();
  }, [user?.id, vaultClearDone]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`projects-dashboard`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, (payload) => {
        const next = payload.new as any;
        const prev = payload.old as any;
        setProjects((current) => {
          if (payload.eventType === "DELETE") return current.filter((p) => p.id !== prev?.id);
          if (next?.user_id !== user.id) return current;
          const id = next?.id;
          if (!id) return current;
          const exists = current.some((p) => p.id === id);
          return exists ? current.map((p) => (p.id === id ? { ...p, ...next } : p)) : [next, ...current];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const fetchProjects = async (userId?: string) => {
    try {
      const [{ projects: localProjects }, { assets }] = await Promise.all([
        localKlimaxApi.listProjects(),
        localKlimaxApi.listAssets(),
      ]);
      setProjects(localProjects);
      setBankAssets(assets);
      saveKlimaxBankAssets(assets);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Backend local", description: error.message || "Impossible de charger les projets" });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const createNewProject = async (template?: { title: string; description: string; sourceGroup?: KlimaxVideoGroup }) => {
    try {
      const { project } = await localKlimaxApi.createProject({
        title: template?.title ? `Klimax ${template.title}` : undefined,
        description: template?.description,
        sourceGroupId: template?.sourceGroup?.id || null,
      });
      toast({ title: "Projet créé", description: "Le nouveau projet est prêt" });
      setProjects([project, ...projects]);
      navigate(`/project/${project.id}`);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erreur", description: error.message });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0916] flex items-center justify-center">
        <div className="text-center space-y-4 animate-pulse">
          <div className="w-20 h-20 rounded-[30px] bg-gradient-to-br from-[#e324ff] via-[#b638fc] to-[#6813d4] flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(182,56,252,0.5)]">
            <Zap className="w-10 h-10 text-white fill-current" />
          </div>
          <p className="text-sm font-medium text-slate-400">Chargement de ton espace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-black flex flex-col overflow-hidden font-sans selection:bg-white/10 text-white slate-grid">

      <InvitationBanner />

      <div className="flex-1 flex overflow-hidden w-full h-full relative">

        {/* 🌑 Global Background FX */}
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:100px_100px] opacity-20" />
          <div className="absolute top-[-10%] left-[20%] w-[1200px] h-[1200px] bg-[#3b38fc]/5 rounded-full blur-[250px]" />
          <div className="absolute bottom-[-10%] right-[10%] w-[1000px] h-[1000px] bg-[#e324ff]/5 rounded-full blur-[200px]" />
        </div>

        {/* Sidebar Navigation - Ultra Premium Glass */}
        <aside className="w-[320px] liquid-glass border-r border-white/5 flex flex-col h-full relative z-30 shrink-0">
          <div className="p-8 pb-10 flex items-center gap-5 border-b border-white/5">
            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group cursor-pointer hover:scale-110 transition-all duration-500">
              <Zap className="w-7 h-7 text-white fill-current drop-shadow-[0_0_12px_rgba(255,255,255,0.7)]" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white">Klimax vidéo</span>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">Studio mobile IA</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar py-8 px-6 space-y-10">
            <div>
              <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Tableau de bord</p>
              <div className="space-y-1">
                <SidebarItem icon={<Plus className="w-4 h-4" />} text="Nouveau projet" onClick={() => setNewProjectOpen(true)} active={false} />
                <SidebarItem icon={<Zap className="w-4 h-4" />} text="Mode automatique" onClick={() => navigate("/automatic-mode")} active={window.location.pathname === "/automatic-mode"} />
                <SidebarItem icon={<Brain className="w-4 h-4" />} text="Mode entraînement" onClick={() => navigate("/training-mode")} active={window.location.pathname === "/training-mode"} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between px-4 mb-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Projets</p>
                <button
                  className="p-1 hover:bg-white/5 rounded-md transition-colors"
                  onClick={() => setNewProjectOpen(true)}
                >
                  <Plus className="w-4 h-4 text-slate-400 hover:text-white" />
                </button>
              </div>

              {projects.length === 0 ? (
                <div className="px-6 py-10 text-center bg-white/[0.02] border border-dashed border-white/5 rounded-[30px] mx-2">
                  <p className="text-[10px] font-black uppercase text-white/10 tracking-widest">Aucun projet actif</p>
                </div>
              ) : (
                <div className="space-y-1 px-1">
                  {projects.map(p => (
                    <SidebarProject key={p.id} project={p} onClick={() => navigate(`/project/${p.id}`)} />
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-white/5">
              <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Catégories</p>
              <SidebarItem icon={<Library className="w-4 h-4" />} text="Banque" onClick={() => navigate("/asset-bank")} />
              <SidebarItem icon={<Settings className="w-4 h-4" />} text="Paramètres" onClick={() => navigate("/parametres")} active={window.location.pathname === "/parametres"} />
            </div>
          </div>

          <div className="p-8 bg-white/[0.02] border-t border-white/5 space-y-4">
            <div className="flex items-center gap-4 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/5 group hover:bg-white/[0.05] transition-all cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#e0aaff] to-[#b638fc] p-[2px] shadow-lg">
                <div className="w-full h-full rounded-full bg-[#0c0916] flex items-center justify-center font-black text-[12px] uppercase">
                  {user?.email?.charAt(0)}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{user?.email?.split("@")[0]}</p>
                <p className="text-xs text-emerald-500/80 font-medium flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  En ligne
                </p>
              </div>
              <button onClick={handleSignOut} className="text-white/20 hover:text-red-500 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area - Xrio Style */}
        <main className="flex-1 relative flex flex-col items-center justify-center h-full overflow-hidden w-full z-10 px-12">

          {/* Massive Dynamic Gradient Glow Background */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] h-[70vh] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.05)_0%,transparent_70%)] blur-[150px] pointer-events-none z-0 mix-blend-screen" />

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 py-20">
            <div className="w-full max-w-6xl flex flex-col items-center text-center pointer-events-auto">

              <h1 className="text-8xl md:text-9xl font-bold pb-12 text-white/90 drop-shadow-2xl relative z-0 select-none tracking-tighter">
                Klimax vidéo
              </h1>

              {/* Chat Message History Area - Absolute positioning to prevent title jitter */}
              <div className={`w-full max-w-[700px] mb-12 space-y-6 transition-all duration-700 ${messages.length > 0 ? 'opacity-100 transform translate-y-0 scale-100' : 'opacity-0 transform translate-y-8 scale-95 pointer-events-none'}`}>
                <div className="max-h-[300px] overflow-y-auto no-scrollbar space-y-6 px-4">
                  {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={cn(
                        "max-w-[85%] p-6 rounded-[32px] backdrop-blur-[60px] border shadow-[0_30px_60px_rgba(0,0,0,0.5)] transition-all duration-500",
                        msg.role === 'user'
                          ? 'bg-[#b638fc]/10 border-[#b638fc]/30 text-white shadow-[#b638fc]/10'
                          : 'bg-white/[0.03] border-white/10 text-white shadow-[inset_0_1px_4px_rgba(255,255,255,0.1)]'
                      )}>
                        <p className="text-[16px] leading-relaxed font-bold tracking-tight">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="p-5 rounded-full bg-white/[0.04] backdrop-blur-3xl border border-white/10 flex items-center gap-2.5">
                        <div className="w-2 h-2 rounded-full bg-[#b638fc] animate-bounce shadow-[0_0_10px_#b638fc]" />
                        <div className="w-2 h-2 rounded-full bg-[#b638fc] animate-bounce delay-150 shadow-[0_0_10px_#b638fc]" />
                        <div className="w-2 h-2 rounded-full bg-[#b638fc] animate-bounce delay-300 shadow-[0_0_10px_#b638fc]" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Central Input Box - Liquid Glass Replica */}
              <div className="w-full max-w-[740px] relative group z-10 px-4">
                <div className="absolute -inset-1 bg-gradient-to-r from-[#e324ff] via-[#b638fc] to-[#3b38fc] rounded-full blur-[50px] opacity-[0.1] group-focus-within:opacity-25 transition-opacity duration-1000"></div>

                <div className="relative liquid-glass group-hover:border-white/30 group-focus-within:border-white/60 p-3 pl-12 rounded-full flex items-center shadow-[0_50px_100px_-20px_rgba(0,0,0,0.7)] transition-all duration-700 h-[96px]">

                  <div className="absolute left-12 flex items-center gap-3">
                    <div className="w-2 h-10 bg-gradient-to-b from-[#e324ff] to-transparent rounded-full opacity-40" />
                  </div>

                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Que veux-tu préparer aujourd'hui ?"
                    className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/20 text-xl font-medium ml-4"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSendChat();
                    }}
                  />

                  <button
                    onClick={handleSendChat}
                    disabled={isTyping || !prompt.trim()}
                    className="rounded-full w-14 h-14 bg-white hover:bg-white/90 text-black flex items-center justify-center ml-4 transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-20"
                  >
                    <ArrowRight className="w-6 h-6" />
                  </button>
                </div>

                <div className="mt-8 flex flex-wrap justify-center gap-3 opacity-40 hover:opacity-100 transition-opacity duration-500">
                  <span className="px-5 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-medium cursor-pointer hover:bg-white/10 transition-all">Analyse profonde</span>
                  <span className="px-5 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-medium cursor-pointer hover:bg-white/10 transition-all">Stratégie contenu</span>
                  <span className="px-5 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-medium cursor-pointer hover:bg-white/10 transition-all">Moteur IA</span>
                </div>

                <div className="mt-10 grid w-full gap-4 text-left sm:grid-cols-2 xl:grid-cols-4">
                  <DashboardShortcutCard
                    label="Banque"
                    description="Musiques, B-rolls, images, SFX. La source de tout ce que tu insères dans un montage."
                    icon={<Library className="h-5 w-5" />}
                    onClick={() => navigate("/asset-bank")}
                  />
                  <DashboardShortcutCard
                    label={mostRecentProject ? "Dernier projet" : "Nouveau projet"}
                    description={
                      mostRecentProject
                        ? `Reprendre "${mostRecentProject.title || "Projet sans titre"}" là où tu l'as laissé.`
                        : "Aucun projet pour l'instant. Crée ton premier montage en 2 clips."
                    }
                    icon={mostRecentProject ? <Clock className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                    onClick={() => {
                      if (mostRecentProject) navigate(`/project/${mostRecentProject.id}`);
                      else setNewProjectOpen(true);
                    }}
                    disabled={loading}
                    subtle={mostRecentProject ? `Mis à jour ${formatRelativeDate(mostRecentProject.updated_at)}` : null}
                  />
                  <DashboardShortcutCard
                    label="Mode automatique"
                    description="Génère plusieurs variantes d'un coup : choisis ce qui varie (b-roll, sous-titres, hook, musique…) et lance le batch."
                    icon={<Zap className="h-5 w-5" />}
                    onClick={() => navigate("/automatic-mode")}
                  />
                  <DashboardShortcutCard
                    label="SFX"
                    description="3 transitions (film roll, whoosh, flash) et 3 effets (pop, ding, boom) prêts à coller dans un clip."
                    icon={<AudioLines className="h-5 w-5" />}
                    onClick={() => navigate("/asset-bank?tab=sfx")}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Indicators */}
          <div className="absolute bottom-16 w-full px-20 flex items-center justify-between opacity-20 pointer-events-none">
            <div className="flex items-center gap-8">
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">État système</p>
                <p className="text-sm font-medium text-emerald-500">Modules actifs</p>
              </div>
              <div className="w-px h-8 bg-white/5" />
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Espace</p>
                <p className="text-sm font-medium text-white/60">Synchronisé</p>
              </div>
            </div>

            <div className="group pointer-events-auto cursor-pointer flex flex-col items-center gap-3 hover:opacity-100 transition-opacity">
              <div className="w-[50px] h-[50px] rounded-2xl border border-white/10 flex items-center justify-center bg-white/5 backdrop-blur-xl group-hover:bg-white/10 group-hover:scale-110 transition-all">
                <ArrowDown className="w-6 h-6 text-white group-hover:animate-bounce" />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/40">Explorer</p>
            </div>

            <div className="flex items-center gap-8">
              <div className="flex items-center gap-4">
                <LayoutGrid className="w-5 h-5" />
                <Settings className="w-5 h-5" />
              </div>
            </div>
          </div>

        </main>
      </div>

      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent className="max-w-3xl bg-black border border-white/10 text-white rounded-[32px] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black uppercase tracking-tight">Nouveau projet</DialogTitle>
            <DialogDescription className="text-white/45">
              Seuls les groupes vidéo complets apparaissent ici. Chaque projet contient personne 1 et personne 2.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5">
            <ScrollArea className="h-[60vh] pr-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {uploadedVideoGroups.length > 0 ? (
                  uploadedVideoGroups.map((group) => (
                    <button
                      key={group.id}
                      onClick={() => createNewProject({ title: group.title, description: group.note, sourceGroup: group })}
                      className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:bg-white/[0.08] hover:border-white/20"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-black uppercase tracking-tight">{group.title}</p>
                          <p className="mt-1 text-xs text-white/45">{group.note}</p>
                          <div className="mt-3 grid gap-1 text-[11px] text-white/45">
                            <span>Personne 1: {group.person1?.title}</span>
                            <span>Personne 2: {group.person2?.title}</span>
                          </div>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-white text-black grid place-items-center font-black">
                          2
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="col-span-full rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-6">
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-white/35">0 vidéo ajoutée</p>
                    <h3 className="mt-3 text-2xl font-black">Aucune vidéo disponible</h3>
                    <p className="mt-3 text-sm leading-relaxed text-white/55">
                      Ajoute d'abord un duo vidéo personne 1 + personne 2 dans la Banque. Ici, on ne montre que les groupes complets.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        onClick={() => {
                          setNewProjectOpen(false);
                          navigate("/asset-bank");
                        }}
                        className="rounded-full bg-white text-black px-4 py-2 text-sm font-black"
                      >
                        Ouvrir la Banque
                      </button>
                      <button
                        onClick={() => createNewProject()}
                        className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-black text-white hover:bg-white/10"
                      >
                        Créer projet vide
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

          </div>
        </DialogContent>
      </Dialog>

      <style dangerouslySetInnerHTML={{
        __html: `
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}} />
    </div>
  );
};

export default Dashboard;
