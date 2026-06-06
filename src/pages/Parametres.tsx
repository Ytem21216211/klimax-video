import * as React from "react";
const { useEffect, useState } = React;
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Captions,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { settingsApi, type SettingsPatch, type SettingsView } from "@/lib/settingsApi";
import { localKlimaxApi } from "@/lib/localKlimaxApi";
import { cn } from "@/lib/utils";

type SectionKey = "whisper" | "brollIntelligence";

type SectionConfig = {
  key: SectionKey;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  placeholder: string;
  help: React.ReactNode;
  defaultModel: string;
};

const SECTIONS: SectionConfig[] = [
  {
    key: "whisper",
    title: "Whisper (transcription)",
    description: "Utilisé pour générer les sous-titres. Si la clé est vide, le moteur local Faster-Whisper est utilisé (Python venv requis).",
    icon: Captions,
    placeholder: "sk-...",
    defaultModel: "whisper-1",
    help: (
      <>
        Clé OpenAI. Créez-la sur{" "}
        <a
          href="https://platform.openai.com/api-keys"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          platform.openai.com/api-keys
        </a>
        . Le modèle par défaut <code className="rounded bg-white/10 px-1">whisper-1</code> fournit la transcription multilingue avec timestamps mot par mot.
      </>
    ),
  },
  {
    key: "brollIntelligence",
    title: "Intelligence b-roll (Gemini)",
    description: "Utilisé pour choisir automatiquement le bon b-roll au bon moment lors du rendu, en comparant la transcription aux labels des b-rolls.",
    icon: Wand2,
    placeholder: "AIza...",
    defaultModel: "gemini-1.5-flash",
    help: (
      <>
        Clé Google Gemini (Google AI Studio). Créez-la sur{" "}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          aistudio.google.com/apikey
        </a>
        . Le modèle par défaut <code className="rounded bg-white/10 px-1">gemini-1.5-flash</code> est rapide et peu coûteux. Sans clé, le rendu continue mais n'insère aucun b-roll automatiquement.
      </>
    ),
  },
];

