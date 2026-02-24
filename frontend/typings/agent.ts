export enum AICommandType {
  FIX_SPELLING = 'Fix spelling & grammar',
  MAKE_SHORTER = 'Make shorter',
  MAKE_LONGER = 'Make longer',
  SIMPLIFY = 'Simplify language',
  PROFESSIONAL = 'Make professional',
  CUSTOM = 'Custom command'
}
export interface PDFSourceData {
  fileUrl?: string; // Add this
  pageNumber: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  type: 'text' | 'image' | 'mixed';
}

export interface RootState {
  user: {
    currentUser?: {
      user?: { _id: string, email: string };
      id?: string;
      username?: string;
      profile?: string;
    };
    accessToken: string;
  };
}

export interface AIRequest {
  text: string;
  command: AICommandType;
  customPrompt?: string;
}

export interface AIResponse {
  refinedText: string;
}

export type EditorMetric = {
  words: number;
  characters: number;
}



import { 
  LucideIcon
} from 'lucide-react';


export enum TAB {
  BROWSER = "browser",
  CODE = "code",
  TERMINAL = "terminal",
  THINKING = "sequential_thinking",
  NULL="null"
}

export interface Selection {
  content?:string,
  imageData?:string,
  pageNumber?:number,
  type?:string,
  pdfUrl?:string,
  pdfFile?:string
} 


export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}



export interface GroupData {
  id: string;
  title: string;
  color: ColorTheme;
  zIndex: number;
  fallbackX: number;
  fallbackY: number;
}

// export interface Connection {
//   id: string;
//   fromId: string;
//   toId: string;
//   label?: string;
// }

export interface DragState {
  isDragging: boolean;
  type: 'node' | 'group' | 'canvas' | null;
  id: string | null;
  startX: number;
  startY: number;
  initialPositions: Record<string, Position>; // Map of ID -> {x,y}
}

export interface GlobalNote {
  id: string;
  title: string;
  content: string;
  color: ColorTheme;
  createdAt: number;
}


export interface BlockChange {
  action: 'create' | 'update' | 'delete';
  blockId: number;
  block?: Partial<Block>;
  timestamp: number;
}

export interface BatchUpdate {
  sessionId: string;
  changes: BlockChange[];
  version?: number; // For optimistic concurrency control
}

export type Source = {
  title: string;
  url: string;
};

export type CollabNote = {
  id: string;
  content: string;
  authorId?: string;
  authorEmail?: string;
  createdAt: number;
  updatedAt?: number;
  pinned?: boolean;
  source?: "user" | "ai";
  metadata?: Record<string, any>;
};

export interface WhiteboardContentt {
  schema?: unknown;
  store?: Record<string, unknown>;
  document?: unknown;
}

interface WhiteboardRawData {
  title?: string;
  content?: WhiteboardContentt | unknown;
}

export interface BlockData {
  id: string | number;
  type: string;
  file?:string;
  s3_key?:string;
  size?:string;
  title?: string;
  url?:string;
  pages?:string;
  created_at?:string;
  session_id?:string;
  content?: unknown;
  user_id?:string;
  raw_data?: unknown;
}


export interface VisitResultItem {
  url: string;
  result: { content?: string };
}

export interface ProjectContext {
  projectId?: string;
  topicId?: string;
  workId?: string;
  sessionId?: string;
}

export interface ThoughtEventData {
  queries?: string[];
  urls?: string[];
  results?: VisitResultItem[];
  name?: string;
  arguments?: {
    queries?: string[];
    urls?: string[];
  };
  reasoning?: string;
  final_report?: string;
  result?: string;
  timestamp?: number;
  [key: string]: unknown;
}

export interface QuizQuestion {
  adaptive_reasoning: string;
  answer: string;
  difficulty: "easy" | "medium" | "hard";
  estimated_time: number;
  explanation: string;
  hints: string[];
  options: string[];
  question: string;
  topic: string;
  type: "multiple_choice" | "true_false" | "short_answer";
}

export interface StudentProfile {
  average_score: number;
  learning_style: string;
  preferred_difficulty: string;
  recent_mistakes: string[];
  strong_areas: string[];
  weak_areas: string[];
}

