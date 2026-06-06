import React from 'react';
import {
    BaseEdge,
    EdgeLabelRenderer,
    EdgeProps,
    getBezierPath,
} from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from '@/components/ui/use-toast';

export const DeleteEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    selected,
}: EdgeProps) => {
    const { toast } = useToast();
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    const onEdgeClick = async (evt: React.MouseEvent) => {
        evt.stopPropagation();
        const { error } = await (supabase as any).from('agentik_connections').delete().eq('id', id);

        if (error) {
            toast({
                title: "Delete Failed",
                description: error.message,
                variant: "destructive",
            });
        } else {
            toast({
                title: "Link Severed",
                description: "The neural connection has been dropped.",
            });
        }
    };

    return (
        <>
            <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
            <EdgeLabelRenderer>
                {selected && (
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            fontSize: 12,
                            pointerEvents: 'all',
                        }}
                        className="nodrag nopan"
                    >
                        <button
                            className="w-10 h-10 bg-[#ff2d55] hover:bg-[#ff3b30] text-white rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(255,45,85,0.4)] border-2 border-white/20 transition-all hover:scale-110 active:scale-90 group z-50"
                            onClick={onEdgeClick}
                        >
                            <Trash2 className="w-5 h-5 shadow-sm" />
                        </button>
                    </div>
                )}
            </EdgeLabelRenderer>
        </>
    );
};
