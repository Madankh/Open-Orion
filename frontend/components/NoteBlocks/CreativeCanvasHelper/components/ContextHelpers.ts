import { NodeData, Connection } from '@/typings/agent';
import {isGroupNode} from '../components/CanvasHelpers';

// 1. Context Types
export interface ParentContextNode {
  id: string;
  type: string;
  title: string;
  content?: string;
  level?: number;
  color?: string;
  isGroup: boolean;
  youtubeId?: string;
  fileName?: string;
  pdfSource?: unknown; 
  mediaUrl?: string;
  pdfUrl?: string;
  imageUrl?: string;
  s3Key?: string;
  hasYoutubeVideo?: boolean;
  hasPDF?: boolean;
  hasImage?: boolean;
}

export interface GroupChildNode {
  id: string;
  type: string;
  title: string;
  content?: string;
  level?: number;
  position: { x: number; y: number };
  hasYoutubeVideo: boolean;
  youtubeId?: string;
  hasPDF: boolean;
  hasImage: boolean;
  fileName?: string;
  pdfSource?: {
    pageNumber: number;
    selectionType?: string;
    boundingBox?: unknown;
  };
}

export interface SiblingPreviewNode {
  id: string;
  title: string;
  type: string;
  hasMedia: boolean;
}

export interface ChildContextNode {
  id: string;
  type: string;
  title: string;
  content?: string;
  level?: number;
  hasMedia: boolean;
  youtubeId?: string;
  fileName?: string;
}

export interface SiblingContextNode {
  id: string;
  type: string;
  title: string;
  hasMedia: boolean;
}

// 2. File and Project Types
export interface BranchFile {
  node_id: string;
  file_type: string;
  file_path: string;
  title: string;
  s3_key?: string;
}

export interface ProjectInfo {
  projectId?: string;
  [key: string]: unknown; // Allow other properties
}

export interface WorkspaceInfo {
  [key: string]: unknown;
}

// ============================================
// UPDATED INTERFACES
// ============================================

export interface SmartNodeContext {
  parentChain: ParentContextNode[];
  childNodes: ChildContextNode[];
  siblingNodes: SiblingContextNode[];
  groupInfo: GroupInfo | null;
  isQueryingGroup: boolean;
}

export interface GroupInfo {
  group_id: string;
  group_title: string;
  group_type: string;
  is_querying_group: boolean;
  is_inside_group?: boolean;
  total_children?: number;
  children?: GroupChildNode[];
  statistics?: {
    text_nodes: number;
    image_nodes: number;
    pdf_nodes: number;
    youtube_nodes: number;
  };
  sibling_count?: number;
  siblings_preview?: SiblingPreviewNode[];
}

export interface ConnectedNodeInfo {
  id: string;
  type: string;
  title: string;
  content?: string;
  connectionType: string;
  hasYoutubeVideo?: boolean;
  youtubeId?: string;
  hasPDF?: boolean;
  fileName?: string;
  hasImage?: boolean;
}


