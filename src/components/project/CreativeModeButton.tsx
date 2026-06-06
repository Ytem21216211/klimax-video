import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Rocket, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreativeModeButtonProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

export function CreativeModeButton({ enabled, onToggle, disabled }: CreativeModeButtonProps) {
  const [isActivating, setIsActivating] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Preload the activation sound
  useEffect(() => {
    audioRef.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3");
    audioRef.current.volume = 0.5;
  }, []);

  const handleActivate = async () => {
    if (disabled || isActivating) return;

    if (enabled) {
      // Deactivate - simple toggle
      onToggle(false);
      return;
    }

    // Start activation sequence
    setIsActivating(true);
    setShowOverlay(true);

    // Play sound effect
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }

    // Wait for rocket animation to complete (longer duration)
    await new Promise((resolve) => setTimeout(resolve, 3500));

    // Enable creative mode
    onToggle(true);
    
    // Hide overlay after showing message (longer to enjoy the moment)
    await new Promise((resolve) => setTimeout(resolve, 2500));
    setShowOverlay(false);
    setIsActivating(false);
  };

  return (
    <>
      {/* The Button */}
      <Button
        variant="outline"
        onClick={handleActivate}
        disabled={disabled || isActivating}
        className={cn(
          "relative overflow-hidden border-2 transition-all duration-500",
          enabled
            ? "border-transparent bg-gradient-to-r from-red-500 via-purple-500 to-cyan-500 text-white hover:opacity-90"
            : "border-border/50 hover:border-purple-500/50 hover:bg-purple-500/10",
          "group"
        )}
      >
        {/* RGB animated border when not enabled */}
        {!enabled && (
          <div className="absolute inset-0 -z-10 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div
              className="absolute inset-[-2px] rounded-md animate-rgb-border"
              style={{
                background: "linear-gradient(90deg, #ff0000, #ff8800, #ffff00, #00ff00, #00ffff, #0088ff, #ff00ff, #ff0000)",
                backgroundSize: "400% 100%",
              }}
            />
          </div>
        )}

        {/* Inner content */}
        <div className="relative z-10 flex items-center gap-2">
          {isActivating ? (
            <Rocket className="w-4 h-4 animate-bounce" />
          ) : enabled ? (
            <Sparkles className="w-4 h-4 animate-pulse" />
          ) : (
            <Rocket className="w-4 h-4 group-hover:animate-pulse" />
          )}
          <span className={cn(
            "font-semibold",
            enabled && "bg-gradient-to-r from-white via-yellow-200 to-white bg-clip-text"
          )}>
            {enabled ? "Creative Mode" : "Creative Mode"}
          </span>
        </div>

        {/* RGB shimmer effect when enabled */}
        {enabled && (
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
              backgroundSize: "200% 100%",
              animation: "shimmer-effect 2s ease-in-out infinite",
            }}
          />
        )}
      </Button>

      {/* Full-screen activation overlay - Portal to body to escape any parent constraints */}
      {showOverlay && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          {/* Dark overlay that dims the ENTIRE website */}
          <div 
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            style={{ 
              animation: "overlay-fade-in 0.5s ease-out forwards",
            }}
          />

          {/* Rocket launch effect */}
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            {/* Particle trail behind rocket */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8">
              {[...Array(30)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-3 h-3 rounded-full"
                  style={{
                    background: `hsl(${i * 12}, 100%, 60%)`,
                    bottom: `${-10 + i * 4}%`,
                    left: `${Math.random() * 100}%`,
                    animation: `rocket-particle 2s ease-out ${i * 0.04}s forwards`,
                    opacity: 0,
                    boxShadow: `0 0 10px hsl(${i * 12}, 100%, 60%)`,
                  }}
                />
              ))}
            </div>

            {/* Central rocket */}
            <div
              className="relative z-10"
              style={{
                animation: "rocket-launch 2s cubic-bezier(0.4, 0, 0.2, 1) forwards",
              }}
            >
              <Rocket className="w-32 h-32 text-primary rotate-[-45deg] drop-shadow-[0_0_50px_rgba(34,197,94,0.9)]" />
              {/* Rocket glow */}
              <div
                className="absolute inset-0 rounded-full blur-2xl"
                style={{
                  background: "radial-gradient(circle, rgba(34,197,94,0.8) 0%, transparent 70%)",
                  animation: "pulse-glow 0.25s ease-in-out infinite alternate",
                }}
              />
            </div>

            {/* Multiple burst rings */}
            {[0, 0.2, 0.4].map((delay, i) => (
              <div
                key={i}
                className="absolute w-[800px] h-[800px] rounded-full"
                style={{
                  background: `radial-gradient(circle, rgba(168,85,247,${0.4 - i * 0.1}) 0%, rgba(59,130,246,${0.3 - i * 0.08}) 40%, transparent 70%)`,
                  animation: `burst-expand 1.5s ease-out ${0.8 + delay}s forwards`,
                  opacity: 0,
                  transform: "scale(0)",
                }}
              />
            ))}
          </div>

          {/* "Creative Mode Activated" text - Professional SaaS style */}
          <div
            className="relative z-20 text-center px-8"
            style={{
              animation: "text-appear 0.8s ease-out 2s forwards",
              opacity: 0,
            }}
          >
            {/* Subtle top accent line */}
            <div 
              className="mx-auto mb-6 h-[2px] w-16 rounded-full"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(34,197,94,0.8), transparent)",
              }}
            />
            
            <h2
              className="text-4xl md:text-6xl font-semibold tracking-tight"
              style={{
                background: "linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,0.7) 100%)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                color: "transparent",
                letterSpacing: "-0.02em",
              }}
            >
              Creative Mode
            </h2>
            
            {/* Status badge */}
            <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span 
                className="text-sm font-medium tracking-wide uppercase"
                style={{ color: "rgba(34,197,94,0.9)" }}
              >
                Activated
              </span>
            </div>
            
            {/* Subtle bottom text */}
            <p
              className="mt-6 text-sm text-white/50 font-light tracking-wide"
            >
              Advanced AI editing features enabled
            </p>
          </div>

          {/* Inject keyframes into the portal */}
          <style>{`
            @keyframes overlay-fade-in {
              0% { opacity: 0; }
              100% { opacity: 1; }
            }
            @keyframes rocket-launch {
              0% { transform: translateY(100vh) scale(0.5); opacity: 0; }
              25% { opacity: 1; }
              60% { transform: translateY(0) scale(1.1); opacity: 1; }
              100% { transform: translateY(-150vh) scale(0.4); opacity: 0; }
            }
            @keyframes rocket-particle {
              0% { transform: translateY(100vh) scale(0); opacity: 0; }
              15% { opacity: 1; }
              100% { transform: translateY(-100vh) scale(2.5); opacity: 0; }
            }
            @keyframes burst-expand {
              0% { transform: scale(0); opacity: 0.9; }
              100% { transform: scale(4); opacity: 0; }
            }
            @keyframes text-appear {
              0% { opacity: 0; transform: scale(0.7) translateY(30px); }
              60% { transform: scale(1.05) translateY(0); }
              100% { opacity: 1; transform: scale(1) translateY(0); }
            }
            @keyframes glow-pulse {
              0% { filter: drop-shadow(0 0 15px rgba(34,197,94,0.7)); }
              100% { filter: drop-shadow(0 0 40px rgba(34,197,94,1)); }
            }
          `}</style>
        </div>,
        document.body
      )}

      <style>{`
        @keyframes overlay-fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }

        @keyframes shimmer-effect {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @keyframes rocket-launch {
          0% {
            transform: translateY(100vh) scale(0.5);
            opacity: 0;
          }
          25% {
            opacity: 1;
          }
          60% {
            transform: translateY(0) scale(1.1);
            opacity: 1;
          }
          100% {
            transform: translateY(-150vh) scale(0.4);
            opacity: 0;
          }
        }

        @keyframes rocket-particle {
          0% {
            transform: translateY(100vh) scale(0);
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          100% {
            transform: translateY(-100vh) scale(2.5);
            opacity: 0;
          }
        }

        @keyframes burst-expand {
          0% {
            transform: scale(0);
            opacity: 0.9;
          }
          100% {
            transform: scale(4);
            opacity: 0;
          }
        }

        @keyframes text-appear {
          0% {
            opacity: 0;
            transform: scale(0.7) translateY(30px);
          }
          60% {
            transform: scale(1.05) translateY(0);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes glow-pulse {
          0% {
            filter: drop-shadow(0 0 15px rgba(34,197,94,0.7));
          }
          100% {
            filter: drop-shadow(0 0 40px rgba(34,197,94,1));
          }
        }

        @keyframes animate-rgb-border {
          0% { background-position: 0% 50%; }
          100% { background-position: 400% 50%; }
        }

        .animate-rgb-border {
          animation: animate-rgb-border 3s linear infinite;
        }
      `}</style>
    </>
  );
}
