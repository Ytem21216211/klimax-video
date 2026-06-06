import { useEffect, useState, useRef, useMemo, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { Player, PlayerRef } from "@remotion/player";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  Sparkles, 
  Layers, 
  Clock, 
  Play, 
  Pause, 
  Settings2, 
  Plus, 
  Image as ImageIcon, 
  Trash2,
  Cpu,
  BrainCircuit,
  Wand2,
  Save,
  Loader2,
  Download,
  Box,
  Monitor
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  spring, 
  interpolate, 
  useCurrentFrame, 
  useVideoConfig, 
  AbsoluteFill,
  Sequence
} from "remotion";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { 
  PerspectiveCamera, 
  Text, 
  Float, 
  Environment, 
  ContactShadows, 
  Grid,
  useTexture,
  Center,
  RoundedBox
} from "@react-three/drei";
import { 
  Bloom, 
  DepthOfField, 
  Noise, 
  Vignette, 
  ChromaticAberration,
  EffectComposer 
} from "@react-three/postprocessing";
import * as THREE from "three";
import { cn } from "@/lib/utils";

// --- 3D Components (STEP 10,000 NEURAL ENGINE) ---

const TexturedMaterial = ({ url, color, glow }: { url?: string, color?: string, glow?: number }) => {
  // Fallback to a transparent pixel if no URL provided to avoid conditional hook call
  const fallback = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
  const texture = useTexture(url || fallback);
  
  useEffect(() => {
    if (texture) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1, 1);
    }
  }, [texture]);

  return (
    <meshStandardMaterial 
      color={color || "#8B4513"} 
      map={url ? texture : null}
      roughness={0.2}
      metalness={0.1}
      emissive={glow ? color : "black"}
      emissiveIntensity={Number(glow || 0) / 50}
    />
  );
};

const NeuralBlock: React.FC<{ layer: any; frame: number; fps: number }> = ({ layer, frame, fps }) => {
  const entrance = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 120, mass: 0.8 }
  });

  const stoneTexture = "https://images.unsplash.com/photo-1599148401005-fe6d7497dd5e?q=80&w=1000&auto=format&fit=crop";
  const grassTexture = "https://images.unsplash.com/photo-1533460004989-cef01064af7c?q=80&w=1000&auto=format&fit=crop";
  
  const activeTextureUrl = layer.texturePrompt?.includes('stone') ? stoneTexture : (layer.texturePrompt?.includes('grass') ? grassTexture : layer.textureUrl);

  const scale = interpolate(entrance, [0, 1], [0, layer.scale || 1.5]);
  const rotationY = (frame / 60) * (layer.rotateY || 1);
  const rotationX = (frame / 120) * (layer.rotateX || 0.5);

  return (
    <Float speed={2} rotationIntensity={1} floatIntensity={2}>
      <RoundedBox 
        args={[1, 1, 1]} 
        radius={0.05} 
        smoothness={4} 
        scale={scale}
        rotation={[rotationX, rotationY, 0]}
        position={[0, 0.5, 0]}
      >
        <Suspense fallback={<meshStandardMaterial color={layer.color || "#8B4513"} />}>
          <TexturedMaterial url={activeTextureUrl} color={layer.color} glow={layer.glow} />
        </Suspense>
      </RoundedBox>
    </Float>
  );
};

const NeuralText: React.FC<{ layer: any; frame: number; fps: number }> = ({ layer, frame, fps }) => {
  const entrance = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 150, mass: 0.5 }
  });

  const scale = interpolate(entrance, [0, 1], [0.8, 1]);
  const z = interpolate(entrance, [0, 1], [-2, 0]);

  return (
    <Center position={[0, 1, z]} scale={scale * (layer.scale || 1)}>
      <Text
        fontSize={0.8}
        maxWidth={10}
        lineHeight={1}
        letterSpacing={layer.letterSpacing || -0.05}
        textAlign="center"
        color={layer.color || "white"}
        anchorX="center"
        anchorY="middle"
      >
        {layer.content || "AFTER AI"}
        <meshStandardMaterial 
          emissive={layer.glow ? layer.color : "black"} 
          emissiveIntensity={Number(layer.glow || 0) / 30}
          roughness={0.1}
          metalness={0.5}
        />
      </Text>
    </Center>
  );
};

