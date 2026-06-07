import * as React from "react";
const { useCallback, useEffect, useState } = React;
import { useToast } from "@/hooks/use-toast";
import { localKlimaxApi, type LocalKlimaxPreset } from "@/lib/localKlimaxApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BookmarkPlus, Loader2, RotateCcw, Save, Trash2, Wand2 } from "lucide-react";

const LOCAL_PRESET_FIELDS = [
  "hookText",
  "subtitleSize",
  "subtitleStyle",
  "hookStyle",
  "musicEnabled",
  "musicVolumeDb",
  "brollEnabled",
  "autoSfxEnabled",
  "autoZoomEnabled",
  "autoZoomMode",
  "autoZoomBoostPercent",
  "autoZoomDurationSeconds",
  "introZoomOutEnabled",
  "replyZoomOutEnabled",
  "zoomOutStartPercent",
  "zoomOutDurationSeconds",
  "klimaxLogoEnabled",
  "logoTriggerWord",
];

// Mirrors the PRESET_FIELDS on the server. Kept inline to avoid coupling the
// editor to a server-side import.
function readProjectSettingsForPreset(): Record<string, unknown> {
  // The editor keeps its own state, but for the "Save preset" flow the easiest
  // source of truth is the localStorage-persisted project state used by the
  // klimaxStorage helpers. We rely on a single side-channel key set elsewhere
  // in the editor (set via `window.dispatchEvent` on save) — but for a clean
  // API the editor passes a snapshot via the "preset-snapshot" custom event.
  // This module is the receiver.
  return {};
}

export type PresetSnapshot = Record<string, unknown>;

type Props = {
  refreshSignal: number;
  onApplied?: () => void;
};

const PresetsPanel: React.FC<Props> = ({ refreshSignal, onApplied }) => {
  const { toast } = useToast();
  const [presets, setPresets] = useState<LocalKlimaxPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const { presets } = await localKlimaxApi.listPresets();
      setPresets(presets);
    } catch (err) {
      toast({ variant: "destructive", title: "Erreur", description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchAll(); }, [fetchAll, refreshSignal]);

  const onCreate = async () => {
    if (!draftName.trim()) {
      toast({ variant: "destructive", title: "Nom requis", description: "Donne un nom à ton preset." });
      return;
    }
    // Collect a snapshot from a window event so this component stays decoupled
    // from the editor's internal state. The editor dispatches this event with
    // the current settings whenever the user clicks "Save preset".
    const snapshot: PresetSnapshot = (window as any).__klimaxCurrentSnapshot?.() || {};
    setSaving(true);
    try {
      await localKlimaxApi.createPreset({ name: draftName.trim(), ...snapshot });
      setDraftName("");
      setCreateOpen(false);
      toast({ title: "Preset enregistré", description: `"${draftName}" est prêt à être réutilisé.` });
      await fetchAll();
      onApplied?.();
    } catch (err) {
      toast({ variant: "destructive", title: "Échec", description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const onApply = async (preset: LocalKlimaxPreset) => {
    setApplying(preset.id);
    try {
      // The editor listens for a custom event and applies the settings to the
      // current project + saves the project on the server.
      window.dispatchEvent(new CustomEvent("klimax:apply-preset", { detail: preset.settings }));
      toast({ title: "Preset appliqué", description: `Les réglages de "${preset.name}" sont chargés.` });
      onApplied?.();
    } catch (err) {
      toast({ variant: "destructive", title: "Échec", description: (err as Error).message });
    } finally {
      setApplying(null);
    }
  };

  const onDelete = async (preset: LocalKlimaxPreset) => {
    setRemoving(preset.id);
    try {
      await localKlimaxApi.deletePreset(preset.id);
      await fetchAll();
      toast({ title: "Preset supprimé", description: `"${preset.name}" n'est plus disponible.` });
    } catch (err) {
      toast({ variant: "destructive", title: "Échec", description: (err as Error).message });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-center gap-3 mb-3">
        <BookmarkPlus className="h-5 w-5 text-white/60" />
        <h3 className="font-black uppercase tracking-tight">Préréglages</h3>
      </div>
      <p className="text-xs text-white/55 leading-relaxed">
        Sauvegarde un ensemble complet de réglages (style sous-titres, hook, musique, toggles) et
        recharge-le en un clic sur un nouveau projet. Pratique pour les A/B tests.
      </p>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            className="mt-4 w-full rounded-2xl bg-white text-black hover:bg-white/90 font-black"
          >
            <Save className="mr-2 h-4 w-4" />
            Nouveau preset
          </Button>
        </DialogTrigger>
        <DialogContent className="border-white/10 bg-[#0c0c10] text-white">
          <DialogHeader>
            <DialogTitle>Enregistrer un preset</DialogTitle>
            <DialogDescription className="text-white/55">
              Le preset capture les réglages actuels du projet (style sous-titres, hook, musique, toggles…).
              Donne-lui un nom parlant pour le retrouver facilement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Nom du preset</Label>
            <Input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Ex: Hook agressif + CapCut jaune"
              className="rounded-2xl border-white/10 bg-black text-white"
            />
            <p className="text-[10px] text-white/40">
              Champs capturés : sous-titres (style + taille), hook (texte + couleurs), musique (volume + activé),
              logo Klimax, B-rolls, SFX, mot-clé logo.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              className="rounded-2xl border-white/10 bg-transparent text-white hover:bg-white/10"
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={onCreate}
              disabled={saving || !draftName.trim()}
              className="rounded-2xl bg-white text-black hover:bg-white/90 font-black"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mt-5 space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-white/40">
            <Loader2 className="h-3 w-3 animate-spin" /> Chargement…
          </div>
        ) : presets.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 bg-black/40 p-3 text-xs text-white/40">
            Aucun preset. Configure ton montage puis clique "Nouveau preset" pour le sauvegarder.
          </p>
        ) : (
          presets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{preset.name}</p>
                <p className="text-[10px] text-white/35">Mis à jour {new Date(preset.updated_at).toLocaleString("fr-FR")}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="icon"
                  onClick={() => onApply(preset)}
                  disabled={applying === preset.id}
                  title="Appliquer"
                  className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10"
                >
                  {applying === preset.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  onClick={() => onDelete(preset)}
                  disabled={removing === preset.id}
                  title="Supprimer"
                  className="h-9 w-9 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 hover:bg-red-500/20"
                >
                  {removing === preset.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PresetsPanel;
