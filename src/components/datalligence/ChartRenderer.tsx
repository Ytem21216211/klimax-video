import { useMemo } from "react";
import {
    ResponsiveContainer,
    LineChart,
    Line,
    AreaChart,
    Area,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    RadarChart,
    Radar,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ScatterChart,
    Scatter,
    Treemap,
    FunnelChart,
    Funnel,
    LabelList,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from "recharts";
import type { ChartType } from "./ChartTypePicker";
import { formatMetricValue } from "@/hooks/useAnalyticsData";

const COLORS = [
    "#10b981", "#06b6d4", "#8b5cf6", "#f59e0b", "#ef4444",
    "#ec4899", "#14b8a6", "#6366f1", "#84cc16", "#f97316",
];

const GLOW_FILTER = (
    <defs>
        <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
            </feMerge>
        </filter>
    </defs>
);

interface ChartDataPoint {
    name: string;
    [key: string]: any;
}

interface ChartRendererProps {
    type: ChartType;
    data: ChartDataPoint[];
    dataKeys: string[];
    format?: string;
    height?: number;
    colors?: string[];
}

const CustomTooltip = ({ active, payload, label, format }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 shadow-xl backdrop-blur-xl">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            {payload.map((entry: any, idx: number) => (
                <p key={idx} className="text-sm font-semibold" style={{ color: entry.color }}>
                    {entry.name}: {formatMetricValue(entry.value, format || "number")}
                </p>
            ))}
        </div>
    );
};

