import { useEffect, useRef, useState } from "react";
import { Zap, Sparkles, ArrowRight, Brain, Mic, Cpu, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const FeaturesSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.3 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section id="features" className="pt-40 pb-20 bg-[#0c0916] relative overflow-hidden font-sans border-t border-white/5 flex flex-col items-center min-h-[1200px]">

      {/* CSS Animations */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes rotate-slow { 100% { transform: rotate(360deg); } }
        @keyframes rotate-fast-reverse { 100% { transform: rotate(-360deg); } }
        @keyframes dash-flow { to { stroke-dashoffset: -1000; } }
        @keyframes float-1 { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-15px) scale(1.02); } }
        @keyframes float-2 { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(15px) scale(1.02); } }
        @keyframes pulse-core { 
          0%, 100% { transform: scale(1) rotate(45deg); box-shadow: 0 0 60px 10px rgba(182,56,252,0.4), inset 0 0 20px rgba(255,255,255,0.5); } 
          50% { transform: scale(1.05) rotate(45deg); box-shadow: 0 0 100px 30px rgba(227,36,255,0.7), inset 0 0 30px rgba(255,255,255,0.8); } 
        }
      `}} />

      {/* Ambient background glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#6813d4]/15 rounded-full blur-[200px] mix-blend-screen pointer-events-none" />

      {/* Header text minimal */}
      <div className="text-center mb-16 relative z-20 px-4">
        <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full border border-[#b638fc]/30 bg-[#161224]/80 text-[#e0aaff] text-[13px] font-medium mb-8 shadow-[0_0_20px_rgba(182,56,252,0.3),inset_0_1px_2px_rgba(255,255,255,0.1)] backdrop-blur-xl">
          <Zap className="w-4 h-4 fill-current animate-pulse opacity-80" />
          <span className="tracking-[0.1em] uppercase">The Super-AI Engine</span>
        </div>
        <h2 className="text-5xl md:text-[80px] font-bold text-transparent bg-clip-text bg-[linear-gradient(160deg,#ffffff_30%,#e0aaff_60%,#c28aff_90%)] leading-[1.05] tracking-[-0.02em] drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">
          Hyperspeed <br className="hidden md:block" /> Architecture.
        </h2>
      </div>

      {/* Motion Design SVG Diagram Area */}
      <div ref={sectionRef} className="relative w-full max-w-[1200px] h-[600px] mx-auto z-10 flex items-center justify-center">

        {/* Abstract SVG Background Lines & Orbits */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid meet" fill="none">
          {/* Rotating Rings */}
          <g className={`transition-opacity duration-[1000ms] ease-in-out delay-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
            <g style={{ transformOrigin: '600px 300px', animation: 'rotate-slow 60s linear infinite' }}>
              <circle cx="600" cy="300" r="200" stroke="rgba(182,56,252,0.15)" strokeWidth="1" strokeDasharray="4 8" />
              <circle cx="600" cy="300" r="200" stroke="rgba(227,36,255,0.5)" strokeWidth="2" strokeDasharray="100 800" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 10px #e324ff)' }} />
            </g>

            <g style={{ transformOrigin: '600px 300px', animation: 'rotate-fast-reverse 40s linear infinite' }}>
              <circle cx="600" cy="300" r="280" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <circle cx="600" cy="300" r="280" stroke="#ffffff" strokeWidth="2" strokeDasharray="50 1200" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 15px #ffffff)' }} />
            </g>
          </g>

          <defs>
            <linearGradient id="gradient-line" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e324ff" stopOpacity="1" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="100%" stopColor="#9638fc" stopOpacity="1" />
            </linearGradient>
            <linearGradient id="solid-line" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.05)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
            </linearGradient>
          </defs>

          {/* Connected lines showing sequentially */}
          {/* Node 1 Top Left */}
          <g className={`transition-opacity duration-700 ease-out delay-[400ms] ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
            <path d="M600,300 L300,100" stroke="url(#solid-line)" strokeWidth="2" />
            <path d="M600,300 L300,100" stroke="url(#gradient-line)" strokeWidth="3" strokeDasharray="10 20" style={{ animation: 'dash-flow 20s linear infinite', strokeLinecap: 'round' }} />
          </g>

          {/* Node 2 Top Right */}
          <g className={`transition-opacity duration-700 ease-out delay-[1000ms] ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
            <path d="M600,300 L900,100" stroke="url(#solid-line)" strokeWidth="2" />
            <path d="M600,300 L900,100" stroke="url(#gradient-line)" strokeWidth="3" strokeDasharray="5 15" style={{ animation: 'dash-flow 25s linear infinite', strokeLinecap: 'round' }} />
          </g>

          {/* Node 3 Bottom Left */}
          <g className={`transition-opacity duration-700 ease-out delay-[1600ms] ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
            <path d="M600,300 L250,500" stroke="url(#solid-line)" strokeWidth="2" />
            <path d="M600,300 L250,500" stroke="url(#gradient-line)" strokeWidth="3" strokeDasharray="15 30" style={{ animation: 'dash-flow 15s linear infinite reverse', strokeLinecap: 'round' }} />
          </g>

          {/* Node 4 Bottom Right */}
          <g className={`transition-opacity duration-700 ease-out delay-[2200ms] ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
            <path d="M600,300 L950,500" stroke="url(#solid-line)" strokeWidth="2" />
            <path d="M600,300 L950,500" stroke="url(#gradient-line)" strokeWidth="3" strokeDasharray="20 40" style={{ animation: 'dash-flow 12s linear infinite reverse', strokeLinecap: 'round' }} />
          </g>
        </svg>

        {/* Central Core Element */}
        <div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[140px] h-[140px] z-30 transition-all duration-[800ms] ease-[cubic-bezier(0.175,0.885,0.32,1.275)] ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
        >
          <div className="w-full h-full rounded-[32px] border border-white/40 bg-gradient-to-br from-[#e324ff] via-[#b638fc] to-[#2a0845] flex items-center justify-center backdrop-blur-2xl" style={{ animation: 'pulse-core 4s ease-in-out infinite' }}>
            <div className="w-[80px] h-[80px] rounded-[24px] bg-white shadow-[0_0_40px_rgba(255,255,255,1)] flex items-center justify-center -rotate-45">
              <Zap className="w-10 h-10 text-[#b638fc] drop-shadow-[0_0_10px_#e324ff] fill-current" />
            </div>
          </div>
        </div>

        {/* Floating Peripheral Nodes */}
        {/* Top Left */}
        <div className="absolute top-[5%] md:top-[10%] left-[5%] md:left-[15%] z-20" style={{ animation: 'float-1 8s ease-in-out infinite' }}>
          <div className={`transition-all duration-[800ms] ease-[cubic-bezier(0.175,0.885,0.32,1.275)] delay-[700ms] ${isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-50 translate-y-12'}`}>
            <div className="w-[200px] p-5 rounded-[24px] bg-[#161224]/80 backdrop-blur-2xl border border-white/20 shadow-[0_0_40px_rgba(182,56,252,0.3),inset_0_1px_4px_rgba(255,255,255,0.3)] flex flex-col items-center text-center group hover:scale-105 transition-transform duration-300">
              <div className="w-14 h-14 mb-4 rounded-full bg-gradient-to-r from-[#3b38fc] via-[#b438fc] to-[#fca5fc] group-hover:from-[#4542fc] group-hover:via-[#bf42fc] group-hover:to-[#fcaffc] flex items-center justify-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.5),inset_0_-2px_4px_rgba(0,0,0,0.3),0_5px_15px_rgba(182,56,252,0.4)] group-hover:shadow-[inset_0_2px_4px_rgba(255,255,255,0.6),inset_0_-2px_4px_rgba(0,0,0,0.3),0_10px_25px_rgba(182,56,252,0.6)] transition-all">
                <Brain className="w-6 h-6 text-white drop-shadow-md relative z-10" />
              </div>
              <span className="text-white font-bold text-[14px] uppercase tracking-wider mb-1.5 group-hover:text-[#e0aaff] transition-colors">Cognitive AI</span>
              <span className="text-slate-400 text-[12px] font-medium leading-[1.3]">Dynamic script analysis and synthesis.</span>
            </div>
          </div>
        </div>

        {/* Top Right */}
        <div className="absolute top-[10%] md:top-[10%] right-[5%] md:right-[15%] z-20" style={{ animation: 'float-2 7s ease-in-out infinite' }}>
          <div className={`transition-all duration-[800ms] ease-[cubic-bezier(0.175,0.885,0.32,1.275)] delay-[1300ms] ${isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-50 translate-y-12'}`}>
            <div className="w-[200px] p-5 rounded-[24px] bg-[#161224]/80 backdrop-blur-2xl border border-white/20 shadow-[0_0_40px_rgba(182,56,252,0.3),inset_0_1px_4px_rgba(255,255,255,0.3)] flex flex-col items-center text-center group hover:scale-105 transition-transform duration-300">
              <div className="w-14 h-14 mb-4 rounded-full bg-gradient-to-r from-[#3b38fc] via-[#b438fc] to-[#fca5fc] group-hover:from-[#4542fc] group-hover:via-[#bf42fc] group-hover:to-[#fcaffc] flex items-center justify-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.5),inset_0_-2px_4px_rgba(0,0,0,0.3),0_5px_15px_rgba(182,56,252,0.4)] group-hover:shadow-[inset_0_2px_4px_rgba(255,255,255,0.6),inset_0_-2px_4px_rgba(0,0,0,0.3),0_10px_25px_rgba(182,56,252,0.6)] transition-all">
                <Cpu className="w-6 h-6 text-white drop-shadow-md relative z-10" />
              </div>
              <span className="text-white font-bold text-[14px] uppercase tracking-wider mb-1.5 group-hover:text-[#e0aaff] transition-colors">GPU Cluster</span>
              <span className="text-slate-400 text-[12px] font-medium leading-[1.3]">Sub-second 4K video rendering.</span>
            </div>
          </div>
        </div>

        {/* Bottom Left */}
        <div className="absolute top-[70%] md:top-[75%] left-[2%] md:left-[12%] z-20" style={{ animation: 'float-2 9s ease-in-out infinite' }}>
          <div className={`transition-all duration-[800ms] ease-[cubic-bezier(0.175,0.885,0.32,1.275)] delay-[1900ms] ${isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-50 translate-y-12'}`}>
            <div className="w-[200px] p-5 rounded-[24px] bg-[#161224]/80 backdrop-blur-2xl border border-white/20 shadow-[0_0_40px_rgba(182,56,252,0.3),inset_0_1px_4px_rgba(255,255,255,0.3)] flex flex-col items-center text-center group hover:scale-105 transition-transform duration-300">
              <div className="w-14 h-14 mb-4 rounded-full bg-gradient-to-r from-[#3b38fc] via-[#b438fc] to-[#fca5fc] group-hover:from-[#4542fc] group-hover:via-[#bf42fc] group-hover:to-[#fcaffc] flex items-center justify-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.5),inset_0_-2px_4px_rgba(0,0,0,0.3),0_5px_15px_rgba(182,56,252,0.4)] group-hover:shadow-[inset_0_2px_4px_rgba(255,255,255,0.6),inset_0_-2px_4px_rgba(0,0,0,0.3),0_10px_25px_rgba(182,56,252,0.6)] transition-all">
                <Mic className="w-6 h-6 text-white drop-shadow-md relative z-10" />
              </div>
              <span className="text-white font-bold text-[14px] uppercase tracking-wider mb-1.5 group-hover:text-[#e0aaff] transition-colors">Neural Audio</span>
              <span className="text-slate-400 text-[12px] font-medium leading-[1.3]">Perfect multi-lingual sync & dubs.</span>
            </div>
          </div>
        </div>

        {/* Bottom Right */}
        <div className="absolute top-[65%] md:top-[75%] right-[2%] md:right-[12%] z-20" style={{ animation: 'float-1 10s ease-in-out infinite' }}>
          <div className={`transition-all duration-[800ms] ease-[cubic-bezier(0.175,0.885,0.32,1.275)] delay-[2500ms] ${isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-50 translate-y-12'}`}>
            <div className="w-[200px] p-5 rounded-[24px] bg-[#161224]/80 backdrop-blur-2xl border border-white/20 shadow-[0_0_40px_rgba(182,56,252,0.3),inset_0_1px_4px_rgba(255,255,255,0.3)] flex flex-col items-center text-center group hover:scale-105 transition-transform duration-300">
              <div className="w-14 h-14 mb-4 rounded-full bg-gradient-to-r from-[#3b38fc] via-[#b438fc] to-[#fca5fc] group-hover:from-[#4542fc] group-hover:via-[#bf42fc] group-hover:to-[#fcaffc] flex items-center justify-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.5),inset_0_-2px_4px_rgba(0,0,0,0.3),0_5px_15px_rgba(182,56,252,0.4)] group-hover:shadow-[inset_0_2px_4px_rgba(255,255,255,0.6),inset_0_-2px_4px_rgba(0,0,0,0.3),0_10px_25px_rgba(182,56,252,0.6)] transition-all">
                <Rocket className="w-6 h-6 text-white drop-shadow-md relative z-10" />
              </div>
              <span className="text-white font-bold text-[14px] uppercase tracking-wider mb-1.5 group-hover:text-[#e0aaff] transition-colors">Auto-Publish</span>
              <span className="text-slate-400 text-[12px] font-medium leading-[1.3]">Algorithmic multi-platform delivery.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Massive Call to Action */}
      <div className={`w-full relative py-20 mt-10 md:mt-20 flex flex-col items-center text-center z-20 px-4 transition-all duration-[1000ms] delay-[3000ms] ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-16'}`}>
        <h3 className="text-4xl md:text-[50px] font-bold text-white mb-8 tracking-[-0.02em] font-sans drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">
          Experience the new standard.
        </h3>
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <Link to="/auth">
            <Button className="relative bg-gradient-to-r from-[#3b38fc] via-[#b438fc] to-[#fca5fc] hover:from-[#4542fc] hover:via-[#bf42fc] hover:to-[#fcaffc] text-white font-bold rounded-full px-10 h-[60px] text-[16px] shadow-[inset_0_2px_4px_rgba(255,255,255,0.5),inset_0_-2px_4px_rgba(0,0,0,0.3),0_5px_15px_rgba(0,0,0,0.4)] transition-all border-none hover:scale-[1.05]">
              <Sparkles className="mr-2 w-5 h-5" />
              Start your 14-day free trial
            </Button>
          </Link>
          <Link to="/auth">
            <Button variant="outline" className="bg-[#161224]/50 backdrop-blur-xl border border-white/30 text-white hover:bg-white/10 font-medium rounded-full px-8 h-[60px] text-[16px] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2),0_5px_15px_rgba(0,0,0,0.5)] transition-all hover:scale-[1.05]">
              See Pricing <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