const Scene: React.FC<{ layers: any[]; frame: number; fps: number }> = ({ layers, frame, fps }) => {
  // Cinematic Camera Path (Phase 10,000)
  const cameraZ = interpolate(frame, [0, 450], [12, 8], { extrapolateRight: 'clamp' });
  const cameraY = interpolate(frame, [0, 450], [4, 2], { extrapolateRight: 'clamp' });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, cameraY, cameraZ]} fov={35} />
      <Environment preset="city" />
      <ambientLight intensity={0.4} />
      
      {/* High-Intensity Neural Lighting */}
      <spotLight position={[10, 10, 10]} angle={0.2} penumbra={1} intensity={3} castShadow color="#b638fc" />
      <spotLight position={[-10, 10, -5]} angle={0.15} penumbra={1} intensity={2} color="#e324ff" />
      <pointLight position={[0, 5, 0]} intensity={1} color="#ffffff" />

      <group position={[0, -1.5, 0]}>
        <Grid 
          infiniteGrid 
          fadeDistance={50} 
          fadeStrength={10} 
          cellSize={1} 
          sectionSize={5} 
          sectionColor="#b638fc" 
          sectionThickness={2} 
          cellColor="#222"
        />
        <ContactShadows opacity={0.6} scale={30} blur={3} far={10} color="#000" />
      </group>

      {layers.map((layer, i) => {
        const startFrame = Math.round((layer.start || 0) * fps);
        const durationFrames = Math.round((layer.duration || 5) * fps);
        const isActive = frame >= startFrame && frame < startFrame + durationFrames;
        
        if (!isActive) return null;

        return (
          <group key={layer.id || i}>
            {layer.type === 'cube' && <NeuralBlock layer={layer} frame={frame - startFrame} fps={fps} />}
            {(layer.type === 'text' || layer.type === 'counter') && <NeuralText layer={layer} frame={frame - startFrame} fps={fps} />}
          </group>
        );
      })}

      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={1} intensity={1.25} mipmapBlur />
        <Noise opacity={0.05} />
        <Vignette eskil={false} offset={0.1} darkness={1.1} />
      </EffectComposer>
    </>
  );
};

const MainComposition: React.FC<{ layers: any[] }> = ({ layers = [] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: '#020105' }}>
      <Suspense fallback={
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#020105]">
           <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
           <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em]">Neural Synchronizing...</p>
        </div>
      }>
        <Canvas shadows dpr={[1, 2]} gl={{ antialias: false, alpha: false }}>
           <Scene layers={layers} frame={frame} fps={fps} />
        </Canvas>
      </Suspense>
    </AbsoluteFill>
  );
};

// --- Dashboard Component ---

