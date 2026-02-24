import { Connection } from '@/typings/agent';
import React from 'react';
import { useMemo, useCallback } from 'react';

/**
 * Viewport bounds calculator
 * Calculates visible area in canvas coordinates
 */
export const useViewportBounds = (viewport: { x: number; y: number }, scale: number, padding = 200) => {
  return useMemo(() => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const height = typeof window !== 'undefined' ? window.innerHeight : 1080;
    
    return {
      minX: (-viewport.x - padding) / scale,
      maxX: (-viewport.x + width + padding) / scale,
      minY: (-viewport.y - padding) / scale,
      maxY: (-viewport.y + height + padding) / scale,
    };
  }, [viewport.x, viewport.y, scale, padding]);
};

/**
 * Node visibility checker - FIXED with generous buffer
 * Optimized AABB collision detection with symmetric buffer
 */
export const isNodeVisible = (node: any, bounds: any) => {
  // ✅ MUCH LARGER buffer to prevent popping - nodes load before they're visible
  const SAFETY_BUFFER = 1000; 
  
  // Check if node is completely outside viewport bounds (with buffer)
  // Using generous buffer means nodes start rendering well before they enter viewport
  return !(
    node.x + node.width + SAFETY_BUFFER < bounds.minX ||  // Too far left
    node.x - SAFETY_BUFFER > bounds.maxX ||                // Too far right
    node.y + node.height + SAFETY_BUFFER < bounds.minY ||  // Too far up
    node.y - SAFETY_BUFFER > bounds.maxY                   // Too far down
  );
};

/**
 * Connection visibility checker
 * Checks if connection line intersects viewport
 */
export const isConnectionVisible = (
  from: { x: number; y: number; width: number; height: number },
  to: { x: number; y: number; width: number; height: number },
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
): boolean => {
  const fromCenterX = from.x + from.width / 2;
  const fromCenterY = from.y + from.height / 2;
  const toCenterX = to.x + to.width / 2;
  const toCenterY = to.y + to.height / 2;

  // Check if either endpoint is visible
  if (
    (fromCenterX >= bounds.minX && fromCenterX <= bounds.maxX && fromCenterY >= bounds.minY && fromCenterY <= bounds.maxY) ||
    (toCenterX >= bounds.minX && toCenterX <= bounds.maxX && toCenterY >= bounds.minY && toCenterY <= bounds.maxY)
  ) {
    return true;
  }

  // Check if line intersects viewport bounds (simple bbox check)
  const lineMinX = Math.min(fromCenterX, toCenterX);
  const lineMaxX = Math.max(fromCenterX, toCenterX);
  const lineMinY = Math.min(fromCenterY, toCenterY);
  const lineMaxY = Math.max(fromCenterY, toCenterY);

  return !(
    lineMaxX < bounds.minX ||
    lineMinX > bounds.maxX ||
    lineMaxY < bounds.minY ||
    lineMinY > bounds.maxY
  );
};

/**
 * Virtual renderer hook
 * Returns only visible nodes and connections
 */
export const useVirtualization = <T extends { id: string; x: number; y: number; width: number; height: number }>(
  items: T[],
  viewport: { x: number; y: number },
  scale: number,
  padding?: number
) => {
  const bounds = useViewportBounds(viewport, scale, padding);

  return useMemo(() => {
    return items.filter(item => isNodeVisible(item, bounds));
  }, [items, bounds]);
};

/**
 * Connection virtualization hook
 */
export const useConnectionVirtualization = (
  connections: Connection[],
  nodes: Map<string, { x: number; y: number; width: number; height: number }>,
  viewport: { x: number; y: number },
  scale: number
) => {
  const bounds = useViewportBounds(viewport, scale, 400); // Larger padding for connections

  return useMemo(() => {
    return connections.filter(conn => {
      const fromNode = nodes.get(conn.fromId);
      const toNode = nodes.get(conn.toId);
      
      if (!fromNode || !toNode) return false;
      
      return isConnectionVisible(fromNode, toNode, bounds);
    });
  }, [connections, nodes, bounds]);
};

/**
 * Transform calculator
 * Pre-calculates transform string for better performance
 */
export const useCanvasTransform = (viewport: { x: number; y: number }, scale: number) => {
  return useMemo(() => {
    // Use translate3d for hardware acceleration
    return `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${scale})`;
  }, [viewport.x, viewport.y, scale]);
};

/**
 * Screen to canvas coordinate converter
 */
export const useScreenToCanvas = (viewport: { x: number; y: number }, scale: number) => {
  return useCallback((screenX: number, screenY: number) => {
    return {
      x: (screenX - viewport.x) / scale,
      y: (screenY - viewport.y) / scale,
    };
  }, [viewport.x, viewport.y, scale]);
};

