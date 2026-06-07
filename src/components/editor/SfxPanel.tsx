import * as React from "react";
const { useCallback, useEffect, useState } = React;
import { useToast } from "@/hooks/use-toast";
import { localKlimaxApi, type LocalKlimaxSfx } from "@/lib/localKlimaxApi";
import { Loader2, Sparkles, Wand2, AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  clips: { id: string; stage: string; sfxEffect?: string | null }[];
  transitionKey?: string | null;
  autoSfxEnabled?: boolean;
  onChange: () => void;
};

const SfxPanel: React.FC<Props> = ({ projectId, clips, transitionKey, autoSfxEnabled = true, onChange }) => {
  const { toast } = useToast();
  const [sfx, setSfx] = useState<LocalKlimaxSfx[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    localKlimaxApi
      .listSfx()
      .then(({ sfx }) => setSfx(sfx))
      .catch(() => setSfx([]))
      .finally(() => setLoading(false));
  }, []);

  const transitions = sfx.filter((s) => s.type === "transition");
  const effects = sfx.filter((s) => s.type === "effect");

  const persist = useCallback(
    async (nextTransition: string | null | undefined, nextClipSfx: Record<string, string | null>) => {
      setSaving(true);
      try {
        await localKlimaxApi.setProjectSfx(projectId, {
          transitionKey: nextTransition === undefined ? undefined : nextTransition,
          clipSfx: nextClipSfx,
        });
        onChange();
      } catch (err) {
        toast({ variant: "destructive", title: "SFX", description: (err as Error).message });
      } finally {
        setSaving(false);
      }
    },
    [projectId, onChange, toast]
  );

  const setTransition = (key: string | null) => {
    persist(key, {});
  };

  const setClipEffect = (clipId: string, key: string | null) => {
    const map: Record<string, string | null> = {};
    map[clipId] = key;
    persist(undefined, map);
  };

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
        <div className="flex items-center gap-2 text-xs text-white/40">
          <Loader2 className="h-3 w-3 animate-spin" /> Chargement de la bibliothèque SFX…
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 space-y-5">
      <div>
        <div className="flex items-center gap-3">
          <AudioLines className="h-5 w-5 text-white/60" />
          <h3 className="font-black uppercase tracking-tight">SFX</h3>
          {saving && <Loader2 className="ml-auto h-3 w-3 animate-spin text-white/40" />}
        </div>
        <p className="mt-2 text-xs text-white/55 leading-relaxed">
          Les SFX automatiques détectent les mots forts de la transcription, placent un son environ toutes les 3-4s à -8 dB,
          et ajoutent un riser avant Personne 2. Les effets manuels restent disponibles clip par clip.
        </p>
        <div className="mt-3 rounded-2xl border border-white/10 bg-black px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
          Auto SFX: {autoSfxEnabled ? "actif" : "désactivé dans réglages rapides"}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Transition vidéo</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTransition(null)}
            className={cn(
              "rounded-2xl border px-3 py-2 text-left text-xs transition",
              !transitionKey
                ? "border-white bg-white text-black"
                : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/10"
            )}
          >
            <Sparkles className="h-3 w-3 mb-1 opacity-50" />
            <p className="font-black">Aucune</p>
            <p className="text-[10px] opacity-60">Cut sec entre les clips</p>
          </button>
          {transitions.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTransition(item.key)}
              className={cn(
                "rounded-2xl border px-3 py-2 text-left text-xs transition",
                transitionKey === item.key
                  ? "border-white bg-white text-black"
                  : "border-white/10 bg-white/[0.03] text-white/65 hover:bg-white/10"
              )}
            >
              <Sparkles className="h-3 w-3 mb-1 opacity-50" />
              <p className="font-black">{item.label}</p>
              <p className="text-[10px] opacity-60">{item.durationMs} ms · {item.ready ? "prêt" : "à générer"}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Effet audio manuel par clip</p>
        {clips.map((clip) => (
          <div key={clip.id} className="rounded-2xl border border-white/10 bg-black p-3 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/55">
              {clip.stage === "intro" ? "Personne 1" : "Personne 2"} · {clip.id.slice(-6)}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setClipEffect(clip.id, null)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[10px] font-black transition",
                  !clip.sfxEffect
                    ? "border-white bg-white text-black"
                    : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/10"
                )}
              >
                Aucun
              </button>
              {effects.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setClipEffect(clip.id, item.key)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[10px] font-black transition",
                    clip.sfxEffect === item.key
                      ? "border-white bg-white text-black"
                      : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/10"
                  )}
                >
                  <Wand2 className="h-3 w-3 inline mr-1" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SfxPanel;