export function ChartRenderer({
    type,
    data,
    dataKeys,
    format = "number",
    height = 250,
    colors = COLORS,
}: ChartRendererProps) {
    const chartColors = useMemo(
        () => dataKeys.map((_, i) => colors[i % colors.length]),
        [dataKeys, colors]
    );

    if (!data.length) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                No data available
            </div>
        );
    }

    const commonAxisProps = {
        tick: { fill: "#6b7280", fontSize: 11 },
        axisLine: { stroke: "#1f2937" },
        tickLine: false,
    };

    switch (type) {
        case "line":
            return (
                <ResponsiveContainer width="100%" height={height}>
                    <LineChart data={data}>
                        {GLOW_FILTER}
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="name" {...commonAxisProps} />
                        <YAxis {...commonAxisProps} />
                        <Tooltip content={<CustomTooltip format={format} />} />
                        {dataKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                        {dataKeys.map((key, i) => (
                            <Line
                                key={key}
                                type="monotone"
                                dataKey={key}
                                stroke={chartColors[i]}
                                strokeWidth={2.5}
                                dot={{ r: 3, fill: chartColors[i] }}
                                activeDot={{ r: 5, strokeWidth: 2 }}
                                filter="url(#glow)"
                                animationDuration={1200}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            );

        case "area":
            return (
                <ResponsiveContainer width="100%" height={height}>
                    <AreaChart data={data}>
                        {GLOW_FILTER}
                        <defs>
                            {dataKeys.map((key, i) => (
                                <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={chartColors[i]} stopOpacity={0.4} />
                                    <stop offset="95%" stopColor={chartColors[i]} stopOpacity={0} />
                                </linearGradient>
                            ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="name" {...commonAxisProps} />
                        <YAxis {...commonAxisProps} />
                        <Tooltip content={<CustomTooltip format={format} />} />
                        {dataKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                        {dataKeys.map((key, i) => (
                            <Area
                                key={key}
                                type="monotone"
                                dataKey={key}
                                stroke={chartColors[i]}
                                strokeWidth={2}
                                fill={`url(#grad-${key})`}
                                animationDuration={1200}
                            />
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            );

        case "bar":
            return (
                <ResponsiveContainer width="100%" height={height}>
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="name" {...commonAxisProps} />
                        <YAxis {...commonAxisProps} />
                        <Tooltip content={<CustomTooltip format={format} />} />
                        {dataKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                        {dataKeys.map((key, i) => (
                            <Bar
                                key={key}
                                dataKey={key}
                                fill={chartColors[i]}
                                radius={[4, 4, 0, 0]}
                                animationDuration={800}
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            );

        case "bar_horizontal":
            return (
                <ResponsiveContainer width="100%" height={height}>
                    <BarChart data={data} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis type="number" {...commonAxisProps} />
                        <YAxis dataKey="name" type="category" {...commonAxisProps} width={80} />
                        <Tooltip content={<CustomTooltip format={format} />} />
                        {dataKeys.map((key, i) => (
                            <Bar
                                key={key}
                                dataKey={key}
                                fill={chartColors[i]}
                                radius={[0, 4, 4, 0]}
                                animationDuration={800}
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            );

        case "stacked_bar":
            return (
                <ResponsiveContainer width="100%" height={height}>
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="name" {...commonAxisProps} />
                        <YAxis {...commonAxisProps} />
                        <Tooltip content={<CustomTooltip format={format} />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {dataKeys.map((key, i) => (
                            <Bar
                                key={key}
                                dataKey={key}
                                stackId="stack"
                                fill={chartColors[i]}
                                radius={i === dataKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                animationDuration={800}
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            );

        case "grouped_bar":
            return (
                <ResponsiveContainer width="100%" height={height}>
                    <BarChart data={data} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="name" {...commonAxisProps} />
                        <YAxis {...commonAxisProps} />
                        <Tooltip content={<CustomTooltip format={format} />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {dataKeys.map((key, i) => (
                            <Bar
                                key={key}
                                dataKey={key}
                                fill={chartColors[i]}
                                radius={[4, 4, 0, 0]}
                                animationDuration={800}
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            );

        case "donut":
        case "pie": {
            const innerRadius = type === "donut" ? 60 : 0;
            const pieData = data.map((d, i) => ({
                name: d.name,
                value: d[dataKeys[0]] || 0,
                fill: chartColors[i % chartColors.length],
            }));
            return (
                <ResponsiveContainer width="100%" height={height}>
                    <PieChart>
                        <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={innerRadius}
                            outerRadius={90}
                            paddingAngle={3}
                            dataKey="value"
                            animationDuration={1000}
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                            {pieData.map((entry, i) => (
                                <Cell key={i} fill={entry.fill} stroke="transparent" />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip format={format} />} />
                    </PieChart>
                </ResponsiveContainer>
            );
        }

        case "radar": {
            return (
                <ResponsiveContainer width="100%" height={height}>
                    <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
                        <PolarGrid stroke="#1f2937" />
                        <PolarAngleAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 10 }} />
                        <PolarRadiusAxis tick={{ fill: "#4b5563", fontSize: 9 }} />
                        {dataKeys.map((key, i) => (
                            <Radar
                                key={key}
                                name={key}
                                dataKey={key}
                                stroke={chartColors[i]}
                                fill={chartColors[i]}
                                fillOpacity={0.2}
                                animationDuration={1000}
                            />
                        ))}
                        <Tooltip content={<CustomTooltip format={format} />} />
                        {dataKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                    </RadarChart>
                </ResponsiveContainer>
            );
        }

        case "scatter":
            return (
                <ResponsiveContainer width="100%" height={height}>
                    <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey={dataKeys[0]} name={dataKeys[0]} {...commonAxisProps} />
                        <YAxis dataKey={dataKeys[1] || dataKeys[0]} name={dataKeys[1] || dataKeys[0]} {...commonAxisProps} />
                        <Tooltip content={<CustomTooltip format={format} />} />
                        <Scatter
                            data={data}
                            fill={chartColors[0]}
                            animationDuration={1000}
                        />
                    </ScatterChart>
                </ResponsiveContainer>
            );

        case "treemap": {
            const treemapData = data.map((d, i) => ({
                name: d.name,
                size: d[dataKeys[0]] || 0,
                fill: chartColors[i % chartColors.length],
            }));
            return (
                <ResponsiveContainer width="100%" height={height}>
                    <Treemap
                        data={treemapData}
                        dataKey="size"
                        nameKey="name"
                        aspectRatio={4 / 3}
                        animationDuration={800}
                    >
                        <Tooltip content={<CustomTooltip format={format} />} />
                    </Treemap>
                </ResponsiveContainer>
            );
        }

        case "funnel": {
            const funnelData = data.map((d, i) => ({
                name: d.name,
                value: d[dataKeys[0]] || 0,
                fill: chartColors[i % chartColors.length],
            }));
            return (
                <ResponsiveContainer width="100%" height={height}>
                    <FunnelChart>
                        <Tooltip content={<CustomTooltip format={format} />} />
                        <Funnel
                            dataKey="value"
                            data={funnelData}
                            isAnimationActive
                            animationDuration={800}
                        >
                            <LabelList position="center" fill="#fff" fontSize={11} dataKey="name" />
                        </Funnel>
                    </FunnelChart>
                </ResponsiveContainer>
            );
        }

        case "bullet": {
            // Bullet chart: target line with actual bar
            return (
                <ResponsiveContainer width="100%" height={height}>
                    <BarChart data={data} layout="vertical" barSize={20}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis type="number" {...commonAxisProps} />
                        <YAxis dataKey="name" type="category" {...commonAxisProps} width={80} />
                        <Tooltip content={<CustomTooltip format={format} />} />
                        {dataKeys.map((key, i) => (
                            <Bar
                                key={key}
                                dataKey={key}
                                fill={chartColors[i]}
                                radius={[0, 4, 4, 0]}
                                animationDuration={800}
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            );
        }

        case "gauge": {
            // Simple gauge using SVG arc
            const value = data[0]?.[dataKeys[0]] || 0;
            const max = 100;
            const pct = Math.min(value / max, 1);
            const angle = pct * 180;
            const radius = 70;
            const cx = 120;
            const cy = 100;

            const polarToCartesian = (a: number) => ({
                x: cx + radius * Math.cos(((180 - a) * Math.PI) / 180),
                y: cy - radius * Math.sin(((180 - a) * Math.PI) / 180),
            });

            const start = polarToCartesian(0);
            const end = polarToCartesian(angle);
            const largeArc = angle > 90 ? 1 : 0;

            return (
                <div className="flex flex-col items-center justify-center" style={{ height }}>
                    <svg width={240} height={130} viewBox="0 0 240 130">
                        {/* Background arc */}
                        <path
                            d={`M ${polarToCartesian(0).x} ${polarToCartesian(0).y} A ${radius} ${radius} 0 0 1 ${polarToCartesian(180).x} ${polarToCartesian(180).y}`}
                            fill="none"
                            stroke="#1f2937"
                            strokeWidth={14}
                            strokeLinecap="round"
                        />
                        {/* Value arc */}
                        {angle > 0 && (
                            <path
                                d={`M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`}
                                fill="none"
                                stroke={chartColors[0]}
                                strokeWidth={14}
                                strokeLinecap="round"
                                style={{
                                    filter: `drop-shadow(0 0 6px ${chartColors[0]}80)`,
                                }}
                            />
                        )}
                        <text x={cx} y={cy + 5} textAnchor="middle" fill={chartColors[0]} fontSize={28} fontWeight="bold">
                            {formatMetricValue(value, format)}
                        </text>
                    </svg>
                </div>
            );
        }

        case "heatmap": {
            // Grid heatmap
            const maxVal = Math.max(...data.map((d) => d[dataKeys[0]] || 0), 1);
            const cols = Math.min(data.length, 7);
            const rows = Math.ceil(data.length / cols);

            return (
                <div className="grid gap-1 p-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, height }}>
                    {data.map((d, i) => {
                        const val = d[dataKeys[0]] || 0;
                        const intensity = val / maxVal;
                        return (
                            <div
                                key={i}
                                className="rounded-md flex items-center justify-center text-[10px] font-medium transition-all hover:scale-105"
                                style={{
                                    backgroundColor: `rgba(16, 185, 129, ${0.1 + intensity * 0.8})`,
                                    color: intensity > 0.5 ? "#fff" : "#6b7280",
                                }}
                                title={`${d.name}: ${formatMetricValue(val, format)}`}
                            >
                                <div className="text-center">
                                    <div>{d.name}</div>
                                    <div className="font-bold">{formatMetricValue(val, format)}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            );
        }

        case "waterfall": {
            // Waterfall using stacked bars with invisible base
            const waterfallData = data.map((d, i) => {
                const val = d[dataKeys[0]] || 0;
                return {
                    name: d.name,
                    value: Math.abs(val),
                    fill: val >= 0 ? chartColors[0] : "#ef4444",
                };
            });

            return (
                <ResponsiveContainer width="100%" height={height}>
                    <BarChart data={waterfallData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="name" {...commonAxisProps} />
                        <YAxis {...commonAxisProps} />
                        <Tooltip content={<CustomTooltip format={format} />} />
                        <Bar dataKey="value" animationDuration={800} radius={[4, 4, 0, 0]}>
                            {waterfallData.map((entry, i) => (
                                <Cell key={i} fill={entry.fill} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            );
        }

        case "table": {
            return (
                <div className="overflow-auto w-full h-full border border-white/10 rounded-lg">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs uppercase bg-white/5 text-gray-400 sticky top-0">
                            <tr>
                                <th className="px-4 py-2">Name</th>
                                {dataKeys.map((key) => (
                                    <th key={key} className="px-4 py-2">{key.replace(/_/g, " ")}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {data.map((row, i) => (
                                <tr key={i} className="hover:bg-white/5 transition-colors">
                                    <td className="px-4 py-2 font-medium">{row.name}</td>
                                    {dataKeys.map((key) => (
                                        <td key={key} className="px-4 py-2 text-gray-300">
                                            {formatMetricValue(row[key], format)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }

        default:
            return (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                    Chart type "{type}" not rendered
                </div>
            );
    }
}
