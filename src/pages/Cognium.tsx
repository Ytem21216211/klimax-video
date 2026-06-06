import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Brain, Hand as HandIcon, Cpu, Zap, ArrowLeft, Camera, Settings,
  Activity, Shield, Search, Sparkles, RefreshCw, Power, Mic,
  MessageSquare, Volume2, Waves, Scan, Fingerprint
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

import { Hands, HAND_CONNECTIONS } from "@mediapipe/hands";
import { Camera as MediaCamera } from "@mediapipe/camera_utils";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";

export default function Cognium() {
  const navigate = useNavigate();
  const [isJarvisEnabled, setIsJarvisEnabled] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  
  const [status, setStatus] = useState<"idle" | "connecting" | "active" | "error">("idle");
  const [gesture, setGesture] = useState<string>("Initializing...");
  const [transcript, setTranscript] = useState<string[]>([]);
  const [interimTranscript, setInterimTranscript] = useState<string>("");
  const [movementIntensity, setMovementIntensity] = useState(0);
  const [voiceLevel, setVoiceLevel] = useState(0);
  
  const recognitionRef = useRef<any>(null);
  const lastLandmarksRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Speech & Audio Engine
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.onresult = (event: any) => {
          let interim = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const text = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              setTranscript(prev => [...prev.slice(-15), text]);
              setInterimTranscript("");
            } else interim += text;
          }
          setInterimTranscript(interim);
        };
        recognitionRef.current = recognition;
      }
    }
  }, []);



  // Mediapipe Neural Engine
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const HandsConstructor = (Hands as any).Hands || Hands;
        if (!HandsConstructor) return;
        const hands = new HandsConstructor({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
        hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.4, minTrackingConfidence: 0.4 });
        hands.onResults((results: any) => {
          if (!canvasRef.current || !videoRef.current) return;
          const ctx = canvasRef.current.getContext("2d");
          if (!ctx) return;
          ctx.save();
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            setGesture("Neural Sync Active");
            let totalMove = 0;
            results.multiHandLandmarks.forEach((landmarks: any, hIdx: number) => {
              if (lastLandmarksRef.current?.[hIdx]) {
                landmarks.forEach((p: any, i: number) => {
                  const lp = lastLandmarksRef.current[hIdx][i];
                  if (lp) totalMove += Math.sqrt(Math.pow(p.x-lp.x,2)+Math.pow(p.y-lp.y,2));
                });
              }
              drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: "#b638fc", lineWidth: 4 });
              drawLandmarks(ctx, landmarks, { color: "#e324ff", lineWidth: 1, radius: 3 });
            });
            setMovementIntensity(Math.min(100, totalMove * 400));
            lastLandmarksRef.current = results.multiHandLandmarks;
          } else {
            setGesture("Optic Scanning...");
            setMovementIntensity(p => Math.max(0, p - 5));
          }
          ctx.restore();
        });
        handsRef.current = hands;
      } catch (e) { console.error(e); }
    }
    return () => {
      cameraRef.current?.stop();
      handsRef.current?.close();
      recognitionRef.current?.stop();
      audioContextRef.current?.close();
    };
  }, []);

  const toggleJarvis = async (enabled: boolean) => {
    setIsJarvisEnabled(enabled);
    if (enabled) {
      setStatus("connecting");
      setGesture("Accessing Systems...");
      
      try {
        if (!videoRef.current || !handsRef.current) return;

        // 1. Check for Secure Context (Required for Media APIs)
        if (!window.isSecureContext && window.location.hostname !== "localhost") {
          throw new Error("Neural interface requires a secure (HTTPS) connection.");
        }

        // 2. Request Permissions explicitly first (More reliable on Safari/Mac)
        console.log("Requesting neural permissions...");
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 1280, height: 720 },
          audio: true 
        });
        
        // Assign stream to video element
        videoRef.current.srcObject = stream;
        
        // 3. Start Audio Engine
        if (recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (srErr) {
            console.warn("Speech recognition already active or unavailable", srErr);
          }
        }
        
        // Initialize Audio Analysis
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        analyserRef.current.fftSize = 32;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        
        const updateAudio = () => {
          if (!analyserRef.current || !isJarvisEnabled) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setVoiceLevel(avg / 1.28);
          requestAnimationFrame(updateAudio);
        };
        updateAudio();

        // 4. Initialize Mediapipe Camera
        const CameraConstructor = (MediaCamera as any).Camera || MediaCamera;
        cameraRef.current = new CameraConstructor(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current && handsRef.current) {
              await handsRef.current.send({ image: videoRef.current });
            }
          },
          width: 1280,
          height: 720
        });

        console.log("Starting neural optics...");
        await cameraRef.current.start();
        
        setStatus("active");
        setGesture("Neural Sync Active");
        toast.success("Jarvis System Online", {
          description: "Optics and Acoustic sensors synchronized.",
        });

      } catch (error: any) {
        console.error("Jarvis Neural Failure:", error);
        setStatus("error");
        setIsJarvisEnabled(false);
        setGesture("Neural Link Error");
        
        const msg = error.message || "Unknown hardware error";
        toast.error("Neural Link Failed", {
          description: error.name === "NotAllowedError" 
            ? "Permission denied. Please enable camera and mic in browser settings."
            : msg,
        });
        
        // Clean up any partially initialized streams
        if (videoRef.current?.srcObject) {
          (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
          videoRef.current.srcObject = null;
        }
      }
    } else {
      // Shutdown Logic
      console.log("Shutting down neural interface...");
      recognitionRef.current?.stop();
      cameraRef.current?.stop();
      cameraRef.current = null;
      
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
      
      audioContextRef.current?.close();
      audioContextRef.current = null;
      analyserRef.current = null;
      
      setStatus("idle");
      setGesture("Optics Offline");
      setMovementIntensity(0);
      setVoiceLevel(0);
    }
  };

  return (
    <div className="min-h-screen bg-[#0c0916] text-white selection:bg-[#b638fc]/30 overflow-hidden relative font-sans">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:100px_100px] opacity-20" />
        <div className="absolute top-[-10%] left-[20%] w-[1200px] h-[1200px] bg-[#3b38fc]/5 rounded-full blur-[250px]" />
        <div className="absolute bottom-[-10%] right-[10%] w-[1000px] h-[1000px] bg-[#e324ff]/5 rounded-full blur-[200px]" />
      </div>

      <header className="relative z-20 flex items-center justify-between p-8 border-b border-white/5 backdrop-blur-xl bg-[#161224]/40">
        <div className="flex items-center gap-6">
          <button onClick={() => navigate("/dashboard")} className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all group">
            <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-white" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#b638fc] to-[#3b38fc] flex items-center justify-center shadow-[0_0_20px_rgba(182,56,252,0.4)]"><Brain className="w-6 h-6 text-white" /></div>
              <h1 className="text-3xl font-black tracking-tight uppercase italic">Cognium</h1>
            </div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-[0.3em] mt-1 ml-1">Advanced Neural Interface</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className={cn("flex items-center gap-4 px-6 py-3 rounded-full border transition-all duration-500", isJarvisEnabled ? "bg-[#b638fc]/10 border-[#b638fc]/30 shadow-[0_0_30px_rgba(182,56,252,0.2)]" : "bg-white/5 border-white/10")}>
            <div className="flex items-center gap-2">
              <Sparkles className={cn("w-4 h-4", isJarvisEnabled ? "text-[#b638fc] animate-pulse" : "text-slate-500")} />
              <span className={cn("text-sm font-black uppercase tracking-widest", isJarvisEnabled ? "text-white" : "text-slate-500")}>Jarvis</span>
            </div>
            <Switch checked={isJarvisEnabled} onCheckedChange={toggleJarvis} className="data-[state=checked]:bg-[#b638fc]" />
          </div>
          <Button variant="ghost" className="w-12 h-12 rounded-2xl border border-white/5 bg-white/5 p-0"><Settings className="w-5 h-5 text-slate-400" /></Button>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 h-[calc(100vh-113px)] overflow-hidden">
        <div className="w-[380px] border-r border-white/5 bg-[#161224]/20 backdrop-blur-3xl p-8 flex flex-col gap-8">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Neural Parameters</h2>
              <div className="flex items-center gap-1.5">
                <div className={cn("w-1.5 h-1.5 rounded-full", status === "active" ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-slate-700")} />
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{status}</span>
              </div>
            </div>
            <div className="grid gap-4">
              <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/5 space-y-3">
                <div className="flex items-center gap-3 opacity-40"><Activity className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-widest">Movement Sensitivity</span></div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#3b38fc] to-[#b638fc] transition-all duration-300" style={{ width: `${movementIntensity}%` }} />
                </div>
                <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-slate-500 italic">Neural Delta</span><span className="text-[10px] font-black text-white">{movementIntensity.toFixed(1)}%</span></div>
              </div>
              <div className="p-5 rounded-3xl bg-white/[0.03] border border-white/5 space-y-3">
                <div className="flex items-center gap-3 opacity-40"><Mic className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-widest">Acoustic Engine</span></div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-all duration-100" style={{ width: `${voiceLevel}%` }} />
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2"><Volume2 className="w-3 h-3 text-emerald-500" /><span className="text-xs font-bold">Whisper-Lite</span></div>
                  <span className={cn("text-[10px] font-black uppercase", isJarvisEnabled ? "text-emerald-500" : "text-slate-500")}>{isJarvisEnabled ? "Listening" : "Standby"}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-4"><MessageSquare className="w-4 h-4 text-[#b638fc]" /><h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Live Transcript</h2></div>
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pr-2">
              {transcript.map((t, i) => (
                <div key={i} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 animate-in fade-in slide-in-from-left-2 duration-500 hover:bg-white/[0.04] transition-colors"><p className="text-sm font-medium text-slate-200">{t}</p></div>
              ))}
              {interimTranscript && <div className="p-4 rounded-2xl bg-[#b638fc]/5 border border-[#b638fc]/20 opacity-60 animate-pulse"><p className="text-sm font-medium text-slate-400 italic">{interimTranscript}...</p></div>}
              {transcript.length === 0 && !interimTranscript && (
                <div className="flex flex-col items-center justify-center h-full opacity-20"><Waves className="w-12 h-12 mb-4 animate-pulse text-[#b638fc]" /><p className="text-[10px] font-black uppercase tracking-[0.3em] text-center">Neural Voice Interface Active</p></div>
              )}
            </div>
          </div>

          <div className="pt-6 border-t border-white/5">
            <div className="p-6 rounded-[32px] bg-gradient-to-br from-[#b638fc]/20 to-transparent border border-[#b638fc]/20">
              <div className="flex items-center gap-3 mb-3"><Fingerprint className="w-5 h-5 text-[#b638fc]" /><span className="text-xs font-black uppercase tracking-widest">Neural Status</span></div>
              <p className="text-2xl font-black italic uppercase text-white tracking-tighter">{isJarvisEnabled ? gesture : "Optics Offline"}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 relative bg-black/40 p-12 overflow-hidden flex flex-col items-center justify-center">
          <div className="absolute inset-0 pointer-events-none z-10 p-12 border-[20px] border-transparent">
            <div className="absolute top-0 left-0 w-24 h-24 border-t-2 border-l-2 border-white/10 rounded-tl-3xl" />
            <div className="absolute top-0 right-0 w-24 h-24 border-t-2 border-r-2 border-white/10 rounded-tr-3xl" />
            <div className="absolute bottom-0 left-0 w-24 h-24 border-b-2 border-l-2 border-white/10 rounded-bl-3xl" />
            <div className="absolute bottom-0 right-0 w-24 h-24 border-b-2 border-r-2 border-white/10 rounded-br-3xl" />
            {isJarvisEnabled && <div className="absolute left-0 right-0 h-px bg-[#b638fc]/30 shadow-[0_0_20px_#b638fc] animate-scan z-20" />}
            <div className="absolute top-12 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-2 rounded-full bg-black/60 backdrop-blur-xl border border-white/5">
              <div className={cn("w-2 h-2 rounded-full", isJarvisEnabled ? "bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" : "bg-red-500")} />
              <span className="text-[10px] font-black uppercase tracking-[0.3em]">{isJarvisEnabled ? "Neural Tracking Active" : "Systems Standby"}</span>
            </div>
          </div>

          <div className={cn("w-full h-full max-w-5xl rounded-[40px] border border-white/5 bg-[#161224]/40 overflow-hidden relative group shadow-2xl transition-all duration-700 hover:border-[#b638fc]/30", isJarvisEnabled && "ring-1 ring-[#b638fc]/20")}>
            <div className={cn("absolute inset-0 transition-all duration-1000", isJarvisEnabled ? "opacity-100 scale-100" : "opacity-0 scale-110 grayscale")}>
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" onLoadedMetadata={() => { if (videoRef.current && canvasRef.current) { canvasRef.current.width = videoRef.current.videoWidth; canvasRef.current.height = videoRef.current.videoHeight; } }} />
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-20 pointer-events-none mirror" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#b638fc]/10 to-transparent opacity-0 transition-opacity duration-300" style={{ opacity: movementIntensity / 200 }} />
            </div>
            {!isJarvisEnabled && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in zoom-in duration-700">
                <div className="w-32 h-32 rounded-full bg-white/5 border border-white/10 flex items-center justify-center relative">
                  <div className="absolute inset-0 rounded-full bg-[#b638fc]/5 animate-ping" /><Camera className="w-12 h-12 text-slate-700" />
                </div>
                <div className="space-y-4">
                  <h3 className="text-4xl font-black italic uppercase tracking-tighter text-white/20">Initialize Cognium</h3>
                  <p className="text-slate-500 text-sm font-bold uppercase tracking-widest max-w-md mx-auto">Neural sync maps your physical presence to cognitive commands in real-time.</p>
                </div>
                <Button onClick={() => toggleJarvis(true)} className="bg-[#b638fc] hover:bg-[#a129e6] text-white px-10 h-16 rounded-2xl font-black uppercase tracking-widest shadow-[0_0_40px_rgba(182,56,252,0.4)] transition-all hover:scale-105 active:scale-95"><Power className="w-5 h-5 mr-3" />Initiate System</Button>
                
                {typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && (
                  <div className="mt-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 max-w-md animate-in fade-in slide-in-from-bottom-2 duration-1000">
                    <p className="text-amber-500 text-[10px] font-black uppercase tracking-widest mb-1">Security Warning</p>
                    <p className="text-amber-200/60 text-[11px] font-medium leading-relaxed">
                      Browsers block Camera/Mic on non-secure connections. Please use <span className="text-amber-200">HTTPS</span> or <span className="text-amber-200">localhost</span> to enable Cognium.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-12 flex items-center gap-12 opacity-30 hover:opacity-100 transition-opacity duration-700">
            <div className="flex items-center gap-3"><Scan className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-widest">Hand Tracking</span></div>
            <div className="flex items-center gap-3"><Volume2 className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-widest">Speech Synthesis</span></div>
            <div className="flex items-center gap-3"><Cpu className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-widest">Neural Mapping</span></div>
          </div>
        </div>
      </main>
      <style dangerouslySetInnerHTML={{ __html: `
        .mirror { transform: scaleX(-1); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes scan { 0% { top: 0%; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
        .animate-scan { animation: scan 3s linear infinite; }
      `}} />
    </div>
  );
}
