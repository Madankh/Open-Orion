// CanvasHelpers.ts
import { NodeData, Connection } from '@/typings/agent';
import { toast } from 'sonner';
import { pythonUrl } from "../../../../apiurl"
// Constants
export const SNAP_GRID = 10;
export const GROUP_PADDING = 30;
export const GROUP_HEADER_HEIGHT = 50;
export const API_BASE_URL = `${pythonUrl}/api`;


export const isGroupNode = (node: NodeData): boolean => node.type === 'group';

export const getAllChildren = (nodeId: string, allNodes: NodeData[]): NodeData[] => {
    const children: NodeData[] = [];
    const node = allNodes.find(n => n.id === nodeId);
    if (!node) return children;

    node.childIds.forEach(childId => {
        const child = allNodes.find(n => n.id === childId);
        if (child) {
            children.push(child);
            children.push(...getAllChildren(childId, allNodes));
        }
    });
    return children;
};

export const getGroupBounds = (groupNode: NodeData, allNodes: NodeData[]) => {
    const children = allNodes.filter(n => n.parentId === groupNode.id);

    if (children.length === 0) {
        return { x: groupNode.x, y: groupNode.y, w: groupNode.width, h: groupNode.height };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    children.forEach(child => {
        minX = Math.min(minX, child.x);
        minY = Math.min(minY, child.y);
        maxX = Math.max(maxX, child.x + child.width);
        maxY = Math.max(maxY, child.y + child.height);
    });

    minX -= GROUP_PADDING;
    minY -= GROUP_PADDING + GROUP_HEADER_HEIGHT;
    maxX += GROUP_PADDING;
    maxY += GROUP_PADDING;

    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

export const getNodeCenter = (id: string, nodes: NodeData[]) => {
    const n = nodes.find(x => x.id === id);
    if (!n) return { x: 0, y: 0 };
    
    if (isGroupNode(n)) {
        const bounds = getGroupBounds(n, nodes);
        return { 
            x: bounds.x + bounds.w / 2, 
            y: bounds.y + bounds.h / 2 
        };
    }
    
    return { x: n.x + n.width / 2, y: n.y + n.height / 2 };
};


export const collectNodeContext = (nodeId: string, nodesRef: React.RefObject<NodeData[]>) => {
      const nodes = nodesRef.current || [];
      const currentNode = nodes.find(n => n.id === nodeId);
      if (!currentNode) return { parentChain: [], childNodes: [], siblingNodes: [] };
    
      // Get parent chain
      const parentChain: any[] = [];
      let current = currentNode;
      while (current.parentId) {
        const parent = nodes.find(n => n.id === current.parentId);
        if (!parent) break;
        parentChain.push({
          id: parent.id,
          type: parent.type,
          title: parent.title,
          content: parent.content,
          level: parent.level
        });
        current = parent;
      }
    
      // Get child nodes
      const childNodes = nodes
        .filter(n => n.parentId === nodeId)
        .map(n => ({
          id: n.id,
          type: n.type,
          title: n.title,
          content: n.content,
          level: n.level
        }));
    
      // Get sibling nodes
      const siblingNodes = nodes
        .filter(n => n.parentId === currentNode.parentId && n.id !== nodeId)
        .map(n => ({
          id: n.id,
          type: n.type,
          title: n.title,
          content: n.content,
          level: n.level
        }));
    
      return { parentChain, childNodes, siblingNodes };
    };

export const getConnectedNodes = (
      nodeId: string,
      connectionsRef: React.RefObject<Connection[]>,
      nodesRef: React.RefObject<NodeData[]>
    ) => {
      const connections = connectionsRef.current || [];
      const nodes = nodesRef.current || [];
      
      const connectedIds = new Set<string>();
      connections.forEach(conn => {
        if (conn.fromId === nodeId) connectedIds.add(conn.toId);
        if (conn.toId === nodeId) connectedIds.add(conn.fromId);
      });
    
      return Array.from(connectedIds)
        .map(id => nodes.find(n => n.id === id))
        .filter(Boolean)
        .map(n => ({
          id: n!.id,
          type: n!.type,
          title: n!.title,
          content: n!.content,
          level: n!.level
        }));
    };

export const findParentPDF = (nodeId: string, nodesRef: React.RefObject<NodeData[]>) => {
      const nodes = nodesRef.current || [];
      let current = nodes.find(n => n.id === nodeId);
      
      while (current?.parentId) {
        const parent = nodes.find(n => n.id === current!.parentId);
        if (!parent) break;
        if (parent.type === 'pdf' && parent.pdfUrl) return parent;
        current = parent;
      }
      
      return null;
    };

// --- 3. API Services (Cleaner Code) ---

export const apiSaveNodeParent = async (sessionId: string, accessToken: string, childNodeId: string, groupId: string, parentNodeId: string | null) => {
    try {
        await fetch(`${API_BASE_URL}/nodes/${sessionId}/${childNodeId}?branch_id=main`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                group_id: groupId,
                parent_node_id: parentNodeId
            })
        });
    } catch (error) {
        console.error('❌ Error saving node parent:', error);
    }
};

export const apiBatchUpdatePositions = async (sessionId: string, accessToken: string, updates: any[]) => {
    await fetch(`${API_BASE_URL}/nodes/${sessionId}/batch-update?branch_id=main`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ updates })
    });
}

export const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
};

export const extractYoutubeId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};


export const apiService = {
    downloadFile: async (sessionId: string, s3Key: string, accessToken: string) => {
        try {
            let cleanS3Key = s3Key;
            if (cleanS3Key.startsWith('/workspace/')) {
                cleanS3Key = cleanS3Key.substring(11);
            }

            const response = await fetch(`${API_BASE_URL}/download`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId, s3_key: cleanS3Key })
            });

            if (!response.ok) return null;
            const result = await response.json();
            return `${pythonUrl}${result.file?.path}`;
        } catch (error) {
            console.error('❌ Error downloading file:', error);
            return null;
        }
    },

    uploadFile: async (sessionId: string, file: { path: string, content: string }, accessToken: string) => {
        const response = await fetch(`${API_BASE_URL}/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, file })
        });
        if (!response.ok) throw new Error("Upload failed");
        return await response.json(); // Returns { file: { s3_key, path } }
    },

    saveNode: async (sessionId: string, nodeId: string, data: any, accessToken: string) => {
        try {
            await fetch(`${API_BASE_URL}/nodes/${sessionId}/${nodeId}?branch_id=main`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            // console.log('✅ Saved node data:', nodeId);
        } catch (error) {
            console.error('❌ Error saving node:', error);
        }
    },

    createNode: async (sessionId: string, nodeData: any, accessToken: string) => {
        try {
            await fetch(`${API_BASE_URL}/nodes`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    canvas_id: sessionId,
                    branch_id: 'main',
                    ...nodeData // Spread the specific node data here
                })
            });
        } catch (error) {
            console.error("❌ Failed to create node in DB:", error);
            toast.error("Failed to save to database");
        }
    },
    
    saveConnection: async (sessionId: string, connectionId: string, data: any, accessToken: string, isNew = false) => {
        const endpoint = isNew ? `${API_BASE_URL}/connections` : `${API_BASE_URL}/connections/${sessionId}/${connectionId}?branch_id=main`;
        const method = isNew ? 'POST' : 'PATCH';
        
        try {
             await fetch(endpoint, {
                method,
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    canvas_id: sessionId,
                    branch_id: 'main',
                    ...(isNew ? { connection_id: connectionId } : {}),
                    ...data
                })
            });
        } catch(e) { console.error("Connection save failed", e); }
    }
};