export const collectSmartNodeContext = (
  nodeId: string,
  nodesRef: React.RefObject<NodeData[]>
): SmartNodeContext => {
  const nodes = nodesRef.current || [];
  const currentNode = nodes.find(n => n.id === nodeId);

  if (!currentNode) {
    return {
      parentChain: [],
      childNodes: [],
      siblingNodes: [],
      groupInfo: null,
      isQueryingGroup: false
    };
  }

  const isQueryingGroup = isGroupNode(currentNode);

  const parentChain: ParentContextNode[] = [];
  let current = currentNode;
  let groupAncestor: NodeData | null = null;

  while (current?.parentId) {
    const parent = nodes.find(n => n.id === current.parentId);
    if (!parent) break;

    if (isGroupNode(parent)) {
      groupAncestor = parent;
    }

    parentChain.unshift({
      id: parent.id,
      type: parent.type,
      title: parent.title,
      content: parent.content,
      level: parent.level,
      color: parent.color,
      isGroup: isGroupNode(parent),
      
      ...(parent.youtubeId && { youtubeId: parent.youtubeId }),
      ...(parent.fileName && { fileName: parent.fileName }),
      ...(parent.pdfSource && { pdfSource: parent.pdfSource }),
      ...(parent.mediaUrl && { mediaUrl: parent.mediaUrl }),
      ...(parent.pdfUrl && { pdfUrl: parent.pdfUrl }),
      ...(parent.imageUrl && { imageUrl: parent.imageUrl }),
      ...(parent.s3Key && { s3Key: parent.s3Key })
    });

    current = parent;
  }

  let groupInfo: GroupInfo | null = null;

  if (isQueryingGroup) {
    const groupChildren = nodes.filter(n => n.parentId === nodeId);
    groupInfo = {
      group_id: currentNode.id,
      group_title: currentNode.title,
      group_type: currentNode.type,
      is_querying_group: true,
      total_children: groupChildren.length,
      children: groupChildren.map(child => ({
        id: child.id,
        type: child.type,
        title: child.title,
        content: child.content, 
        level: child.level,
        position: { x: child.x, y: child.y },
        hasYoutubeVideo: !!child.youtubeId,
        youtubeId: child.youtubeId,
        hasPDF: !!child.fileName && child.fileName.endsWith('.pdf'),
        hasImage: !!child.fileName && /\.(jpg|jpeg|png|gif|webp)$/i.test(child.fileName),
        fileName: child.fileName,
        ...(child.pdfSource && {
          pdfSource: {
            pageNumber: child.pdfSource.pageNumber,
            selectionType: child.pdfSource.type
          }
        })
      })),
      statistics: {
        text_nodes: groupChildren.filter(c => c.type === 'text').length,
        image_nodes: groupChildren.filter(c => c.type === 'image').length,
        pdf_nodes: groupChildren.filter(c => c.type === 'pdf').length,
        youtube_nodes: groupChildren.filter(c => c.youtubeId).length
      }
    };
  } else if (groupAncestor) {
    const groupSiblings = nodes.filter(n => 
      n.parentId === groupAncestor!.id && n.id !== nodeId
    );
    groupInfo = {
      group_id: groupAncestor.id,
      group_title: groupAncestor.title,
      group_type: groupAncestor.type,
      is_inside_group: true,
      is_querying_group: false,
      sibling_count: groupSiblings.length,
      siblings_preview: groupSiblings.slice(0, 5).map(s => ({
        id: s.id,
        title: s.title,
        type: s.type,
        hasMedia: !!(s.youtubeId || s.fileName)
      }))
    };
  }

  // 3. Child Nodes
  const childNodes: ChildContextNode[] = nodes
    .filter(n => n.parentId === nodeId)
    .map(child => ({
      id: child.id,
      type: child.type,
      title: child.title,
      content: isQueryingGroup 
        ? child.content 
        : child.content?.substring(0, 150), 
      level: child.level,
      hasMedia: !!(child.youtubeId || child.fileName || child.pdfSource),
      ...(child.youtubeId && { youtubeId: child.youtubeId }),
      ...(child.fileName && { fileName: child.fileName })
    }));

  
  // A. Find the parent object ONCE (if it exists)
  const parentNode = currentNode.parentId 
    ? nodes.find(n => n.id === currentNode.parentId) 
    : undefined;

  // B. Safely check if parent is a group
  const isParentGroup = parentNode ? isGroupNode(parentNode) : false;

  const siblingNodes: SiblingContextNode[] = nodes
    .filter(n => {
      return (
        n.parentId === currentNode.parentId && 
        n.id !== nodeId &&
        !isParentGroup 
      );
    })
    .slice(0, 5)
    .map(sibling => ({
      id: sibling.id,
      type: sibling.type,
      title: sibling.title,
      hasMedia: !!(sibling.youtubeId || sibling.fileName)
    }));

  return {
    parentChain,
    childNodes,
    siblingNodes,
    groupInfo,
    isQueryingGroup
  };
};