const Parametres = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<SectionKey, string>>({ whisper: "", brollIntelligence: "" });
  const [models, setModels] = useState<Record<SectionKey, string>>({ whisper: "whisper-1", brollIntelligence: "gemini-1.5-flash" });
  const [reveal, setReveal] = useState<Record<SectionKey, boolean>>({ whisper: false, brollIntelligence: false });
  const [saving, setSaving] = useState<Record<SectionKey, boolean>>({ whisper: false, brollIntelligence: false });
  const [testing, setTesting] = useState<Record<SectionKey, boolean>>({ whisper: false, brollIntelligence: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const view = await settingsApi.get();
        if (cancelled) return;
        setSettings(view);
        setModels({ whisper: view.whisper.model, brollIntelligence: view.brollIntelligence.model });
      } catch (err) {
        toast({ variant: "destructive", title: "Impossible de charger les paramètres", description: (err as Error).message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  const onSave = async (key: SectionKey) => {
    const draft = drafts[key];
    if (!draft || draft.trim().length === 0) {
      toast({ variant: "destructive", title: "Clé vide", description: "Colle une clé API ou laisse le serveur la conserver." });
      return;
    }
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const patch: SettingsPatch = { [key]: { apiKey: draft.trim(), model: models[key] } };
      const next = await settingsApi.update(patch);
      setSettings(next);
      setDrafts((d) => ({ ...d, [key]: "" }));
      setReveal((r) => ({ ...r, [key]: false }));
      toast({ title: "Clé enregistrée", description: "Stockée localement, jamais renvoyée en clair au navigateur." });
    } catch (err) {
      toast({ variant: "destructive", title: "Échec de l'enregistrement", description: (err as Error).message });
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  const onClear = async (key: SectionKey) => {
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const patch: SettingsPatch = { [key]: { apiKey: "" } };
      const next = await settingsApi.update(patch);
      setSettings(next);
      toast({ title: "Clé supprimée", description: "Le service repassera sur le moteur local." });
    } catch (err) {
      toast({ variant: "destructive", title: "Échec", description: (err as Error).message });
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  const onTest = async (key: SectionKey) => {
    setTesting((t) => ({ ...t, [key]: true }));
    try {
      const result = key === "whisper" ? await settingsApi.testWhisper() : await settingsApi.testBrollIntelligence();
      if (result.ok) {
        toast({ title: "Connexion OK", description: `Modèle actif: ${result.model || "—"}` });
      } else {
        toast({ variant: "destructive", title: "Connexion échouée", description: result.error || "Erreur inconnue." });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Connexion échouée", description: (err as Error).message });
    } finally {
      setTesting((t) => ({ ...t, [key]: false }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white/60">
        <Loader2 className="mr-3 h-5 w-5 animate-spin" /> Chargement des paramètres…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="rounded-full border-white/10 bg-white/[0.03] text-white hover:bg-white/10"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Tableau de bord
          </Button>
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-white/35">
            <SettingsIcon className="h-4 w-4" /> Paramètres
          </div>
        </div>

        <div>
          <h1 className="text-4xl font-black tracking-tight">Paramètres</h1>
          <p className="mt-2 text-sm text-white/55">
            Clés d'API pour les services IA. Les clés sont stockées localement sur ce serveur et ne sont jamais renvoyées en clair au navigateur.
          </p>
        </div>

        <div className="space-y-6">
          {SECTIONS.map((section) => {
            const view = settings?.[section.key];
            const Icon = section.icon;
            const draft = drafts[section.key];
            const isRevealed = reveal[section.key];
            const inputValue = draft.length > 0 ? draft : (isRevealed && view?.hasKey ? view.apiKeyMasked : "");
            return (
              <div key={section.key} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-black">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black tracking-tight">{section.title}</h2>
                      <p className="mt-1 text-sm text-white/55 max-w-xl">{section.description}</p>
                    </div>
                  </div>
                  <StatusBadge hasKey={Boolean(view?.hasKey)} />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
                      Clé API
                    </Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                        <Input
                          type={isRevealed ? "text" : "password"}
                          autoComplete="off"
                          spellCheck={false}
                          value={inputValue}
                          onChange={(e) => setDrafts((d) => ({ ...d, [section.key]: e.target.value }))}
                          placeholder={view?.hasKey ? "La clé enregistrée est masquée. Colle une nouvelle clé pour la remplacer." : section.placeholder}
                          className="rounded-2xl border-white/10 bg-black pl-10 pr-10 text-white"
                        />
                        <button
                          type="button"
                          onClick={() => setReveal((r) => ({ ...r, [section.key]: !r[section.key] }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                          aria-label={isRevealed ? "Masquer" : "Afficher"}
                        >
                          {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <Button
                        type="button"
                        onClick={() => onSave(section.key)}
                        disabled={saving[section.key] || draft.trim().length === 0}
                        className="rounded-2xl bg-white text-black hover:bg-white/90 font-black disabled:opacity-40"
                      >
                        {saving[section.key] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                        Enregistrer
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Modèle</Label>
                    <Input
                      value={models[section.key]}
                      onChange={(e) => setModels((m) => ({ ...m, [section.key]: e.target.value }))}
                      placeholder={section.defaultModel}
                      className="rounded-2xl border-white/10 bg-black text-white"
                    />
                  </div>

                  <div className="flex items-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onTest(section.key)}
                      disabled={!view?.hasKey || testing[section.key]}
                      className="flex-1 rounded-2xl border-white/10 bg-white/[0.03] text-white hover:bg-white/10 disabled:opacity-40"
                    >
                      {testing[section.key] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                      Tester la connexion
                    </Button>
                    {view?.hasKey && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onClear(section.key)}
                        disabled={saving[section.key]}
                        className="rounded-2xl border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                      >
                        Supprimer
                      </Button>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-xs leading-relaxed text-white/55">
                  {section.help}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-[24px] border border-white/10 bg-white/[0.02] p-5 text-xs text-white/45">
          <p className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <span>
              Les clés sont écrites dans <code className="rounded bg-white/10 px-1">local-data/klimax/settings.json</code>, qui n'est pas versionné. Si tu migres le projet, copie ce fichier séparément.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

const StatusBadge = ({ hasKey }: { hasKey: boolean }) => (
  <div
    className={cn(
      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em]",
      hasKey
        ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
        : "border-white/10 bg-white/5 text-white/55"
    )}
  >
    <Sparkles className="h-3 w-3" />
    {hasKey ? "Configuré" : "Non configuré"}
  </div>
);

export default Parametres;
