import { useId } from "react";
import type { MockFigure, MockQuestion, MockReviewItem, MockTable, MockTree, MockTreeNode } from "../../lib/mockTestContent";

/**
 * The exhibits that belong to a question stem: its figure or tree and its
 * table. Shared by the exam screen, the student's review and the tutor's
 * answer-key review so a question looks the same everywhere.
 */
export function MockExhibits({ question }: { question: Pick<MockQuestion, "table" | "figure" | "tree"> }) {
  return (
    <>
      {question.figure && <MockFigureView figure={question.figure} />}
      {question.tree && <MockTreeView tree={question.tree} />}
      {question.table && <MockTableView table={question.table} />}
    </>
  );
}

/** A worked graphic shown only after the attempt, e.g. the tree the question asked the student to build. */
export function MockReviewExhibits({ item }: { item: Pick<MockReviewItem, "reviewFigure" | "reviewTree"> }) {
  if (!item.reviewFigure && !item.reviewTree) return null;
  return (
    <div className="mock-review__worked">
      <p className="mock-review__worked-label">Worked graphic</p>
      {item.reviewFigure && <MockFigureView figure={item.reviewFigure} />}
      {item.reviewTree && <MockTreeView tree={item.reviewTree} />}
    </div>
  );
}

interface PlacedNode {
  node: MockTreeNode;
  depth: number;
  y: number;
  parentY: number;
}

/** Lays a tree out left to right: one row per leaf, a parent centred on its children. */
export function layoutTree(tree: MockTree): { nodes: PlacedNode[]; leaves: number; depth: number } {
  const nodes: PlacedNode[] = [];
  let leaf = 0;
  let maxDepth = 1;
  const place = (node: MockTreeNode, depth: number, parentY: number | null): number => {
    maxDepth = Math.max(maxDepth, depth);
    const placed: PlacedNode = { node, depth, y: 0, parentY: 0 };
    nodes.push(placed);
    if (node.children.length === 0) {
      placed.y = leaf;
      leaf += 1;
    } else {
      const ys = node.children.map(child => place(child, depth + 1, null));
      placed.y = (ys[0]! + ys[ys.length - 1]!) / 2;
      // Children were placed before the parent's own row was known.
      for (const other of nodes) if (node.children.includes(other.node)) other.parentY = placed.y;
    }
    if (parentY !== null) placed.parentY = parentY;
    return placed.y;
  };
  const rootYs = tree.branches.map(branch => place(branch, 1, null));
  const rootY = (rootYs[0]! + rootYs[rootYs.length - 1]!) / 2;
  for (const placed of nodes) if (placed.depth === 1) placed.parentY = rootY;
  return { nodes, leaves: leaf, depth: maxDepth };
}

const TREE_COLUMN = 170;
const TREE_ROW = 46;
const TREE_PAD = { left: 18, right: 150, top: 22, bottom: 14 };

function TreeOutline({ nodes }: { nodes: MockTreeNode[] }) {
  return (
    <ul>
      {nodes.map((node, index) => (
        <li key={index}>
          {node.label}: {node.probability}{node.note ? ` (${node.note})` : ""}
          {node.children.length > 0 && <TreeOutline nodes={node.children} />}
        </li>
      ))}
    </ul>
  );
}

/** A probability tree drawn from its data; branch probabilities stay exactly as written. */
export function MockTreeView({ tree }: { tree: MockTree }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { nodes, leaves, depth } = layoutTree(tree);
  const width = TREE_PAD.left + depth * TREE_COLUMN + TREE_PAD.right;
  const height = TREE_PAD.top + Math.max(1, leaves) * TREE_ROW + TREE_PAD.bottom;
  const x = (level: number) => TREE_PAD.left + level * TREE_COLUMN;
  const y = (row: number) => TREE_PAD.top + row * TREE_ROW + TREE_ROW / 2;
  const rootY = nodes.filter(node => node.depth === 1).reduce((sum, node, _i, all) => sum + node.parentY / all.length, 0);
  return (
    <figure className="mock-figure mock-tree">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-desc`} className="mock-figure__svg">
        <title id={`${id}-title`}>{tree.title}</title>
        <desc id={`${id}-desc`}>{tree.description}</desc>
        {nodes.map((placed, index) => {
          const x1 = x(placed.depth - 1) + 8;
          const x2 = x(placed.depth) - 8;
          const y1 = y(placed.parentY);
          const y2 = y(placed.y);
          return (
            <g key={index} className="mock-tree__branch">
              <line x1={x1} y1={y1} x2={x2} y2={y2} className="mock-tree__edge" />
              <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 7} textAnchor="middle" className="mock-tree__probability">{placed.node.probability}</text>
              <circle cx={x(placed.depth)} cy={y2} r={4} className="mock-tree__node" />
              {placed.node.children.length > 0 ? (
                // Inner outcomes sit above their node, clear of the branches leaving it.
                <text x={x(placed.depth)} y={y2 - 12} textAnchor="middle" className="mock-tree__label">{placed.node.label}</text>
              ) : (
                <text x={x(placed.depth) + 10} y={y2} dominantBaseline="middle" className="mock-tree__label">
                  {placed.node.label}
                  {placed.node.note && <tspan className="mock-tree__note"> · {placed.node.note}</tspan>}
                </text>
              )}
            </g>
          );
        })}
        <circle cx={x(0)} cy={y(rootY)} r={5} className="mock-tree__node mock-tree__node--root" />
        {tree.rootLabel && <text x={x(0)} y={y(rootY) - 12} className="mock-tree__label">{tree.rootLabel}</text>}
      </svg>
      <figcaption className="visually-hidden">
        {tree.rootLabel || tree.title}
        <TreeOutline nodes={tree.branches} />
      </figcaption>
    </figure>
  );
}

/** A figure cell: optional sign/bracket/currency, digits, optional decimals and unit. */
const NUMERIC_CELL = /^[(+\-\u2212]?\s*[$€£¥]?\s*\d[\d,]*(\.\d+)?\s*(%|x|×|bps?)?\)?$/i;
const BLANK_CELL = /^(|-|\u2013|\u2014|n\/a)$/i;

/** Data columns (not the row-label column) whose every filled cell is a figure. */
export function numericColumns(table: MockTable): boolean[] {
  return table.headers.map((_, column) => {
    if (column === 0) return false;
    const cells = table.rows.map(row => (row.cells[column] ?? "").trim()).filter(cell => !BLANK_CELL.test(cell));
    return cells.length > 0 && cells.every(cell => NUMERIC_CELL.test(cell));
  });
}

export function MockTableView({ table }: { table: MockTable }) {
  const numeric = numericColumns(table);
  const num = (column: number) => (numeric[column] ? "is-num" : undefined);
  return (
    <div className="mock-table-wrap">
      <table className="mock-table">
        {table.caption && <caption>{table.caption}</caption>}
        <thead>
          <tr>{table.headers.map((header, column) => <th key={column} scope="col" className={num(column)}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.cells.map((cell, column) => column === 0
                ? <th key={column} scope="row">{cell}</th>
                : <td key={column} className={num(column)}>{cell}</td>)}
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
