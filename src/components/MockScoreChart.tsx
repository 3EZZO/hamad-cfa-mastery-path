import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface MockChartPoint {
  name: string;
  score: number;
  target: number;
  /** Pre-formatted section chips, weakest first; empty when not recorded. */
  sections?: string[];
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--border, #d9ddd7)",
  backgroundColor: "var(--surface, #fff)",
  color: "var(--ink, #132c44)",
  fontSize: 12,
  padding: "8px 10px",
} as const;

/** Score, target and, when the tutor tallied them, the section results. */
function MockTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: MockChartPoint }>;
  label?: string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div style={tooltipStyle} role="presentation">
      <strong style={{ display: "block", marginBottom: 4 }}>{label}</strong>
      <div>Actual score: {point.score}%</div>
      <div>Internal target: {point.target}%</div>
      {point.sections?.length ? (
        <ul style={{ margin: "6px 0 0", paddingLeft: 14, opacity: 0.9 }}>
          {point.sections.map((section) => (
            <li key={section}>{section}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function MockScoreChart({ data }: { data: MockChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 16, right: 12, left: -18, bottom: 4 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--chart-grid, rgba(23,55,57,.12))"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "var(--chart-tick, #61706d)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 20, 40, 60, 80, 100]}
          tick={{ fontSize: 11, fill: "var(--chart-tick, #61706d)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<MockTooltip />} />
        <Line
          type="monotone"
          dataKey="target"
          name="Internal target"
          stroke="var(--chart-target, #b18939)"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="score"
          name="Actual score"
          stroke="var(--chart-score, #153f42)"
          strokeWidth={3}
          dot={{ r: 5, fill: "var(--chart-target, #d1a950)", stroke: "var(--chart-score, #153f42)", strokeWidth: 2 }}
          activeDot={{ r: 7 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
