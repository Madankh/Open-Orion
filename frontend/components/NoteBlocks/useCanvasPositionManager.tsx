import { useCallback, useRef, useEffect } from 'react';

// ============================================
// SMART POSITION MANAGER
// ============================================

class SmartPositionManager {
  private positions: Map<string, { x: number; y: number }> = new Map();
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private hasUnsavedChanges = false;
  private isSaving = false;

  constructor(
    private mode: 'personal' | 'collaborative',
    private onSave: (positions: Map<string, { x: number; y: number }>) => Promise<void>,
    private autoSaveIntervalMs: number = 30000 // 30 seconds
  ) {
    // Only enable auto-save for collaborative mode
    if (mode === 'collaborative') {
      this.startAutoSave();
    }
  }

  // Update a node position (instant, no API call)
  updatePosition(nodeId: string, x: number, y: number) {
    this.positions.set(nodeId, { x, y });
    this.hasUnsavedChanges = true;
  }

  // Get current position from cache
  getPosition(nodeId: string) {
    return this.positions.get(nodeId);
  }

  // Background auto-save for collaborative mode
  private startAutoSave() {
    this.autoSaveInterval = setInterval(async () => {
      if (this.hasUnsavedChanges && !this.isSaving) {
        console.log('🔄 Auto-saving positions...');
        await this.save();
      }
    }, this.autoSaveIntervalMs);
  }

  // Manual save (call on session close)
  async save() {
    if (!this.hasUnsavedChanges || this.isSaving) return;

    this.isSaving = true;
    const positionsToSave = new Map(this.positions);

    try {
      console.log(`💾 Saving ${positionsToSave.size} node positions...`);
      await this.onSave(positionsToSave);
      this.hasUnsavedChanges = false;
      console.log('✅ Positions saved successfully');
    } catch (error) {
      console.error('❌ Failed to save positions:', error);
      throw error;
    } finally {
      this.isSaving = false;
    }
  }

  // Check if there are unsaved changes
  getUnsavedCount(): number {
    return this.hasUnsavedChanges ? this.positions.size : 0;
  }

  // Cleanup
  async destroy() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    // Final save before destroying
    if (this.hasUnsavedChanges) {
      await this.save();
    }
  }
}

// ============================================
// REACT HOOK FOR CANVAS POSITION MANAGEMENT
// ============================================

export function useCanvasPositionManager(
  sessionId: string,
  accessToken: string,
  isCollaborativeMode: boolean,
  collab: any,
  API_BASE_URL: string
) {
  const managerRef = useRef<SmartPositionManager | null>(null);
  const yjsThrottleRef = useRef<Map<string, number>>(new Map());
  
  // Initialize manager
  useEffect(() => {
    const saveToDatabase = async (positions: Map<string, { x: number; y: number }>) => {
      const updates = Array.from(positions.entries()).map(([nodeId, pos]) => ({
        node_id: nodeId,
        position_x: pos.x,
        position_y: pos.y
      }));

      const response = await fetch(
        `${API_BASE_URL}/nodes/${sessionId}/batch-update?branch_id=main`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ updates })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to save positions');
      }
    };

    managerRef.current = new SmartPositionManager(
      isCollaborativeMode ? 'collaborative' : 'personal',
      saveToDatabase,
      30000 // Auto-save every 30 seconds in collaborative mode
    );

    return () => {
      // Save on component unmount
      managerRef.current?.destroy();
    };
  }, [sessionId, accessToken, isCollaborativeMode, API_BASE_URL]);

  // Update position during drag (no API call)
  const updateNodePosition = useCallback((nodeId: string, x: number, y: number) => {
    // 1. Update manager cache immediately
    managerRef.current?.updatePosition(nodeId, x, y);

    // 2. Update Y.js (throttled to 100ms per node)
    if (isCollaborativeMode) {
      const now = Date.now();
      const lastUpdate = yjsThrottleRef.current.get(nodeId) || 0;
      
      if (now - lastUpdate > 100) { // Max 10 updates/sec per node
        yjsThrottleRef.current.set(nodeId, now);
        collab?.updateYCanvasNode(nodeId, {
          position: { x, y }
        });
      }
    }
  }, [isCollaborativeMode, collab]);

  // Manual save (call on session close or user action)
  const savePositions = useCallback(async () => {
    await managerRef.current?.save();
  }, []);

  // Get unsaved changes count
  const getUnsavedCount = useCallback(() => {
    return managerRef.current?.getUnsavedCount() || 0;
  }, []);

  return {
    updateNodePosition,
    savePositions,
    getUnsavedCount
  };
}