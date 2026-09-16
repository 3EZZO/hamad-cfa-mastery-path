import { useMemo } from "react";
import cx from "clsx";

export interface RouteNode {
  id: string;
  isPast: boolean;
  isCurrent: boolean;
  isComplete: boolean;
}

interface PlanRouteGraphicProps {
  nodes: RouteNode[];
  columns?: number;
  compact?: boolean;
}

export function PlanRouteGraphic({ nodes, columns = 5, compact = false }: PlanRouteGraphicProps) {
  const rowHeight = compact ? 12 : 36;
  const colWidth = compact ? 16 : 46;
  const paddingX = compact ? 8 : 20;
  const paddingY = compact ? 8 : 20;

  const positionedNodes = useMemo(() => {
    return nodes.map((node, i) => {
      const row = Math.floor(i / columns);
      const isEvenRow = row % 2 === 0;
      const col = isEvenRow ? i % columns : (columns - 1) - (i % columns);
      
      const x = paddingX + col * colWidth;
      const y = paddingY + row * rowHeight;
      
      return { ...node, x, y };
    });
  }, [nodes, columns, colWidth, rowHeight, paddingX, paddingY]);

  const pathData = useMemo(() => {
    if (positionedNodes.length === 0) return "";
    let d = `M ${positionedNodes[0].x} ${positionedNodes[0].y}`;
    for (let i = 1; i < positionedNodes.length; i++) {
      const prev = positionedNodes[i - 1];
      const curr = positionedNodes[i];
      if (prev.y === curr.y) {
        d += ` L ${curr.x} ${curr.y}`;
      } else {
        d += ` Q ${prev.x} ${prev.y + rowHeight/2} ${curr.x} ${curr.y}`;
      }
    }
    return d;
  }, [positionedNodes, rowHeight]);

  const completedPathData = useMemo(() => {
    const activeNodes = positionedNodes.filter(n => n.isPast || n.isCurrent);
    if (activeNodes.length === 0) return "";
    let d = `M ${activeNodes[0].x} ${activeNodes[0].y}`;
    for (let i = 1; i < activeNodes.length; i++) {
      const prev = activeNodes[i - 1];
      const curr = activeNodes[i];
      if (prev.y === curr.y) {
        d += ` L ${curr.x} ${curr.y}`;
      } else {
        d += ` Q ${prev.x} ${prev.y + rowHeight/2} ${curr.x} ${curr.y}`;
      }
    }
    return d;
  }, [positionedNodes, rowHeight]);

  const totalWidth = paddingX * 2 + (columns - 1) * colWidth;
  const totalHeight = paddingY * 2 + (Math.ceil(nodes.length / columns) - 1) * rowHeight;

  return (
    <div className={cx("plan-route-graphic", { compact })} aria-hidden="true">
      <svg viewBox={`0 0 ${totalWidth} ${totalHeight}`} width="100%" height="100%">
        <path 
          d={pathData} 
          fill="none" 
          stroke="rgba(255, 255, 255, 0.1)" 
          strokeWidth={compact ? "1.5" : "3"}
          strokeLinecap="round" 
          strokeLinejoin="round" 
        />
        <path 
          d={completedPathData} 
          fill="none" 
          stroke="var(--theme-blue)" 
          strokeWidth={compact ? "1.5" : "3"}
          strokeLinecap="round" 
          strokeLinejoin="round" 
          className="plan-route-active-line"
        />
        {positionedNodes.map((node) => {
          const isActive = node.isPast || node.isCurrent;
          const rNode = compact ? 2 : 4;
          const rPulse = compact ? 4 : 8;
          return (
            <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
              {node.isCurrent && (
                <circle r={rPulse} fill="var(--theme-blue)" className="plan-route-pulse" />
              )}
              <circle 
                r={rNode}
                fill={isActive ? "var(--theme-blue)" : "var(--surface-2)"} 
                stroke={isActive ? "none" : "rgba(255, 255, 255, 0.2)"}
                strokeWidth={compact ? "1" : "1.5"}
                className={cx("plan-route-node", {
                  "is-current": node.isCurrent,
                  "is-complete": node.isComplete
                })}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
