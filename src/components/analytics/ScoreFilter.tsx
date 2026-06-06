import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

export type ScoreRange = "0-20" | "20-50" | "50-70" | "70-90" | "90-100" | "100+";

interface ScoreFilterProps {
    selectedRanges: ScoreRange[];
    onRangeToggle: (range: ScoreRange) => void;
    selectedGamemode: string | null;
    onGamemodeChange: (mode: string | null) => void;
}

export function ScoreFilter({
    selectedRanges,
    onRangeToggle,
    selectedGamemode,
    onGamemodeChange
}: ScoreFilterProps) {

    const ranges: { label: string; value: ScoreRange; color: string }[] = [
        { label: "0-20 (Reject)", value: "0-20", color: "bg-red-500/10 text-red-500 border-red-500/20" },
        { label: "20-50 (Crawl)", value: "20-50", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
        { label: "50-70 (Fit)", value: "50-70", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
        { label: "70-90 (High Velocity)", value: "70-90", color: "bg-green-500/10 text-green-500 border-green-500/20" },
        { label: "90-100 (Dominant)", value: "90-100", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
        { label: "100+ (Viral)", value: "100+", color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" },
    ];

    return (
        <div className="flex items-center space-x-4 p-4 bg-card rounded-lg border shadow-sm">
            <div className="flex flex-wrap gap-2 items-center flex-1">
                <span className="text-sm font-medium text-muted-foreground mr-2">
                    Score Range:
                </span>
                {ranges.map((range) => {
                    const isSelected = selectedRanges.includes(range.value);
                    return (
                        <button
                            key={range.value}
                            onClick={() => onRangeToggle(range.value)}
                            className={`
                px-3 py-1 text-xs rounded-full border transition-all
                ${isSelected
                                    ? `${range.color} ring-1 ring-offset-1 ring-offset-background`
                                    : "bg-background border-input hover:bg-accent text-muted-foreground"}
              `}
                        >
                            {range.label}
                        </button>
                    );
                })}
            </div>

            <div className="w-[1px] h-8 bg-border" />

            <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-muted-foreground">
                    Gamemode:
                </span>
                <Select
                    value={selectedGamemode || "all"}
                    onValueChange={(val) => onGamemodeChange(val === "all" ? null : val)}
                >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="All Modes" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Modes</SelectItem>
                        <SelectItem value="educational">Educational</SelectItem>
                        <SelectItem value="storytelling">Storytelling</SelectItem>
                        <SelectItem value="gameplay">Gameplay</SelectItem>
                        <SelectItem value="reaction">Reaction</SelectItem>
                        <SelectItem value="asmr">ASMR</SelectItem>
                    </SelectContent>
                </Select>

                {selectedGamemode && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onGamemodeChange(null)}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
    );
}
