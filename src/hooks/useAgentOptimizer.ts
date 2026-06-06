import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { toast } from '@/hooks/use-toast';

export const useAgentOptimizer = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [messages, setMessages] = useState<any[]>([]);

    const deployAgent = async (projectId: string, agentId: string) => {
        console.log("Neural Link: Initiating Grok Analysis for Project:", projectId, "Agent:", agentId);
        setIsLoading(true);
        setMessages([{ role: 'assistant', content: "Neural Link: Initiating Strategic Analysis..." }]);

        try {
            // 1. Get current Authenticated User ID (Required for DB RLS)
            const { data: userData } = await supabase.auth.getUser();
            const userId = userData?.user?.id;
            if (!userId) throw new Error("Authentication link lost. Please re-login.");

            // 2. Fetch latest project metrics and settings
            const { data: project, error: projectError } = await supabase
                .from('projects')
                .select(`
                    *,
                    video_performance (
                        youtube_views,
                        youtube_avg_view_percentage,
                        youtube_click_through_rate
                    )
                `)
                .eq('id', projectId)
                .order('created_at', { foreignTable: 'video_performance', ascending: false })
                .limit(1, { foreignTable: 'video_performance' })
                .maybeSingle();

            if (projectError) throw projectError;
            if (!project) throw new Error("Project configuration not found.");

            const latestPerformance = project.video_performance?.[0] || {};

            const metrics = {
                retention: latestPerformance.youtube_avg_view_percentage || 0,
                daily_views: latestPerformance.youtube_views || 0,
                settings: {
                    subtitle: project.subtitle_settings,
                    voice: project.voice_id,
                    lab_enabled: project.lab_enabled,
                    youtube: project.youtube_settings,
                }
            };

            // 3. Trigger the Agent Loop via direct fetch
            const response = await fetch('/api/agent-optimizer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, metrics, messages: [], agentId, userId }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const detailedError = errData.details ? `${errData.error}: ${errData.details}` : (errData.error || `HTTP ${response.status}`);
                throw new Error(detailedError);
            }

            // 4. Robust Stream Reader (Buffered to handle partial chunks)
            const reader = response.body?.getReader();
            if (!reader) throw new Error("Neural stream reader not available");

            const decoder = new TextDecoder();
            let accumulatedContent = "";
            let buffer = ""; // Keeps partial lines across chunks

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk; // Add chunk to buffer

                const lines = buffer.split('\n');
                
                // Keep the last part (it might be a partial line)
                buffer = lines.pop() || "";

                lines.forEach(line => {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) return;

                    // Data Stream Protocol Matching
                    // 0: Text content (Thought/Summary)
                    if (trimmedLine.startsWith('0:')) {
                        try {
                            const raw = trimmedLine.substring(2);
                            const content = raw.startsWith('"') ? JSON.parse(raw) : raw;
                            accumulatedContent += content;
                        } catch (e) {
                            accumulatedContent += trimmedLine.substring(2);
                        }
                    } 
                    // 9: Tool call (Action)
                    else if (trimmedLine.startsWith('9:')) {
                        try {
                            const toolInfo = JSON.parse(trimmedLine.substring(2));
                            const toolName = toolInfo.toolName || 'Neural Tool';
                            const args = toolInfo.args ? JSON.stringify(toolInfo.args, null, 1) : '{}';
                            accumulatedContent += `\n\n> ⚙️ **ACTION:** Executing: \`${toolName}\`\n> **ARGS:** \`${args}\`...\n\n`;
                        } catch (e) {}
                    }
                    // a: Tool result (Observation)
                    else if (trimmedLine.startsWith('a:')) {
                        try {
                            const resultInfo = JSON.parse(trimmedLine.substring(2));
                            const resultText = resultInfo.result || 'Analysis complete.';
                            accumulatedContent += `\n> 👁️ **OBSERVATION:** ${resultText}\n\n`;
                        } catch (e) {}
                    }

                    // Update UI for each complete instruction
                    setMessages([{ role: 'assistant', content: accumulatedContent }]);
                });
            }

            toast({
                title: "Neural Synergy Synchronized",
                description: "Deep analysis complete. Check Strategy tab.",
            });
        } catch (error: any) {
            console.error("Neural Link Failed:", error);
            
            toast({
                variant: "destructive",
                title: "Neural Deployment Failed",
                description: error.message,
            });
        } finally {
            setIsLoading(false);
        }
    };

    return {
        deployAgent,
        messages,
        isLoading,
    };
};
