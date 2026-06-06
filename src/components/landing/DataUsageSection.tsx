import { Shield, Eye, Database, Lock, Trash2, FileCheck } from "lucide-react";
import { Link } from "react-router-dom";

const dataItems = [
  {
    icon: Eye,
    title: "YouTube Data Access",
    description: "We request access to your YouTube channel to enable direct video uploads and analyze your existing content. We only access data you explicitly authorize."
  },
  {
    icon: Database,
    title: "Secure Processing",
    description: "Your uploaded videos are processed on private, secure servers to generate transcripts and voice-overs. They are deleted immediately post-render."
  },
  {
    icon: Lock,
    title: "Enterprise Auth",
    description: "Integrating seamlessly via OAuth 2.0. We never see or store your Google password, and you retain absolute control over API revoking."
  },
  {
    icon: FileCheck,
    title: "Private AI Training",
    description: "When providing scripts for clone synthesis, data is isolated specifically for your account. We never pool user data for shared AI models."
  },
  {
    icon: Trash2,
    title: "Instant Deletion",
    description: "You hold the keys. Delete all your data, projects, and custom voice models directly from your dashboard with zero retention."
  },
  {
    icon: Shield,
    title: "Zero Data Sharing",
    description: "Your intellectual property remains yours. We never aggregate, sell, or share your proprietary content architectures with third parties."
  }
];

const DataUsageSection = () => {
  return (
    <section id="data-usage" className="py-32 relative font-sans border-t border-white/5 bg-[#0c0916] overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#3b38fc]/5 rounded-full blur-[200px] mix-blend-screen pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-24">
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-white/10 bg-[#161224]/80 text-[#c28aff] text-[13px] font-medium mb-6 shadow-[inset_0_1px_2px_rgba(255,255,255,0.1)] backdrop-blur-xl">
            <Shield className="w-4 h-4 fill-current opacity-80" />
            <span className="tracking-wide">Enterprise Security</span>
          </div>
          <h2 className="text-4xl md:text-[56px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-[#a65cd6] mb-6 leading-[1.1] tracking-[-0.02em]">
            How We Protect You
          </h2>
          <p className="text-lg md:text-xl text-slate-400/90 max-w-2xl mx-auto font-medium">
            Absolute transparency regarding data collection, usage, and algorithmic protection.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
          {dataItems.map((item) => (
            <div
              key={item.title}
              className="group relative p-8 rounded-[24px] bg-[#161224]/50 backdrop-blur-xl border border-white/5 hover:border-white/10 transition-all duration-500 hover:-translate-y-1 overflow-hidden"
            >
              {/* Internal abstract glowing ring on hover */}
              <div className="absolute -left-12 -bottom-12 w-40 h-40 bg-[#9638fc]/0 group-hover:bg-[#9638fc]/10 rounded-full blur-3xl transition-all duration-700" />

              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#2a1d45] to-[#12072b] border border-white/10 flex items-center justify-center mb-6 shadow-[inset_0_1px_2px_rgba(255,255,255,0.1)] group-hover:scale-110 transition-transform duration-500">
                  <item.icon className="w-5 h-5 text-[#e0aaff]" />
                </div>
                <h3 className="text-[20px] font-semibold text-white mb-3 group-hover:text-[#e0aaff] transition-colors">
                  {item.title}
                </h3>
                <p className="text-slate-400 text-[15px] leading-[1.6]">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center relative z-10 max-w-2xl mx-auto p-8 rounded-[24px] bg-[#161224]/30 border border-white/5 backdrop-blur-md">
          <p className="text-slate-400 font-medium mb-4">
            For uncompromised details on our security architecture, please review our
          </p>
          <Link
            to="/privacy-policy"
            className="inline-flex items-center gap-2 text-[#e0aaff] hover:text-white font-semibold transition-colors bg-white/5 px-6 py-3 rounded-full border border-white/10 hover:bg-white/10 shadow-[inner_0_1px_1px_rgba(255,255,255,0.1)]"
          >
            <Shield className="w-4 h-4" />
            Official Privacy Policy
          </Link>
        </div>
      </div>
    </section>
  );
};

export default DataUsageSection;
