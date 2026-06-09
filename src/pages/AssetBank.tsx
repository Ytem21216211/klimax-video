import * as React from "react";
const { useEffect, useMemo, useRef, useState } = React;
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Library, Plus, Trash2, Music, Film, Image as ImageIcon, CirclePlay, Upload, AudioLines, Wand2, Sparkles, Loader2, Users, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { localKlimaxApi, LOCAL_KLIMAX_API, type LocalKlimaxSfx } from "@/lib/localKlimaxApi";
import { cn } from "@/lib/utils";
import {
  createKlimaxBankAsset,
  getKlimaxVideoGroups,
  loadKlimaxBankAssets,
  saveKlimaxBankAssets,
  type KlimaxAssetCategory,
  type KlimaxBankAsset,
} from "@/lib/klimaxStorage";

const categoryMeta: Record<KlimaxAssetCategory, { label: string; description: string; icon: React.ReactNode }> = {
  music: { label: "Musique", description: "Sons et ambiances", icon: <Music className="h-4 w-4" /> },
  broll: { label: "B-roll", description: "Plans d'illustration", icon: <Film className="h-4 w-4" /> },
  image: { label: "Images", description: "Visuels sous le texte", icon: <ImageIcon className="h-4 w-4" /> },
  video: { label: "Vidéos", description: "2 parties liées", icon: <CirclePlay className="h-4 w-4" /> },
  speaker: { label: "2e speaker", description: "Clips Shelly / Julien à incruster (haut / bas)", icon: <Users className="h-4 w-4" /> },
};

type SelectedVideoFile = {
  name: string;
  size: number;
  type: string;
  file: File;
};

const stripFileExtension = (fileName: string) => fileName.replace(/\.[^/.]+$/, "");

const formatFileSize = (size: number) => {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
};

