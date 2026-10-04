import { useId } from "react";
import type { MockFigure, MockQuestion, MockTable } from "../../lib/mockTestContent";

/**
 * The exhibits that belong to a question stem: its table and its figure.
 * Shared by the exam screen, the student's review and the tutor's answer-key
 * review so a question looks the same everywhere.
 */
export function MockExhibits({ question }: { question: Pick<MockQuestion, "table" | "figure"> }) {
  return (
    <>
      {question.figure && <MockFigureView figure={question.figure} />}
      {question.table && <MockTableView table={question.table} />}
    </>
  );
}

export function MockTableView({ table }: { table: MockTable }) {
  return (
    <div className="mock-table-wrap">
      <table className="mock-table">
        {table.caption && <caption>{table.caption}</caption>}
        <thead>
          <tr>{table.headers.map((header, column) => <th key={column} scope="col">{header}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.cells.map((cell, column) => column === 0
                ? <th key={column} scope="row">{cell}</th>
                : <td key={column}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Drawing area in SVG units; the SVG scales to the available width.
const W = 480;
const H = 320;
const PAD = { left: 58, right: 18, top: 18, bottom: 50 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** Up to four significant figures, without trailing zeros. */
export function formatTick(value: number): string {
  if (value === 0) return "0";
  return String(Number(value.toPrecision(4)));
}

export function MockFigureView({ figure }: { figure: MockFigure }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const sx = (x: number) => PAD.left + ((x - figure.xMin) / (figure.xMax - figure.xMin)) * PLOT_W;
  const sy = (y: number) => PAD.top + PLOT_H - ((y - figure.yMin) / (figure.yMax - figure.yMin)) * PLOT_H;
  const baseline = sy(Math.max(figure.yMin, Math.min(0, figure.yMax)));
  return (
    <figure className="mock-figure">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
        className="mock-figure__svg"
      >
        <title id={`${id}-title`}>{figure.title}</title>
        <desc id={`${id}-desc`}>{figure.description}</desc>
        <defs>
          <clipPath id={`${id}-plot`}>
            <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} />
          </clipPath>
        </defs>
        {figure.yTicks.map(tick => (
          <g key={`y${tick}`} className="mock-figure__tick">
            <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={sy(tick)} y2={sy(tick)} className="mock-figure__grid" />
            <text x={PAD.left - 8} y={sy(tick)} textAnchor="end" dominantBaseline="middle">{formatTick(tick)}</text>
          </g>
        ))}
        {figure.xTicks.map(tick => (
          <g key={`x${tick}`} className="mock-figure__tick">
            <line x1={sx(tick)} x2={sx(tick)} y1={PAD.top} y2={PAD.top + PLOT_H} className="mock-figure__grid" />
            <text x={sx(tick)} y={PAD.top + PLOT_H + 16} textAnchor="middle">{formatTick(tick)}</text>
          </g>
        ))}
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + PLOT_H} className="mock-figure__axis" />
        <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={PAD.top + PLOT_H} y2={PAD.top + PLOT_H} className="mock-figure__axis" />
        <text x={PAD.left + PLOT_W / 2} y={H - 8} textAnchor="middle" className="mock-figure__axis-label">{figure.xLabel}</text>
        <text
          x={14}
          y={PAD.top + PLOT_H / 2}
          textAnchor="middle"
          transform={`rotate(-90 14 ${PAD.top + PLOT_H / 2})`}
          className="mock-figure__axis-label"
        >
          {figure.yLabel}
        </text>
        <g clipPath={`url(#${id}-plot)`}>
          {figure.guides.map((guide, index) => guide.axis === "x"
            ? <line key={`g${index}`} x1={sx(guide.value)} x2={sx(guide.value)} y1={PAD.top} y2={PAD.top + PLOT_H} className="mock-figure__guide" />
            : <line key={`g${index}`} x1={PAD.left} x2={PAD.left + PLOT_W} y1={sy(guide.value)} y2={sy(guide.value)} className="mock-figure__guide" />)}
          {figure.series.map((series, index) => {
            const tone = `mock-figure__series mock-figure__series--${series.tone}${series.dashed ? " is-dashed" : ""}`;
            if (series.kind === "line") {
              return <polyline key={index} className={tone} points={series.points.map(point => `${sx(point.x)},${sy(point.y)}`).join(" ")} />;
            }
            if (series.kind === "scatter") {
              return (
                <g key={index} className={tone}>
                  {series.points.map((point, pointIndex) => <circle key={pointIndex} cx={sx(point.x)} cy={sy(point.y)} r={4} />)}
                </g>
              );
            }
            const xs = series.points.map(point => sx(point.x)).sort((left, right) => left - right);
            const gaps = xs.slice(1).map((value, pointIndex) => value - xs[pointIndex]!);
            const width = Math.max(4, Math.min(48, (gaps.length ? Math.min(...gaps) : PLOT_W / 4) * 0.7));
            return (
              <g key={index} className={`${tone} is-bar`}>
                {series.points.map((point, pointIndex) => (
                  <rect
                    key={pointIndex}
                    x={sx(point.x) - width / 2}
                    y={Math.min(sy(point.y), baseline)}
                    width={width}
                    height={Math.abs(baseline - sy(point.y))}
                  />
                ))}
              </g>
            );
          })}
        </g>
        {figure.guides.map((guide, index) => guide.label && (guide.axis === "x"
          // Labels of vertical guides stack in rows so neighbouring lines (e.g. mean and mode) stay readable.
          ? <text key={`gl${index}`} x={sx(guide.value) + 4} y={PAD.top + 12 + 16 * figure.guides.slice(0, index).filter(other => other.axis === "x" && other.label).length} className="mock-figure__guide-label">{guide.label}</text>
          : <text key={`gl${index}`} x={PAD.left + 6} y={sy(guide.value) - 5} className="mock-figure__guide-label">{guide.label}</text>))}
        {figure.markers.map((marker, index) => (
          <g key={`m${index}`} className="mock-figure__marker">
            <circle cx={sx(marker.x)} cy={sy(marker.y)} r={4.5} />
            <text x={sx(marker.x) + 7} y={sy(marker.y) - 7}>{marker.label}</text>
          </g>
        ))}
      </svg>
      <figcaption>
        <strong>{figure.title}</strong>
        <ul className="mock-figure__legend" aria-label="Legend">
          {figure.series.map((series, index) => (
            <li key={index}>
              <i className={`mock-figure__swatch mock-figure__swatch--${series.tone}${series.dashed ? " is-dashed" : ""}${series.kind === "line" ? "" : " is-solid"}`} aria-hidden="true" />
              {series.label}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
