export type Platform = 'tiktok' | 'youtube' | 'instagram' | 'custom';
export type AgentRole = 'strategist' | 'optimizer' | 'growth' | 'monetization';
export type PermissionLevel = 'read-only' | 'contributor' | 'admin';

export interface Project {
    id: string;
    title: string;
    prompt?: string;
    status: string;
    created_at: string;
    updated_at: string;
    subtitle_style?: string;
    aspect_ratio?: string;
    subtitle_settings?: any;
    music_settings?: any;
    youtube_settings?: any;
    description?: string;
    gamemode_id?: string;
    metrics?: {
        total_views: number;
        daily_views: number;
        health_score: number;
        vqi: number;
        momentum: number;
    };
    videos?: any[];
    voiceovers?: any[];
    onDelete?: (id: string) => void;
}

export interface Agent {
    id: string;
    name: string;
    role: AgentRole;
    skills: string[];
    permission_level: PermissionLevel;
    memory_id?: string;
    status: 'idle' | 'analyzing' | 'acting';
    created_at: string;
    onDelete?: (id: string) => void;
}

export interface Connection {
    id: string;
    agent_id: string;
    project_id: string;
    created_at: string;
}

export interface Skill {
    id: string;
    name: string;
    description: string;
    prompt: string;
    context?: any;
    api_key?: string;
    created_at: string;
    updated_at: string;
}

export interface SkillAssociation {
    agent_id: string;
    skill_id: string;
    enabled: boolean;
}