export interface ApiKeys {
  llmKey: string | null;
  imageKey: string | null;
  webKey: string | null;
}

export interface InitAgentContent {
  tool_args: {
    deep_research: boolean;
    pdf: boolean;
    mode:string,
    model_id:string,
    agent_type:string,
    media_generation: boolean;
    audio_generation: boolean;
    browser: boolean;
    sequential_thinking?: boolean;
  };
  api_keys?: ApiKeys; 
}

export enum AgentEvent {
  USER_MESSAGE = "user_message",
  CONNECTION_ESTABLISHED = "connection_established",
  WORKSPACE_INFO = "workspace_info",
  PROCESSING = "processing",
  TOOL_ARGS_STREAM = "Tool_processing",
  AGENT_THINKING = "agent_thinking",
  TOOL_CALL = "tool_call",
  TOOL_RESULT = "tool_result",
  AGENT_RESPONSE = "agent_response",
  STREAM_COMPLETE = "stream_complete",
  ERROR = "error",
  SYSTEM = "system",
  PONG = "pong",
  UPLOAD_SUCCESS = "upload_success",
  BROWSER_USE = "browser_use",
  FILE_EDIT = "file_edit",
  PROMPT_GENERATED = "prompt_generated",
  // DEEP_SEARCH_EVENT = "Deep_research_agent_started",
  // DEEP_RESEARCH_START = "Deep_research_agent_started",
  // DEEP_RESEARCH_STEP = "deep_research_step",
  DEEP_RESEARCH_TOKEN = "deep_research_token",
  DEEP_RESEARCH_COMPLETE = "DEEP_SEARCH_COMPLETE",
  // TOKEN_USAGE = "token_usage",
  REASONING_TOKEN="Reasoning_token",
  DEEP_SEARCH_EVENT = "start",
  DEEP_RESEARCH_STEP = "step",
  STEP_COMPLETED = "step_completed",
  TOOL = "tool",
  START = "start",
  STEP = "step",
  REASONING = "reasoning",
  SEARCH = "search",
  VISIT2="visit",
  SEARCH_RESULTS = "search_results",
  EVAL_ANSWER = "eval_answer",
  WRITING_REPORT = "writing_report",
  DEEP_RESEARCH_START = "Deep_research_agent_started",
  TOKEN_USAGE = "token_usage",
  THINKING = "thinking",
  KNOWLEDGE = "knowledge",
  DRAFT_ANSWER = "draft_answer",
  GENERATING_REPORT="generating_report",

  STREAMING_TOKEN="STREAMING_TOKEN",
  STREAMING_COMPLETE="STREAMING_COMPLETE"

}

export enum TOOL {
  SEQUENTIAL_THINKING = "sequential_thinking",
  STR_REPLACE_EDITOR = "str_replace_editor",
  CREATE_FILE = "CREATE_FILE",
  BROWSER_USE = "browser_use",
  PRESENTATION = "presentation",
  WEB_SEARCH = "web_search",
  IMAGE_SEARCH = "image_search",
  VISIT = "visit_webpage",
  VISIT2 = "visit_webpage",
  BASH = "bash",
  COMPLETE = "complete",
  STATIC_DEPLOY = "static_deploy",
  PDF_TEXT_EXTRACT = "pdf_content_extract",
  AUDIO_TRANSCRIBE = "audio_transcribe",
  GENERATE_AUDIO_RESPONSE = "generate_audio_response",
  Adaptive_question_generator = "AdaptiveQuestionGenerator",
  VIDEO_GENERATE = "generate_video_from_text",
  IMAGE_GENERATE = "generate_image_from_text",
  DEEP_RESEARCH = "deep_research",
  LIST_HTML_LINKS = "list_html_links",
  YOUTUBE_VIDEO_TRANSCRIPT = "youtube_video_transcript",
  IntelligentFeedbackSystem="IntelligentFeedbackSystem",
  SEARCH_DOCUMENTS="search_documents",
  INDEX_DOCUMENTS="index_documents",
  // browser tools
  BROWSER_VIEW = "browser_view",
  BROWSER_NAVIGATION = "browser_navigation",
  BROWSER_RESTART = "browser_restart",
  BROWSER_WAIT = "browser_wait",
  BROWSER_SCROLL_DOWN = "browser_scroll_down",
  BROWSER_SCROLL_UP = "browser_scroll_up",
  BROWSER_CLICK = "browser_click",
  BROWSER_ENTER_TEXT = "browser_enter_text",
  BROWSER_PRESS_KEY = "browser_press_key",
  BROWSER_GET_SELECT_OPTIONS = "browser_get_select_options",
  BROWSER_SELECT_DROPDOWN_OPTION = "browser_select_dropdown_option",
  BROWSER_SWITCH_TAB = "browser_switch_tab",
  BROWSER_OPEN_NEW_TAB = "browser_open_new_tab",
  MESSAGE_USER="MessageToUser",
  MESSAGE_USERR="MessageToUserMessageToUser",
  RETRIEVE_CONTEXT="retrieve_context"
}

