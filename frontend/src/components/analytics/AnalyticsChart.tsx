import { useMemo, useState } from 'react';

 
interface DataPoint {
    date: string;
    views: number;
    clicks: number;
}

interface AnalyticsChartProps {
    data: any[];
    type?: 'views' | 'clicks' | 'combined'; // Added combined
    height?: number;
    color?: string; // Main color
}

// Simple SVG Line Chart Component
export default function AnalyticsChart({ data, type = 'views', height = 250, color = '#3b82f6' }: AnalyticsChartProps) {
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    // Calculate Max Value for Scaling
    const maxVal = useMemo(() => {
        if (!data || data.length === 0) return 10;
        const maxViews = Math.max(...data.map(d => d.views || 0));
        const maxClicks = Math.max(...data.map(d => d.clicks || 0));
        return Math.max(maxViews, maxClicks, 5); // Minimum scale of 5
    }, [data]);

    if (!data || data.length === 0) return (
        <div className="flex items-center justify-center p-8 text-slate-500 text-sm h-full bg-slate-50/50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
            No analytics data available for this period.
        </div>
    );

    // Chart Dimensions
    const padding = 20;
    const widthPercent = 100;
    // We'll use a viewBox system. Let's say width is 1000 units for easy math.
    const viewBoxWidth = 1000;
    const viewBoxHeight = height;

    const chartWidth = viewBoxWidth - (padding * 2);
    const chartHeight = viewBoxHeight - (padding * 2);

    const stepX = chartWidth / (data.length - 1 || 1);

    // Helper to get coordinates
    const getPoint = (index: number, value: number) => {
        const x = padding + (index * stepX);
        const y = padding + chartHeight - ((value / maxVal) * chartHeight);
        return `${x},${y}`;
    };

    // Generate Path Data
    const generatePath = (key: 'views' | 'clicks') => {
        return data.map((d, i) => {
            const val = d[key] || 0;
            const action = i === 0 ? 'M' : 'L';
            return `${action} ${getPoint(i, val)}`;
        }).join(' ');
    };

    // Generate Area Data (for fill effect)
    const generateArea = (key: 'views' | 'clicks') => {
        const line = generatePath(key);
        const start = getPoint(0, 0).split(',')[0] + ',' + (padding + chartHeight);
        const end = getPoint(data.length - 1, 0).split(',')[0] + ',' + (padding + chartHeight);
        return `${line} L ${end} L ${start} Z`;
    };

    return (
        <div className="w-full relative select-none" style={{ height }}>
            <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
                preserveAspectRatio="none"
                className="overflow-visible"
                onMouseLeave={() => setHoverIndex(null)}
            >
                {/* Grid Lines (Horizontal) */}
                {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                    <line
                        key={t}
                        x1={padding}
                        y1={padding + (chartHeight * t)}
                        x2={padding + chartWidth}
                        y2={padding + (chartHeight * t)}
                        stroke="currentColor"
                        strokeOpacity="0.1"
                        strokeDasharray="4 4"
                    />
                ))}

                {/* Views Path (Blue) */}
                {(type === 'views' || type === 'combined') && (
                    <>
                        {/* Area Fill */}
                        <path
                            d={generateArea('views')}
                            fill={color}
                            fillOpacity="0.1"
                            stroke="none"
                        />
                        {/* Line Stroke */}
                        <path
                            d={generatePath('views')}
                            fill="none"
                            stroke={color}
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </>
                )}

                {/* Clicks Path (Green/Teal for contrast if combined) */}
                {(type === 'clicks' || type === 'combined') && (
                    <>
                        <path
                            d={generateArea('clicks')}
                            fill={type === 'combined' ? '#10b981' : color}
                            fillOpacity="0.1"
                            stroke="none"
                        />
                        <path
                            d={generatePath('clicks')}
                            fill="none"
                            stroke={type === 'combined' ? '#10b981' : color}
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray={type === 'combined' ? "5 5" : ""}
                        />
                    </>
                )}

                {/* Interactive Points & Tooltips */}
                {data.map((d, i) => {
                    const viewX = parseFloat(getPoint(i, d.views).split(',')[0]);
                    const viewY = parseFloat(getPoint(i, d.views).split(',')[1]);

                    const clickX = parseFloat(getPoint(i, d.clicks).split(',')[0]);
                    const clickY = parseFloat(getPoint(i, d.clicks).split(',')[1]);

                    const isHovered = hoverIndex === i;

                    return (
                        <g key={i}>
                            {/* Invisible Touch Area for Hover */}
                            <rect
                                x={viewX - (stepX / 2)}
                                y={0}
                                width={stepX}
                                height={viewBoxHeight}
                                fill="transparent"
                                onMouseEnter={() => setHoverIndex(i)}
                                className="cursor-crosshair"
                            />

                            {/* Hover Indicator Line */}
                            {isHovered && (
                                <line
                                    x1={viewX} y1={padding}
                                    x2={viewX} y2={chartHeight + padding}
                                    stroke="currentColor"
                                    strokeOpacity="0.2"
                                    strokeWidth="1"
                                />
                            )}

                            {/* Data Points (Only show on hover or endpoints) */}
                            {/* Views Point */}
                            {(type === 'views' || type === 'combined') && (
                                <circle
                                    cx={viewX} cy={viewY}
                                    r={isHovered ? 6 : 0}
                                    fill={color}
                                    stroke="white"
                                    strokeWidth="2"
                                    className="transition-all duration-200"
                                />
                            )}

                            {/* Clicks Point */}
                            {(type === 'clicks' || type === 'combined') && (
                                <circle
                                    cx={clickX} cy={clickY}
                                    r={isHovered ? 6 : 0}
                                    fill={type === 'combined' ? '#10b981' : color}
                                    stroke="white"
                                    strokeWidth="2"
                                    className="transition-all duration-200"
                                />
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* Tooltip Overlay */}
            {hoverIndex !== null && hoverIndex >= 0 && data[hoverIndex] && (
                <div
                    className="absolute bg-slate-900 text-white text-xs rounded-lg py-2 px-3 shadow-xl pointer-events-none z-10 border border-slate-700 backdrop-blur-md bg-opacity-90 transition-all duration-75"
                    style={{
                        left: `${((hoverIndex * stepX) / viewBoxWidth) * 100}%`, // Position based on index
                        top: '10px',
                        transform: 'translateX(-50%)'
                    }}
                >
                    <div className="font-bold mb-1 border-b border-slate-700 pb-1 text-slate-300">
                        {new Date(data[hoverIndex].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                    {(type === 'views' || type === 'combined') && (
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: color }}></div>
                            <span>Views: <span className="font-bold">{data[hoverIndex].views}</span></span>
                        </div>
                    )}
                    {(type === 'clicks' || type === 'combined') && (
                        <div className="flex items-center gap-2 mt-1">
                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                            <span>Clicks: <span className="font-bold">{data[hoverIndex].clicks}</span></span>
                        </div>
                    )}
                </div>
            )}

            {/* Dates X-Axis */}
            <div className="flex justify-between text-[10px] text-slate-400 mt-2 px-2 uppercase tracking-wider font-semibold">
                <span>{new Date(data[0].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                <span className="hidden sm:inline">{new Date(data[Math.floor(data.length / 2)].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                <span>{new Date(data[data.length - 1].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            </div>
        </div>
    );
}
