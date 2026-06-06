import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Menu, X, ArrowRight } from "lucide-react";
import { useState } from "react";
import logo from "@/assets/logo.png";

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
    setIsMenuOpen(false);
  };

  return (
    <div className="fixed top-8 left-0 right-0 z-50 flex justify-center px-4 w-full">
      <nav className="w-full max-w-[1000px] bg-[#120d20]/80 backdrop-blur-2xl border border-white/10 rounded-[28px] pl-6 pr-2 py-2.5 flex items-center justify-between shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.05)]">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 pr-8 group">
          <div className="relative flex items-center justify-center p-1.5 bg-gradient-to-br from-[#1e1536] to-[#120d20] rounded-xl border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
            <img
              src={logo}
              alt="MineCaption Logo"
              className="w-6 h-6 object-cover rounded-md"
            />
          </div>
          <span className="text-[16px] font-semibold text-white tracking-[0.1em] uppercase shadow-sm">MineCaption</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-10 flex-1 justify-center">
          <button
            onClick={() => scrollToSection("features")}
            className="text-slate-300 hover:text-white transition-colors text-[13px] tracking-[0.03em] font-medium"
          >
            Product
          </button>
          <button
            onClick={() => scrollToSection("how-it-works")}
            className="text-slate-300 hover:text-white transition-colors text-[13px] tracking-[0.03em] font-medium"
          >
            Solutions
          </button>
          <button
            onClick={() => scrollToSection("platform")}
            className="text-slate-300 hover:text-white transition-colors text-[13px] tracking-[0.03em] font-medium"
          >
            Pricing
          </button>
          <button
            onClick={() => scrollToSection("reviews")}
            className="text-slate-300 hover:text-white transition-colors text-[13px] tracking-[0.03em] font-medium"
          >
            Resources
          </button>
        </div>

        {/* CTA Button */}
        <div className="hidden md:flex items-center">
          <Link to="/auth">
            <div className="relative group rounded-full">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-[#4d4dfc] via-[#b638fc] to-[#fca5fc] rounded-full blur-sm opacity-50 group-hover:opacity-100 transition duration-500"></div>
              <Button className="relative bg-gradient-to-r from-[#3b38fc] via-[#b438fc] to-[#fca5fc] hover:from-[#4542fc] hover:via-[#bf42fc] hover:to-[#fcaffc] text-white font-medium rounded-full px-6 h-[42px] text-sm shadow-[inset_0_2px_3px_rgba(255,255,255,0.6),inset_0_-2px_4px_rgba(0,0,0,0.3)] transition-all border-none">
                Free Trial
                <ArrowRight className="w-4 h-4 ml-1.5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="md:hidden p-2 text-slate-300 hover:text-white mr-2"
        >
          {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      {/* Mobile Menu Dropdown */}
      {isMenuOpen && (
        <div className="md:hidden absolute top-24 left-4 right-4 bg-[#120d20]/95 backdrop-blur-3xl border border-white/10 rounded-3xl p-6 shadow-2xl animate-in slide-in-from-top-4">
          <div className="flex flex-col gap-4">
            <button
              onClick={() => scrollToSection("features")}
              className="text-left text-slate-300 hover:text-white transition-colors py-2 font-medium"
            >
              Product
            </button>
            <button
              onClick={() => scrollToSection("how-it-works")}
              className="text-left text-slate-300 hover:text-white transition-colors py-2 font-medium"
            >
              Solutions
            </button>
            <button
              onClick={() => scrollToSection("platform")}
              className="text-left text-slate-300 hover:text-white transition-colors py-2 font-medium"
            >
              Pricing
            </button>
            <button
              onClick={() => scrollToSection("reviews")}
              className="text-left text-slate-300 hover:text-white transition-colors py-2 font-medium"
            >
              Resources
            </button>
            <div className="pt-4 mt-2 border-t border-white/10">
              <Link to="/auth" onClick={() => setIsMenuOpen(false)}>
                <Button className="w-full relative bg-gradient-to-r from-[#3b38fc] via-[#b438fc] to-[#fca5fc] text-white font-medium rounded-full h-[48px] shadow-[inset_0_2px_3px_rgba(255,255,255,0.6),inset_0_-2px_4px_rgba(0,0,0,0.3)] border-none">
                  Free Trial
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Navbar;