export type ActionStep = {
  type: TOOL;
  data: {
    isResult?: boolean;
    tool_name?: string;
    tool_input?: {
      description?: string;
      action?: string;
      text?: string;
      thought?: string;
      path?: string;
      file_text?: string;
      file_path?: string;
      command?: string;
      url?: string;
      query?: string;
      file?: string;
      instruction?: string;
      output_filename?: string;
      key?: string;
      mode?:string;
    };
    result?: string | Record<string, unknown>;
    query?: string;
    content?: string;
    path?: string;
  };
};


export interface AdaptiveQuestionData {
  adaptation_strategy: string;
  content: string;
  learning_objectives: string[];
  questions: QuizQuestion[];
  student_profile: StudentProfile;
}

export interface MessageForUser {
  tool_input:{
    text:string
  }
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content?: string;
  model_id?:string;
  timestamp: number;
  action?: ActionStep;
  sender?:string;
  type?:string;
  mode?: string; 
  files?: string[]; // File names
  fileContents?: { [filename: string]: string }; // Base64 content of files
  quizData?: AdaptiveQuestionData;
  MessageForUser?:MessageForUser

}

export interface ISession {
  id: string;
  workspace_dir: string;
  created_at: string;
  device_id: string;
  first_message: string;
}

export interface IEvent {
  id: string;
  event_type: AgentEvent;
  event_payload: {
    type: AgentEvent;
    content: Record<string, unknown>;
  };
  timestamp: string;
  workspace_dir: string;
}


export enum ThoughtType {
  START = "start",
  STEP = "step",
  STEP_COMPLETED = "step_completed",
  REASONING = "reasoning",
  THINKING = "thinking",
  KNOWLEDGE = "knowledge",
  SEARCH = "search",
  VISIT = "visit",
  DRAFT_ANSWER = "draft_answer",
  GENERATING_REPORT = "generating_report",
  EVAL_ANSWER = "eval_answer",
  SEARCH_RESULTS = "search_results",
  WRITING_REPORT = "writing_report",
  TOOL = "tool",
  COMPLETE="complete",
}

export type ThoughtStep = {
  id?: number;
  type: ThoughtType;
  data: {
    step?: number;
    total_step?: number;
    type?: string;
    question?: string;
    answer?: string;
    urls?: string[];
    action?: string;
    thinking?: string;
    is_final?: boolean;
    final_report?: string;
    queries?: string[];
    results?: {
      url: string;
      title: string;
      description: string;
    }[];
  };
  timestamp: number;
};

export interface ApiBlock {
  id: number; 
  type: string;
  content?: string;
  created_at: string;
  updated_at: string; 
  session_id: string;
  user_id: string;
  [key: string]: any; 
}

export interface Block {
  id:number;
  type?: 'text' | 'heading' | 'code' | 'table' | 'bullet' | 'numbered-list' | 
        'quote' | 'details' | 'latex' | 'image' | 'video' | 'audio' | 
        'pdf' | 'document' | 'whiteboard' | 'youtube' | 'kanban';
  content?: string;
  level?: number;
  language?: string;
  data?: string[][];
  title?: string;
  isOpen?: boolean;
  name?: string;
  size?: number | string;
  url?: string;
  serverPath?: string;
  src?: string;
  s3_key?: string;
  file?: File;
  status?: 'uploading' | 'uploaded' | 'error';
  videoId?: string;
  timestamps?: any[];
  boardTitle?: string;
  columns?: any[];
  pages?: string;
  created_at?: string;
  session_id?: string;
  user_id?: string;
  prompt?: string;
  query?: string;
  items?: string[];
  results?: SearchResult[];
  thumbnail?: string;
  aiContext?: {
    triggeredBy?: number;
    triggerType?: string;
    createdByAI?: boolean;
    aiPrompt?: string;
  };
}

