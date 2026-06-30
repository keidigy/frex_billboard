type Series = {
  label: string;
  values: { date: string; value: number; close?: number; currency?: string }[];
};

const colors = ["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c"];

function shortDate(iso: string) {
  const date = new Date(iso);
  return `${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function pointTitle(label: string, point: Series["values"][number]) {
  const close = typeof point.close === "number" ? ` · 종가 ${point.close.toLocaleString()}${point.currency ? ` ${point.currency}` : ""}` : "";
  return `${label} · ${shortDate(point.date)} · ${point.value.toFixed(2)}%${close}`;
}

export function LineChart({ series }: { series: Series[] }) {
  const all = series.flatMap((item) => item.values.map((point) => point.value));
  const dates = Array.from(new Set(series.flatMap((item) => item.values.map((point) => point.date)))).sort();
  const min = Math.min(-5, ...all);
  const max = Math.max(5, ...all);
  const width = 360;
  const height = 184;
  const padX = 24;
  const padTop = 16;
  const padBottom = 34;
  const y = (value: number) => height - padBottom - ((value - min) / (max - min || 1)) * (height - padTop - padBottom);
  const x = (date: string) => {
    const index = dates.indexOf(date);
    return padX + (index / Math.max(dates.length - 1, 1)) * (width - padX * 2);
  };
  const visibleDates = dates.length <= 7 ? dates : dates.filter((_, index) => index === 0 || index === dates.length - 1 || index === Math.floor(dates.length / 2));

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="수익률 추이">
        <line x1={padX} x2={width - padX} y1={y(0)} y2={y(0)} className="chart-zero" />
        <text x={padX} y={y(max) - 4} className="chart-axis-label">
          {max.toFixed(1)}%
        </text>
        <text x={padX} y={y(min) + 12} className="chart-axis-label">
          {min.toFixed(1)}%
        </text>
        {series.map((item, seriesIndex) => {
          const points = item.values.length
            ? item.values
            : [
                { date: "start", value: 0, close: 0 },
                { date: "now", value: 0, close: 0 },
              ];
          const path = points
            .map((point) => {
              return `${x(point.date)},${y(point.value)}`;
            })
            .join(" ");
          const color = colors[seriesIndex % colors.length];
          return (
            <g key={item.label}>
              <polyline points={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {points.map((point) => (
                <circle key={`${item.label}-${point.date}`} cx={x(point.date)} cy={y(point.value)} r="3.2" fill={color} stroke="white" strokeWidth="1.4">
                  <title>{pointTitle(item.label, point)}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {visibleDates.map((date) => (
          <text key={date} x={x(date)} y={height - 10} textAnchor="middle" className="chart-date-label">
            {shortDate(date)}
          </text>
        ))}
      </svg>
      <p className="chart-caption">점은 수집된 일별 종가이며, 선은 시작가 대비 수익률입니다.</p>
      <div className="chart-legend">
        {series.map((item, index) => (
          <span key={item.label}>
            <i style={{ background: colors[index % colors.length] }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
