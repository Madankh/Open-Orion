// viewportManager.ts - Viewport-based node fetching system

import { NodeData, Connection } from '@/typings/agent';
import { API_BASE_URL, extractYoutubeId } from '../components/CanvasHelpers'; 

// ============================================
// TYPES & CONSTANTS
// ============================================

export interface ViewportBounds {
  x_min: number;
  x_max: number;
  y_min: number;
  y_max: number;
}

export interface ViewportState {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export interface NodeCache {
  nodes: Map<string, NodeData>;
  connections: Map<string, Connection>;
  lastFetchBounds: ViewportBounds | null;
  loadedTiles: Set<string>;
}

// Buffer zone around viewport (in pixels)
// Increased to 1500 to ensure smooth panning without white voids
const VIEWPORT_BUFFER = 3000; 
const TILE_SIZE = 500;
const FETCH_DEBOUNCE_MS = 500;
const CACHE_CLEANUP_DISTANCE = 4; // Keep nodes in memory a bit longer

// ============================================
// VIEWPORT CALCULATIONS
// ============================================

/**
 * Calculate viewport bounds with buffer zone
 */
export function calculateViewportBounds(
  viewport: ViewportState
): ViewportBounds {
  return {
    x_min: viewport.x - VIEWPORT_BUFFER,
    x_max: viewport.x + viewport.width + VIEWPORT_BUFFER,
    y_min: viewport.y - VIEWPORT_BUFFER,
    y_max: viewport.y + viewport.height + VIEWPORT_BUFFER,
  };
}

/**
 * Check if a node is within viewport bounds
 */
export function isNodeInViewport(
  node: NodeData,
  bounds: ViewportBounds
): boolean {
  const nodeRight = node.x + node.width;
  const nodeBottom = node.y + node.height;

  return (
    nodeRight >= bounds.x_min &&
    node.x <= bounds.x_max &&
    nodeBottom >= bounds.y_min &&
    node.y <= bounds.y_max
  );
}

/**
 * Check if viewport has moved significantly
 */
export function hasViewportChangedSignificantly(
  oldBounds: ViewportBounds | null,
  newBounds: ViewportBounds
): boolean {
  if (!oldBounds) return true;

  const xChange = Math.abs(newBounds.x_min - oldBounds.x_min);
  const yChange = Math.abs(newBounds.y_min - oldBounds.y_min);

  // Trigger fetch if moved more than 20% of viewport buffer
  return xChange > VIEWPORT_BUFFER * 0.2 || yChange > VIEWPORT_BUFFER * 0.2;
}

/**
 * Calculate distance from node to viewport center
 */
export function getNodeDistanceFromViewport(
  node: NodeData,
  viewport: ViewportState
): number {
  const viewportCenterX = viewport.x + viewport.width / 2;
  const viewportCenterY = viewport.y + viewport.height / 2;
  
  const nodeCenterX = node.x + node.width / 2;
  const nodeCenterY = node.y + node.height / 2;

  const dx = nodeCenterX - viewportCenterX;
  const dy = nodeCenterY - viewportCenterY;

  return Math.sqrt(dx * dx + dy * dy);
}

async function internalDownloadS3(
  sessionId: string,
  s3Key: string,
  accessToken: string
): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/download`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ session_id: sessionId, s3_key: s3Key })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return `${data.url}` || null; // This is the signed URL you need
  } catch (error) {
    return null;
  }
}

export async function fetchNodesInViewport(
  canvasId: string,
  bounds: ViewportBounds,
  branchId: string = 'main',
  accessToken: string
): Promise<{ nodes: NodeData[]; connections: Connection[] }> {
  
  const url = `${API_BASE_URL}/nodes/${canvasId}/viewport?` +
    `branch_id=${branchId}&` +
    `x_min=${bounds.x_min}&x_max=${bounds.x_max}&` +
    `y_min=${bounds.y_min}&y_max=${bounds.y_max}`;

  const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
  });

  if (!response.ok) throw new Error('Failed to fetch viewport');
  const data = await response.json();
  
  // ✅ FIX: Use Promise.all to handle S3 downloads in parallel
  const mappedNodes = await Promise.all(data.nodes.map(async (node: any) => {
      
      let metadata = node.metadata || {};
      if (typeof metadata === 'string') {
          try { metadata = JSON.parse(metadata); } catch(e) {}
      }
      
      // 1. RE-ADD S3 DOWNLOAD LOGIC
      let pdfUrl = node.pdf_url;
      let mediaUrl = node.media_url;

      if (node.s3_key) {
         // Only try to sign if it's a file type that needs it
         if (node.node_type === 'pdf' || node.node_type === 'image' || node.node_type === 'media') {
             const signedUrl = await internalDownloadS3(canvasId, node.s3_key, accessToken);
             if (signedUrl) {
                 if (node.node_type === 'pdf') pdfUrl = signedUrl;
                 else mediaUrl = signedUrl;
             }
         }
      }

      // 2. YouTube Logic
      let youtubeId = metadata.youtubeId; 
      if (!youtubeId && node.node_type === 'youtube' && node.media_url) {
          youtubeId = extractYoutubeId(node.media_url);
      }

      return {
          id: node.node_id,
          type: node.node_type,
          title: node.title,
          content: node.project_note_id ? "" : node.content, // Still keep content empty for Refs
          x: Number(node.position_x),
          y: Number(node.position_y),
          width: Number(node.width) || 420,
          height: Number(node.height) || 200,
          color: node.color || 'white',
          parentId: node.parent_node_id,
          childIds: [],
          level: node.level || 0,
          isExpanded: node.is_expanded !== false,
          fileType: node.file_type,
          fileName: node.file_name,
          
          // Use the hydrated URLs
          imageUrl: mediaUrl,
          mediaUrl: mediaUrl,
          pdfUrl: pdfUrl,
          s3Key: node.s3_key,
          
          youtubeId: youtubeId, 
          projectNoteId: node.project_note_id,
          globalNoteId: node.global_note_id,
          pdfSource: metadata.pdfSource || undefined,
          metadata: metadata
      };
  }));

  const mappedConnections = data.connections.map((c: any) => ({
      id: c.connection_id,
      fromId: c.from_node_id,
      toId: c.to_node_id,
      color: c.color || 'slate',
      strokeStyle: c.stroke_style || 'solid',
      arrowType: c.arrow_type || 'end',
      label: c.label || ''
  }));

  return { nodes: mappedNodes, connections: mappedConnections };
}


/**
 * Unused but kept for type compatibility
 */
export async function fetchConnectionsForNodes(
  canvasId: string,
  nodeIds: string[],
  branchId: string = 'main',
  accessToken: string
): Promise<Connection[]> {
  return [];
}

export function createNodeCache(): NodeCache {
  return {
    nodes: new Map(),
    connections: new Map(),
    lastFetchBounds: null,
    loadedTiles: new Set(),
  };
}

export function addNodesToCache(
  cache: NodeCache,
  nodes: NodeData[],
  connections: Connection[]
): void {
  nodes.forEach(node => cache.nodes.set(node.id, node));
  connections.forEach(conn => cache.connections.set(conn.id, conn));
}

export function cleanupDistantNodes(
  cache: NodeCache,
  viewport: ViewportState
): { removed: number; kept: number } {
  
  const maxDistance = viewport.width * 10; 
  let removed = 0;
  let kept = 0;

  cache.nodes.forEach((node, nodeId) => {
    const distance = getNodeDistanceFromViewport(node, viewport);
    
    if (distance > maxDistance) {
      cache.nodes.delete(nodeId);
      removed++;
    } else {
      kept++;
    }
  });

  // Clean up orphaned connections
  cache.connections.forEach((conn, connId) => {
    if (!cache.nodes.has(conn.fromId) || !cache.nodes.has(conn.toId)) {
      cache.connections.delete(connId);
    }
  });

  console.log(`[CACHE] Cleanup: Removed ${removed}, Kept ${kept}`);
  return { removed, kept };
}

export function getVisibleNodesFromCache(
  cache: NodeCache,
  bounds: ViewportBounds
): NodeData[] {
  const visible: NodeData[] = [];
  
  cache.nodes.forEach(node => {
    if (isNodeInViewport(node, bounds)) {
      visible.push(node);
    }
  });

  return visible;
}

// ============================================
// DEBOUNCED FETCH MANAGER
// ============================================

export class ViewportFetchManager {
  private cache: NodeCache;
  private fetchTimeout: NodeJS.Timeout | null = null;
  private isFetching: boolean = false;
  private canvasId: string;
  private branchId: string;
  private accessToken: string;
  
  constructor(canvasId: string, branchId: string, accessToken: string) {
    this.cache = createNodeCache();
    this.canvasId = canvasId;
    this.branchId = branchId;
    this.accessToken = accessToken;
  }

  /**
   * Main method: Handle viewport change and fetch if needed
   */
  async handleViewportChange(
    viewport: ViewportState,
    onNodesUpdate: (nodes: NodeData[], connections: Connection[]) => void
  ): Promise<void> {
    
    const bounds = calculateViewportBounds(viewport);

    // Optimistic Update: Show what we have in cache immediately
    if (this.cache.nodes.size > 0) {
        const visibleNodes = getVisibleNodesFromCache(this.cache, bounds);
        const visibleConnections = Array.from(this.cache.connections.values());
        // Call update immediately to ensure UI is responsive
        if (visibleNodes.length > 0) {
            onNodesUpdate(visibleNodes, visibleConnections);
        }
    }

    if (this.fetchTimeout) clearTimeout(this.fetchTimeout);

    this.fetchTimeout = setTimeout(async () => {
      // Don't fetch if we barely moved
      if (!hasViewportChangedSignificantly(this.cache.lastFetchBounds, bounds)) {
        return;
      }

      if (this.isFetching) return;

      await this.fetchAndUpdate(viewport, bounds, onNodesUpdate);
    }, FETCH_DEBOUNCE_MS);
  }

  /**
   * Fetch nodes and update cache
   */
  private async fetchAndUpdate(
    viewport: ViewportState,
    bounds: ViewportBounds,
    onNodesUpdate: (nodes: NodeData[], connections: Connection[]) => void
  ): Promise<void> {
    
    this.isFetching = true;

    try {
      const { nodes, connections } = await fetchNodesInViewport(
        this.canvasId,
        bounds,
        this.branchId,
        this.accessToken
      );

      // Update Cache
      addNodesToCache(this.cache, nodes, connections);
      this.cache.lastFetchBounds = bounds;

      // Garbage Collection
      cleanupDistantNodes(this.cache, viewport);

      // Get Final Visible Set
      const visibleNodes = getVisibleNodesFromCache(this.cache, bounds);
      const visibleConnections = Array.from(this.cache.connections.values());

      // Update React
      if (visibleNodes.length > 0 || this.cache.nodes.size === 0) {
          onNodesUpdate(visibleNodes, visibleConnections);
      }

    } catch (error) {
      console.error('❌ Failed to fetch viewport nodes:', error);
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * Force fetch current viewport (Call on Save/Delete/Create)
   */
  async forceFetch(
    viewport: ViewportState,
    onNodesUpdate: (nodes: NodeData[], connections: Connection[]) => void
  ): Promise<void> {
    const bounds = calculateViewportBounds(viewport);
    await this.fetchAndUpdate(viewport, bounds, onNodesUpdate);
  }

  getCacheStats() {
    return {
      totalNodes: this.cache.nodes.size,
      totalConnections: this.cache.connections.size,
      loadedTiles: this.cache.loadedTiles.size,
      lastFetchBounds: this.cache.lastFetchBounds,
    };
  }

  clearCache(): void {
    this.cache.nodes.clear();
    this.cache.connections.clear();
    this.cache.loadedTiles.clear();
    this.cache.lastFetchBounds = null;
  }
}