export type YBlock = Block;

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export interface AISuggestion {
  id: number;
  text: string;
  type: string;
  relatedBlockId?: number;
  relatedBlockType?: string | number;
  sourceType: 'agent_response' | 'quick_ai' | 'block_context' | 'tool_call' | 'whiteboard_ai';
  suggestedBlockType?: 'text' | 'code' | 'table' | 'heading' | 'quote' | 'latex' | 'details'| 'bullet' | 'numbered-list' | 'whiteboard';
  parsedContent?: any;
  insertAfterBlockId?: number;
}

export interface Position {
  x: number;
  y: number;
}



export enum EventType {
  CONNECTION_ESTABLISHED = 'connection_established',
  AGENT_INITIALIZED = 'agent_initialized',
  AGENT_RESPONSE = 'agent_response',
  STREAMING_TOKEN = 'streaming_token',
  STREAMING_COMPLETE = 'streaming_complete',
  PROCESSING = 'processing',
  ERROR = 'error',
  USER_MESSAGE = 'user_message',
  WORKSPACE_INFO = 'workspace_info',
  PROMPT_GENERATED = 'prompt_generated',
  TOOL_CALL = 'tool_call',
  TOOL_RESULT = 'tool_result',
  UPLOAD_SUCCESS = 'upload_success',
  PONG = 'pong',
  SYSTEM = 'system',
  UPDATE_BLOCKS = 'update_blocks',
  BLOCKS_UPDATE_SUCCESS = 'blocks_update_success',
  BLOCKS_UPDATE_ERROR = 'blocks_update_error',
  WHITEBOARD_AI_RESPONSE = "whiteboard_ai_response",
  WHITEBOARD_SUGGESTION = "whiteboard_suggestion",
  WHITEBOARD_CONTEXT = "whiteboard_context"
}


export interface WhiteboardBlock {
  id: string | number;
  content: any;
  title?: string;
  type?: 'education' | 'sales' | 'marketing' | 'general';
}

export interface QuickAction {
  label: string;
  prompt: string;
  icon: LucideIcon;
  category?: string;
}

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

export interface ShapeDescription {
  type: string;
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  props: any;
}


// In typings/agent.ts - Fix WhiteboardContent
export interface WhiteboardContent {
  shapes?: any[];
  aiShapes?: any[];
  aiAction?: string;
  explanation?: string;
  store?: Record<string, unknown>;
  schema?: {
    schemaVersion: number;
    sequences: Record<string, unknown>;
  };
  shapeCount?: number;
  viewport?: any;
  type?: string;
  document?: unknown;
  hasSelection?: boolean;
  selectedShapeIds?: string[];
  totalShapeCount?: number;
}

export interface Position { x: number; y: number }

export type NodeType = 
  | 'text' 
  | 'group' 
  | 'agent' 
  | 'conversation' 
  | 'file' 
  | 'media' 
  | 'pdf' 
  | 'image' 
  | 'youtube' 
  | 'link';

export interface NodeData {
  // Core Identity
  id: string;
  type: NodeType;
  title: string;
  content: string;
  projectNoteId?:string;
  // Position & Layout (Required - every node has position)
  x: number;
  y: number;
  width: number;
  height: number;
  
  // Visual
  color: ColorTheme;
  
  // Hierarchy
  parentId?: string;        // Reference to parent node (replaces groupId)
  childIds: string[];       // Direct children
  level: number;            // Depth in hierarchy
  isExpanded: boolean;      // For collapsing groups/nodes
  
