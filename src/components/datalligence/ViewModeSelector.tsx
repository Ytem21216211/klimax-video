import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe, FolderOpen, Gamepad2 } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { ViewMode, Gamemode, Project } from "@/hooks/useAnalyticsData";

interface ViewModeSelectorProps {
    viewMode: ViewMode;
    onChange: (mode: ViewMode) => void;
    gamemodes: Gamemode[];
    projects: Project[];
}

export function ViewModeSelector({
    viewMode,
    onChange,
    gamemodes,
    projects,
}: ViewModeSelectorProps) {
    return (
        <div className="flex items-center gap-3">
            <Tabs
                value={viewMode.type}
                onValueChange={(v) =>
                    onChange({ type: v as ViewMode["type"], id: undefined })
                }
            >
                <TabsList className="bg-white/5 border border-white/10">
                    <TabsTrigger
                        value="global"
                        className="gap-1.5 text-xs data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400"
                    >
                        <Globe className="w-3.5 h-3.5" />
                        Global
                    </TabsTrigger>
                    <TabsTrigger
                        value="project"
                        className="gap-1.5 text-xs data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400"
                    >
                        <FolderOpen className="w-3.5 h-3.5" />
                        Project
                    </TabsTrigger>
                    <TabsTrigger
                        value="gamemode"
                        className="gap-1.5 text-xs data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400"
                    >
                        <Gamepad2 className="w-3.5 h-3.5" />
                        Gamemode
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            {viewMode.type === "project" && (
                <Select
                    value={viewMode.id || ""}
                    onValueChange={(id) => onChange({ type: "project", id })}
                >
                    <SelectTrigger className="w-48 h-8 text-xs bg-white/5 border-white/10">
                        <SelectValue placeholder="Select project..." />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d1117] border-white/10">
                        {projects.map((p) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">
                                {p.title}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}

            {viewMode.type === "gamemode" && (
                <Select
                    value={viewMode.id || ""}
                    onValueChange={(id) => onChange({ type: "gamemode", id })}
                >
                    <SelectTrigger className="w-48 h-8 text-xs bg-white/5 border-white/10">
                        <SelectValue placeholder="Select gamemode..." />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d1117] border-white/10">
                        {gamemodes.map((g) => (
                            <SelectItem key={g.id} value={g.id} className="text-xs">
                                {g.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
        </div>
    );
}
