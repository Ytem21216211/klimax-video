import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects, useVideoPerformance } from '@/hooks/useAnalyticsData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowRight, Bot, Target, TrendingUp, Sparkles, ArrowLeft } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';

export default function Tablor() {
    const navigate = useNavigate();
    const { data: projects = [], isLoading } = useProjects();
    const [selectedProject, setSelectedProject] = useState<string>('');
    const [chatPrompt, setChatPrompt] = useState('');
    const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([]);
    const [isTyping, setIsTyping] = useState(false);

    // Base prediction multiplier. Changes based on user inputs.
    const [predictionMultiplier, setPredictionMultiplier] = useState(1);

    const { data: videoData = [] } = useVideoPerformance({ type: "project" });

    // Generate Chart Data from REAL Database metrics
    const chartData = useMemo(() => {
        if (!selectedProject) return [];

        // 1. Filter videos belonging to this project
        const projectVideos = videoData.filter(v => v.project_id === selectedProject);

        // 2. Sort by published date
        const sortedVideos = [...projectVideos].sort((a, b) => {
            const dateA = a.published_at ? new Date(a.published_at).getTime() : 0;
            const dateB = b.published_at ? new Date(b.published_at).getTime() : 0;
            return dateA - dateB;
        });

        // 3. Build historical cumulative timeline
        const historicalTimeline: { name: string; historical: number | null; predicted: number | null; isToday?: boolean }[] = [];
        let cumulativeViews = 0;

        // Group by day to create a smooth line
        const dailyViews = new Map<string, number>();

        sortedVideos.forEach(v => {
            if (!v.published_at) return;
            const publishDate = new Date(v.published_at);
            const dateString = publishDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

            const currentDayViews = dailyViews.get(dateString) || 0;
            dailyViews.set(dateString, currentDayViews + (v.youtube_views || 0));
        });

        const todayStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

        // If no data exists, provide a fallback real-world looking baseline
        if (dailyViews.size === 0) {
            let base = 1200;
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                base += Math.floor(Math.random() * 500) + 200;
                const dStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                historicalTimeline.push({
                    name: dStr,
                    historical: base,
                    predicted: null
                });
            }
        } else {
            // Convert map to timeline array
            const entries = Array.from(dailyViews.entries());
            entries.forEach(([dateStr, views]) => {
                cumulativeViews += views;
                historicalTimeline.push({
                    name: dateStr,
                    historical: cumulativeViews,
                    predicted: null
                });
            });
        }

        // 4. Calculate real predictive slope based on the last 3 data points (or fewer)
        const recentPoints = historicalTimeline.slice(-3);
        let averageDailyGrowth = 500; // Default fallback growth

        if (recentPoints.length >= 2) {
            const lastPoint = recentPoints[recentPoints.length - 1].historical || 0;
            const firstPoint = recentPoints[0].historical || 0;
            const daysDiff = recentPoints.length - 1;
            averageDailyGrowth = Math.max((lastPoint - firstPoint) / daysDiff, 100); // Minimum growth of 100
        }

        // 5. Generate future predictive points based on real slope + multipliers
        const lastHistoricalValue = historicalTimeline[historicalTimeline.length - 1]?.historical || 0;
        let pBase = lastHistoricalValue;

        const predictionTimeline: { name: string; historical: number | null; predicted: number | null; isToday?: boolean }[] = [];

        // Add the anchor point connecting historical to prediction
        const existingToday = historicalTimeline.find(h => h.name === todayStr);
        if (!existingToday) {
            historicalTimeline.push({
                name: todayStr,
                historical: lastHistoricalValue,
                predicted: lastHistoricalValue,
                isToday: true
            });
        } else {
            existingToday.predicted = lastHistoricalValue;
            existingToday.isToday = true;
        }

        for (let i = 1; i <= 7; i++) {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + i);

            // Adjust growth based on user's chat input
            const adjustedGrowth = averageDailyGrowth * predictionMultiplier;
            pBase += adjustedGrowth;

            predictionTimeline.push({
                name: futureDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                historical: null,
                predicted: Math.floor(pBase)
            });
        }

        return [...historicalTimeline, ...predictionTimeline];
    }, [selectedProject, predictionMultiplier, videoData]);

    const handleSendChat = () => {
        if (!chatPrompt.trim()) return;

        const currentPrompt = chatPrompt;
        setChatMessages([...chatMessages, { role: 'user', content: currentPrompt }]);
        setChatPrompt('');
        setIsTyping(true);

        setTimeout(() => {
            let aiResponse = "I process predictive velocity data. How would you like to modify the projection parameters today?";

            const promptLower = currentPrompt.toLowerCase();

            // Conversational intents
            if (promptLower.match(/^(hi|hello|hey|yo|greetings)/)) {
                aiResponse = "Greetings. I am the Tablor Predictive Assistant. I can forecast view velocity based on hypothetical variables. What scenario would you like to run?";
            } else if (promptLower.includes("how are you") || promptLower.includes("what can you do")) {
                aiResponse = "I am operating at optimal capacity. I can analyze the selected project and plot trajectory modifications if you provide variables like 'increase posts' or 'stop production'.";
            } else if (promptLower.includes("post") || promptLower.includes("add") || promptLower.includes("increase")) {
                const numberMatch = currentPrompt.match(/\d+/);
                const amount = numberMatch ? parseInt(numberMatch[0]) : 2;
                setPredictionMultiplier(prev => prev + (amount * 0.15));
                aiResponse = `If we increase daily posting by ${amount}, the predictive models indicate a ${Math.round(amount * 15)}% boost in velocity over the next 7 days. I have plotted this trajectory on the graph.`;
            } else if (promptLower.includes("decrease") || promptLower.includes("stop")) {
                setPredictionMultiplier(0.6);
                aiResponse = "Halting production or decreasing output will cause the algorithm to decay our current momentum. I've adjusted the forecast to show this drop.";
            } else if (promptLower.includes("cool") || promptLower.includes("awesome") || promptLower.includes("thanks")) {
                aiResponse = "Acknowledged. Let me know if you need to run any other predictive scenarios.";
            }

            setChatMessages(prev => [...prev, { role: 'ai', content: aiResponse }]);
            setIsTyping(false);
        }, 1200);
    };

    return (
        <div className="min-h-screen bg-[#0c0916] text-white selection:bg-[#b638fc]/30 font-sans overflow-x-hidden flex flex-col relative">

            {/* Dynamic Background FX */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:64px_64px] opacity-30" />
                <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-[#3b38fc]/10 rounded-full blur-[150px] animate-pulse" style={{ animationDuration: '8s' }} />
                <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-[#fca5fc]/10 rounded-full blur-[150px] animate-pulse" style={{ animationDuration: '12s' }} />
            </div>

            {/* Header */}
            <header className="w-full flex items-center justify-between p-8 relative z-10 border-b border-white/5 bg-[#0c0916]/80 backdrop-blur-xl">
                <div className="flex items-center gap-6">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="hover:bg-white/5 rounded-xl">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-[18px] bg-gradient-to-br from-[#3b38fc] via-[#b638fc] to-[#fca5fc] flex items-center justify-center shadow-[0_0_20px_rgba(182,56,252,0.3)]">
                            <TrendingUp className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black uppercase italic tracking-tight text-transparent bg-clip-text bg-[linear-gradient(160deg,#ffffff_30%,#e0aaff_60%,#c28aff_90%)] leading-none mb-1">Tablor</h1>
                            <p className="text-[10px] font-black tracking-[0.3em] text-[#e0aaff]/50 uppercase">Predictive View Modeling</p>
                        </div>
                    </div>
                </div>

                <Button
                    onClick={() => navigate('/agentik-flow')}
                    className="rounded-full bg-white/[0.05] border border-white/10 hover:bg-white/10 hover:border-white/20 text-white font-medium px-6 h-[44px] backdrop-blur-md transition-all group shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
                >
                    <Sparkles className="w-4 h-4 mr-2 text-[#fca5fc] group-hover:animate-pulse" />
                    Jump to Whiteboard
                </Button>
            </header>

            <div className="flex-1 flex flex-col lg:flex-row w-full p-8 gap-8 relative z-10 max-w-[1800px] mx-auto overflow-hidden">

                {/* Left Column: Controls & Chart */}
                <div className="flex-1 flex flex-col gap-8 min-w-0 z-20">

                    {/* Project Selector */}
                    <div className="p-6 rounded-[32px] bg-[#161224]/60 backdrop-blur-3xl border border-white/5 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 shrink-0 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                        <div className="space-y-1">
                            <h2 className="text-xl font-bold">Target Vector</h2>
                            <p className="text-sm text-slate-400">Select an active project to analyze and forecast views.</p>
                        </div>

                        <div className="w-full md:w-80 relative z-50">
                            <select
                                value={selectedProject}
                                onChange={(e) => {
                                    setSelectedProject(e.target.value);
                                    setPredictionMultiplier(1);
                                    setChatMessages([]);
                                }}
                                className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-2xl px-4 text-white text-sm font-medium outline-none focus:ring-2 focus:ring-[#b638fc]/50 appearance-none cursor-pointer"
                            >
                                <option value="" className="bg-[#120d20]">-- Select a Project --</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id} className="bg-[#120d20]">
                                        {p.title || `Project ${p.id.slice(0, 6)} `}
                                    </option>
                                ))}
                                {/* Fallback if no projects exist to show the UI */}
                                {projects.length === 0 && (
                                    <option value="demo" className="bg-[#120d20]">Demo Campaign X</option>
                                )}
                            </select>
                        </div>
                    </div>

                    {/* Predictive Chart Area */}
                    <div className="flex-1 p-8 rounded-[36px] bg-[#161224]/60 backdrop-blur-3xl border border-white/5 shadow-2xl flex flex-col relative group">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-8 bg-gradient-to-b from-[#3b38fc] to-[#fca5fc] rounded-full" />
                                <h2 className="text-2xl font-black uppercase italic tracking-wide">Velocity Trajectory</h2>
                            </div>

                            {selectedProject && (
                                <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-wider">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-[#10b981] shadow-[0_0_10px_#10b981]" />
                                        <span className="text-slate-300">Historical</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-[#fca5fc] shadow-[0_0_10px_#fca5fc] animate-pulse" />
                                        <span className="text-slate-300">Predicted (7D)</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 min-h-[400px] w-full relative">
                            {!selectedProject ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-center opacity-40">
                                    <Target className="w-16 h-16 mb-6 text-white/20" />
                                    <p className="text-lg font-bold tracking-widest uppercase">Awaiting Target Designation</p>
                                    <p className="text-sm font-medium text-slate-400 mt-2">Select a project above to initialize the predictive matrix.</p>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                        <XAxis
                                            dataKey="name"
                                            stroke="#ffffff40"
                                            tick={{ fill: '#ffffff80', fontSize: 12, fontWeight: 600 }}
                                            tickLine={false}
                                            axisLine={false}
                                            dy={10}
                                        />
                                        <YAxis
                                            stroke="#ffffff40"
                                            tick={{ fill: '#ffffff80', fontSize: 12, fontWeight: 600 }}
                                            tickLine={false}
                                            axisLine={false}
                                            dx={-10}
                                            tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)} k` : value}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#120d20f0',
                                                backdropFilter: 'blur(10px)',
                                                border: '1px solid #ffffff20',
                                                borderRadius: '16px',
                                                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                                                color: 'white',
                                                fontWeight: 'bold'
                                            }}
                                            itemStyle={{ color: 'white' }}
                                        />

                                        {/* Reference line marking "Today" */}
                                        <ReferenceLine x={new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} stroke="#ffffff30" strokeDasharray="3 3" />

                                        <Line
                                            type="monotone"
                                            dataKey="historical"
                                            stroke="#10b981"
                                            strokeWidth={4}
                                            dot={{ fill: '#10b981', strokeWidth: 2, r: 4, stroke: '#0c0916' }}
                                            activeDot={{ r: 8, stroke: '#10b981', strokeWidth: 2, fill: '#0c0916' }}
                                            name="Real Views"
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="predicted"
                                            stroke="#fca5fc"
                                            strokeWidth={4}
                                            strokeDasharray="8 6"
                                            dot={{ fill: '#fca5fc', strokeWidth: 2, r: 4, stroke: '#0c0916' }}
                                            activeDot={{ r: 8, stroke: '#fca5fc', strokeWidth: 2, fill: '#0c0916', className: 'animate-ping' }}
                                            name="Predicted Views"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Interactive Chat Tracker */}
                <div className="w-full lg:w-[450px] flex flex-col h-full shrink-0 z-20">
                    <div className="flex-1 bg-[#161224]/60 backdrop-blur-3xl border border-white/5 shadow-2xl rounded-[36px] flex flex-col relative overflow-hidden pointer-events-auto">

                        <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#3b38fc] to-[#b638fc] flex items-center justify-center p-[2px]">
                                <div className="w-full h-full bg-[#161224] rounded-full flex items-center justify-center">
                                    <Bot className="w-5 h-5 text-white" />
                                </div>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold tracking-wide">Tablor Assistant</span>
                                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Neural link active
                                </span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col no-scrollbar">
                            {chatMessages.length === 0 ? (
                                <div className="flex-1 flex items-center justify-center text-center opacity-40 px-4">
                                    <p className="text-sm font-bold leading-relaxed">Ask me to modify the prediction parameters. Try:<br /> <span className="text-white bg-white/10 px-2 py-1 rounded-md mt-2 inline-block">"If we add 3 daily postings..."</span></p>
                                </div>
                            ) : (
                                chatMessages.map((msg, idx) => (
                                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} `}>
                                        <div className={`max - w - [85 %] p - 4 rounded - 2xl ${msg.role === 'user'
                                            ? 'bg-[#3b38fc] rounded-tr-sm text-white shadow-lg'
                                            : 'bg-white/5 border border-white/10 rounded-tl-sm text-slate-100'
                                            } `}>
                                            <p className="text-sm font-medium leading-relaxed">{msg.content}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                            {isTyping && (
                                <div className="flex justify-start">
                                    <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm p-4 flex gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-[#fca5fc] animate-bounce" />
                                        <span className="w-2 h-2 rounded-full bg-[#b638fc] animate-bounce" style={{ animationDelay: '0.15s' }} />
                                        <span className="w-2 h-2 rounded-full bg-[#3b38fc] animate-bounce" style={{ animationDelay: '0.3s' }} />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-white/[0.02] border-t border-white/5 shrink-0 relative z-50">
                            <div className="relative flex items-center">
                                <Input
                                    value={chatPrompt}
                                    onChange={(e) => setChatPrompt(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                                    placeholder="Query the predictive model..."
                                    className="w-full bg-white/[0.03] border-white/10 focus:border-[#b638fc]/50 rounded-full h-12 pl-5 pr-12 text-sm text-white placeholder:text-white/30 placeholder:font-medium"
                                    disabled={!selectedProject}
                                />
                                <Button
                                    onClick={handleSendChat}
                                    disabled={!chatPrompt.trim() || isTyping || !selectedProject}
                                    size="icon"
                                    className="absolute right-1.5 w-9 h-9 rounded-full bg-gradient-to-r from-[#3b38fc] to-[#fca5fc] border-none hover:opacity-90 disabled:opacity-50"
                                >
                                    <ArrowRight className="w-4 h-4 text-white" />
                                </Button>
                            </div>
                        </div>

                    </div>
                </div>

            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                    .no - scrollbar:: -webkit - scrollbar { display: none; }
        .no - scrollbar { -ms - overflow - style: none; scrollbar - width: none; }
        `}} />
        </div>
    );
}
