import * as React from "react";
import {
  ArrowRight,
  BadgeCheck,
  Captions,
  Film,
  Image,
  Music,
  Scissors,
  Sparkles,
  Upload,
  Wand2,
  Zap,
} from "lucide-react";

const features = [
  {
    icon: <Captions className="h-5 w-5" />,
    title: "Sous-titres automatiques",
    text: "La video parle, Klimax detecte, transcrit et place les sous-titres sans saisie manuelle.",
  },
  {
    icon: <Film className="h-5 w-5" />,
    title: "Clip 1 + clip 2",
    text: "Structure pensee pour hook, reponse, dialogue original et variations courtes.",
  },
  {
    icon: <Image className="h-5 w-5" />,
    title: "B-rolls et images",
    text: "Une banque visuelle pour illustrer ce qui est dit sous le texte et changer chaque video.",
  },
  {
    icon: <Music className="h-5 w-5" />,
    title: "Musique et SFX",
    text: "Ambiances, impacts et sons courts configurables avant l'automatisation complete.",
  },
];

const SlateLanding: React.FC = () => {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black overflow-hidden">
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)] bg-[size:84px_84px]" />
      <div className="fixed inset-x-0 top-0 h-80 pointer-events-none bg-gradient-to-b from-white/[0.08] to-transparent" />

      <nav className="relative z-20 flex items-center justify-between px-5 py-5 lg:px-10">
        <a href="/" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full overflow-hidden bg-white">
            <img src="/klimax-logo.jpeg" alt="Klimax logo" className="h-full w-full object-cover" />
          </div>
          <div>
            <div className="text-lg font-black uppercase tracking-tight">Klimax video</div>
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/35">AI mobile studio</div>
          </div>
        </a>

        <div className="hidden items-center gap-8 text-sm font-semibold text-white/55 md:flex">
          <a href="#workflow" className="hover:text-white">Workflow</a>
          <a href="#assets" className="hover:text-white">Assets</a>
          <a href="#automation" className="hover:text-white">Automation</a>
        </div>

        <a href="/auth" className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-black hover:bg-white/90">
          Open studio
        </a>
      </nav>

      <main className="relative z-10">
        <section className="mx-auto grid min-h-[calc(100vh-80px)] max-w-7xl grid-cols-1 items-center gap-10 px-5 pb-12 pt-10 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
          <div className="max-w-2xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-white/55">
              <Sparkles className="h-4 w-4" />
              Front-end Klimax en construction
            </div>
            <h1 className="text-6xl font-black uppercase leading-[0.9] tracking-[-0.06em] md:text-8xl">
              Videos courtes.
              <span className="block text-white/45">Controle total.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/58">
              Un studio noir et blanc pour preparer les videos de l'application mobile Klimax :
              hook visuel, sous-titres automatiques, B-rolls, images, musiques, SFX et futur mode IA.
            </p>
            <div className="mt-9 flex flex-wrap gap-4">
              <a href="/auth" className="inline-flex items-center rounded-full bg-white px-7 py-4 font-black text-black hover:bg-white/90">
                Commencer
                <ArrowRight className="ml-2 h-5 w-5" />
              </a>
              <a href="#workflow" className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.03] px-7 py-4 font-black text-white hover:bg-white/[0.08]">
                Voir le workflow
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-8 rounded-[48px] bg-white/[0.04] blur-3xl" />
            <div className="relative rounded-[36px] border border-white/10 bg-white/[0.04] p-4 shadow-2xl">
              <div className="grid gap-4 rounded-[28px] border border-white/10 bg-black p-4 lg:grid-cols-[250px_1fr]">
                <div className="aspect-[9/16] rounded-[28px] border border-white/10 bg-[linear-gradient(150deg,#5f5f5f,#111_45%,#292929)] p-5">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.25em] text-white/45">
                    <span>Clip 1</span>
                    <span>9:16</span>
                  </div>
                  <div className="mt-24 rounded-[999px] bg-white px-5 py-4 text-center text-xl font-black leading-tight text-black">
                    Tu connais cette sensation ?
                  </div>
                  <div className="mt-7 rounded-2xl bg-black/70 px-4 py-3 text-center text-2xl font-black leading-tight text-white shadow-2xl">
                    Sous-titres generes depuis l'audio
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/35">Mode</p>
                        <h2 className="text-2xl font-black">Manuel maintenant, auto plus tard</h2>
                      </div>
                      <BadgeCheck className="h-6 w-6 text-white/45" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-black">Manuel</div>
                      <div className="rounded-2xl border border-white/10 px-4 py-3 text-center text-sm font-black text-white/45">Automatique</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {[
                      ["Hook", "Bulle blanche editable"],
                      ["Subtitles", "Auto transcription"],
                      ["B-roll", "Sous le texte"],
                      ["KLIMAX", "Logo sur mot-cle"],
                    ].map(([title, text]) => (
                      <div key={title} className="rounded-2xl border border-white/10 bg-black p-4">
                        <div className="text-sm font-black">{title}</div>
                        <div className="mt-1 text-xs text-white/45">{text}</div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <Scissors className="h-5 w-5 text-white/45" />
                      <h3 className="font-black uppercase tracking-tight">Timeline</h3>
                    </div>
                    <div className="space-y-3 text-sm">
                      <TimelineRow index="1" title="Clip 1" text="Hook + sous-titres automatiques" />
                      <TimelineRow index="2" title="Clip 2" text="Deuxieme personne + sous-titres automatiques" />
                      <TimelineRow index="3" title="Assets" text="Images, B-rolls, musique, SFX" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className="border-y border-white/10 bg-white/[0.02] px-5 py-24 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <div className="mb-12 max-w-2xl">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-white/35">Workflow</p>
              <h2 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Ce qu'on garde, ce qu'on adapte.</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <div key={feature.title} className="rounded-[28px] border border-white/10 bg-black p-6">
                  <div className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-white text-black">{feature.icon}</div>
                  <h3 className="text-lg font-black">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/50">{feature.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="assets" className="px-5 py-24 lg:px-10">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-white/35">Banque</p>
              <h2 className="mt-3 text-4xl font-black tracking-tight">Videos, B-rolls, images, musiques.</h2>
              <p className="mt-5 text-white/55">
                La prochaine etape sera de brancher tes 20 videos dans une bibliotheque Klimax, puis de choisir clip 1 et clip 2 pour chaque montage.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                [<Upload className="h-5 w-5" />, "Importer les 20 videos", "Sources du projet Klimax"],
                [<Film className="h-5 w-5" />, "Clip 1 / Clip 2", "Structure manuelle par video"],
                [<Image className="h-5 w-5" />, "Illustrations", "Images placees sous le texte"],
                [<Zap className="h-5 w-5" />, "SFX", "Impacts automatiques et variations"],
              ].map(([icon, title, text]) => (
                <div key={String(title)} className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
                  <div className="mb-5 text-white/55">{icon}</div>
                  <h3 className="font-black">{title}</h3>
                  <p className="mt-2 text-sm text-white/45">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="automation" className="px-5 pb-24 lg:px-10">
          <div className="mx-auto max-w-7xl rounded-[36px] border border-white/10 bg-white text-black p-8 md:p-12">
            <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-white">
                  <Wand2 className="h-4 w-4" />
                  Automation plus tard
                </div>
                <h2 className="text-4xl font-black tracking-tight">On construit d'abord le front manuel propre.</h2>
                <p className="mt-4 max-w-2xl text-black/60">
                  Ensuite, l'IA analysera l'audio, detectera les mots forts, proposera B-rolls/images, changera les musiques et creera des variantes.
                </p>
              </div>
              <a href="/auth" className="inline-flex items-center justify-center rounded-full bg-black px-7 py-4 font-black text-white hover:bg-black/85">
                Entrer dans le studio
                <ArrowRight className="ml-2 h-5 w-5" />
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

const TimelineRow = ({ index, title, text }: { index: string; title: string; text: string }) => (
  <div className="flex items-center gap-3 rounded-2xl bg-black p-3">
    <div className="grid h-9 w-9 place-items-center rounded-full bg-white text-sm font-black text-black">{index}</div>
    <div>
      <div className="font-black">{title}</div>
      <div className="text-xs text-white/40">{text}</div>
    </div>
  </div>
);

export default SlateLanding;
