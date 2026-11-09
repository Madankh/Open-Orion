import { NodeData, Connection, ColorTheme } from '@/typings/agent';
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

export interface Card {
  id: string;
  projectId: string;
  type: 'text' | 'image' | 'pdf' | 'youtube' | 'excerpt';
  title: string;
  content: string;                 // editor JSON/HTML
  media?: { url: string; s3Key: string; fileName: string; fileType: string };
  source?: { pdfUrl: string; pageNumber: number; boundingBox: any }; // your pdfSource
  createdAt: number; updatedAt: number;
}

export interface Placement {
  id: string; canvasId: string;
  kind: 'note' | 'card' | 'group';
  cardId: string | null;           // set only when kind === 'card'
  // note-only inline content (exactly what NodeData has now)
  title?: string; content?: string; media?: { url: string; s3Key: string; fileName: string; fileType: string };
  x: number; y: number; width: number; height: number;
  color: ColorTheme; parentId?: string;
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

export interface LiveCanvasChatContext {
  anchor_node_id: string;
  anchor_title: string;
  snapshot: LiveCanvasSnapshot;
}

export interface CanvasPdfReference {
  node_id: string;
  title: string;
  file_name: string;
  s3_key: string;
}

export interface LiveCanvasSnapshot extends Record<string, unknown> {
  pdf_files: CanvasPdfReference[];
}

type CollectionSource<T> = T[] | { current: T[] | null };

const readCollection = <T,>(source: CollectionSource<T>): T[] =>
  Array.isArray(source) ? source : source.current || [];

const limitContextText = (value: string | undefined, maxLength: number): string => {
  if (!value || value.length <= maxLength) return value || '';
  return `${value.slice(0, maxLength)}…`;
};


export const collectSmartNodeContext = (
  nodeId: string,
  nodesSource: CollectionSource<NodeData>
): SmartNodeContext => {
  const nodes = readCollection(nodesSource);
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
  connectionsSource: CollectionSource<Connection>,
  nodesSource: CollectionSource<NodeData>
): ConnectedNodeInfo[] => {
  const connections = readCollection(connectionsSource);
  const nodes = readCollection(nodesSource);
  
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
  nodesSource: CollectionSource<NodeData>
): BranchFile[] => {
  const nodes = readCollection(nodesSource);
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

export const buildLiveCanvasChatContext = (
  nodeId: string,
  nodes: NodeData[],
  connections: Connection[]
): LiveCanvasChatContext | null => {
  const currentNode = nodes.find(node => node.id === nodeId);
  if (!currentNode) return null;

  const hierarchy = collectSmartNodeContext(nodeId, nodes);
  const connectedNodes = getConnectedNodesWithMedia(nodeId, connections, nodes);
  const directConnections = connections.filter(
    connection => connection.fromId === nodeId || connection.toId === nodeId
  );

  const objectKeyFromUrl = (value?: string): string => {
    if (!value) return '';
    let pathname = value;
    try {
      pathname = new URL(value).pathname;
    } catch {
      // Canvas nodes can contain either a URL or a workspace-relative path.
    }
    const parts = pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    const uploadsIndex = parts.indexOf('uploaded_files');
    if (uploadsIndex <= 0 || uploadsIndex === parts.length - 1) return '';
    const keyParts = parts.slice(0, uploadsIndex + 1);
    if (keyParts[0] === 'workspace') keyParts.shift();
    return [...keyParts, ...parts.slice(uploadsIndex + 1)].join('/');
  };
  const objectKeyForNode = (node: NodeData): string =>
    objectKeyFromUrl(node.s3Key) ||
    objectKeyFromUrl(node.pdfUrl) ||
    objectKeyFromUrl(node.mediaUrl);

  const relatedPdfNodes: NodeData[] = [];
  const addRelatedNode = (node?: NodeData) => {
    if (!node || relatedPdfNodes.some(existing => existing.id === node.id)) return;
    const fileName = node.fileName || '';
    const objectKey = objectKeyForNode(node);
    const isPdf = node.type === 'pdf' || /\.pdf$/i.test(fileName) || /\.pdf$/i.test(objectKey);
    if (isPdf && objectKey) relatedPdfNodes.push(node);
  };

  // Prefer the PDF that a text/excerpt node points back to, then its ancestors,
  // the selected node itself, and directly connected PDFs.
  if (currentNode.pdfSource?.fileUrl) {
    addRelatedNode(nodes.find(node =>
      node.pdfUrl === currentNode.pdfSource?.fileUrl || node.s3Key === currentNode.pdfSource?.fileUrl
    ));
  }
  [...hierarchy.parentChain].reverse().forEach(parent => {
    addRelatedNode(nodes.find(node => node.id === parent.id));
  });
  addRelatedNode(currentNode);
  directConnections.forEach(connection => {
    const connectedId = connection.fromId === nodeId ? connection.toId : connection.fromId;
    addRelatedNode(nodes.find(node => node.id === connectedId));
  });
  if (hierarchy.groupInfo?.isQueryingGroup) {
    nodes.filter(node => node.parentId === nodeId).forEach(addRelatedNode);
  }

  const pdfFiles = relatedPdfNodes.slice(0, 3).map(node => {
    const s3Key = objectKeyForNode(node);
    return {
      node_id: node.id,
      title: limitContextText(node.title, 300),
      file_name: node.fileName || s3Key.split('/').pop() || node.title || 'canvas.pdf',
      s3_key: s3Key,
    };
  });
  const excerptSourceKey = objectKeyFromUrl(currentNode.pdfSource?.fileUrl);
  if (excerptSourceKey && !pdfFiles.some(file => file.s3_key === excerptSourceKey)) {
    pdfFiles.unshift({
      node_id: currentNode.id,
      title: limitContextText(currentNode.title, 300),
      file_name: excerptSourceKey.split('/').pop() || 'source.pdf',
      s3_key: excerptSourceKey,
    });
    pdfFiles.splice(3);
  }

  const contextNode = (node: NodeData, contentLimit: number) => ({
    id: node.id,
    type: node.type,
    title: limitContextText(node.title, 300),
    content: limitContextText(node.content, contentLimit),
    parentId: node.parentId || null,
    level: node.level,
    ...(node.youtubeId && { youtubeId: node.youtubeId }),
    ...(node.fileName && { fileName: node.fileName }),
    ...(node.pdfSource && { pdfSource: node.pdfSource }),
  });

  const parentChain = hierarchy.parentChain.slice(-5).map(parent => ({
    id: parent.id,
    type: parent.type,
    title: limitContextText(parent.title, 300),
    content: limitContextText(parent.content, 1800),
    isGroup: parent.isGroup,
    level: parent.level,
  }));

  const childNodes = hierarchy.childNodes.slice(0, 10).map(child => ({
    ...child,
    title: limitContextText(child.title, 300),
    content: limitContextText(child.content, 900),
  }));

  const groupInfo = hierarchy.groupInfo
    ? {
        group_id: hierarchy.groupInfo.group_id,
        group_title: limitContextText(hierarchy.groupInfo.group_title, 300),
        group_type: hierarchy.groupInfo.group_type,
        is_querying_group: hierarchy.groupInfo.is_querying_group,
        is_inside_group: hierarchy.groupInfo.is_inside_group,
        total_children: hierarchy.groupInfo.total_children,
        statistics: hierarchy.groupInfo.statistics,
        sibling_count: hierarchy.groupInfo.sibling_count,
        siblings_preview: hierarchy.groupInfo.siblings_preview,
      }
    : null;

  const links = directConnections.slice(0, 12).map(connection => ({
    id: connection.id,
    from_id: connection.fromId,
    to_id: connection.toId,
    label: limitContextText(connection.label, 300),
    stroke_style: connection.strokeStyle,
    arrow_type: connection.arrowType,
    connected_node_title: limitContextText(
      nodes.find(node => node.id === (connection.fromId === nodeId ? connection.toId : connection.fromId))?.title,
      300
    ),
  }));

  return {
    anchor_node_id: currentNode.id,
    anchor_title: limitContextText(currentNode.title, 300),
    snapshot: {
      current_node: contextNode(currentNode, 12000),
      pdf_files: pdfFiles,
      parent_chain: parentChain,
      child_nodes: childNodes,
      sibling_nodes: hierarchy.siblingNodes.slice(0, 8).map(sibling => ({
        ...sibling,
        title: limitContextText(sibling.title, 300),
      })),
      group_info: groupInfo,
      connected_nodes: connectedNodes.slice(0, 12).map(node => ({
        ...node,
        title: limitContextText(node.title, 300),
        content: limitContextText(node.content, 600),
      })),
      links,
    },
  };
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
          parentId: currentNode.parentId || null,
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
          group_info: nodeContext.groupInfo
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