// Inline-renamable title. Click the pencil → edit → Enter / blur saves, Escape
// cancels. Used for the base clips (personne 1 / 2) and the 2e-speaker clips so a
// name (e.g. "Julien" / "Shelly") can be attached to each source.
const EditableTitle = ({
  value,
  placeholder,
  className,
  onSave,
}: {
  value: string;
  placeholder?: string;
  className?: string;
  onSave: (next: string) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  if (editing) {
    const commit = () => {
      const next = draft.trim();
      setEditing(false);
      if (next && next !== value) onSave(next);
      else setDraft(value);
    };
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-white/25 bg-black px-2 py-1 text-sm font-bold text-white outline-none focus:border-white/60"
        />
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={commit}
          className="shrink-0 text-emerald-400/80 transition hover:text-emerald-300"
          title="Valider"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <p className={cn("min-w-0 flex-1 truncate", className)}>{value || placeholder}</p>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="shrink-0 text-white/35 transition hover:text-white"
        title="Renommer"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

const AssetBank = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [assets, setAssets] = useState<KlimaxBankAsset[]>(() => loadKlimaxBankAssets());
  const [sfx, setSfx] = useState<LocalKlimaxSfx[]>([]);
  const [initialTab, setInitialTab] = useState<string>(searchParams.get("tab") || "music");
  const [category, setCategory] = useState<KlimaxAssetCategory>("music");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [assetFile, setAssetFile] = useState<SelectedVideoFile | null>(null);
  const [videoPersonOneFile, setVideoPersonOneFile] = useState<SelectedVideoFile | null>(null);
  const [videoPersonTwoFile, setVideoPersonTwoFile] = useState<SelectedVideoFile | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const assetInputRef = useRef<HTMLInputElement | null>(null);
  const videoPersonOneInputRef = useRef<HTMLInputElement | null>(null);
  const videoPersonTwoInputRef = useRef<HTMLInputElement | null>(null);

  const groupedAssets = useMemo(
    () =>
      assets.reduce<Record<KlimaxAssetCategory, KlimaxBankAsset[]>>(
        (acc, asset) => {
          acc[asset.category].push(asset);
          return acc;
        },
        { music: [], broll: [], image: [], video: [], speaker: [] }
      ),
    [assets]
  );
  const videoGroups = useMemo(() => getKlimaxVideoGroups(assets), [assets]);

  const persist = (nextAssets: KlimaxBankAsset[]) => {
    setAssets(nextAssets);
    saveKlimaxBankAssets(nextAssets);
  };

  useEffect(() => {
    localKlimaxApi
      .listAssets()
      .then(({ assets: nextAssets }) => {
        setAssets(nextAssets);
        saveKlimaxBankAssets(nextAssets);
      })
      .catch(() => {
        // Le backend local peut être éteint; la Bank garde le fallback navigateur.
      });
    localKlimaxApi
      .listSfx()
      .then(({ sfx: nextSfx }) => setSfx(nextSfx))
      .catch(() => setSfx([]));
  }, []);

  useEffect(() => {
    // Sync the active tab into the URL so the Dashboard SFX card can deep-link here.
    const current = searchParams.get("tab");
    if (current !== initialTab) {
      const next = new URLSearchParams(searchParams);
      next.set("tab", initialTab);
      setSearchParams(next, { replace: true });
    }
  }, [initialTab, searchParams, setSearchParams]);

  const addAsset = async () => {
    if (isSaving) return;
    if (category === "video") {
      if (!videoPersonOneFile || !videoPersonTwoFile) return;
      setIsSaving(true);
      try {
        const { assets: nextAssets } = await localKlimaxApi.uploadVideoPair(
          videoPersonOneFile.file,
          videoPersonTwoFile.file,
          note.trim()
        );
        persist(nextAssets);
        setNote("");
        setVideoPersonOneFile(null);
        setVideoPersonTwoFile(null);
        if (videoPersonOneInputRef.current) videoPersonOneInputRef.current.value = "";
        if (videoPersonTwoInputRef.current) videoPersonTwoInputRef.current.value = "";
        toast({ title: "Vidéos ajoutées", description: "Le duo est prêt pour un nouveau projet." });
      } catch (error: any) {
        toast({ variant: "destructive", title: "Backend local", description: error.message });
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (!assetFile) return;
    setIsSaving(true);
    try {
      const { assets: nextAssets } = await localKlimaxApi.uploadAsset(category, assetFile.file, note.trim());
      persist(nextAssets);
      setAssetFile(null);
      if (assetInputRef.current) assetInputRef.current.value = "";
      toast({ title: "Asset ajouté", description: assetFile.name });
    } catch (error: any) {
      // Do NOT fall back to a localStorage-only asset: without a backend file it
      // can't be rendered, so it would show in the Banque/preview but silently
      // disappear at export. Surface the error instead.
      toast({
        variant: "destructive",
        title: "Backend local",
        description: error?.message || "Upload impossible — démarre le backend local et réessaie.",
      });
    } finally {
      setIsSaving(false);
    }
    setTitle("");
    setNote("");
  };

  const [uploadingSfx, setUploadingSfx] = useState(false);
  const uploadSfxFile = async (file: File | null) => {
    if (!file || uploadingSfx) return;
    setUploadingSfx(true);
    try {
      const { sfx: nextSfx } = await localKlimaxApi.uploadSfx(file);
      setSfx(nextSfx);
      toast({ title: "SFX ajouté", description: file.name });
    } catch (error: any) {
      toast({ variant: "destructive", title: "SFX", description: error.message });
    } finally {
      setUploadingSfx(false);
    }
  };
  const removeSfx = async (key: string) => {
    try {
      const { sfx: nextSfx } = await localKlimaxApi.deleteSfx(key);
      setSfx(nextSfx);
    } catch (error: any) {
      toast({ variant: "destructive", title: "SFX", description: error.message });
    }
  };

  const selectVideoFile = (file: File | null, person: "one" | "two" | "asset") => {
    if (!file) return;
    const nextFile = { name: file.name, size: file.size, type: file.type, file };
    if (person === "asset") setAssetFile(nextFile);
    if (person === "one") setVideoPersonOneFile(nextFile);
    if (person === "two") setVideoPersonTwoFile(nextFile);
  };

  const removeAsset = (assetId: string) => {
    localKlimaxApi
      .deleteAsset(assetId)
      .then(({ assets: nextAssets }) => persist(nextAssets))
      .catch(() => persist(assets.filter((asset) => asset.id !== assetId)));
  };

  const removeVideoGroup = (groupId: string) => {
    localKlimaxApi
      .deleteAsset(groupId)
      .then(({ assets: nextAssets }) => persist(nextAssets))
      .catch(() => persist(assets.filter((asset) => asset.id !== groupId && asset.groupId !== groupId)));
  };

  const renameAsset = (assetId: string, nextTitle: string) => {
    localKlimaxApi
      .renameAsset(assetId, nextTitle)
      .then(({ assets: nextAssets }) => {
        persist(nextAssets);
        toast({ title: "Clip renommé", description: nextTitle });
      })
      .catch((error: Error) => {
        // Backend éteint : on garde le nom en local au moins.
        persist(assets.map((asset) => (asset.id === assetId ? { ...asset, title: nextTitle } : asset)));
        toast({ variant: "destructive", title: "Backend local", description: error?.message || "Renommé en local uniquement." });
      });
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black">
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)] bg-[size:72px_72px]" />

      <header className="relative z-10 flex items-center justify-between gap-4 border-b border-white/10 bg-black/80 px-6 py-5 backdrop-blur-xl">
        <div className="flex items-center gap-4 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard")}
            className="rounded-full border border-white/10 bg-white/[0.03] text-white hover:bg-white hover:text-black"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-10 w-10 rounded-full border border-white/10 bg-white/5 grid place-items-center">
            <Library className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight">Banque d'assets</h1>
            <p className="text-xs text-white/45">Musiques, B-rolls, images et vidéos sauvegardés pour la suite</p>
          </div>
        </div>
      </header>

      <main className="relative z-10 grid gap-6 px-6 py-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-white/35">Ajouter un élément</p>
          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Catégorie à ajouter</Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(categoryMeta).map(([value, meta]) => {
                  const isActive = category === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCategory(value as KlimaxAssetCategory)}
                      className={cn(
                        "rounded-2xl border p-3 text-left transition",
                        isActive ? "border-white bg-white text-black" : "border-white/10 bg-black text-white hover:bg-white/[0.06]"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn("grid h-8 w-8 place-items-center rounded-full", isActive ? "bg-black text-white" : "bg-white/[0.06] text-white")}>
                          {meta.icon}
                        </span>
                        <span className="font-black text-sm">{meta.label}</span>
                      </div>
                      <p className={cn("mt-2 text-[11px] leading-tight", isActive ? "text-black/55" : "text-white/40")}>{meta.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {category !== "video" && (
              <div className="rounded-3xl border border-dashed border-white/15 bg-black p-4">
                <input
                  ref={assetInputRef}
                  type="file"
                  accept={category === "music" ? "audio/*" : category === "image" ? "image/*" : "video/*"}
                  className="hidden"
                  onChange={(event) => selectVideoFile(event.target.files?.[0] || null, "asset")}
                />
                <Button
                  type="button"
                  onClick={() => assetInputRef.current?.click()}
                  variant="outline"
                  className="h-auto w-full justify-start rounded-2xl border-white/10 bg-white/[0.03] px-4 py-3 text-left text-white hover:bg-white/10"
                >
                  <Upload className="mr-3 h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-black">
                      {assetFile ? assetFile.name : `Choisir un fichier ${categoryMeta[category].label.toLowerCase()}`}
                    </span>
                    <span className="mt-1 block text-xs text-white/45">
                      {assetFile ? `${formatFileSize(assetFile.size)} · ${assetFile.type || categoryMeta[category].label}` : "Le nom du fichier sera utilisé automatiquement"}
                    </span>
                  </span>
                </Button>
              </div>
            )}

            {category === "video" && (
              <div className="grid gap-3">
                <div className="rounded-3xl border border-dashed border-white/15 bg-black p-4">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-white text-black">
                      <Plus className="h-4 w-4" />
                    </div>
                    <div>
                      <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">+ Vidéo personne 1</Label>
                      <p className="text-xs text-white/35">Première partie du même projet vidéo</p>
                    </div>
                  </div>
                  <input
                    ref={videoPersonOneInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(event) => selectVideoFile(event.target.files?.[0] || null, "one")}
                  />
                  <Button
                    type="button"
                    onClick={() => videoPersonOneInputRef.current?.click()}
                    variant="outline"
                    className="h-auto w-full justify-start rounded-2xl border-white/10 bg-white/[0.03] px-4 py-3 text-left text-white hover:bg-white/10"
                  >
                    <Upload className="mr-3 h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-black">
                        {videoPersonOneFile ? videoPersonOneFile.name : "Choisir le fichier personne 1"}
                      </span>
                      <span className="mt-1 block text-xs text-white/45">
                        {videoPersonOneFile ? `${formatFileSize(videoPersonOneFile.size)} · ${videoPersonOneFile.type || "vidéo"}` : "Le nom du fichier sera utilisé automatiquement"}
                      </span>
                    </span>
                  </Button>
                </div>
                <div className="rounded-3xl border border-dashed border-white/15 bg-black p-4">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-white text-black">
                      <Plus className="h-4 w-4" />
                    </div>
                    <div>
                      <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">+ Vidéo personne 2</Label>
                      <p className="text-xs text-white/35">Deuxième partie liée à la personne 1</p>
                    </div>
                  </div>
                  <input
                    ref={videoPersonTwoInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(event) => selectVideoFile(event.target.files?.[0] || null, "two")}
                  />
                  <Button
                    type="button"
                    onClick={() => videoPersonTwoInputRef.current?.click()}
                    variant="outline"
                    className="h-auto w-full justify-start rounded-2xl border-white/10 bg-white/[0.03] px-4 py-3 text-left text-white hover:bg-white/10"
                  >
                    <Upload className="mr-3 h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-black">
                        {videoPersonTwoFile ? videoPersonTwoFile.name : "Choisir le fichier personne 2"}
                      </span>
                      <span className="mt-1 block text-xs text-white/45">
                        {videoPersonTwoFile ? `${formatFileSize(videoPersonTwoFile.size)} · ${videoPersonTwoFile.type || "vidéo"}` : "Le nom du fichier sera utilisé automatiquement"}
                      </span>
                    </span>
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-[0.2em] text-white/45">
                {category === "broll" ? "Label du b-roll" : "Note"}
              </Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-[120px] rounded-2xl border-white/10 bg-black text-white"
                placeholder={
                  category === "broll"
                    ? "Décris ce que le b-roll montre (ex: 'Personne qui tape sur un clavier, gros plan sur l'écran'). Cette description sert à l'IA pour choisir le bon b-roll au bon moment."
                    : "Usage, ambiance, type de plan..."
                }
              />
              {category === "broll" && (
                <p className="text-[10px] text-white/40 leading-relaxed">
                  Plus la description est précise (sujet, ambiance, action), plus l'IA choisira le bon b-roll au moment du rendu. Va dans <span className="underline">Paramètres</span> pour configurer la clé Gemini.
                </p>
              )}
            </div>

            <Button
              onClick={addAsset}
              disabled={isSaving || (category === "video" ? !videoPersonOneFile || !videoPersonTwoFile : !assetFile)}
              className="w-full rounded-2xl bg-white text-black hover:bg-white/90 font-black disabled:opacity-35"
            >
              <Plus className="mr-2 h-4 w-4" />
              {isSaving ? "Ajout en cours..." : category === "video" ? "Ajouter définitivement la vidéo complète" : "Ajouter définitivement"}
            </Button>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-white/35">Banque persistante</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">Choix enregistrés pour les projets</h2>
            </div>
            <p className="text-sm text-white/45">{assets.length} élément(s) enregistré(s)</p>
          </div>

          <Tabs defaultValue="music" value={initialTab} onValueChange={setInitialTab} className="mt-6">
            <TabsList className="grid grid-cols-6 bg-black border border-white/10 rounded-2xl p-1 h-12">
              <TabsTrigger value="music" className="rounded-xl text-[10px]">Musique</TabsTrigger>
              <TabsTrigger value="broll" className="rounded-xl text-[10px]">B-roll</TabsTrigger>
              <TabsTrigger value="image" className="rounded-xl text-[10px]">Images</TabsTrigger>
              <TabsTrigger value="video" className="rounded-xl text-[10px]">Vidéos</TabsTrigger>
              <TabsTrigger value="speaker" className="rounded-xl text-[10px]">2e speaker</TabsTrigger>
              <TabsTrigger value="sfx" className="rounded-xl text-[10px]">SFX</TabsTrigger>
            </TabsList>

            {(["music", "broll", "image", "video", "speaker", "sfx"] as (KlimaxAssetCategory | "sfx")[]).map((cat) => (
              <TabsContent key={cat} value={cat} className="mt-6">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {cat === "video" ? (
                    <>
                      {videoGroups.map((group) => (
                        <article key={group.id} className="rounded-[22px] border border-white/10 bg-black p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-black uppercase tracking-tight truncate">{group.title}</p>
                              <p className="mt-1 text-xs text-white/45">{group.note}</p>
                            </div>
                            <button
                              onClick={() => removeVideoGroup(group.id)}
                              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-black text-white/45 transition hover:bg-white/5 hover:text-white"
                            >
                              <Trash2 className="h-4 w-4" />
                              Supprimer
                            </button>
                          </div>
                          <div className="mt-4 grid gap-2 text-xs">
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                              <span className="font-black uppercase tracking-[0.2em] text-white/35">Personne 1</span>
                              {group.person1 ? (
                                <div className="mt-1">
                                  <EditableTitle
                                    value={group.person1.title}
                                    className="font-bold text-white"
                                    onSave={(next) => renameAsset(group.person1!.id, next)}
                                  />
                                </div>
                              ) : (
                                <p className="mt-1 font-bold text-white">A ajouter</p>
                              )}
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                              <span className="font-black uppercase tracking-[0.2em] text-white/35">Personne 2</span>
                              {group.person2 ? (
                                <div className="mt-1">
                                  <EditableTitle
                                    value={group.person2.title}
                                    className="font-bold text-white"
                                    onSave={(next) => renameAsset(group.person2!.id, next)}
                                  />
                                </div>
                              ) : (
                                <p className="mt-1 font-bold text-white">A ajouter</p>
                              )}
                            </div>
                          </div>
                        </article>
                      ))}
                      {videoGroups.length === 0 && (
                        <div className="rounded-[22px] border border-dashed border-white/10 bg-black/50 p-5 text-sm text-white/45">
                          Aucune vidéo liée pour le moment. Ajoute un duo personne 1 + personne 2.
                        </div>
                      )}
                    </>
                  ) : cat !== "sfx" ? (
                    <>
                      {groupedAssets[cat].map((asset) => (
                        <article key={asset.id} className="rounded-[22px] border border-white/10 bg-black p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              {cat === "speaker" ? (
                                <EditableTitle
                                  value={asset.title}
                                  className="font-black uppercase tracking-tight"
                                  onSave={(next) => renameAsset(asset.id, next)}
                                />
                              ) : (
                                <p className="font-black uppercase tracking-tight truncate">{asset.title}</p>
                              )}
                              <p className="mt-1 text-xs text-white/45">{asset.note}</p>
                            </div>
                            <button
                              onClick={() => removeAsset(asset.id)}
                              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-black text-white/45 transition hover:bg-white/5 hover:text-white"
                            >
                              <Trash2 className="h-4 w-4" />
                              Supprimer
                            </button>
                          </div>
                        </article>
                      ))}
                       {groupedAssets[cat].length === 0 && (
                        <div className="rounded-[22px] border border-dashed border-white/10 bg-black/50 p-5 text-sm text-white/45">
                          Aucun élément dans {categoryMeta[cat].label.toLowerCase()} pour le moment.
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="sm:col-span-2 xl:col-span-3 rounded-[22px] border border-white/10 bg-black/40 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black uppercase tracking-tight text-white">SFX par défaut</p>
                            <p className="mt-1 text-xs text-white/45">
                              Quand « Sound effects » est activé dans l'éditeur, un de ces sons est ajouté
                              au hasard ~toutes les 4 s (-9 dB). Le riser, lui, termine le 1er clip (-15 dB).
                            </p>
                          </div>
                          <AudioLines className="h-5 w-5 text-white/50" />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          {sfx.filter((s) => !s.user).map((item) => (
                            <div key={item.key} className="rounded-2xl border border-white/10 bg-black p-3">
                              <div className="flex items-center gap-2 text-white">
                                {item.type === "riser" ? (
                                  <Sparkles className="h-4 w-4 text-white/60" />
                                ) : (
                                  <Wand2 className="h-4 w-4 text-white/60" />
                                )}
                                <span className="font-black truncate">{item.label}</span>
                                <span className="ml-auto text-[10px] uppercase tracking-[0.2em] text-white/30">
                                  {item.type === "riser" ? "Riser" : "Effet"}
                                </span>
                              </div>
                              <p className="mt-2 text-xs text-white/45">{item.description}</p>
                              <audio
                                controls
                                src={`${LOCAL_KLIMAX_API}/api/sfx/${encodeURIComponent(item.key)}/file`}
                                className="mt-2 w-full h-8"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="sm:col-span-2 xl:col-span-3 rounded-[22px] border border-white/10 bg-black/40 p-4 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black uppercase tracking-tight text-white">Mes SFX (MP3)</p>
                            <p className="mt-1 text-xs text-white/45">
                              Importe tes propres sons (mp3, wav, m4a…). Ils rejoignent la rotation automatique :
                              quand « Sound effects » est activé, ils peuvent tomber au hasard ~toutes les 4 s.
                            </p>
                          </div>
                          <label
                            className={cn(
                              "inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white text-black px-4 py-2 text-xs font-black uppercase tracking-wider transition hover:bg-white/90",
                              uploadingSfx && "opacity-60 pointer-events-none"
                            )}
                          >
                            {uploadingSfx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            {uploadingSfx ? "Import…" : "Importer un SFX"}
                            <input
                              type="file"
                              accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac"
                              className="hidden"
                              disabled={uploadingSfx}
                              onChange={(e) => {
                                const f = e.target.files?.[0] || null;
                                uploadSfxFile(f);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          {sfx.filter((s) => s.user).map((item) => (
                            <div key={item.key} className="rounded-2xl border border-white/10 bg-black p-3">
                              <div className="flex items-center gap-2 text-white">
                                <AudioLines className="h-4 w-4 text-white/60" />
                                <span className="font-black truncate">{item.label}</span>
                                <button
                                  type="button"
                                  onClick={() => removeSfx(item.key)}
                                  title="Supprimer"
                                  className="ml-auto text-white/40 hover:text-red-400 transition"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                              <audio
                                controls
                                src={`${LOCAL_KLIMAX_API}/api/sfx/${encodeURIComponent(item.key)}/file`}
                                className="mt-2 w-full h-8"
                              />
                            </div>
                          ))}
                          {sfx.filter((s) => s.user).length === 0 && (
                            <div className="sm:col-span-3 rounded-2xl border border-dashed border-white/10 bg-black/50 p-4 text-xs text-white/45">
                              Aucun SFX importé. Clique sur « Importer un SFX » pour ajouter les tiens.
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <div className="mt-6 rounded-[24px] border border-dashed border-white/10 bg-black/60 p-5 text-sm text-white/55">
            La banque sert pour la suite des projets. Les clips se choisissent ailleurs, dans la page de montage, puis on associe ici la musique, les images et les B-rolls.
          </div>
        </section>
      </main>
    </div>
  );
};

export default AssetBank;
