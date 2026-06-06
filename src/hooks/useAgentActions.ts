import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Project } from "@/types/agentik";

export const useAgentActions = () => {
    const { toast } = useToast();

    const logAction = async (projectId: string, agentId: string | undefined, type: string, updates: any, summary: string) => {
        try {
            const { data: metrics } = await (supabase as any)
                .from('agentik_project_metrics')
                .select('total_views, daily_views, momentum')
                .eq('id', projectId)
                .single();

            await (supabase as any).from('agentik_action_logs').insert({
                project_id: projectId,
                agent_id: agentId,
                action_type: type,
                changes: updates,
                summary_md: summary,
                pre_action_metrics: metrics || {}
            });
        } catch (e) {
            console.error("Action Log Failed:", e);
        }
    };

    const updateProjectConfig = async (projectId: string, updates: any, agentId?: string) => {
        try {
            const { data: project, error: fetchError } = await (supabase as any)
                .from('projects')
                .select('*')
                .eq('id', projectId)
                .single();

            if (fetchError) throw fetchError;

            const jsonColumns = [
                'subtitle_settings',
                'beginning_effect_settings',
                'ip_popup_settings',
                'end_screen_settings',
                'music_settings',
                'colorimetry_settings',
                'effects_settings',
                'script_settings',
                'tablor_settings'
            ];

            const finalUpdates: any = { ...updates };

            jsonColumns.forEach(col => {
                if (updates[col]) {
                    finalUpdates[col] = {
                        ...(project[col] || {}),
                        ...updates[col]
                    };
                }
            });

            const { error: updateError } = await (supabase as any)
                .from('projects')
                .update(finalUpdates)
                .eq('id', projectId);

            if (updateError) throw updateError;

            // Log the action for the Learning Loop
            const updatedKeys = Object.keys(updates).join(', ');
            logAction(projectId, agentId, 'config_update', updates, `Updated project configuration: ${updatedKeys}`);

            toast({
                title: "Global Config Modified",
                description: "The AI agent has successfully rewritten the project's biological makeup.",
            });

            return { success: true };
        } catch (error: any) {
            console.error("Agent Update Error:", error);
            toast({
                variant: "destructive",
                title: "Neural Override Failed",
                description: error.message,
            });
            return { success: false, error: error.message };
        }
    };

    const triggerBatchRender = async (projectId: string, count: number = 1, options: any = {}, agentId?: string) => {
        try {
            const { data: project, error: fetchError } = await (supabase as any)
                .from('projects')
                .select('*')
                .eq('id', projectId)
                .single();

            if (fetchError) throw fetchError;

            toast({
                title: "Dispatching Neural Batch",
                description: `Initializing ${count} render units via agent command.`,
            });

            await (supabase as any).from('projects').update({ status: 'processing', render_progress: 5 }).eq('id', projectId);

            const renderPromises = Array.from({ length: count }).map((_, i) => {
                return new Promise(resolve => setTimeout(resolve, i * 300)).then(() => 
                    supabase.functions.invoke("process-video", {
                        body: {
                            projectId,
                            prompt: options.prompt || project.prompt,
                            subtitleSettings: project.subtitle_settings,
                            aspectRatio: project.aspect_ratio,
                            beginningEffectSettings: project.beginning_effect_settings,
                            ipPopupSettings: project.ip_popup_settings,
                            endScreenSettings: project.end_screen_settings,
                            musicSettings: project.music_settings,
                            regenerateScript: true,
                            targetScriptLength: options.duration || 30,
                            effectsSettings: project.effects_settings,
                            commentGeneratorEnabled: project.comment_generator_enabled,
                            selectedCommentId: project.selected_comment_id,
                        },
                    })
                );
            });

            await Promise.all(renderPromises).then(() => {
                logAction(projectId, agentId, 'batch_render', { count, options }, `Triggered batch render of ${count} videos.`);
            });

            toast({
                title: "Batch Deployed",
                description: `Successfully pushed ${count} render jobs to the GPU cluster.`,
            });

            return { success: true, count };
        } catch (error: any) {
            console.error("Agent Render Error:", error);
            toast({
                variant: "destructive",
                title: "Deployment Aborted",
                description: error.message,
            });
            return { success: false, error: error.message };
        }
    };

    return {
        updateProjectConfig,
        triggerBatchRender,
    };
};