  // File/Media Properties (Optional)
  fileType?: string;
  s3Key?: string;           // Unified (removed duplicate s3_key)
  fileName?: string;
  mediaUrl?: string;
  pdfUrl?: string;      
  pdfFile?: File;
  youtubeId?: string;
  imageUrl?: string;
  isRunning?: boolean;
  isThinking?: boolean;
  thinkingContent?: string;
  toolExecuting?: string;
  error?: boolean;
  groupId?:string|null;
  globalNoteId?: string; 
  project_note_id?:string;
  zIndex?: number;
  fallbackX?: number;
  fallbackY?: number;
  pdfSource?: PDFSourceData;
}

// Helper type for creating new nodes with defaults
export type CreateNodeData = Pick<NodeData, 'id' | 'type' | 'x' | 'y'> & 
  Partial<Omit<NodeData, 'id' | 'type' | 'x' | 'y'>>;

// Default factory function
export const createNode = (data: CreateNodeData): NodeData => ({
  title: '',
  content: '',
  width: 320,
  height: 200,
  color: 'white',
  childIds: [],
  level: 0,
  isExpanded: true,
  ...data,
});

// Type guards
export const isGroupNode = (node: NodeData): boolean => node.type === 'group';
export const hasChildren = (node: NodeData): boolean => node.childIds.length > 0;

interface UserInfo {
  _id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  paymentHistory: any[];  // You can refine this based on the structure of paymentHistory
  plan: string;
  status: string;
  subscriptionEnd: string | null;  // Assuming it's a string or null
  token_limit: number;
  verified: boolean;
}

export interface InfiniteCanvasProps {
  sessionId?: string;
  socket?: WebSocket | null; 
  workspaceInfoFromHome?: string;
  isConnected?:boolean;
  projectInfo?:{projectId?:string,name: string, type: string};
  projectContext?: ProjectContext;
  userinfo?:UserInfo;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}
export type ColorTheme = 'slate' | 'red' | 'green' | 'blue' | 'yellow' | 'orange' | 'purple' | 'white';
export type ConnectionStyle = 'solid' | 'dashed' | 'dotted';
export type ConnectionArrow = 'none' | 'end' | 'both';

export interface Connection {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
  strokeStyle: ConnectionStyle;
  arrowType: ConnectionArrow;
  color: ColorTheme;
}

export interface CanvasState {
  zoom: number
  pan: Position
  isDragging: boolean
  dragStart: Position
  selectedNodeId: string | null
}

export interface MediaNodeProps {
  content: string;
  fileType: string;
  fileName: string;
  mediaUrl: string;
}


export const COLORS = [
  'from-purple-500 to-pink-500',
  'from-blue-500 to-cyan-500',
  'from-green-500 to-emerald-500',
  'from-orange-500 to-red-500',
  'from-indigo-500 to-purple-500',
  'from-yellow-500 to-orange-500',
  'from-pink-500 to-rose-500',
  'from-cyan-500 to-blue-500',
  'from-teal-500 to-cyan-500'
]

export interface ProfileCircleProps {
  name?: string;
  size?: number;
  backgroundColor?: string;
  textColor?: string;
  profile?: string;
}

export interface MemoizedMarkdownProps {
  content: string;
}

export interface NodeProps {
  node: NodeData;
  isSelected: boolean;
  canvas: CanvasState;
  draggedNode: string | null;
  username: string;
  profile: string;
  nodeRef: React.RefObject<HTMLDivElement>;
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onUpdateContent: (nodeId: string, content: string, title?: string) => void;
  onToggleExpanded: (nodeId: string, forceValue?: boolean) => void;
  onRunAgent: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onCreateChild: (parentId?: string, type?: NodeData['type'], fileData?: { name: string, type: string, content: string }) => void;
  onUploadFile: (nodeId: string) => void;
  onConnectionStart: (nodeId: string, point: string) => void;
  onOpenPDFReader: (nodeId?: string, fileName?: string, fileContent?: string) => void; 
}

export interface ConnectionsProps {
  connections: Connection[];
  nodes: Map<string, NodeData>;
  canvas: CanvasState;
  connecting: any;
  getAnchor: (nodeId: string, point?: string) => Position;
  containerRef: React.RefObject<HTMLDivElement>;
}

export interface GlobalNote {
  id: string;
  title: string;
  content: string;
  color: ColorTheme;
  createdAt: number;
  _timestamp?: number; // For Yjs change detection
}