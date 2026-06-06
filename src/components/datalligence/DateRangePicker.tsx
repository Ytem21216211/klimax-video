import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import type { DateRange } from "@/hooks/useAnalyticsData";

const PRESETS: { label: string; days: number }[] = [
    { label: "7d", days: 7 },
    { label: "30d", days: 30 },
    { label: "90d", days: 90 },
    { label: "1y", days: 365 },
    { label: "All", days: 0 },
];

interface DateRangePickerProps {
    value: DateRange | undefined;
    onChange: (range: DateRange | undefined) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
    const activeDays = value
        ? Math.round(
            (value.to.getTime() - value.from.getTime()) / (1000 * 60 * 60 * 24)
        )
        : 0;

    return (
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-0.5">
            <Calendar className="w-3.5 h-3.5 text-gray-500 ml-2" />
            {PRESETS.map((preset) => {
                const isActive =
                    preset.days === 0
                        ? !value
                        : activeDays === preset.days;

                return (
                    <Button
                        key={preset.label}
                        variant="ghost"
                        size="sm"
                        className={`h-6 px-2.5 text-xs rounded-md transition-all ${isActive
                                ? "bg-emerald-500/20 text-emerald-400 shadow-sm"
                                : "text-gray-400 hover:text-white hover:bg-white/5"
                            }`}
                        onClick={() => {
                            if (preset.days === 0) {
                                onChange(undefined);
                            } else {
                                onChange({
                                    from: new Date(Date.now() - preset.days * 24 * 60 * 60 * 1000),
                                    to: new Date(),
                                });
                            }
                        }}
                    >
                        {preset.label}
                    </Button>
                );
            })}
        </div>
    );
}