const AfterAI = () => {
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const playerRef = useRef<PlayerRef>(null);
  const [layers, setLayers] = useState<any[]>([
    { id: 'bg-1', name: 'Studio Base', type: 'solid', color: '#020105', start: 0, duration: 15, x: 50, y: 50 },
    { id: 'cube-1', name: 'Neural Core', type: 'cube', color: '#b638fc', start: 0, duration: 15, scale: 2, rotateY: 2, glow: 50 },
    { id: 'text-1', name: 'Cinematic Title', type: 'text', content: 'STEP 10,000', start: 1, duration: 14, scale: 1.2, glow: 30 },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [compositionName, setCompositionName] = useState("Untitled Composition");
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const selectedLayer = useMemo(() => 
    layers.find(l => l.id === selectedLayerId), 
  [layers, selectedLayerId]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setLoading(false);
      fetchProjects();
    };
    checkAuth();
  }, [navigate]);

  const fetchProjects = async () => {
    const { data } = await supabase
      .from('motion_designs')
      .select('*')
      .order('updated_at', { ascending: false });
    if (data) setProjects(data);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from('motion_designs')
        .upsert({
          id: currentProjectId || undefined,
          user_id: user.id,
          name: compositionName,
          prompt,
          config: { layers },
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      fetchProjects();

      toast({
        title: "Project Synchronized",
        description: `Neural states for "${compositionName}" have been pushed to vault.`,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Sync Failed",
        description: err.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewProject = () => {
    setLayers([
      { id: 'bg-1', name: 'Studio Base', type: 'solid', color: '#020105', start: 0, duration: 15 },
      { id: 'cube-1', name: 'Neural Core', type: 'cube', color: '#b638fc', start: 0, duration: 15, scale: 2, rotateY: 2, glow: 50 },
    ]);
    setCompositionName("Untitled Composition");
    setCurrentProjectId(null);
    setSelectedLayerId(null);
    setPrompt("");
    toast({ title: "Environment Re-initialized", description: "3D neural workspace is ready." });
  };

  const handleGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("generate-motion-design", {
        body: { 
          prompt, 
          aspectRatio: "16:9",
          currentLayers: layers,
          imageBase64: selectedImage
        },
      });

      if (error) throw error;

      if (data?.success && data.config?.layers) {
        setLayers(data.config.layers);
        if (playerRef.current) {
          playerRef.current.seekTo(0);
          setCurrentFrame(0);
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const projectData: any = {
            user_id: user.id,
            name: compositionName === "Untitled Composition" ? (prompt.slice(0, 20) + "...") : compositionName,
            prompt,
            config: { layers: data.config.layers },
            updated_at: new Date().toISOString()
          };

          if (currentProjectId) projectData.id = currentProjectId;

          const { data: savedProj, error: saveErr } = await supabase
            .from('motion_designs')
            .upsert(projectData)
            .select()
            .single();

          if (!saveErr && savedProj) {
            setCurrentProjectId(savedProj.id);
            if (compositionName === "Untitled Composition") setCompositionName(savedProj.name);
          }
          fetchProjects();
        }

        toast({
          title: "Neural Architecture Updated",
          description: `Synthesized 3D cinematic motion with ${data.config.layers.length} neural nodes.`,
        });
      }
    } catch (err: any) {
      console.error("[AfterAI] Build failed:", err);
      toast({
        variant: "destructive",
        title: "Synthesis Error",
        description: err.message,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-[#020105] text-white selection:bg-[#b638fc]/30 overflow-hidden flex flex-col font-sans">
      
      {/* Header */}
      <header className="h-16 border-b border-white/5 bg-[#080610]/80 backdrop-blur-3xl flex items-center px-6 justify-between shrink-0 z-50">
        <div className="flex items-center gap-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard")}
            className="w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#e324ff] via-[#b638fc] to-[#2a0845] flex items-center justify-center shadow-[0_0_30px_rgba(182,56,252,0.4)]">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white leading-none tracking-tight">AFTER AI</h1>
              <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em] opacity-80">Phase 10,000 Studio</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button 
            onClick={handleNewProject}
            variant="ghost" 
            className="h-11 px-5 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
          <div className="h-6 w-[1px] bg-white/10 mx-1" />
          <Button 
            onClick={handleSave}
            disabled={isSaving || layers.length === 0}
            variant="ghost" 
            className="h-11 px-5 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Vault Sync
          </Button>
          <Button className="h-11 px-8 rounded-2xl bg-primary text-white font-black text-[11px] uppercase tracking-[0.1em] hover:scale-105 transition-all shadow-xl shadow-primary/30">
            <Download className="w-5 h-5 mr-2" />
            Export 4K
          </Button>
        </div>
      </header>

      {/* Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar */}
        <aside className="w-80 border-r border-white/5 bg-[#04030a] flex flex-col shrink-0">
          <Tabs defaultValue="layers" className="flex-1 flex flex-col">
            <div className="p-5 border-b border-white/5">
              <TabsList className="w-full bg-white/[0.03] h-12 p-1 rounded-2xl">
                <TabsTrigger value="layers" className="flex-1 rounded-xl text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-black">
                  <Layers className="w-4 h-4 mr-2" />
                  Nodes
                </TabsTrigger>
                <TabsTrigger value="projects" className="flex-1 rounded-xl text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-black">
                  <BrainCircuit className="w-4 h-4 mr-2" />
                  Vault
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="layers" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-5 space-y-3">
                  {layers.map((layer) => (
                    <div 
                      key={layer.id} 
                      onClick={() => setSelectedLayerId(layer.id)}
                      className={cn(
                        "group flex items-center gap-4 p-4 rounded-[24px] border transition-all cursor-pointer",
                        selectedLayerId === layer.id 
                          ? "bg-primary/10 border-primary/40 shadow-[0_0_30px_rgba(182,56,252,0.15)] scale-[1.02]" 
                          : "bg-white/[0.02] border-white/5 hover:border-white/20"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xl",
                        selectedLayerId === layer.id ? "bg-primary text-white" : "bg-white/10 text-white/20"
                      )}>
                         {layer.type === 'cube' ? <Box className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-[12px] font-black truncate transition-colors",
                          selectedLayerId === layer.id ? "text-primary" : "text-white/80 group-hover:text-white"
                        )}>{layer.name}</p>
                        <p className="text-[10px] text-white/20 font-black tracking-[0.2em] uppercase">{layer.type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="projects" className="flex-1 m-0 overflow-hidden">
               <ScrollArea className="h-full">
                  <div className="p-5 space-y-4">
                    {projects.map((p) => (
                      <div 
                        key={p.id} 
                        onClick={() => {
                          setLayers(p.config.layers);
                          setCompositionName(p.name);
                          setCurrentProjectId(p.id);
                          toast({ title: "Environment Loaded", description: `"${p.name}" session active.` });
                        }}
                        className={cn(
                          "group p-5 rounded-[24px] border transition-all cursor-pointer",
                          currentProjectId === p.id ? "bg-primary/10 border-primary/40" : "bg-white/[0.03] border-white/5 hover:border-white/20"
                        )}
                      >
                        <h3 className={cn("text-[12px] font-black mb-1", currentProjectId === p.id ? "text-primary" : "text-white")}>{p.name}</h3>
                        <p className="text-[10px] text-white/20 font-bold line-clamp-2 uppercase tracking-tighter">{p.prompt || "Neural sequence"}</p>
                      </div>
                    ))}
                  </div>
               </ScrollArea>
            </TabsContent>
          </Tabs>
        </aside>

        {/* Center: Real 3D Studio */}
        <div className="flex-1 flex flex-col bg-black relative">
          
          <div className="flex-1 p-10 flex flex-col items-center justify-center relative">
            <div className="w-[1920px] h-[1080px] max-w-full aspect-[16/9] relative shadow-[0_0_150px_rgba(182,56,252,0.25)] rounded-[60px] overflow-hidden border border-white/10 bg-[#020105]">
              <Player
                ref={playerRef}
                component={MainComposition}
                inputProps={{ layers }}
                durationInFrames={450} 
                fps={30}
                compositionWidth={1920}
                compositionHeight={1080}
                style={{ width: '100%', height: '100%' }}
                controls={false}
                loop
                onFrameUpdate={(e) => setCurrentFrame(e.frame)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            </div>

            {/* Neural Prompting Core */}
            <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[800px] bg-black/80 backdrop-blur-[40px] border border-white/10 rounded-[32px] p-3 flex items-center gap-4 shadow-3xl z-20">
              <div className="flex items-center gap-3 pl-3">
                 <Label htmlFor="image-inspiration" className="cursor-pointer group">
                    <div className={cn(
                      "w-12 h-12 rounded-[18px] flex items-center justify-center transition-all overflow-hidden",
                      selectedImage ? "bg-primary/20 text-primary border border-primary/40 shadow-[0_0_20px_rgba(182,56,252,0.5)]" : "bg-white/5 text-white/20 hover:bg-white/10"
                    )}>
                      {selectedImage ? <img src={selectedImage} className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6" />}
                    </div>
                    <input id="image-inspiration" type="file" accept="image/*" className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => setSelectedImage(reader.result as string);
                        reader.readAsDataURL(file);
                      }
                    }} />
                 </Label>
              </div>
              <Input 
                placeholder="PROMPT PHASE 10,000 CINEMATICS (e.g. 'A mossy stone block with volumetric light rays')..." 
                className="flex-1 bg-transparent border-none focus-visible:ring-0 text-base font-bold placeholder:text-white/10 h-14"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              />
              <Button 
                onClick={handleGenerate}
                disabled={isGenerating || !prompt}
                className={cn(
                  "h-12 px-8 rounded-[18px] font-black text-[11px] uppercase tracking-[0.2em] transition-all",
                  isGenerating ? "bg-white/10 text-white/40" : "bg-primary text-white hover:scale-105 shadow-[0_0_30px_rgba(182,56,252,0.5)]"
                )}
              >
                {isGenerating ? <Cpu className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5 mr-3" />}
                {isGenerating ? "Synthesizing" : "Neural Build"}
              </Button>
            </div>
          </div>

          {/* Neural Timeline */}
          <div className="h-80 border-t border-white/5 bg-[#080610] flex flex-col shrink-0">
             <div className="h-12 border-b border-white/5 flex items-center px-8 justify-between bg-black/40">
                <div className="flex items-center gap-8">
                   <Button size="icon" variant="ghost" onClick={() => playerRef.current?.isPlaying() ? playerRef.current.pause() : playerRef.current?.play()} className="h-10 w-10 text-white/40 hover:text-white">
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                   </Button>
                   <div className="flex items-center gap-4">
                      <Clock className="w-4 h-4 text-white/20" />
                      <span className="text-[12px] font-black tabular-nums tracking-widest text-primary">
                        {Math.floor(currentFrame / 30).toString().padStart(2, '0')}:{(currentFrame % 30).toString().padStart(2, '0')}
                      </span>
                   </div>
                </div>
                <div className="flex items-center gap-6">
                   <div className="flex items-center gap-3">
                      <Monitor className="w-4 h-4 text-white/20" />
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">4K Studio Preview</span>
                   </div>
                </div>
             </div>
             <div className="flex-1 flex overflow-hidden">
                <div className="w-80 border-r border-white/5 overflow-y-auto no-scrollbar bg-[#04030a]">
                   {layers.map((layer) => (
                      <div key={layer.id} onClick={() => setSelectedLayerId(layer.id)} className={cn("h-14 border-b border-white/5 flex items-center px-6 gap-4 cursor-pointer transition-all", selectedLayerId === layer.id ? "bg-primary/10 border-l-4 border-l-primary" : "bg-white/[0.01] hover:bg-white/[0.02]")}>
                         <Settings2 className={cn("w-4 h-4", selectedLayerId === layer.id ? "text-primary" : "text-white/20")} />
                         <span className={cn("text-[11px] font-black uppercase tracking-widest truncate", selectedLayerId === layer.id ? "text-primary" : "text-white/40")}>{layer.name}</span>
                      </div>
                   ))}
                </div>
                 <div className="flex-1 bg-[#020105] relative overflow-x-auto no-scrollbar">
                    <div className="absolute top-0 bottom-0 w-[3px] bg-primary z-30 pointer-events-none shadow-[0_0_25px_rgba(182,56,252,1)]" style={{ left: `${(currentFrame / 450) * 100}%` }}>
                       <div className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-5 bg-primary rounded-full shadow-[0_0_20px_rgba(182,56,252,1)]" />
                    </div>
                    {layers.map((layer) => (
                      <div key={layer.id} onClick={() => setSelectedLayerId(layer.id)} className="h-14 border-b border-white/5 flex items-center px-0 relative group/track cursor-pointer">
                          <div className={cn("absolute h-8 rounded-2xl border shadow-2xl transition-all flex items-center px-4", selectedLayerId === layer.id ? "border-primary bg-primary/20 scale-[1.02] z-20" : "border-white/10 bg-white/5 z-10")} style={{ left: `${(layer.start || 0) * 6.66}%`, width: `${(layer.duration || 5) * 6.66}%` }}>
                              <span className={cn("text-[9px] font-black uppercase tracking-[0.15em] truncate", selectedLayerId === layer.id ? "text-primary" : "text-white/40")}>{layer.name}</span>
                          </div>
                      </div>
                    ))}
                 </div>
             </div>
          </div>
        </div>

        {/* Right Sidebar: Neural Control */}
        <aside className="w-80 border-l border-white/5 bg-[#080610] flex flex-col shrink-0">
           <div className="p-8 border-b border-white/5">
              <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 mb-2">Properties</h2>
              <p className="text-lg font-black text-white leading-tight tracking-tighter">Neural Control</p>
           </div>
           <ScrollArea className="flex-1">
               <div className="p-8 space-y-10">
                  {selectedLayer ? (
                    <div className="space-y-6">
                      <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 italic block mb-6">{selectedLayer.name}</Label>
                      <div className="space-y-8 p-6 rounded-[32px] bg-white/[0.03] border border-white/5">
                         <div className="space-y-4">
                            <div className="flex justify-between items-center px-1">
                               <span className="text-[11px] font-black text-white/40 uppercase tracking-widest">Opacity</span>
                               <span className="text-[11px] font-black text-primary">{Math.round((selectedLayer.opacity || 1) * 100)}%</span>
                            </div>
                            <Slider value={[(selectedLayer.opacity || 1) * 100]} max={100} onValueChange={([val]) => setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, opacity: val / 100 } : l))} />
                         </div>
                         <div className="space-y-4">
                            <div className="flex justify-between items-center px-1">
                               <span className="text-[11px] font-black text-white/40 uppercase tracking-widest">Scale</span>
                               <span className="text-[11px] font-black text-primary">{(selectedLayer.scale || 1).toFixed(2)}x</span>
                            </div>
                            <Slider value={[(selectedLayer.scale || 1) * 25]} max={100} onValueChange={([val]) => setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, scale: val / 25 } : l))} />
                         </div>
                         <div className="space-y-4">
                            <div className="flex justify-between items-center px-1">
                               <span className="text-[11px] font-black text-white/40 uppercase tracking-widest">Bloom</span>
                               <span className="text-[11px] font-black text-primary">{selectedLayer.glow || 0}%</span>
                            </div>
                            <Slider value={[selectedLayer.glow || 0]} max={100} onValueChange={([val]) => setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, glow: val } : l))} />
                         </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center border border-dashed border-white/5 rounded-[40px] text-center p-10 opacity-40">
                      <Cpu className="w-10 h-10 text-primary mb-5 animate-pulse" />
                      <p className="text-[11px] font-black text-white uppercase tracking-[0.3em] leading-relaxed">
                        Awaiting neural<br/>target selection
                      </p>
                    </div>
                  )}
               </div>
           </ScrollArea>
        </aside>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
      `}} />
    </div>
  );
};

export default AfterAI;
