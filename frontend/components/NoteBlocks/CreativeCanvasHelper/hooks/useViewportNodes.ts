import { useState, useEffect, useRef, useCallback } from 'react';
import { NodeData, Connection } from '@/typings/agent';
import { ViewportFetchManager } from './viewportManager';

interface UseViewportNodesProps {
  canvasId: string;
  branchId: string;
  accessToken: string | undefined;
  viewport: { x: number; y: number };
  scale: number;
  windowSize: { width: number; height: number };
  isEnabled: boolean;
  isDragging: boolean;
}

interface UseViewportNodesReturn {
  nodes: NodeData[];
  connections: Connection[];
  isLoading: boolean;
  forceFetch: () => Promise<void>;
  cacheStats: any;
}

export function useViewportNodes({
  canvasId,
  branchId,
  accessToken,
  viewport,
  scale,
  windowSize,
  isEnabled,
  isDragging 
}: UseViewportNodesProps): UseViewportNodesReturn {
  
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const viewportRef = useRef(viewport);
  const scaleRef = useRef(scale);
  
  // Keep them synced
  useEffect(() => {
      viewportRef.current = viewport;
      scaleRef.current = scale;
  }, [viewport, scale]);
  
  const managerRef = useRef<ViewportFetchManager | null>(null);
  const isInitializedRef = useRef(false);

  // Initialize manager
  useEffect(() => {
    if (!isEnabled || !accessToken || !canvasId) {
      return;
    }

    if (!managerRef.current) {
      console.log('[VIEWPORT] 🔧 Initializing Viewport Manager');
      managerRef.current = new ViewportFetchManager(canvasId, branchId, accessToken);
      isInitializedRef.current = false;
    }
  }, [canvasId, branchId, accessToken, isEnabled]);

  // Handle viewport changes
  useEffect(() => {
    // 👇 CHANGE 3: The Magic Fix.
    // If the user is dragging, STOP. Do not calculate. Do not fetch. Do not render.
    // Wait until they release the mouse.
    if (!isEnabled || !managerRef.current || !accessToken || isDragging) {
      return;
    }

    const viewportState = {
      x: viewport.x,
      y: viewport.y,
      width: windowSize.width,
      height: windowSize.height,
      scale
    };

    const handleNodesUpdate = (fetchedNodes: NodeData[], fetchedConnections: Connection[]) => {
      // console.log('[VIEWPORT] 📦 Received update'); // Optional: Comment out log to save console spam

      setNodes(prev => {
        const existingMap = new Map(prev.map(n => [n.id, n]));
        
        fetchedNodes.forEach(node => {
          existingMap.set(node.id, node);
        });
        
        return Array.from(existingMap.values());
      });

      setConnections(prev => {
        const existingMap = new Map(prev.map(c => [c.id, c]));
        fetchedConnections.forEach(conn => {
          existingMap.set(conn.id, conn);
        });
        return Array.from(existingMap.values());
      });
    };

    // Trigger fetch
    setIsLoading(true);
    managerRef.current.handleViewportChange(viewportState, handleNodesUpdate)
      .finally(() => {
        setIsLoading(false);
        if (!isInitializedRef.current) {
          isInitializedRef.current = true;
          console.log('[VIEWPORT] ✅ Initial load complete');
        }
      });

  }, [
    viewport.x, 
    viewport.y, 
    scale, 
    windowSize.width, 
    windowSize.height, 
    isEnabled, 
    accessToken, 
    isDragging // <--- Add this to dependency array so it re-runs when you stop dragging
  ]);

  // Force refresh
  const forceFetch = useCallback(async () => {
    if (!managerRef.current || !accessToken) return;

    const viewportState = {
      x: viewport.x,
      y: viewport.y,
      width: windowSize.width,
      height: windowSize.height,
      scale
    };

    const handleNodesUpdate = (fetchedNodes: NodeData[], fetchedConnections: Connection[]) => {
      setNodes(prev => {
        const existingMap = new Map(prev.map(n => [n.id, n]));
        fetchedNodes.forEach(node => existingMap.set(node.id, node));
        return Array.from(existingMap.values());
      });

      setConnections(prev => {
        const existingMap = new Map(prev.map(c => [c.id, c]));
        fetchedConnections.forEach(conn => existingMap.set(conn.id, conn));
        return Array.from(existingMap.values());
      });
    };

    await managerRef.current.forceFetch(viewportState, handleNodesUpdate);
  }, [viewport, scale, windowSize, accessToken]);

  const cacheStats = managerRef.current?.getCacheStats() || {};

  return {
    nodes,
    connections,
    isLoading,
    forceFetch,
    cacheStats
  };
}