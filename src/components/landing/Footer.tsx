import { Link } from "react-router-dom";
import { Github, Twitter, Instagram, Youtube, Mail } from "lucide-react";
import logo from "@/assets/logo.png";

const Footer = () => {
  return (
    <footer className="bg-[#0c0916] border-t border-white/5 py-16 md:py-24 relative overflow-hidden font-sans">
      {/* Decorative gradient */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#b638fc]/30 to-transparent" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-[#6813d4]/5 rounded-full blur-[150px] mix-blend-screen pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8 mb-16">
          {/* Brand Column */}
          <div className="col-span-1 md:col-span-2 space-y-6">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="relative flex items-center justify-center p-1.5 bg-gradient-to-br from-[#2a1d45] to-[#12072b] rounded-xl border border-white/10 shadow-[inner_0_1px_1px_rgba(255,255,255,0.1)] group-hover:shadow-[0_0_15px_rgba(182,56,252,0.4)] transition-shadow duration-500">
                <img src={logo} alt="MineCaption Logo" className="w-8 h-8 rounded-lg" />
              </div>
              <span className="text-[16px] font-semibold text-white tracking-[0.1em] uppercase shadow-sm">MineCaption</span>
            </Link>
            <p className="text-slate-400 max-w-sm leading-[1.7] text-[15px]">
              The premium AI-powered video editing architecture designed specifically for high-retention content creation.
              Automate your workflow at hyperspeed.
            </p>
            <div className="flex items-center gap-4 pt-4">
              <a href="#" className="p-2.5 rounded-full bg-white/5 border border-white/5 hover:bg-[#b638fc]/20 hover:border-[#b638fc]/50 text-slate-400 hover:text-white transition-all shadow-lg hover:shadow-[0_0_15px_rgba(182,56,252,0.4)]">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="p-2.5 rounded-full bg-white/5 border border-white/5 hover:bg-[#e324ff]/20 hover:border-[#e324ff]/50 text-slate-400 hover:text-white transition-all shadow-lg hover:shadow-[0_0_15px_rgba(227,36,255,0.4)]">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="#" className="p-2.5 rounded-full bg-white/5 border border-white/5 hover:bg-[#ff73ff]/20 hover:border-[#ff73ff]/50 text-slate-400 hover:text-white transition-all shadow-lg hover:shadow-[0_0_15px_rgba(255,115,255,0.4)]">
                <Youtube className="w-5 h-5" />
              </a>
              <a href="#" className="p-2.5 rounded-full bg-white/5 border border-white/5 hover:bg-[#9638fc]/20 hover:border-[#9638fc]/50 text-slate-400 hover:text-white transition-all shadow-lg hover:shadow-[0_0_15px_rgba(150,56,252,0.4)]">
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Links Column 1 */}
          <div>
            <h4 className="font-semibold text-white mb-6 tracking-wide">Platform</h4>
            <ul className="space-y-4 text-[15px]">
              <li>
                <button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} className="text-slate-400 hover:text-white transition-colors hover:translate-x-1 inline-block duration-300">
                  Features
                </button>
              </li>
              <li>
                <button onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} className="text-slate-400 hover:text-white transition-colors hover:translate-x-1 inline-block duration-300">
                  How It Works
                </button>
              </li>
              <li>
                <Link to="/pricing" className="text-slate-400 hover:text-white transition-colors hover:translate-x-1 inline-block duration-300">
                  Pricing
                </Link>
              </li>
              <li>
                <Link to="/auth" className="text-slate-400 hover:text-white transition-colors hover:translate-x-1 inline-block duration-300">
                  Login
                </Link>
              </li>
            </ul>
          </div>

          {/* Links Column 2 */}
          <div>
            <h4 className="font-semibold text-white mb-6 tracking-wide">Legal</h4>
            <ul className="space-y-4 text-[15px]">
              <li>
                <Link to="/privacy-policy" className="text-slate-400 hover:text-white transition-colors hover:translate-x-1 inline-block duration-300">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="text-slate-400 hover:text-white transition-colors hover:translate-x-1 inline-block duration-300">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/cookies" className="text-slate-400 hover:text-white transition-colors hover:translate-x-1 inline-block duration-300">
                  Cookie Policy
                </Link>
              </li>
              <li>
                <a href="mailto:support@minecaption.com" className="flex items-center gap-2 text-slate-400 hover:text-[#e0aaff] transition-colors hover:translate-x-1 inline-block duration-300">
                  <span className="flex items-center"><Mail className="w-4 h-4 mr-2" /> Support</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 text-[14px] text-slate-500">
          <p>© 2026 MineCaption AI. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <span className="flex items-center">Made with <span className="text-[#fca5fc] mx-1">❤️</span> for Creators</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
