import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, Play, Sparkles } from "lucide-react";

const Hero = () => {
  return (
    <section className="relative min-h-screen pt-40 pb-20 flex flex-col items-center justify-start overflow-hidden bg-[#0c0916]">

      {/* Subtle Base Background Setup */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#0c0916] via-[#100b21] to-[#12072b] opacity-80" />

      {/* Grid Pattern with perfect fade */}
      <div
        className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_70%_70%_at_50%_40%,#000_60%,transparent_100%)]"
      />

      {/* Background Thin Rings */}
      <div className="absolute top-[0%] left-[-15%] w-[800px] h-[800px] rounded-full border border-white/[0.04] pointer-events-none" />
      <div className="absolute top-[35%] right-[-10%] w-[600px] h-[600px] rounded-full border border-white/[0.04] pointer-events-none" />

      {/* Ambient background color nebulas */}
      <div className="absolute top-[10%] left-[20%] w-[600px] h-[600px] bg-[#3b38fc]/10 rounded-full blur-[150px] mix-blend-screen pointer-events-none" />
      <div className="absolute top-[20%] right-[10%] w-[500px] h-[500px] bg-[#fca5fc]/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none" />

      {/* Content Container */}
      <div className="relative z-10 container mx-auto px-4 flex flex-col items-center text-center">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-[#b87cff]/30 bg-[#251540]/40 text-white text-[13px] font-medium mb-12 shadow-[inset_0_1px_2px_rgba(255,255,255,0.15)] backdrop-blur-md hover:bg-[#251540]/60 transition-colors cursor-default">
          <Sparkles className="w-4 h-4 text-[#ffb3ff]" fill="currentColor" />
          <span>New: AI-driven workflow automation</span>
        </div>

        {/* Headline */}
        <h1 className="text-[48px] md:text-[68px] font-bold mb-6 leading-[1.1] tracking-[-0.02em] font-sans max-w-5xl mx-auto">
          <span className="text-white">Discover a </span>
          <span className="relative inline-block px-1">
            <span
              className="text-transparent bg-clip-text bg-[linear-gradient(160deg,#b638fc_10%,#e0aaff_35%,#ffffff_48%,#ffffff_55%,#b638fc_70%,#6813d4_90%)]"
            >
              new universe
            </span>
          </span>
          <span className="text-white"> of achievable goals,</span><br className="hidden md:block" />
          <span className="text-white">with the power of our super-ai</span>
        </h1>

        {/* Subheading */}
        <p className="text-slate-300/80 text-[18px] md:text-[20px] max-w-2xl mx-auto mb-10 leading-[1.6] font-normal tracking-wide">
          A powerful collaboration platform designed to keep your YouTube team aligned and producing viral content efficiently.
        </p>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-5 mb-20">
          <Link to="/auth">
            <div className="relative group">
              {/* Outer Glow */}
              <div className="absolute -inset-0.5 bg-gradient-to-r from-[#4d4dff] via-[#d64dff] to-[#ffb3ff] rounded-full blur-md opacity-60 group-hover:opacity-100 group-hover:blur-lg transition duration-500"></div>
              {/* Button */}
              <Button className="relative bg-gradient-to-r from-[#3b38fc] via-[#b438fc] to-[#fca5fc] hover:from-[#4542fc] hover:via-[#bf42fc] hover:to-[#fcaffc] text-white font-semibold rounded-full px-8 h-[52px] text-[15px] shadow-[inset_0_2px_4px_rgba(255,255,255,0.5),inset_0_-2px_4px_rgba(0,0,0,0.3),0_5px_15px_rgba(0,0,0,0.4)] transition-all border-none group-hover:scale-[1.02]">
                Start your 14-day free trial
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </Link>
          <Link to="#">
            <Button variant="outline" className="bg-[#1a122e]/60 border border-white/10 text-white hover:bg-[#1a122e] hover:text-white font-medium rounded-full px-7 h-[52px] text-[15px] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_5px_15px_rgba(0,0,0,0.3)] transition-all hover:scale-105 backdrop-blur-md">
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center mr-3 border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]">
                <Play className="w-3 h-3 ml-0.5 text-white" fill="currentColor" />
              </div>
              Watch product demo
            </Button>
          </Link>
        </div>

        {/* Stats Row */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6 mb-24 w-full">
          <div className="bg-[#120d20]/80 backdrop-blur-xl border border-white/5 rounded-[24px] px-8 py-6 flex flex-col items-center justify-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_10px_30px_rgba(0,0,0,0.5)] min-w-[200px]">
            <span className="text-[32px] font-bold text-white mb-1">50K+</span>
            <span className="text-slate-400 text-sm font-medium tracking-wide">Teams worldwide</span>
          </div>
          <div className="bg-[#120d20]/80 backdrop-blur-xl border border-white/5 rounded-[24px] px-8 py-6 flex flex-col items-center justify-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_10px_30px_rgba(0,0,0,0.5)] min-w-[200px]">
            <span className="text-[32px] font-bold text-white mb-1">99.9%</span>
            <span className="text-slate-400 text-sm font-medium tracking-wide">Reliable uptime</span>
          </div>
          <div className="bg-[#120d20]/80 backdrop-blur-xl border border-white/5 rounded-[24px] px-8 py-6 flex flex-col items-center justify-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_10px_30px_rgba(0,0,0,0.5)] min-w-[200px]">
            <span className="text-[32px] font-bold text-white mb-1">4.8/5</span>
            <span className="text-slate-400 text-sm font-medium tracking-wide">Customer satisfaction</span>
          </div>
        </div>

      </div>

      {/* Dashboard Preview Glow & Container */}
      <div className="relative w-full max-w-5xl px-4 z-20 mt-12 font-sans">

        {/* Massive Radiant Glow Source Behind Dashboard */}
        {/* Outer deep purple wide glow */}
        <div className="absolute top-[-30px] left-1/2 -translate-x-1/2 w-[110%] h-[200px] bg-[#9638fc]/50 blur-[90px] mix-blend-screen pointer-events-none rounded-[100%]" />

        {/* Intense vibrant fuchsia core glow */}
        <div className="absolute top-[-20px] left-1/2 -translate-x-1/2 w-[80%] h-[100px] bg-[#d552f7]/40 blur-[50px] mix-blend-screen pointer-events-none rounded-[100%]" />

        {/* The Dashboard App Container */}
        <div className="relative w-full aspect-[16/9] rounded-t-[32px] border border-white/20 border-b-0 bg-[#211b33]/60 backdrop-blur-2xl shadow-[0_-30px_100px_-20px_rgba(182,56,252,0.6),inset_0_1px_2px_rgba(255,255,255,0.4)] overflow-hidden flex flex-col p-[7px] pt-[7px]">

          {/* Inner dark container to match reference */}
          <div className="w-full h-full bg-[#1b172a] rounded-t-[26px] overflow-hidden flex flex-col border border-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
            {/* Dashboard Header Bar */}
            <div className="h-14 border-b border-black/40 flex items-center px-4 gap-2 bg-[#1e1930]">
              <div className="w-3 h-3 rounded-full bg-[#37314a]" />
              <div className="w-3 h-3 rounded-full bg-[#37314a]" />
              <div className="w-3 h-3 rounded-full bg-[#37314a]" />
              <div className="ml-6 flex items-center gap-2">
                <span className="text-white text-sm font-medium opacity-90">SaaS Pro</span>
                <span className="text-white/30 text-xs pl-2">Overview</span>
              </div>
            </div>
            {/* Dashboard Layout Mock */}
            <div className="flex-1 flex bg-[#1a1628]">
              {/* Sidebar */}
              <div className="w-56 border-r border-black/20 p-4 flex flex-col gap-2 bg-[#1b172a]">
                <div className="h-10 w-full bg-[#2a2440] rounded-xl border border-white/5 flex items-center px-3">
                  <div className="w-4 h-4 rounded bg-white/20 mr-3" />
                  <div className="h-2 w-16 bg-white/40 rounded" />
                </div>
                <div className="h-10 w-full hover:bg-[#2a2440]/50 rounded-xl flex items-center px-3 mt-2">
                  <div className="w-4 h-4 rounded bg-white/10 mr-3" />
                  <div className="h-2 w-20 bg-white/20 rounded" />
                </div>
                <div className="h-10 w-full hover:bg-[#2a2440]/50 rounded-xl flex items-center px-3">
                  <div className="w-4 h-4 rounded bg-white/10 mr-3" />
                  <div className="h-2 w-14 bg-white/20 rounded" />
                </div>
              </div>
              {/* Main Area */}
              <div className="flex-1 p-8 flex flex-col gap-8">
                <div>
                  <h2 className="text-white font-semibold text-xl mb-1">Overview</h2>
                  <p className="text-slate-400 text-sm">Welcome back to your dashboard</p>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-6">
                  <div className="bg-[#211c34] rounded-2xl border border-white/5 hover:border-white/10 transition-colors p-6 shadow-md flex justify-between">
                    <div>
                      <p className="text-slate-400 text-xs font-medium mb-2">Total Revenue</p>
                      <h3 className="text-white text-2xl font-semibold">$67,432</h3>
                      <p className="text-[#3b82f6] text-xs mt-2">+12.5% from last month</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-slate-400 font-serif">$</div>
                  </div>
                  <div className="bg-[#211c34] rounded-2xl border border-white/5 hover:border-white/10 transition-colors p-6 shadow-md flex justify-between">
                    <div>
                      <p className="text-slate-400 text-xs font-medium mb-2">Active Users</p>
                      <h3 className="text-white text-2xl font-semibold">16,100</h3>
                      <p className="text-[#3b82f6] text-xs mt-2">+8.3% from last month</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-slate-400">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
export default Hero
