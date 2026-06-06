import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LabModeButtonProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

export function LabModeButton({ enabled, onToggle, disabled }: LabModeButtonProps) {
  const [isActivating, setIsActivating] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<'shake' | 'transform' | 'complete'>('shake');
  const shakeAudioRef = useRef<HTMLAudioElement | null>(null);
  const successAudioRef = useRef<HTMLAudioElement | null>(null);

  // Preload sound effects
  useEffect(() => {
    // Short bubbling sound
    shakeAudioRef.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3");
    shakeAudioRef.current.volume = 0.3;
    // Soft success chime
    successAudioRef.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3");
    successAudioRef.current.volume = 0.4;
  }, []);

  const handleActivate = async () => {
    if (disabled || isActivating) return;

    if (enabled) {
      onToggle(false);
      return;
    }

    setIsActivating(true);
    setShowOverlay(true);
    setAnimationPhase('shake');

    // Play shake sound
    if (shakeAudioRef.current) {
      shakeAudioRef.current.currentTime = 0;
      shakeAudioRef.current.play().catch(() => {});
    }

    // Shake phase
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    // Stop shake sound
    if (shakeAudioRef.current) {
      shakeAudioRef.current.pause();
      shakeAudioRef.current.currentTime = 0;
    }
    
    // Transform phase - liquid becomes RGB
    setAnimationPhase('transform');

    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Complete phase - show text + play success sound
    setAnimationPhase('complete');
    if (successAudioRef.current) {
      successAudioRef.current.currentTime = 0;
      successAudioRef.current.play().catch(() => {});
    }
    onToggle(true);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    setShowOverlay(false);
    setIsActivating(false);
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={handleActivate}
        disabled={disabled || isActivating}
        className={cn(
          "relative overflow-hidden border-2 transition-all duration-500",
          enabled
            ? "border-transparent bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 text-white hover:opacity-90"
            : "border-border/50 hover:border-purple-500/50 hover:bg-purple-500/10",
          "group"
        )}
      >
        {/* RGB animated border when not enabled */}
        {!enabled && (
          <div className="absolute inset-0 -z-10 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div
              className="absolute inset-[-2px] rounded-md"
              style={{
                background: "linear-gradient(90deg, #a855f7, #ec4899, #06b6d4, #a855f7)",
                backgroundSize: "400% 100%",
                animation: "lab-rgb-border 3s linear infinite",
              }}
            />
          </div>
        )}

        {/* Inner content */}
        <div className="relative z-10 flex items-center gap-2">
          {isActivating ? (
            <FlaskConical className="w-4 h-4 animate-bounce" />
          ) : enabled ? (
            <FlaskConical className="w-4 h-4 animate-pulse" />
          ) : (
            <FlaskConical className="w-4 h-4 group-hover:animate-pulse" />
          )}
          <span className={cn(
            "font-semibold",
            enabled && "bg-gradient-to-r from-white via-purple-200 to-white bg-clip-text"
          )}>
            {enabled ? "AI Lab Active" : "Enable AI Lab"}
          </span>
        </div>

        {/* RGB shimmer effect when enabled */}
        {enabled && (
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
              backgroundSize: "200% 100%",
              animation: "lab-shimmer 2s ease-in-out infinite",
            }}
          />
        )}
      </Button>

      {/* Full-screen activation overlay */}
      {showOverlay && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          {/* Dark overlay */}
          <div 
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
            style={{ animation: "lab-overlay-fade-in 0.5s ease-out forwards" }}
          />

          {/* Flask Container */}
          <div className="relative z-10 flex flex-col items-center">
            {/* The Flask */}
            <div
              className={cn(
                "relative",
                animationPhase === 'shake' && "animate-[lab-flask-shake_0.1s_ease-in-out_infinite]"
              )}
              style={{
                animation: animationPhase === 'shake' 
                  ? "lab-flask-shake 0.1s ease-in-out infinite"
                  : animationPhase === 'transform'
                  ? "lab-flask-glow 0.5s ease-out forwards"
                  : undefined,
              }}
            >
              {/* Flask SVG */}
              <svg 
                width="160" 
                height="200" 
                viewBox="0 0 160 200" 
                className="drop-shadow-2xl"
                style={{
                  filter: animationPhase === 'transform' || animationPhase === 'complete'
                    ? "drop-shadow(0 0 30px rgba(168, 85, 247, 0.8))"
                    : "drop-shadow(0 0 10px rgba(168, 85, 247, 0.3))",
                }}
              >
                {/* Flask outline */}
                <path
                  d="M55 10 L55 70 L20 160 Q15 175 30 185 L130 185 Q145 175 140 160 L105 70 L105 10 Z"
                  fill="none"
                  stroke="rgba(255,255,255,0.6)"
                  strokeWidth="3"
                  className="transition-all duration-500"
                />
                {/* Flask neck */}
                <rect x="52" y="5" width="56" height="15" rx="3" fill="rgba(255,255,255,0.4)" />
                
                {/* Liquid */}
                <defs>
                  <clipPath id="flaskClip">
                    <path d="M58 72 L25 155 Q22 168 32 178 L128 178 Q138 168 135 155 L102 72 Z" />
                  </clipPath>
                  {animationPhase !== 'shake' && (
                    <linearGradient id="rgbGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#a855f7">
                        <animate attributeName="stop-color" values="#a855f7;#ec4899;#06b6d4;#a855f7" dur="2s" repeatCount="indefinite" />
                      </stop>
                      <stop offset="50%" stopColor="#ec4899">
                        <animate attributeName="stop-color" values="#ec4899;#06b6d4;#a855f7;#ec4899" dur="2s" repeatCount="indefinite" />
                      </stop>
                      <stop offset="100%" stopColor="#06b6d4">
                        <animate attributeName="stop-color" values="#06b6d4;#a855f7;#ec4899;#06b6d4" dur="2s" repeatCount="indefinite" />
                      </stop>
                    </linearGradient>
                  )}
                </defs>
                
                {/* Liquid fill */}
                <g clipPath="url(#flaskClip)">
                  <rect
                    x="20"
                    y="90"
                    width="120"
                    height="100"
                    fill={animationPhase === 'shake' ? "rgba(168, 85, 247, 0.6)" : "url(#rgbGradient)"}
                    className="transition-all duration-700"
                  >
                    {animationPhase === 'shake' && (
                      <animate attributeName="y" values="90;85;95;90" dur="0.2s" repeatCount="indefinite" />
                    )}
                  </rect>
                  
                  {/* Bubbles */}
                  {animationPhase === 'shake' && (
                    <>
                      <circle cx="50" cy="140" r="4" fill="rgba(255,255,255,0.5)">
                        <animate attributeName="cy" values="140;100;140" dur="0.8s" repeatCount="indefinite" />
                      </circle>
                      <circle cx="80" cy="150" r="3" fill="rgba(255,255,255,0.4)">
                        <animate attributeName="cy" values="150;110;150" dur="0.6s" repeatCount="indefinite" />
                      </circle>
                      <circle cx="110" cy="145" r="5" fill="rgba(255,255,255,0.3)">
                        <animate attributeName="cy" values="145;105;145" dur="0.7s" repeatCount="indefinite" />
                      </circle>
                    </>
                  )}
                </g>
              </svg>

              {/* Glow rings on transform */}
              {(animationPhase === 'transform' || animationPhase === 'complete') && (
                <>
                  {[0, 0.2, 0.4].map((delay, i) => (
                    <div
                      key={i}
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full"
                      style={{
                        background: `radial-gradient(circle, rgba(168,85,247,${0.4 - i * 0.1}) 0%, rgba(236,72,153,${0.3 - i * 0.08}) 40%, transparent 70%)`,
                        animation: `lab-burst-expand 1.2s ease-out ${delay}s forwards`,
                        opacity: 0,
                        transform: "scale(0)",
                      }}
                    />
                  ))}
                </>
              )}
            </div>

            {/* Activation Text */}
            {animationPhase === 'complete' && (
              <div
                className="mt-12 text-center"
                style={{
                  animation: "lab-text-appear 0.8s ease-out forwards",
                }}
              >
                {/* Accent line */}
                <div 
                  className="mx-auto mb-6 h-[2px] w-16 rounded-full"
                  style={{
                    background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.8), transparent)",
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
                  AI Lab
                </h2>
                
                {/* Status badge */}
                <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-purple-500/30 bg-purple-500/10">
                  <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                  <span 
                    className="text-sm font-medium tracking-wide uppercase"
                    style={{ color: "rgba(168,85,247,0.9)" }}
                  >
                    Enabled
                  </span>
                </div>
                
                <p className="mt-6 text-sm text-white/50 font-light tracking-wide">
                  Autonomous experimentation active
                </p>
              </div>
            )}
          </div>

          {/* Keyframes for portal */}
          <style>{`
            @keyframes lab-overlay-fade-in {
              0% { opacity: 0; }
              100% { opacity: 1; }
            }
            @keyframes lab-flask-shake {
              0%, 100% { transform: translateX(0) rotate(0deg); }
              25% { transform: translateX(-5px) rotate(-3deg); }
              75% { transform: translateX(5px) rotate(3deg); }
            }
            @keyframes lab-flask-glow {
              0% { filter: drop-shadow(0 0 10px rgba(168, 85, 247, 0.3)); }
              100% { filter: drop-shadow(0 0 40px rgba(168, 85, 247, 0.9)); }
            }
            @keyframes lab-burst-expand {
              0% { transform: translate(-50%, -50%) scale(0); opacity: 0.9; }
              100% { transform: translate(-50%, -50%) scale(3); opacity: 0; }
            }
            @keyframes lab-text-appear {
              0% { opacity: 0; transform: scale(0.7) translateY(30px); }
              60% { transform: scale(1.05) translateY(0); }
              100% { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
        </div>,
        document.body
      )}

      {/* Button keyframes */}
      <style>{`
        @keyframes lab-rgb-border {
          0% { background-position: 0% 50%; }
          100% { background-position: 400% 50%; }
        }
        @keyframes lab-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </>
  );
}