export const getConnectedNodesWithMedia = (
  nodeId: string,
  connectionsRef: React.RefObject<Connection[]>,
  nodesRef: React.RefObject<NodeData[]>
): ConnectedNodeInfo[] => {
  const connections = connectionsRef.current || [];
  const nodes = nodesRef.current || [];
  
  const connectedNodeIds = new Set<string>();
  
  connections.forEach(conn => {
    if (conn.fromId === nodeId) {
      connectedNodeIds.add(conn.toId);
    }
    if (conn.toId === nodeId) {
      connectedNodeIds.add(conn.fromId);
    }
  });
  
  return Array.from(connectedNodeIds)
    .map(id => nodes.find(n => n.id === id))
    .filter((node): node is NodeData => !!node)
    .map(node => ({
      id: node.id,
      type: node.type,
      title: node.title,
      content: node.content?.substring(0, 200),
      connectionType: connections.find(c => 
        (c.fromId === nodeId && c.toId === node.id) ||
        (c.toId === nodeId && c.fromId === node.id)
      )?.label || 'connected',
      
      hasYoutubeVideo: !!node.youtubeId,
      youtubeId: node.youtubeId,
      hasPDF: !!node.fileName && node.fileName.endsWith('.pdf'),
      hasImage: !!node.fileName && /\.(jpg|jpeg|png|gif|webp)$/i.test(node.fileName),
      fileName: node.fileName
    }));
};

export const cleanUrlPath = (url: string | undefined | null): string => {
  if (!url) return "";
  
  let path = url;

  if (url.startsWith('https')) {
    try {
      path = new URL(url).pathname; 
    } catch (e) { 
    }
  }

  if (path.includes("uploaded_files/")) {
    const parts = path.split("/uploaded_files/");
    return "uploaded_files/" + parts[1];
  }

  return path;
};


export const collectBranchFiles = (
  nodeId: string, 
  nodesRef: React.RefObject<NodeData[]>
): BranchFile[] => {
  const nodes = nodesRef.current || [];
  const files: BranchFile[] = [];

  nodes.forEach(node => {
    if (node.pdfUrl || node.mediaUrl || node.s3Key) {
      // Ensure we have a string value to push to files
      const path = node.pdfUrl || node.mediaUrl || node.s3Key;
      if (path) {
        files.push({
          node_id: node.id,
          file_type: node.type,
          file_path: path,
          title: node.title,
          s3_key: node.s3Key
        });
      }
    }
  });

  return files;
};

