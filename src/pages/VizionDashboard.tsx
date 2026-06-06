import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Cpu, Play, CheckCircle, Eye, ArrowRight, Zap, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

export default function VizionDashboard() {
    const [files, setFiles] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);
    const [presetData, setPresetData] = useState<any>(null);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.type === 'video/mp4');
            setFiles(prev => [...prev, ...droppedFiles]);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const selectedFiles = Array.from(e.target.files).filter(f => f.type === 'video/mp4');
            setFiles(prev => [...prev, ...selectedFiles]);
        }
    };

    const handleUpload = async () => {
        if (files.length === 0) return;
        setIsUploading(true);

        const formData = new FormData();
        files.forEach(file => {
            formData.append('videos', file);
        });

        try {
            const response = await fetch('http://localhost:3001/api/vizion/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();
            toast({ title: 'References Uploaded', description: `Successfully uploaded ${data.count} videos to the Vizion engine.` });
        } catch (err: any) {
            toast({ title: 'Upload Error', description: err.message, variant: 'destructive' });
        } finally {
            setIsUploading(false);
        }
    };

    const handleExtract = async () => {
        setIsExtracting(true);
        setPresetData(null);
        try {
            toast({ title: 'Engine Started', description: 'Vizion is analyzing physics. This takes time.' });
            const response = await fetch('http://localhost:3001/api/vizion/extract', {
                method: 'POST'
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Extraction failed');

            setPresetData(data.preset);
            toast({ title: 'Extraction Complete', description: 'Mathematical preset successfully generated.', duration: 5000 });
        } catch (err: any) {
            toast({ title: 'Extraction Error', description: err.message, variant: 'destructive' });
        } finally {
            setIsExtracting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#050505] text-slate-200 flex flex-col items-center overflow-x-hidden relative font-sans selection:bg-white/20">

            {/* 🌑 ULTRA-CLEAN MONOCHROME BACKGROUND */}
            <div className="fixed inset-0 z-0">
                {/* Gray to Soft Black Degrade */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,#2a2a2a_0%,#050505_70%)] opacity-80" />

                {/* Subtle Neural Grid (Grayscale) */}
                <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <pattern id="grid-clean" width="80" height="80" patternUnits="userSpaceOnUse">
                            <path d="M 80 0 L 0 0 0 80" fill="none" stroke="white" strokeWidth="0.5" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid-clean)" />
                </svg>

                {/* Micro Particles */}
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] pointer-events-none" />
            </div>

            <div className="max-w-7xl w-full px-6 py-12 space-y-24 relative z-10">
                {/* 🧪 HEADER: CLEAN VIZION COMMAND */}
                <header className="text-center space-y-10 pt-16 pb-12 animate-in fade-in slide-in-from-top-8 duration-1000">
                    <div className="relative inline-block group">
                        <div className="w-24 h-24 rounded-[2rem] bg-white/[0.03] border border-white/10 backdrop-blur-3xl flex items-center justify-center mx-auto shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50" />
                            <Zap className="w-10 h-10 text-white fill-current drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" />

                            {/* Clean SVG Border Motion */}
                            <svg className="absolute inset-0 w-full h-full -m-0.5 pointer-events-none" viewBox="0 0 100 100">
                                <rect x="0.5" y="0.5" width="99" height="99" rx="30" fill="none" stroke="white" strokeWidth="1" strokeDasharray="15 85" strokeLinecap="round" className="animate-[spin_6s_linear_infinite]" />
                            </svg>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h1 className="text-7xl md:text-8xl font-bold tracking-tight text-white/90">
                            Vizion
                        </h1>
                        <p className="text-slate-400 max-w-2xl mx-auto text-lg font-medium">
                            AI-Assisted Video Analysis Protocol
                        </p>
                    </div>

                    <div className="flex items-center justify-center gap-10">
                        <div className="h-[1px] w-32 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">System Active</span>
                        </div>
                        <div className="h-[1px] w-32 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    </div>
                </header>

                <div className="grid lg:grid-cols-2 gap-20 items-start">
                    {/* 📥 PHASE 1: NEURAL ACQUISITION */}
                    <div className="space-y-12 animate-in fade-in slide-in-from-left-12 duration-1000 delay-200">
                        <div className="flex items-center gap-8 group">
                            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white font-bold text-lg shadow-xl relative transition-transform">
                                01
                            </div>
                            <h3 className="text-3xl font-bold text-white">Input Modules</h3>
                        </div>

                        <div
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            className={cn(
                                "relative overflow-hidden group cursor-pointer rounded-[4rem] p-1 bg-gradient-to-br from-white/10 via-transparent to-transparent transition-all duration-1000",
                                dragActive ? "scale-[1.02] shadow-[0_0_100px_rgba(255,255,255,0.05)]" : "hover:shadow-[0_40px_80px_rgba(0,0,0,0.5)]"
                            )}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {/* 🧪 CLEAN LIQUID GLASS */}
                            <div className={cn(
                                "flex flex-col items-center justify-center p-24 rounded-[4rem] backdrop-blur-[150px] border border-white/5 transition-all duration-1000",
                                dragActive ? "bg-white/[0.05]" : "bg-white/[0.01] hover:bg-white/[0.02]"
                            )}>
                                {/* Minimal Scanning Beam */}
                                <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_4s_infinite_linear]" />

                                <input ref={fileInputRef} type="file" multiple accept="video/mp4" className="hidden" onChange={handleFileChange} />

                                <div className="w-24 h-24 rounded-[2.5rem] bg-white/[0.03] border border-white/10 flex items-center justify-center mb-10 transition-all duration-1000 relative group-hover:shadow-[0_0_40px_rgba(255,255,255,0.1)]">
                                    <Upload className="w-10 h-10 text-slate-400 group-hover:text-white transition-colors" />
                                </div>

                                <h4 className="text-xl font-bold text-white tracking-tight mb-2">Sync References</h4>
                                <p className="text-sm text-slate-500 font-medium tracking-wide">Drop video modules here</p>

                                <div className="mt-12 flex gap-1">
                                    {[1, 2, 3, 4, 5].map(i => (
                                        <div key={i} className="w-4 h-[1px] bg-white opacity-10" />
                                    ))}
                                </div>
                            </div>
                        </div>

                        {files.length > 0 && (
                            <div className="relative group animate-in fade-in slide-in-from-bottom-8 duration-1000">
                                <div className="absolute inset-0 bg-white/5 blur-3xl rounded-[3rem] opacity-20" />
                                <div className="relative bg-[#0a0a0a] border border-white/10 rounded-[3rem] p-10 overflow-hidden shadow-2xl">
                                    <div className="flex justify-between items-center mb-10">
                                        <div>
                                            <p className="text-[10px] font-black text-white/30 tracking-[0.5em] uppercase mb-1">Queue Synchronized</p>
                                            <h4 className="text-2xl font-black text-white">{files.length} Units</h4>
                                        </div>
                                        <button
                                            onClick={handleUpload}
                                            disabled={isUploading}
                                            className="h-12 bg-white text-black text-sm font-bold px-8 rounded-xl hover:bg-slate-200 transition-all active:scale-95 shadow-xl disabled:opacity-30"
                                        >
                                            {isUploading ? 'Uploading...' : 'Link Modules'}
                                        </button>
                                    </div>
                                    <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2 no-scrollbar">
                                        {files.map((f, i) => (
                                            <div key={i} className="flex items-center justify-between p-5 rounded-2xl bg-white/[0.02] border border-white/5 text-[11px] font-bold text-slate-500 hover:text-white hover:bg-white/[0.04] transition-all group/item">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-[1px] w-4 bg-white/20" />
                                                    <span className="truncate">{f.name}</span>
                                                </div>
                                                <CheckCircle className="w-3.5 h-3.5 text-white/10 group-hover/item:text-white transition-colors" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ⚡ PHASE 2: PHYSICS RECONSTRUCTION */}
                    <div className="space-y-12 animate-in fade-in slide-in-from-right-12 duration-1000 delay-400">
                        <div className="flex items-center gap-8 group">
                            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white font-bold text-lg shadow-xl relative transition-transform">
                                02
                            </div>
                            <h3 className="text-3xl font-bold text-white">Extraction Hub</h3>
                        </div>

                        <div className="relative group perspective-[2000px]">
                            <Card className="relative bg-white/[0.01] backdrop-blur-[200px] border border-white/10 rounded-[4rem] p-12 shadow-[0_50px_100px_rgba(0,0,0,0.8)] min-h-[520px] flex flex-col overflow-hidden transition-all duration-1000 hover:border-white/20">

                                {/* Very Soft Gradient Depth */}
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.03)_0%,transparent_60%)]" />

                                {presetData ? (
                                    <div className="flex-1 flex flex-col animate-in zoom-in-95 duration-1000 relative z-10">
                                        <div className="flex items-center gap-5 mb-10">
                                            <div className="w-14 h-14 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center">
                                                <CheckCircle className="w-7 h-7 text-white" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Status: Complete</p>
                                                <h4 className="text-xl font-bold text-white tracking-tight">Vectors Decoded</h4>
                                            </div>
                                        </div>
                                        <div className="flex-1 relative group/code bg-black/60 rounded-[3rem] border border-white/5 p-10 overflow-hidden shadow-inner font-mono">
                                            <pre className="text-[13px] leading-relaxed text-slate-400 no-scrollbar overflow-auto max-h-[300px]">
                                                {JSON.stringify(presetData, null, 2)}
                                            </pre>
                                            {/* Minimal SVG Flux Indicator */}
                                            <div className="absolute bottom-6 right-8 flex gap-1.5 items-end h-6">
                                                {[1, 2, 3, 4, 5].map(i => (
                                                    <div key={i} className="w-[2px] bg-white/20 rounded-full animate-pulse" style={{ height: `${i * 20}%`, animationDelay: `${i * 0.1}s` }} />
                                                ))}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => setPresetData(null)}
                                            className="mt-8 w-full h-12 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-semibold uppercase tracking-wider hover:bg-white/10 transition-all active:scale-95"
                                        >
                                            New Extraction Protocol
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center relative z-10">
                                        {/* Monochrome Core Visualization */}
                                        <div className="relative mb-20 scale-125">
                                            {/* Clean SVG Orbits */}
                                            <svg className="absolute -inset-16 w-64 h-64 animate-[spin_30s_linear_infinite]" viewBox="0 0 100 100">
                                                <circle cx="50" cy="50" r="48" fill="none" stroke="white" strokeWidth="0.1" strokeDasharray="5 15" opacity="0.2" />
                                                <circle cx="50" cy="50" r="42" fill="none" stroke="white" strokeWidth="0.5" strokeDasharray="30 70" strokeLinecap="round" className="animate-[spin_8s_linear_infinite_reverse]" />
                                            </svg>

                                            <div className={cn(
                                                "w-32 h-32 rounded-[3.5rem] bg-white/[0.03] border border-white/10 flex items-center justify-center relative transition-all duration-1000 group-hover:shadow-[0_0_80px_rgba(255,255,255,0.05)]",
                                                isExtracting && "scale-110 shadow-[0_0_100px_rgba(255,255,255,0.1)] border-white/40"
                                            )}>
                                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.1)_0%,transparent_100%)] opacity-50" />
                                                <Cpu className={cn("w-14 h-14 text-slate-500 transition-all duration-1000 relative z-10", isExtracting && "animate-pulse text-white")} />
                                            </div>
                                        </div>

                                        <div className="space-y-4 mb-20">
                                            <h4 className="text-3xl font-bold text-white">
                                                {isExtracting ? 'DECODING' : 'Service Ready'}
                                            </h4>
                                            <p className="text-slate-500 text-sm font-medium">
                                                {isExtracting ? 'Analyzing physics tensors...' : 'Awaiting input modules'}
                                            </p>
                                        </div>

                                        {/* Premium Extraction Button (Restored Colorful Style) */}
                                        <div className="relative group w-full max-w-[320px]">
                                            <div className="absolute -inset-2 bg-gradient-to-r from-[#3b38fc] via-[#b638fc] to-[#fca5fc] rounded-full blur-xl opacity-40 group-hover:opacity-100 transition duration-700 scale-90 group-hover:scale-105" />
                                            <button
                                                onClick={handleExtract}
                                                disabled={isExtracting}
                                                className="relative w-full h-14 bg-primary text-white font-bold text-sm uppercase tracking-wider rounded-xl shadow-lg transition-all hover:scale-[1.02] active:scale-95 disabled:grayscale disabled:opacity-50 flex items-center justify-center border-none"
                                            >
                                                {isExtracting ? (
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                                                        <span>Processing</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-3">
                                                        <Play className="w-4 h-4 fill-current opacity-70" />
                                                        Run Extraction
                                                    </div>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Clean SVG Border Corner */}
                                <svg className="absolute bottom-6 right-8 w-20 h-20 opacity-5" viewBox="0 0 100 100">
                                    <rect width="100" height="100" fill="none" stroke="white" strokeWidth="2" strokeDasharray="10 90" />
                                </svg>
                            </Card>
                        </div>
                    </div>
                </div>

                {/* 📊 FOOTER INTELLIGENCE */}
                <footer className="pt-24 border-t border-white/5 flex flex-col md:flex-row items-center justify-between text-[10px] font-black text-slate-700 uppercase tracking-[0.6em] gap-10 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-1000">
                    <div className="flex items-center gap-4">
                        <div className="w-2.5 h-2.5 rounded-full bg-white opacity-20 shadow-[0_0_10px_white]" />
                        Neural Data Link // Secure
                    </div>
                    <div className="flex items-center gap-16 text-slate-800">
                        <span className="hover:text-white transition-colors">Protocol_X_09</span>
                        <span className="hover:text-white transition-colors">Vector_Lock</span>
                        <span className="text-white/20">© VIZION 2026</span>
                    </div>
                </footer>
            </div>

            {/* Logic-Based CSS Injections */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                .perspective-2000 { perspective: 2000px; }
            `}} />
        </div>
    );
}
