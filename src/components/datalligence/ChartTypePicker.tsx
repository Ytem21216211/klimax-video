import {
    BarChart3,
    LineChart as LineIcon,
    PieChart as PieIcon,
    Activity,
    Target,
    TrendingUp,
    Grid3X3,
    Radar as RadarIcon,
    ScatterChart as ScatterIcon,
    Table2,
    Gauge,
    BarChart2,
    Layers,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export type ChartType =
    | "line"
    | "area"
    | "bar"
    | "bar_horizontal"
    | "stacked_bar"
    | "grouped_bar"
    | "donut"
    | "pie"
    | "radar"
    | "scatter"
    | "treemap"
    | "funnel"
    | "bullet"
    | "gauge"
    | "heatmap"
    | "waterfall"
    | "kpi"
    | "table";

const CHART_OPTIONS: { type: ChartType; label: string; icon: React.ReactNode; group: string }[] = [
    { type: "kpi", label: "KPI Card", icon: <Target className="w-4 h-4" />, group: "Overview" },
    { type: "line", label: "Line Chart", icon: <LineIcon className="w-4 h-4" />, group: "Trends" },
    { type: "area", label: "Area Chart", icon: <Activity className="w-4 h-4" />, group: "Trends" },
    { type: "bar", label: "Bar Chart", icon: <BarChart3 className="w-4 h-4" />, group: "Comparison" },
    { type: "bar_horizontal", label: "Horizontal Bar", icon: <BarChart2 className="w-4 h-4" />, group: "Comparison" },
    { type: "stacked_bar", label: "Stacked Bar", icon: <Layers className="w-4 h-4" />, group: "Comparison" },
    { type: "grouped_bar", label: "Grouped Bar", icon: <BarChart3 className="w-4 h-4" />, group: "Comparison" },
    { type: "donut", label: "Donut Chart", icon: <PieIcon className="w-4 h-4" />, group: "Distribution" },
    { type: "pie", label: "Pie Chart", icon: <PieIcon className="w-4 h-4" />, group: "Distribution" },
    { type: "treemap", label: "Treemap", icon: <Grid3X3 className="w-4 h-4" />, group: "Distribution" },
    { type: "radar", label: "Radar Chart", icon: <RadarIcon className="w-4 h-4" />, group: "Profile" },
    { type: "scatter", label: "Scatter Plot", icon: <ScatterIcon className="w-4 h-4" />, group: "Correlation" },
    { type: "funnel", label: "Funnel", icon: <TrendingUp className="w-4 h-4" />, group: "Flow" },
    { type: "bullet", label: "Bullet Chart", icon: <Target className="w-4 h-4" />, group: "Targets" },
    { type: "gauge", label: "Gauge", icon: <Gauge className="w-4 h-4" />, group: "Targets" },
    { type: "heatmap", label: "Heatmap", icon: <Grid3X3 className="w-4 h-4" />, group: "Pattern" },
    { type: "waterfall", label: "Waterfall", icon: <BarChart3 className="w-4 h-4" />, group: "Flow" },
    { type: "table", label: "Data Table", icon: <Table2 className="w-4 h-4" />, group: "Data" },
];

interface ChartTypePickerProps {
    value: ChartType;
    onChange: (type: ChartType) => void;
}

export function ChartTypePicker({ value, onChange }: ChartTypePickerProps) {
    const current = CHART_OPTIONS.find((o) => o.type === value);
    const groups = [...new Set(CHART_OPTIONS.map((o) => o.group))];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs text-gray-400 hover:text-white"
                >
                    {current?.icon}
                    {current?.label}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-48 bg-[#0d1117] border-white/10"
            >
                {groups.map((group, gi) => (
                    <div key={group}>
                        {gi > 0 && <DropdownMenuSeparator className="bg-white/5" />}
                        <DropdownMenuLabel className="text-[10px] text-gray-500 uppercase">
                            {group}
                        </DropdownMenuLabel>
                        {CHART_OPTIONS.filter((o) => o.group === group).map((option) => (
                            <DropdownMenuItem
                                key={option.type}
                                onClick={() => onChange(option.type)}
                                className={`gap-2 text-xs cursor-pointer ${option.type === value
                                        ? "text-emerald-400 bg-emerald-500/10"
                                        : "text-gray-300 hover:text-white"
                                    }`}
                            >
                                {option.icon}
                                {option.label}
                            </DropdownMenuItem>
                        ))}
                    </div>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
