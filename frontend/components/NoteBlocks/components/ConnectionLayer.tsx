import React from 'react';
import { NodeData, Connection, Position, ColorTheme } from '@/typings/agent';
import { GROUP_PADDING } from './GroupContainer';
import { CONNECTION_COLORS } from '../CreativeCanvasHelper/components/constants';

interface ConnectionLayerProps {
  nodes: NodeData[];
  groups: NodeData[];
  connections: Connection[];
  pendingConnection?: { fromId: string; toPos: Position } | null;
  onSelect: (id: string) => void;
  selectedId: string | null;
}

interface Bounds {
    x: number;
    y: number;
    w: number;
    h: number;
}

export const ConnectionLayer: React.FC<ConnectionLayerProps> = ({ 
  nodes, 
  groups, 
  connections, 
  pendingConnection,
  onSelect,
  selectedId
}) => {
  
  // --- Helper: Get Bounds for Node or Group ---
  const getBounds = (id: string): Bounds | null => {
      const node = nodes.find(n => n.id === id);
      if (node) {
          // Use stored height or estimate if not yet measured
          return {
              x: node.x,
              y: node.y,
              w: node.width,
              h: node.height || (node.imageUrl ? 450 : 150)
          };
      }

      const group = groups.find(g => g.id === id);
      if (group) {
          const groupNodes = nodes.filter(n => n.groupId === group.id);
          if (groupNodes.length === 0) {
              return { x: group.fallbackX, y: group.fallbackY, w: 300, h: 200 };
          }
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          groupNodes.forEach(n => {
              minX = Math.min(minX, n.x);
              minY = Math.min(minY, n.y);
              maxX = Math.max(maxX, n.x + n.width);
              const h = n.height || (n.imageUrl ? 450 : 150);
              maxY = Math.max(maxY, n.y + h);
          });
          return {
              x: minX - GROUP_PADDING,
              y: minY - GROUP_PADDING,
              w: (maxX + GROUP_PADDING) - (minX - GROUP_PADDING),
              h: (maxY + GROUP_PADDING) - (minY - GROUP_PADDING)
          };
      }
      return null;
  };

  const getCenter = (b: Bounds) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

  // --- Helper: Calculate Intersection Point ---
  // Returns the point where the line from center to targetCenter intersects the bounds
  const getIntersection = (bounds: Bounds, targetCenter: Position) => {
      const cx = bounds.x + bounds.w / 2;
      const cy = bounds.y + bounds.h / 2;
      
      const dx = targetCenter.x - cx;
      const dy = targetCenter.y - cy;
      
      // Avoid divide by zero
      if (dx === 0 && dy === 0) return { x: cx, y: cy, side: 'right' };

      // Calculate slopes
      const slope = Math.abs(dy / dx);
      const rectSlope = bounds.h / bounds.w;

      let x, y, side;

      if (slope < rectSlope) {
          // Intersects Left or Right
          if (dx > 0) {
              x = bounds.x + bounds.w;
              side = 'right';
          } else {
              x = bounds.x;
              side = 'left';
          }
          y = cy + (dy / dx) * (x - cx);
      } else {
          // Intersects Top or Bottom
          if (dy > 0) {
              y = bounds.y + bounds.h;
              side = 'bottom';
          } else {
              y = bounds.y;
              side = 'top';
          }
          x = cx + (dx / dy) * (y - cy);
      }

      return { x, y, side };
  };

  const renderConnection = (conn: Connection) => {
    const fromBounds = getBounds(conn.fromId);
    const toBounds = getBounds(conn.toId);

    if (!fromBounds || !toBounds) return null;

    const fromCenter = getCenter(fromBounds);
    const toCenter = getCenter(toBounds);

    // Calculate start point on 'from' object looking at 'to' center
    const start = getIntersection(fromBounds, toCenter);
    
    // Calculate end point on 'to' object looking at 'from' center
    const end = getIntersection(toBounds, fromCenter);

    // --- Dynamic Bezier Curve ---
    // The curve logic depends on which side of the box we are connecting to
    const curvature = 80;
    
    const cp1 = { x: start.x, y: start.y };
    const cp2 = { x: end.x, y: end.y };

    switch (start.side) {
        case 'top': cp1.y -= curvature; break;
        case 'bottom': cp1.y += curvature; break;
        case 'left': cp1.x -= curvature; break;
        case 'right': cp1.x += curvature; break;
    }

    switch (end.side) {
        case 'top': cp2.y -= curvature; break;
        case 'bottom': cp2.y += curvature; break;
        case 'left': cp2.x -= curvature; break;
        case 'right': cp2.x += curvature; break;
    }

    const pathData = `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;

    // Midpoint for Label
    // Cubic bezier formula for t=0.5
    const t = 0.5;
    const mt = 1 - t;
    const midX = mt*mt*mt*start.x + 3*mt*mt*t*cp1.x + 3*mt*t*t*cp2.x + t*t*t*end.x;
    const midY = mt*mt*mt*start.y + 3*mt*mt*t*cp1.y + 3*mt*t*t*cp2.y + t*t*t*end.y;

    const isSelected = selectedId === conn.id;
    const colorKey = conn.color || 'slate';
    const colorHex = CONNECTION_COLORS[colorKey] || CONNECTION_COLORS.slate;
    
    let dashArray = 'none';
    if (conn.strokeStyle === 'dashed') dashArray = '8,6';
    if (conn.strokeStyle === 'dotted') dashArray = '3,4';

    const startMarkerId = `arrowhead-start-${colorKey}${isSelected ? '-selected' : ''}`;
    const endMarkerId = `arrowhead-${colorKey}${isSelected ? '-selected' : ''}`;
    const dotMarkerId = `dot-${colorKey}${isSelected ? '-selected' : ''}`;

    const startMarker = conn.arrowType === 'both' ? `url(#${startMarkerId})` : `url(#${dotMarkerId})`;
    const endMarker = conn.arrowType === 'none' ? undefined : `url(#${endMarkerId})`;

    return (
        <g key={conn.id} className="group">
            <path d={pathData} stroke="transparent" strokeWidth="20" fill="none" className="cursor-pointer pointer-events-auto" onClick={(e) => { e.stopPropagation(); onSelect(conn.id); }} />
            <path
                d={pathData}
                fill="none"
                stroke={isSelected ? "#3b82f6" : colorHex}
                strokeWidth={isSelected ? "3" : "2"}
                strokeDasharray={dashArray}
                markerEnd={endMarker}
                markerStart={startMarker}
                className="transition-colors duration-200 pointer-events-none"
            />
             <foreignObject x={midX - 60} y={midY - 15} width="120" height="30" className="overflow-visible pointer-events-none">
                <div className="w-full h-full flex items-center justify-center">
                    <button
                        onClick={(e) => { e.stopPropagation(); onSelect(conn.id); }}
                        className={`pointer-events-auto px-2 py-0.5 rounded-full text-xs font-medium border shadow-sm transition-all transform hover:scale-105
                            ${isSelected 
                                ? 'bg-blue-500 text-white border-blue-600 ring-2 ring-blue-200' 
                                : 'bg-white text-gray-500 border-gray-200 hover:text-gray-700 hover:border-gray-300'}
                        `}
                    >
                        {conn.label || (isSelected ? "Label" : "")}
                        {!conn.label && !isSelected && <div className="w-2 h-2 rounded-full bg-gray-300" />}
                    </button>
                </div>
            </foreignObject>
        </g>
    );
  };

  const renderPendingPath = () => {
      if (!pendingConnection) return null;
      
      const fromBounds = getBounds(pendingConnection.fromId);
      if (!fromBounds) return null;

      // For pending, we intersect the FROM object based on mouse position
      // We don't have a target rect, just a point
      const start = getIntersection(fromBounds, pendingConnection.toPos);
      const end = pendingConnection.toPos;
      
      // Simple curvature for dragging
      const dist = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
      const curvature = Math.max(dist * 0.25, 40);

      const cp1 = { x: start.x, y: start.y };
      
      switch (start.side) {
        case 'top': cp1.y -= curvature; break;
        case 'bottom': cp1.y += curvature; break;
        case 'left': cp1.x -= curvature; break;
        case 'right': cp1.x += curvature; break;
      }
      
      // For the mouse end, we just curve towards the incoming direction or simple avg
      const cp2 = { x: end.x, y: end.y }; // Simplification for dragging

      const pathData = `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;

      return (
        <path
            d={pathData}
            fill="none"
            stroke="#94a3b8"
            strokeWidth="2"
            strokeDasharray="5,5"
            markerEnd="url(#arrowhead-slate)"
            markerStart="url(#dot-slate)"
        />
      );
  };

  // Generate defs for all colors
  const renderDefs = () => {
      const themes = Object.keys(CONNECTION_COLORS) as ColorTheme[];
      return (
        <defs>
            {themes.map(theme => {
                const color = CONNECTION_COLORS[theme];
                return (
                    <React.Fragment key={theme}>
                        {/* Normal State */}
                        <marker id={`arrowhead-${theme}`} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill={color} />
                        </marker>
                        <marker id={`arrowhead-start-${theme}`} markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                            <polygon points="10 0, 0 3.5, 10 7" fill={color} />
                        </marker>
                        <marker id={`dot-${theme}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
                            <circle cx="5" cy="5" r="5" fill={color} />
                        </marker>

                        {/* Selected State (Blue) */}
                        <marker id={`arrowhead-${theme}-selected`} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                        </marker>
                        <marker id={`arrowhead-start-${theme}-selected`} markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                            <polygon points="10 0, 0 3.5, 10 7" fill="#3b82f6" />
                        </marker>
                        <marker id={`dot-${theme}-selected`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
                            <circle cx="5" cy="5" r="5" fill="#3b82f6" />
                        </marker>
                    </React.Fragment>
                );
            })}
        </defs>
      );
  };

  return (
    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0 overflow-visible">
      {renderDefs()}
      {connections.map(renderConnection)}
      {renderPendingPath()}
    </svg>
  );
};