export const buildCanvasQueryPayload = (
  currentNode: NodeData,
  nodeContext: SmartNodeContext,
  connectedNodes: ConnectedNodeInfo[],
  filePaths: string[],
  sessionId: string,
  username: string,
  userProfile: string,
  userId: string,
  projectInfo: ProjectInfo | unknown, // Using unknown/Interface mix for flexibility
  workspaceInfo: WorkspaceInfo | unknown,
  selectedModel: string,
  userPlanId: string | null,
  apiKeys: { llm: string | null; image: string | null; web: string | null },
  branchFiles: BranchFile[],
  nodeConnections: unknown[] // Or a specific Connection Interface if available
) => {
  // Safe cast helper for project info if strictly unknown
  const safeProjectInfo = projectInfo as ProjectInfo;

  return {
    type: "canvas_query",
    content: {
      canvas_id: sessionId,
      node_id: `response-${currentNode?.id || 'canvas'}-${Date.now()}`,
      source_node_id: currentNode?.id || null,
      branch_id: "main",
      mode: "creative_canvas",
      agent_mode: "creative_canvas",
      model_id: selectedModel || "",
      resume: false,

      // Canvas state
      canvas_state: {
        viewport: {
          zoom: 0.8, // Will be filled in by component
          pan_x: 0,
          pan_y: 0
        },
        selected_node_id: currentNode?.id || null,
        total_nodes: 0, // Will be filled
        total_connections: 0, // Will be filled
        current_branch: "main"
      },

      // ✅ SMART NODE CONTEXT
      node_context: currentNode ? {
        current_node: {
          id: currentNode.id,
          type: currentNode.type,
          title: currentNode.title,
          level: currentNode.level,
          position: { x: currentNode.x, y: currentNode.y },
          color: currentNode.color,
          
          // ✅ YouTube URL in content for AI understanding
          content: currentNode.youtubeId 
            ? `YouTube Video: ${currentNode.youtubeId}\n\n${currentNode.content || ''}`
            : currentNode.content,
          
          // ✅ Media flags (not URLs, those go in files)
          hasYoutubeVideo: !!currentNode.youtubeId,
          hasPDF: !!currentNode.fileName && currentNode.fileName.endsWith('.pdf'),
          hasImage: !!currentNode.fileName && /\.(jpg|jpeg|png|gif|webp)$/i.test(currentNode.fileName),
          
          // ✅ PDF source metadata
          ...(currentNode.pdfSource && {
            pdfSource: {
              pageNumber: currentNode.pdfSource.pageNumber,
              selectionType: currentNode.pdfSource.type,
              boundingBox: currentNode.pdfSource.boundingBox
            }
          })
        },
        
        // ✅ Parent chain with smart media handling
        parent_chain: nodeContext.parentChain.map(parent => ({
          id: parent.id,
          type: parent.type,
          title: parent.title,
          level: parent.level,
          isGroup: parent.isGroup,
          
          // ✅ YouTube in content
          content: parent.youtubeId
            ? `YouTube Video: ${parent.youtubeId}\n\n${parent.content || ''}`
            : parent.content,
          
          hasYoutubeVideo: !!parent.youtubeId,
          hasPDF: !!parent.fileName,
          hasImage: !!parent.fileName && /\.(jpg|jpeg|png)$/i.test(parent.fileName || '')
        })),
        
        child_nodes: nodeContext.childNodes,
        
        // ✅ Siblings only if NOT in a group
        ...(nodeContext.siblingNodes.length > 0 && !nodeContext.groupInfo?.is_inside_group && {
          sibling_nodes: nodeContext.siblingNodes
        }),
        
        // ✅ Group info (full or lightweight)
        ...(nodeContext.groupInfo && {
          group_context: nodeContext.groupInfo
        }),
        
        connected_nodes: connectedNodes.map(conn => ({
          id: conn.id,
          type: conn.type,
          title: conn.title,
          connectionType: conn.connectionType,
          
          // ✅ YouTube in content
          content: conn.youtubeId
            ? `YouTube Video: ${conn.youtubeId}`
            : conn.content?.substring(0, 100),
          
          hasYoutubeVideo: !!conn.youtubeId,
          hasPDF: !!conn.hasPDF,
          fileName: conn.fileName
        }))
      } : null,

      // Project context
      project_context: {
        project_id: safeProjectInfo?.projectId,
        session_id: sessionId,
        workspace_info: workspaceInfo,
        user_id: userId,
        username: username,
        user_profile: userProfile
      },

      // ✅ FILES: PDFs and Images
      files: filePaths,
      
      // Branch files
      branch_files: branchFiles,
      
      // Node connections
      node_connections: nodeConnections,

      // Tool arguments
      tool_args: {
        deep_research: false,
        pdf: true,
        media_generation: false,
        audio_generation: false,
        browser: true,
        sequential_thinking: false,
      },

      // API keys (if custom plan)
      api_keys: userPlanId === "custom_api" ? {
        llmKey: apiKeys.llm,
        imageKey: apiKeys.image,
        webKey: apiKeys.web,
      } : {}
    }
  };
};