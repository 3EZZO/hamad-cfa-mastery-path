import { useMemo } from "react";
import cx from "clsx";
import type { PlanWeek, TrackerState } from "../types";
import { getWeekProgressForState } from "../data/plan";

interface PlanRouteGraphicProps {
  plan: PlanWeek[];
  currentWeek: number;
  tracker: TrackerState;
}

export function PlanRouteGraphic({ plan, currentWeek, tracker }: PlanRouteGraphicProps) {
  const columns = 5;
  const rowHeight = 36;
  const colWidth = 46;
  const paddingX = 20;
  const paddingY = 20;

  const nodes = useMemo(() => {
    return plan.map((week, i) => {
      const row = Math.floor(i / columns);
      const isEvenRow = row % 2 === 0;
      const col = isEvenRow ? i % columns : (columns - 1) - (i % columns);
      
      const x = paddingX + col * colWidth;
      const y = paddingY + row * rowHeight;
      
      const isPast = week.week < currentWeek;
      const isCurrent = week.week === currentWeek;
      const progress = getWeekProgressForState(week, tracker);
      const isComplete = progress === 100;

      return { week, x, y, isPast, isCurrent, isComplete };
    });
  }, [plan, currentWeek, tracker]);

  const pathData = useMemo(() => {
    if (nodes.length === 0) return "";
    let d = `M ${nodes[0].x} ${nodes[0].y}`;
    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1];
      const curr = nodes[i];
      if (prev.y === curr.y) {
        d += ` L ${curr.x} ${curr.y}`;
      } else {
        d += ` Q ${prev.x} ${prev.y + rowHeight/2} ${curr.x} ${curr.y}`;
      }
    }
    return d;
  }, [nodes]);

  const completedPathData = useMemo(() => {
    const activeNodes = nodes.filter(n => n.isPast || n.isCurrent);
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
  }, [nodes]);

  const totalWidth = paddingX * 2 + (columns - 1) * colWidth;
  const totalHeight = paddingY * 2 + (Math.ceil(plan.length / columns) - 1) * rowHeight;

  return (
    <div className="plan-route-graphic" aria-hidden="true">
      <svg viewBox={`0 0 ${totalWidth} ${totalHeight}`} width="100%" height="100%">
        <path 
          d={pathData} 
          fill="none" 
          stroke="rgba(255, 255, 255, 0.1)" 
          strokeWidth="3" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
        />
        <path 
          d={completedPathData} 
          fill="none" 
          stroke="var(--theme-blue)" 
          strokeWidth="3" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          className="plan-route-active-line"
        />
        {nodes.map((node) => {
          const isActive = node.isPast || node.isCurrent;
          return (
            <g key={node.week.week} transform={`translate(${node.x}, ${node.y})`}>
              {node.isCurrent && (
                <circle r="8" fill="var(--theme-blue)" className="plan-route-pulse" />
              )}
              <circle 
                r="4" 
                fill={isActive ? "var(--theme-blue)" : "var(--surface-2)"} 
                stroke={isActive ? "none" : "rgba(255, 255, 255, 0.2)"}
                strokeWidth="1.5"
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