/**
 * Canvas to screen coordinate converter
 */
export const useCanvasToScreen = (viewport: { x: number; y: number }, scale: number) => {
  return useCallback((canvasX: number, canvasY: number) => {
    return {
      x: canvasX * scale + viewport.x,
      y: canvasY * scale + viewport.y,
    };
  }, [viewport.x, viewport.y, scale]);
};

/**
 * Node map creator
 * Creates a Map for O(1) lookups instead of O(n) array finds
 */
export const useNodeMap = <T extends { id: string }>(nodes: T[]) => {
  return useMemo(() => {
    const map = new Map<string, T>();
    nodes.forEach(node => map.set(node.id, node));
    return map;
  }, [nodes]);
};

/**
 * Snap to grid utility
 */
export const snapToGrid = (value: number, gridSize: number): number => {
  return Math.round(value / gridSize) * gridSize;
};

/**
 * Batch update helper
 * Groups multiple state updates into one render
 */
export const useBatchUpdate = () => {
  return useCallback(<T,>(updates: Array<() => T>): T[] => {
    return updates.map(update => update());
  }, []);
};

/**
 * Performance monitor (dev only)
 */
export const usePerformanceMonitor = (enabled = false) => {
  const startMark = useCallback((label: string) => {
    if (enabled && typeof performance !== 'undefined') {
      performance.mark(`${label}-start`);
    }
  }, [enabled]);

  const endMark = useCallback((label: string) => {
    if (enabled && typeof performance !== 'undefined') {
      performance.mark(`${label}-end`);
      performance.measure(label, `${label}-start`, `${label}-end`);
      const measure = performance.getEntriesByName(label)[0];
      console.log(`${label}: ${measure.duration.toFixed(2)}ms`);
    }
  }, [enabled]);

  return { startMark, endMark };
};

/**
 * Debounced resize observer
 */
export const useDebouncedResize = (callback: () => void, delay = 150) => {
  const timeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined);

  React.useEffect(() => {
    const handleResize = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(callback, delay);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [callback, delay]);
};

// ===== VIRTUALIZED CANVAS RENDERER =====

interface VirtualizedCanvasProps {
  nodes: any[];
  connections: any[];
  viewport: { x: number; y: number };
  scale: number;
  selectedId: string | null;
  connectingNodeId: string | null;
  mousePos: { x: number; y: number };
  renderNode: (node: any) => React.ReactNode;
  renderConnection: (connection: any) => React.ReactNode;
  renderPendingConnection?: () => React.ReactNode;
}

export const VirtualizedCanvas: React.FC<VirtualizedCanvasProps> = React.memo(({
  nodes,
  connections,
  viewport,
  scale,
  selectedId,
  connectingNodeId,
  mousePos,
  renderNode,
  renderConnection,
  renderPendingConnection
}) => {
  // Create node lookup map for O(1) access
  const nodeMap = useNodeMap(nodes);
  
  // Get visible nodes
  const visibleNodes = useVirtualization(nodes, viewport, scale);
  
  // Get visible connections
  const visibleConnections = useConnectionVirtualization(connections, nodeMap, viewport, scale);
  
  // Pre-calculate transform
  const transform = useCanvasTransform(viewport, scale);
  
  // Separate groups and regular nodes
  const { groups, regularNodes } = useMemo(() => {
    const groups = visibleNodes.filter(n => n.type === 'group');
    const regularNodes = visibleNodes.filter(n => n.type !== 'group');
    return { groups, regularNodes };
  }, [visibleNodes]);

  return (
    <div
      className="origin-top-left w-full h-full"
      style={{
        transform,
        transformOrigin: '0 0',
      }}
    >
      {/* Render groups first (background layer) */}
      {groups.map(node => (
        <React.Fragment key={node.id}>
          {renderNode(node)}
        </React.Fragment>
      ))}

      {/* Render connections (middle layer) */}
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
      >
        {visibleConnections.map(conn => (
          <React.Fragment key={conn.id}>
            {renderConnection(conn)}
          </React.Fragment>
        ))}
        
        {/* Pending connection */}
        {connectingNodeId && renderPendingConnection && renderPendingConnection()}
      </svg>

      {/* Render regular nodes (foreground layer) */}
      {regularNodes.map(node => (
        <React.Fragment key={node.id}>
          {renderNode(node)}
        </React.Fragment>
      ))}
    </div>
  );
});

VirtualizedCanvas.displayName = 'VirtualizedCanvas';