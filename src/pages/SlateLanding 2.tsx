import * as React from 'react';
const { useState, useEffect } = React;

import { 
  ChevronRight, 
  Layers, 
  Zap, 
  BarChart3, 
  Users, 
  Shield, 
  Globe, 
  Clock, 
  MessageSquare,
  Activity,
  CheckCircle2,
  Lock,
  Cpu
} from 'lucide-react';
import SplitText from '@/components/slate/SplitText';
import VideoBackground from '@/components/slate/VideoBackground';
import GlassCard from '@/components/slate/GlassCard';

const SlateLanding: React.FC = () => {
  const [activeTestimonial, setActiveTestimonial] = useState(0);

  useEffect(() => {
    document.body.classList.add('slate-body');
    return () => {
      document.body.classList.remove('slate-body');
    };
  }, []);

  return (
    <div className="relative min-h-screen selection:bg-white selection:text-black">
      {/* 1. Navbar */}
      <nav className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-6 lg:px-10 py-4 lg:py-5">
        <div className="flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 256 256 L 128 256 L 0 128 L 128 128 Z M 256 128 L 128 128 L 0 0 L 128 0 Z" fill="white" />
          </svg>
          <span className="text-xl tracking-tight font-medium">Climax video</span>
        </div>
        
        <div className="hidden md:flex items-center gap-8">
          <a href="#" className="text-sm opacity-60 hover:opacity-100 transition-opacity">Product</a>
          <a href="#" className="text-sm opacity-60 hover:opacity-100 transition-opacity">Solutions</a>
          <a href="#" className="text-sm opacity-60 hover:opacity-100 transition-opacity">Enterprise</a>
          <a href="#" className="text-sm opacity-60 hover:opacity-100 transition-opacity">Pricing</a>
        </div>

        <a href="/auth" className="liquid-glass rounded-full px-5 py-2 text-sm font-medium hover:bg-white/10 transition-colors">
          Start today
        </a>
      </nav>

      {/* 2. Hero Section */}
      <section className="relative min-h-screen flex items-center pt-20">
        <VideoBackground 
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260502_134830_926d2233-a9a6-45e9-aaa2-28ef8beecb24.mp4" 
          flip={true}
          className="z-0"
        />
        
        <div className="slate-container px-6 z-10">
          <div className="max-w-2xl text-left flex flex-col items-start">
            <div className="liquid-glass rounded-full px-4 py-1.5 text-xs font-medium mb-8 hero-fade-up">
              AI edits for Climax mobile
            </div>
            
            <SplitText 
              text="Turn every clip <br /> into a moment." 
              className="text-6xl md:text-8xl font-semibold mb-6"
              style={{ textShadow: '0 2px 20px rgba(0,0,0,0.3)' }}
            />
            
            <p className="text-lg text-white/60 mb-10 hero-fade-up" style={{ animationDelay: '0.4s' }}>
              A black and white AI video studio for Climax: hooks, subtitles, B-rolls, music, SFX, and manual control before full automation.
            </p>
            
            <div className="flex flex-wrap gap-4 hero-fade-up" style={{ animationDelay: '0.6s' }}>
              <a href="/auth" className="bg-white text-black px-8 py-4 rounded-xl font-semibold text-lg hover:bg-white/90 transition-colors inline-block">
                Get Started
              </a>
              <button className="liquid-glass px-8 py-4 rounded-xl font-semibold text-lg hover:bg-white/5 transition-colors">
                View Demo
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. "How We Keep You Ahead" Section */}
      <section className="slate-section">
        <div className="slate-container">
          <div className="slate-header text-center flex flex-col items-center">
            <h1 className="hero-fade-up">Design every edit.</h1>
            <p className="hero-fade-up">Built for repeatable short-form videos that feel different every time.</p>
          </div>
          
          <div className="slate-cards">
            <GlassCard 
              theme="orange"
              icon={<Zap />}
              title="AI Cinematic Director"
              description="Automatically orchestrate zooms, pans, and SFX with frame-perfect timing."
            />
            <GlassCard 
              theme="blue"
              icon={<BarChart3 />}
              title="Viral Framing"
              description="AI-driven face tracking and scene centering that guarantees viewer focus."
            />
            <GlassCard 
              theme="green"
              icon={<Layers />}
              title="Dynamic Transitions"
              description="Seamless, creative cuts selected by AI to maintain high-energy rhythm."
            />
          </div>
        </div>
      </section>

      {/* 4. Features Section */}
      <section className="bg-black py-32">
        <div className="slate-container px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: <Shield />, title: "Creator Grade", desc: "Lossless rendering and export for maximum visual fidelity." },
              { icon: <Globe />, title: "Viral Mesh", desc: "Direct integration with TikTok, Reels, and Shorts." },
              { icon: <Clock />, title: "Instant Flow", desc: "Generate a week's worth of content in under 5 minutes." },
              { icon: <Activity />, title: "Retention Stats", desc: "Predictive metrics that tell you where viewers will drop off." }
            ].map((f, i) => (
              <div key={i} className="group relative liquid-glass p-8 rounded-3xl h-64 overflow-hidden border border-white/5 transition-all hover:scale-[1.02]">
                <VideoBackground 
                  src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260424_064411_9e9d7f84-9277-41f4-ab10-59172d89e6be.mp4"
                  className="opacity-0 group-hover:opacity-40 transition-opacity duration-700"
                />
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mb-6 border border-white/10 group-hover:border-white/30 transition-colors">
                    {f.icon}
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{f.title}</h3>
                  <p className="text-sm text-white/50">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Benefits Section */}
      <section className="bg-black py-32 border-y border-white/5">
        <div className="slate-container px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div>
              <h2 className="text-4xl font-semibold mb-8">Unleash your content's <br /> viral potential.</h2>
              <div className="space-y-6">
                {[
                  "Boost audience retention by 70% with AI cinematic cuts.",
                  "Automate repetitive subtitling with neural transcription.",
                  "Stay consistent with 1-click batch processing.",
                  "Create Climax videos that never feel copied and pasted."
                ].map((b, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <CheckCircle2 className="w-6 h-6 text-white/40 mt-1 shrink-0" />
                    <p className="text-white/70">{b}</p>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="liquid-glass rounded-[3rem] p-12 relative overflow-hidden h-[400px] flex flex-col justify-center border border-white/10">
              <VideoBackground 
                src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260422_191657_800d4e1f-7ab3-41af-90b6-9bd3039eb294.mp4"
                opacity={0.5}
                className="rounded-[3rem]"
              />
              <div className="relative z-10">
                <div className="text-7xl font-bold mb-2">94%</div>
                <div className="text-xl text-white/50">Retention Increase</div>
                <div className="mt-8 flex gap-2">
                  <div className="h-1 w-12 bg-white rounded-full"></div>
                  <div className="h-1 w-24 bg-white/20 rounded-full"></div>
                  <div className="h-1 w-16 bg-white/20 rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Testimonials Section */}
      <section className="bg-black py-32">
        <div className="slate-container px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { name: "Alex Rivera", role: "Mobile creator", text: "Climax video turns raw dialogue into edits that feel ready for TikTok." },
              { name: "Sarah Chen", role: "Viral strategist", text: "The cleanest way to control hooks, subtitles, B-rolls, and music in one place." },
              { name: "James Wilson", role: "Creative lead", text: "Manual control first, automation later. That is exactly how a serious content system should start." }
            ].map((t, i) => (
              <div 
                key={i} 
                onMouseEnter={() => setActiveTestimonial(i)}
                className="relative liquid-glass p-10 rounded-[2.5rem] min-h-[300px] flex flex-col border border-white/5 cursor-default transition-all"
              >
                <VideoBackground 
                  src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260429_111347_9cf2a2b0-2c10-475b-a132-147a046b4927.mp4"
                  opacity={activeTestimonial === i ? 0.5 : 0}
                  className="transition-opacity duration-500 rounded-[2.5rem]"
                />
                <div className="relative z-10">
                  <MessageSquare className="w-8 h-8 text-white/20 mb-6" />
                  <p className="text-xl leading-relaxed mb-10">"{t.text}"</p>
                  <div className="mt-auto">
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-sm text-white/40">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Pricing Section */}
      <section className="bg-black py-32">
        <div className="slate-container px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              { title: "Starter", price: "$12", desc: "Perfect for early Climax video workflows.", features: ["Up to 5 Active Projects", "AI Cinematic Core", "100GB Render Cache"] },
              { title: "Pro", price: "$29", desc: "Advanced features for scaling empires.", features: ["Unlimited Projects", "Full Neural AI Suite", "Unlimited Render Cache"] }
            ].map((p, i) => (
              <div key={i} className="relative liquid-glass p-16 rounded-[3rem] border border-white/10 overflow-hidden flex flex-col">
                <VideoBackground 
                  src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260407_043131_ebe2f0b5-9acc-4a4f-b2c1-7297f1a3beb9.mp4"
                  opacity={0.4}
                  className="rounded-[3rem]"
                />
                <div className="relative z-10">
                  <h3 className="text-2xl font-semibold mb-2">{p.title}</h3>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-5xl font-bold">{p.price}</span>
                    <span className="text-white/40 text-lg">/mo</span>
                  </div>
                  <p className="text-white/60 mb-10 max-w-xs">{p.desc}</p>
                  <ul className="space-y-4 mb-12">
                    {p.features.map((f, fi) => (
                      <li key={fi} className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-white/30" />
                        <span className="text-sm text-white/80">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <a href="/auth" className="w-full py-4 rounded-2xl bg-white text-black font-semibold hover:bg-white/90 transition-colors text-center">
                    Upgrade to {p.title}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. Final CTA Section */}
      <section className="bg-black py-32">
        <div className="slate-container px-6">
          <div className="relative liquid-glass p-20 rounded-[4rem] text-center overflow-hidden border border-white/10">
            <VideoBackground 
              src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_171521_25968ba2-b594-4b32-aab7-f6b69398a6fa.mp4"
              className="rounded-[4rem]"
            />
            <div className="relative z-10 max-w-xl mx-auto">
              <h2 className="text-5xl font-semibold mb-8">Ready to go viral?</h2>
              <p className="text-lg text-white/60 mb-12">Build a repeatable video system for Climax.</p>
              <a href="/auth" className="bg-white text-black px-12 py-5 rounded-2xl font-bold text-xl hover:scale-105 transition-transform inline-block">
                Claim Your Workspace
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 9. Footer Section */}
      <footer className="bg-black py-20 border-t border-white/5">
        <div className="slate-container px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-12">
            <div className="col-span-2 lg:col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <svg width="22" height="22" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M 256 256 L 128 256 L 0 128 L 128 128 Z M 256 128 L 128 128 L 0 0 L 128 0 Z" fill="white" />
                </svg>
                <span className="text-xl tracking-tight font-medium">Climax video</span>
              </div>
              <p className="text-white/40 max-w-xs text-sm leading-relaxed">
                The AI video studio for Climax mobile clips, manual edits, and future automation.
              </p>
            </div>
            
            {[
              { title: "Product", links: ["Features", "Security", "Pricing", "API"] },
              { title: "Company", links: ["About", "Blog", "Careers", "News"] },
              { title: "Legal", links: ["Privacy", "Terms", "Security", "Cookies"] }
            ].map((col, i) => (
              <div key={i}>
                <h4 className="font-semibold mb-6">{col.title}</h4>
                <ul className="space-y-4">
                  {col.links.map((link, li) => (
                    <li key={li}>
                      <a href="#" className="text-sm text-white/40 hover:text-white transition-colors">{link}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          
          <div className="mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between gap-6">
            <p className="text-xs text-white/30">© 2026 Climax video. All rights reserved.</p>
            <div className="flex gap-8">
              <a href="#" className="text-xs text-white/30 hover:text-white">Twitter</a>
              <a href="#" className="text-xs text-white/30 hover:text-white">LinkedIn</a>
              <a href="#" className="text-xs text-white/30 hover:text-white">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default SlateLanding;
