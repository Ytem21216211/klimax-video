import { Upload, Palette, Wand2, Share2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const steps = [
  {
    id: "01",
    title: "Upload Your Content",
    description: "Upload your raw Minecraft gameplay or choose from our library. Our high-speed ingress seamlessly prepares it for real-time processing.",
    icon: Upload,
    image: "https://images.unsplash.com/photo-1627398242454-45a1465c2479?auto=format&fit=crop&q=80&w=800",
    color: "from-[#9638fc] to-[#e324ff]"
  },
  {
    id: "02",
    title: "Select AI Style",
    description: "Choose from our dynamic editing styles. Whether you want rapid subtitles, jump cuts, or storytelling graphics, our AI adapts to your vision.",
    icon: Palette,
    image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=800",
    color: "from-[#e324ff] to-[#ff8aff]"
  },
  {
    id: "03",
    title: "Generate & Polish",
    description: "Watch as our AI generates scripts, voiceovers, and edits in minutes. Use our intuitive timeline to tweak any detail before rapid finalization.",
    icon: Wand2,
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=800",
    color: "from-[#ff8aff] to-[#fca5fc]"
  },
  {
    id: "04",
    title: "Export & Monetize",
    description: "Export crisp vertical (9:16) or cinematic horizontal (16:9) renders. Publish directly and leverage viral algorithms perfectly.",
    icon: Share2,
    image: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&q=80&w=800",
    color: "from-[#b638fc] to-[#ffb3ff]"
  }
];

const HowItWorksSection = () => {
  return (
    <section id="how-it-works" className="py-32 bg-[#0c0916] relative overflow-hidden font-sans border-t border-white/5">
      {/* Background gradients */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#6813d4]/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none animate-pulse duration-[6000ms]" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-[#e324ff]/10 rounded-full blur-[150px] mix-blend-screen pointer-events-none animate-pulse duration-[7000ms]" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Section Header */}
        <div className="text-center mb-28">
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-white/10 bg-[#161224]/80 text-[#e0aaff] text-[13px] font-medium mb-6 shadow-[inset_0_1px_2px_rgba(255,255,255,0.1)] backdrop-blur-xl">
            <Wand2 className="w-4 h-4 fill-current" />
            <span className="tracking-wide">How It Works</span>
          </div>
          <h2 className="text-4xl md:text-[56px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-[#c28aff] mb-6 leading-[1.1] tracking-[-0.02em]">
            4 Simple Steps.
          </h2>
          <p className="text-lg md:text-xl text-slate-400/90 max-w-2xl mx-auto font-medium">
            From raw footage to viral content in absolute minutes.
          </p>
        </div>

        {/* Steps Timeline */}
        <div className="relative">
          {/* Vertical Glowing Line */}
          <div className="absolute left-[20px] md:left-1/2 top-4 bottom-4 w-[2px] bg-gradient-to-b from-transparent via-[#9638fc] to-transparent hidden md:block opacity-50 shadow-[0_0_10px_#9638fc]" />

          <div className="space-y-32">
            {steps.map((step, index) => (
              <div key={step.id} className={`flex flex-col md:flex-row items-center gap-12 md:gap-20 ${index % 2 === 0 ? 'md:flex-row-reverse' : ''}`}>

                {/* Image Side */}
                <div className="flex-1 w-full group perspective-1000 relative">
                  {/* Surrounding Glow */}
                  <div className={`absolute -inset-4 bg-gradient-to-tr ${step.color} rounded-[32px] blur-3xl opacity-20 group-hover:opacity-40 transition-opacity duration-700 pointer-events-none`} />

                  <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_2px_rgba(255,255,255,0.1)] bg-[#161224] transform group-hover:scale-[1.03] group-hover:-rotate-1 transition-all duration-700">
                    <div className={`absolute inset-0 bg-gradient-to-tr ${step.color} opacity-10 mix-blend-overlay z-10 pointer-events-none`} />
                    <img
                      src={step.image}
                      alt={step.title}
                      className="w-full h-[400px] object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-700"
                    />

                    {/* Floating UI Elements matching reference style */}
                    <div className="absolute top-4 right-4 bg-[#1b172a]/80 backdrop-blur-xl rounded-xl p-3 px-4 border border-white/10 shadow-lg z-20 flex items-center gap-3 transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 delay-100">
                      <div className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${step.color} animate-pulse shadow-[0_0_8px_currentColor]`} />
                      <span className="text-[13px] font-semibold text-white tracking-wide">Processing...</span>
                    </div>
                  </div>
                </div>

                {/* Timeline Dot (Desktop only) */}
                <div className="absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[#161224] border-2 border-[#ff73ff] shadow-[0_0_15px_#ff73ff] z-10 hidden md:block" />

                {/* Content Side */}
                <div className="flex-1 text-left md:text-left relative">
                  {/* Large Number Background Outline */}
                  <span className="absolute -top-16 -left-6 text-[180px] font-black tracking-tighter text-transparent bg-clip-text select-none z-0" style={{ WebkitTextStroke: '2px rgba(255,255,255,0.03)' }}>
                    {step.id}
                  </span>

                  <div className="relative z-10 pl-6 md:pl-0">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 bg-gradient-to-br from-[#2a1d45] to-[#12072b] border border-white/10 shadow-[inset_0_1px_2px_rgba(255,255,255,0.1)]`}>
                      <step.icon className={`w-5 h-5 text-[#e0aaff]`} />
                    </div>

                    <h3 className="text-3xl md:text-[36px] font-bold text-white mb-6 leading-tight">
                      {step.title}
                    </h3>
                    <p className="text-slate-400 text-[17px] leading-[1.7] mb-8 font-medium">
                      {step.description}
                    </p>

                    {index === steps.length - 1 && (
                      <Link to="/auth">
                        <Button className="relative bg-gradient-to-r from-[#3b38fc] via-[#b438fc] to-[#fca5fc] hover:from-[#4542fc] hover:via-[#bf42fc] hover:to-[#fcaffc] text-white font-semibold rounded-full px-8 h-[52px] text-[15px] shadow-[inset_0_2px_4px_rgba(255,255,255,0.5),inset_0_-2px_4px_rgba(0,0,0,0.3),0_5px_15px_rgba(0,0,0,0.4)] transition-all border-none group hover:scale-[1.02] mt-4">
                          Start Creating
                          <ArrowRight className="w-5 h-5 ml-2 transform group-hover:translate-x-1 transition-transform" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
