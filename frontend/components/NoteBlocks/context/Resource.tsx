// contexts/ResourceContext.tsx
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface UploadedResource {
  id: number;
  type: 'pdf' | 'document' | 'image' | 'video' | 'youtube';
  name: string;
  url?: string;
  s3_key?: string;
  size?: number;
  blockId: number;
  uploadedAt?: number;
  sessionId: string;
}

interface ResourceContextType {
  resources: UploadedResource[];
  addResource: (resource: UploadedResource) => void;
  removeResource: (id: number) => void;
  updateResource: (id: number, updates: Partial<UploadedResource>) => void;
  clearResources: () => void;
  getResourcesBySession: (sessionId: string) => UploadedResource[];
  setCurrentSession: (sessionId: string) => void;
  currentSessionId: string | null;
}

const ResourceContext = createContext<ResourceContextType | null>(null);

export const useResources = () => {
  const context = useContext(ResourceContext);
  if (!context) throw new Error('useResources must be used within ResourceProvider');
  return context;
};

export const ResourceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [resources, setResources] = useState<UploadedResource[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // // ✅ Clear resources when session changes
  useEffect(() => {
    if (currentSessionId) {
      console.log(`[RESOURCES] Session changed to: ${currentSessionId}`);
      // Keep only resources for current session
      setResources(prev => prev.filter(r => r.sessionId === currentSessionId));
    }
  }, [currentSessionId]);

  const addResource = useCallback((resource: UploadedResource) => {
    setResources(prev => {
      // Check for exact duplicates
      const exists = prev.some(r => r.id === resource.id && r.sessionId === resource.sessionId);
      if (exists) return prev;
      return [...prev, resource];
    });
  }, []);

  const removeResource = useCallback((id: number) => {
    setResources(prev => {
      const filtered = prev.filter(r => r.id !== id);
      console.log(`[RESOURCES] Removed resource ID: ${id}`);
      return filtered;
    });
  }, []);

  const updateResource = useCallback((id: number, updates: Partial<UploadedResource>) => {
    setResources(prev =>
      prev.map(r => (r.id === id ? { ...r, ...updates } : r))
    );
  }, []);

  const clearResources = useCallback(() => {
    console.log('[RESOURCES] Cleared all resources');
    setResources([]);
  }, []);

  const getResourcesBySession = useCallback((sessionId: string) => {
    return resources.filter(r => r.sessionId === sessionId);
  }, [resources]);

  const setCurrentSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
  }, []);

  return (
    <ResourceContext.Provider value={{ 
      resources: currentSessionId 
        ? resources.filter(r => r.sessionId === currentSessionId) 
        : resources,
      addResource, 
      removeResource, 
      updateResource, 
      clearResources,
      getResourcesBySession,
      setCurrentSession,
      currentSessionId
    }}>
      {children}
    </ResourceContext.Provider>
  );
};