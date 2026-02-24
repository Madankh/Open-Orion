"use client";

import { Terminal as XTerm } from "@xterm/xterm";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  Code,
  Globe,
  Terminal as TerminalIcon,
  Brain
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { cloneDeep, debounce } from "lodash";
import dynamic from "next/dynamic";
import Cookies from "js-cookie";
import { v4 as uuidv4 } from "uuid";
import {useSearchParams } from "next/navigation";
import Browser from "@/components/browser";
import CodeEditor from "@/components/code-editor";
import SearchBrowser from "@/components/search-browser";
import ThinkingCom from "../Thinking";
import APIcontainer from "../APIcontainer"
import {UploadedResource} from '@/typings/agent'
const Terminal = dynamic(() => import("@/components/terminal"), {
  ssr: false,
});
import {
  ActionStep,
  AgentEvent,
  ThoughtType,
  Message,
  TAB,
  TOOL,
  ThoughtEventData,
  ProjectContext,
  QuizQuestion,
  StudentProfile,
  ApiKeys,
  VisitResultItem
} from "@/typings/agent";
import ChatMessage from "../chat-message";
import ImageBrowser from "../image-browser";
import {DeepStep} from "@/components/DeepResearchStep";
import { useSelector } from "react-redux";
import { 
  useTypingTracker, 
  useComponentTracker,
  useAIQueryTracker 
} from '../Y_realtime/TypingTracker';
import { nodeUrl, pythonUrl } from "@/apiurl";


interface UserInfo {
  _id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  paymentHistory: any[];  
  plan: string;
  status: string;
  subscriptionEnd: string | null; 
  token_limit: number;
  verified: boolean;
}

interface AdaptiveQuestionData {
  adaptation_strategy: string;
  content: string;
  learning_objectives: string[];
  questions: QuizQuestion[];
  student_profile: StudentProfile;
}

interface MessageForUser {
  tool_input:{
    text:string
  }
}

interface AICollaborateProps {
  sessionId?: string;
  socket?: WebSocket | null;
  onApplyNote?: (noteContent: string, messageId?: string) => void;
  workspaceInfoFromHome?:string;
  projectInfo?:{name: string, type: string};
  projectContext?: ProjectContext;
  onAgentModeChange?: (mode: string, type: string) => void;
  currentAgentMode?: string;
  currentAgentType?: string;
  onModelChange?: (modelId: string) => void;  
  currentModel?: string;                      
  userinfo?:UserInfo;
}


const AICollaborate: React.FC<AICollaborateProps> = ({
  sessionId,
  socket,
  onApplyNote,
  workspaceInfoFromHome,
  projectInfo,
  projectContext,
  onAgentModeChange,
  currentAgentMode,
  currentAgentType,
  onModelChange,  
  currentModel,    
  userinfo
}) => {
  
  interface RootState {
    user: {
      currentUser?: {
        id?:string;
        user?: { _id: string };
      };
      accessToken: string;
    };
    
  }
  const xtermRef = useRef<XTerm | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const [isTabVisible, setIsTabVisible] = useState(false);

  const [stream, setstreamMessage] = useState<Message[]>([]);
  const modelToUse = "";
  const [selectedModel, setSelectedModel] = useState<string>(currentModel || "");
  // const [selectedMode, setSelectedMode] = useState<AgentMode>(agentModes[0]);
  
  const [UserPlanID, setUserPlanID] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [ThinkingContent, setThinkingContent] = useState<Message[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [isCompleted, setIsCompleted] = useState(false);

  const [activeTab, setActiveTab] = useState(TAB.NULL);
  const [currentActionData, setCurrentActionData] = useState<ActionStep>();
  const [activeFileCodeEditor, setActiveFileCodeEditor] = useState("");
  const [workspaceInfo, setWorkspaceInfo] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [isUseDeepResearch, setIsUseDeepResearch] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const streamedIdsRef = useRef<Set<string>>(new Set());
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isStreamingCode, setIsStreamingCode] = useState<boolean>(false);
  const [streamingToolCallId, setStreamingToolCallId] = useState<string>("");
  const [streamingTokens, setStreamingTokens] = useState<string>("");

  const [historyCursor, setHistoryCursor] = useState<number | null>(null); 
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  
  
  // Deep research state
  const [deepResearchSteps, setDeepResearchSteps] = useState<DeepStep[]>([]);
  const [deepResearchReport, setDeepResearchReport] = useState('');
  const [isReceivingReport, setIsReceivingReport] = useState(false);

  const [filesContent, setFilesContent] = useState<{ [key: string]: string }>({});
  const user = useSelector((state: RootState) => state.user);

  const accessToken = user?.accessToken;
  const userid = user?.currentUser?.id;

  const [browserUrl, setBrowserUrl] = useState("");
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const isReplayMode = useMemo(() => !!searchParams.get("id"), [searchParams]);
 
  const containerRef = useRef<HTMLDivElement>(null);

  const { trackQueryStart, trackQueryEnd } = useAIQueryTracker();
  
  // Track component focus
  useComponentTracker(containerRef, 'ai_chat');
  
  // Track typing in message input
  useTypingTracker('ai-message-input', 'ai_chat');

  useEffect(() => {
    if (currentModel) {
      setSelectedModel(currentModel);
    }
  }, [currentModel]);

function handleAdaptiveQuestionGenerator(data: {
  id: string;
  type: AgentEvent;
  content: Record<string, unknown>;
}) {
    const quizData = data.content.tool_input as AdaptiveQuestionData;
    const quizMessage: Message = {
      id: data.id,
      role: "assistant",
      quizData: quizData,
      timestamp: Date.now()
    };

    // Add message to chat
    setMessages(prev => [...prev, quizMessage]);
  }

  const parseJson = (jsonString: string) => {
    try {
      return JSON.parse(jsonString);
    } catch {
      return null;
    }
  };

  const isThoughtType = (type: AgentEvent | ThoughtType): type is ThoughtType => {
    return Object.values(ThoughtType).includes(type as ThoughtType);
  };


  useEffect(() => {
    if (workspaceInfoFromHome && !workspaceInfo) {
      setWorkspaceInfo(workspaceInfoFromHome);
    }
  }, [workspaceInfoFromHome, workspaceInfo]);


  const handleClickAction = useMemo(() => debounce(
    (data: ActionStep | undefined, showTabOnly = false) => {
      if (!data) return;

      switch (data.type) {
        case TOOL.WEB_SEARCH:
          setActiveTab(TAB.BROWSER);
          setCurrentActionData(data);
          setIsTabVisible(true);
          break;

        case TOOL.IMAGE_GENERATE:
        case TOOL.BROWSER_USE:
        case TOOL.VISIT:
          setActiveTab(TAB.BROWSER);
          setCurrentActionData(data);
          setIsTabVisible(true);
          break;

        case TOOL.BROWSER_CLICK:
        case TOOL.BROWSER_ENTER_TEXT:
        case TOOL.BROWSER_PRESS_KEY:
        case TOOL.BROWSER_GET_SELECT_OPTIONS:
        case TOOL.BROWSER_SELECT_DROPDOWN_OPTION:
        case TOOL.BROWSER_SWITCH_TAB:
        case TOOL.BROWSER_OPEN_NEW_TAB:
        case TOOL.BROWSER_VIEW:
        case TOOL.BROWSER_NAVIGATION:
        case TOOL.BROWSER_RESTART:
        case TOOL.BROWSER_WAIT:
        case TOOL.BROWSER_SCROLL_DOWN:
        case TOOL.BROWSER_SCROLL_UP:
          setActiveTab(TAB.BROWSER);
          setCurrentActionData(data);
          setIsTabVisible(true);
          break;

        case TOOL.BASH:
          setActiveTab(TAB.TERMINAL);
          setIsTabVisible(true);
          if (!showTabOnly) {
            setTimeout(() => {
              if (!data.data?.isResult) {
                xtermRef.current?.writeln(`${data.data.tool_input?.command || ""}`);
              }
              if (data.data.result) {
                const lines = `${data.data.result || ""}`.split("\n");
                lines.forEach((line) => {
                  xtermRef.current?.writeln(line);
                });
                xtermRef.current?.write("$ ");
              }
            }, 500);
          }
          break;

        case TOOL.STR_REPLACE_EDITOR:
          setActiveTab(TAB.CODE);
          setCurrentActionData(data);
          setIsTabVisible(true);
          const path = data.data.tool_input?.path || data.data.tool_input?.file;
          if (path) {
            setActiveFileCodeEditor(
              path.startsWith(workspaceInfo) ? path : `${workspaceInfo}/${path}`
            );
          }
          break;
        default:
          break;
      }
    },
    50
  ), [workspaceInfo]);


  const handleCancelQuery = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast.error("WebSocket connection is not open.");
      return;
    }

    // Send cancel message to the server
    socket.send(
      JSON.stringify({
        type: "cancel",
        content: {},
      })
    );
  };

let llm_key: string | null = null;
let image_key: string | null = null;
let web_key: string | null = null;

const getToolInput = (content: Record<string, unknown>) => content.tool_input as Record<string, unknown>;

if (typeof window !== 'undefined') {
  const allApiKeysStr = localStorage.getItem('allApiKeys');
  if (allApiKeysStr) {
    const allApiKeys = JSON.parse(allApiKeysStr);
    llm_key = allApiKeys.llm;
    image_key = allApiKeys.image_or_video;
    web_key = allApiKeys.webSearch;
  } else {
    llm_key = localStorage.getItem('apiKey_llm');
    image_key = localStorage.getItem('apiKey_image_or_video');
    web_key = localStorage.getItem('apiKey_webSearch');
  }
}

  useEffect(() => {
    const fetchUserData = async () => {
          if (!accessToken || !userid) {
            return;
          }
    
          try {
            const response = await fetch(`${nodeUrl}/api/auth/user/${userid}`, {
              method: 'GET',
              headers: {
                'token': `${accessToken}`,
                'Content-Type': 'application/json',
              },
            });
    
            if (!response.ok) {
              throw new Error(`Failed to fetch user: ${response.status}`);
            }
    
            const data = await response.json();
            setUserPlanID(data.plan);
          } catch (err) {
            console.error("Error fetching user data:", err);
          } finally {
          }
      };
    
      fetchUserData();
    }, [accessToken, userid]); 

  const handleAgentEvent = useCallback((data: {
    id: string;
    type: AgentEvent;
    content: Record<string, unknown>;
    timestamp?: number;
  }) => {
    const getMsgTime = () => data.timestamp || Date.now();
    switch (data.type) {
      case AgentEvent.USER_MESSAGE:
        setMessages((prev) => [...prev, { 
          id: data.id, 
          role: "user", 
          content: data.content.text as string, 
          timestamp: getMsgTime()
        }]);
        break;
  
      case AgentEvent.PROCESSING:
        setIsLoading(true);
        setIsCompleted(false);
        break;
  
      case AgentEvent.STREAMING_TOKEN:
        setstreamMessage((prevMessages) => {
          if (prevMessages.length === 0) {
            return [{
              id: data.id,
              role: "assistant",
              content: data.content.token as string,
              timestamp: Date.now(),
            }];
          }
          
          const lastMessage = cloneDeep(prevMessages[prevMessages.length - 1]);
          
          if (lastMessage.role === "user" || lastMessage.action) {
            return [
              ...prevMessages,
              {
                id: data.id,
                role: "assistant",
                content: data.content.token as string,
                timestamp: Date.now(),
              },
            ];
          } else {
            lastMessage.content = (typeof lastMessage.content === "string" ? lastMessage.content : "") + (data.content.token as string);
            return [...prevMessages.slice(0, -1), lastMessage];
          }
        });
        break;
  
      case AgentEvent.STREAMING_COMPLETE:
        setMessages((prev) => {
          const streamContent = stream.length > 0 ? stream[stream.length - 1] : null;
          if (streamContent && streamContent.role === "assistant") {
            return [...prev, streamContent];
          }
          return prev;
        });
        setstreamMessage([]);
        setIsLoading(false);
        setIsCompleted(true);
        break;
  
      case AgentEvent.AGENT_RESPONSE:
        setstreamMessage([]);
        setMessages((prev) => [...prev, { 
          id: data.id || Date.now().toString(), 
          role: "assistant", 
          content: data.content.text as string, 
          timestamp: getMsgTime()
        }]);
        setIsCompleted(true);
        setIsLoading(false);
        break;
  
      case AgentEvent.PROMPT_GENERATED:
        setIsGeneratingPrompt(false);
        setCurrentQuestion(data.content.result as string);
        break;
  
      case AgentEvent.WORKSPACE_INFO:
        setWorkspaceInfo(data.content.path as string);
        break;
  
      case AgentEvent.AGENT_THINKING:
        setMessages((prev) => [...prev, { 
          id: data.id, 
          role: "assistant", 
          content: data.content.text as string, 
          timestamp: getMsgTime()
        }]);
        break;
  
      case AgentEvent.TOOL_CALL:
        if (data.content.tool_name === TOOL.SEQUENTIAL_THINKING) {
          setActiveTab(TAB.THINKING);
          setThinkingContent((prev) => [...prev, { 
            id: data.id, 
            role: "assistant", 
            content: (data.content.tool_input as { thought: string }).thought as string, 
            timestamp: getMsgTime()
          }]);
        } else if (data.content.tool_name === TOOL.MESSAGE_USER) {
          const toolInput = getToolInput(data.content);
          if (!toolInput?.text) {
            console.error('Missing text in MESSAGE_USER tool_input');
            return;
          }
          const messageForUser: MessageForUser = {
            tool_input: {
              text: toolInput.text as string
            }
          };
          const message: Message = {
            id: data.id,
            role: "assistant",
            timestamp: getMsgTime(),
            MessageForUser: messageForUser
          };
          setMessages(prev => [...prev, message]);
        } else if (data.content.tool_name === TOOL.Adaptive_question_generator) {
          handleAdaptiveQuestionGenerator(data);
        } else {
          const message: Message = { 
            id: data.id, 
            role: "assistant", 
            action: { 
              type: data.content.tool_name as TOOL, 
              data: data.content 
            }, 
            timestamp: getMsgTime()
          };
          const url = (data.content.tool_input as { url: string })?.url as string;
          if (url) { setBrowserUrl(url); }
          setMessages((prev) => [...prev, message]);
          handleClickAction(message.action);
        }
        break;
  
      case AgentEvent.TOOL_ARGS_STREAM: {
        const { token, tool_name } = data.content as {
          token: string;
          tool_name: string;
          tool_call_id: string;
        };
        
        if (tool_name === "str_replace_editor") {
          setActiveTab(TAB.CODE);
          setIsStreamingCode(true);
          setStreamingContent(prev => prev + token);
        }
  
        if (tool_name === "sequential_thinking") {
          setActiveTab(TAB.THINKING);
          setStreamingTokens(prev => prev + token);
        }
  
        if (tool_name === TOOL.BASH) {
          if (activeTab !== TAB.TERMINAL) {
            setActiveTab(TAB.TERMINAL);
          }
          xtermRef.current?.write(token);
        }
        break;
      }
  
      case AgentEvent.FILE_EDIT:
        setMessages((prev) => {
          
          const lastMessage = cloneDeep(prev[prev.length - 1]);
          if (!lastMessage) return prev;
          if (lastMessage?.action && lastMessage.action.type === TOOL.STR_REPLACE_EDITOR) {
            lastMessage.action.data.content = data.content.content as string;
            lastMessage.action.data.path = data.content.path as string;
            const filePath = (data.content.path as string)?.includes(workspaceInfo) 
              ? (data.content.path as string) 
              : `${workspaceInfo}/${data.content.path}`;
            setFilesContent((prevContent) => ({ 
              ...prevContent, 
              [filePath]: data.content.content as string 
            }));
          }
          setTimeout(() => { handleClickAction(lastMessage.action); }, 500);
          return [...prev.slice(0, -1), lastMessage];
        });
        break;
  
      case AgentEvent.TOOL_RESULT:
        if (data.content.tool_name === "str_replace_editor") {
          setIsStreamingCode(false);
          setStreamingContent("");
          setStreamingToolCallId("");
        }
        
        if (data.content.tool_name === TOOL.BROWSER_USE) {
          setMessages((prev) => [...prev, { 
            id: data.id, 
            role: "assistant", 
            content: data.content.result as string, 
            timestamp: getMsgTime()
          }]);
        } else if (
          data.content.tool_name !== TOOL.Adaptive_question_generator &&
          data.content.tool_name !== TOOL.MESSAGE_USER &&
          data.content.tool_name !== TOOL.MESSAGE_USERR &&
          data.content.tool_name !== TOOL.SEQUENTIAL_THINKING &&
          data.content.tool_name !== TOOL.PRESENTATION
        ) {
          setMessages((prev) => {
            const lastMessage = cloneDeep(prev[prev.length - 1]);
            if (lastMessage?.action && lastMessage.action?.type === data.content.tool_name) {
              lastMessage.action.data.result = `${data.content.result}`;
              if ([
                TOOL.BROWSER_VIEW, TOOL.BROWSER_CLICK, TOOL.BROWSER_ENTER_TEXT, 
                TOOL.BROWSER_PRESS_KEY, TOOL.BROWSER_GET_SELECT_OPTIONS, 
                TOOL.BROWSER_SELECT_DROPDOWN_OPTION, TOOL.BROWSER_SWITCH_TAB,
                TOOL.BROWSER_OPEN_NEW_TAB, TOOL.BROWSER_WAIT, TOOL.BROWSER_SCROLL_DOWN, 
                TOOL.BROWSER_SCROLL_UP, TOOL.BROWSER_NAVIGATION, TOOL.BROWSER_RESTART,
              ].includes(data.content.tool_name as TOOL)) {
                lastMessage.action.data.result = data.content.result && Array.isArray(data.content.result)
                  ? data.content.result.find((item) => item.type === "image")?.source?.data
                  : undefined;
              }
              lastMessage.action.data.isResult = true;
              setTimeout(() => { handleClickAction(lastMessage.action); }, 500);
              return [...prev.slice(0, -1), lastMessage];
            } else {
              return [...prev, { ...lastMessage, action: data.content as ActionStep }];
            }
          });
        }
        break;
  
      case AgentEvent.UPLOAD_SUCCESS:
        setIsUploading(false);
        const newFiles = data.content.files as { path: string; saved_path: string; }[];
        const paths = newFiles.map((f) => f.path);
        setUploadedFiles((prev) => [...prev, ...paths]);
        break;
  
      case "error":
        toast.error(data.content.message as string);
        setIsUploading(false);
        setIsLoading(false);
        break;
  
      default:
        console.log("⚠️ Unhandled event type:", data.type);
        break;
    }
  }, [workspaceInfo, handleClickAction, streamingToolCallId, streamingContent, stream]);

  const handleThoughtEvent = useCallback((data: {
    id?: string;
    type: ThoughtType;
    data?: unknown;
    timestamp?: number;
  }) => {
      const eventData = data.data as ThoughtEventData;
      switch (data.type) {
        case ThoughtType.START:
        case ThoughtType.STEP:
        case ThoughtType.STEP_COMPLETED:
        case ThoughtType.KNOWLEDGE:
            break;
        case ThoughtType.TOOL:
            if (eventData.name === "web_search") {
                const message: Message = { id: uuidv4(), role: "assistant", action: { type: TOOL.WEB_SEARCH, data: { tool_input: { query: eventData.arguments?.queries?.[0] } }, }, timestamp: Date.now(), };
                setMessages((prev) => [...prev, message]);
                handleClickAction(message.action);
                const searchStep: DeepStep = { id: uuidv4(), type: "search", data: { queries: eventData.arguments?.queries || [], timestamp: eventData.timestamp || Date.now() } };
                setDeepResearchSteps(prev => [...prev, searchStep]);
            }
            if (eventData.name === "page_visit") {
                const message: Message = { id: uuidv4(), role: "assistant", action: { type: TOOL.VISIT, data: { tool_input: { url: eventData.arguments?.urls?.[0] } }, }, timestamp: Date.now(), };
                const url = eventData.arguments?.urls?.[0];
                if (url) { setBrowserUrl(url); }
                setMessages((prev) => [...prev, message]);
                handleClickAction(message.action);
                const visitStep: DeepStep = { id: uuidv4(), type: "visit", data: { urls: eventData.arguments?.urls || [], timestamp: eventData.timestamp || Date.now(), }, };
                setDeepResearchSteps(prev => [...prev, visitStep]);
            }
            break;
        case ThoughtType.REASONING:
            if (!isReceivingReport) { setIsReceivingReport(true); }
            setDeepResearchReport((prev) => prev + (eventData.reasoning || ""));
            break;
        case ThoughtType.VISIT:
            if (eventData.results) {
                const visitResultStep: DeepStep = {
                    id: uuidv4(),
                    type: "visit_results",
                    data: { 
                        results: eventData.results.map((item: VisitResultItem) => `[${item.url}]: ${item.result?.content?.substring(0, 100) || "No content"}...`),
                        timestamp: data.timestamp || Date.now()
                    },
                };
                setDeepResearchSteps(prev => [...prev, visitResultStep]);
            }
            break;
        case ThoughtType.WRITING_REPORT:
            if (eventData.final_report) {
                setDeepResearchReport(eventData.final_report);
            }
            break;
        case ThoughtType.COMPLETE:
            setIsReceivingReport(false);
            setIsLoading(false);
            setIsCompleted(true);
            setMessages((prev) => [ ...prev, { id: data.id || Date.now().toString(), role: "assistant", content: eventData.result || "", timestamp: Date.now(), },]);
            setDeepResearchReport("");
            setDeepResearchSteps([]);
            break;
        default:
            const genericStep: DeepStep = {
              id: uuidv4(),
              type: data.type as string,
              data: {
                text: JSON.stringify(eventData, null, 2),
              },
            };
            setDeepResearchSteps(prev => [...prev, genericStep]);
            break;
      }
  }, [handleClickAction, isReceivingReport]);


  const processedEventsRef = useRef<Set<string>>(new Set());
  const handleEvent = useCallback((data: {
    id: string;
    type: AgentEvent | ThoughtType;
    content: Record<string, unknown>;
    data?: unknown;
    timestamp?: number;
  }) => {
    // Only check for duplicates on non-streaming events
    // Streaming tokens should always be processed
    const isStreamingEvent = data.type === AgentEvent.STREAMING_TOKEN || 
                            data.type === AgentEvent.TOOL_ARGS_STREAM;
    
    if (!isStreamingEvent) {
      if (processedEventsRef.current.has(data.id)) {
        return;
      }
      processedEventsRef.current.add(data.id);
    }
    
    if (isThoughtType(data.type)) {
      return handleThoughtEvent({
        type: data.type,
        data: data.data ?? data.content,
        id: data.id,
        timestamp: data.timestamp
      });
    }
    return handleAgentEvent({
      id: data.id,
      type: data.type,
      content: data.content,
      timestamp: data.timestamp
    });
  }, [handleAgentEvent, handleThoughtEvent]);
  
  
  const toggleTabVisibility = () => {
  setIsTabVisible(!isTabVisible);
};

  const handleQuestionSubmit = async (
    newQuestion: string,
    modelToUse: string,
    modeId: string,
    referencedResources: UploadedResource[] = []
  ) => {
    if (!newQuestion.trim() || isLoading) return;
  
    trackQueryStart(newQuestion, 'ai_chat');
    setIsLoading(true);
    setCurrentQuestion("");
    setIsCompleted(false);
    setThinkingContent([]);
    const youtubeUrls = referencedResources
      .filter(res => res.type === 'youtube' && res.url)
      .map(res => res.url as string);
  
    const referencedPaths = referencedResources
      .filter(res => res.type !== 'youtube') // ✨ Filter out youtube from files
      .map(res => res.s3_key || res.url || "")
      .filter(path => path !== "")
      .map(path => path.replace(/^\/workspace\/[^\/]+\//, ''));
  
    const sessionPaths = uploadedFiles.map(file => file.replace(/^\/workspace\/[^\/]+\//, ''));
  
    const allFiles = Array.from(new Set([...referencedPaths, ...sessionPaths]));
  
    let finalQuestion = newQuestion;
    if (youtubeUrls.length > 0) {
      const linksText = youtubeUrls.map(url => `\n[Reference Video: ${url}]`).join("");
      finalQuestion += linksText;
    }
  
    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: newQuestion,
      model_id: modelToUse,
      timestamp: Date.now(),
    };
  
    setMessages((prev) => [...prev, newUserMessage]);
  
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast.error("WebSocket connection is not open. Please try again.");
      setIsLoading(false);
      return;
    }
  
    const basePayload = {
      text: finalQuestion,
      model_id: modelToUse,
      resume: messages.length > 0,
      files: allFiles,     
      mode: modeId || "normal"
    };
  
    if (isUseDeepResearch) {
      socket.send(JSON.stringify({ type: "deep_research", content: basePayload }));
    } else {
      socket.send(JSON.stringify({ type: "query", content: basePayload }));
    }
  
    trackQueryEnd();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      
    }
  };

  const handleEnhancePrompt = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast.error("WebSocket connection is not open. Please try again.");
      return;
    }
    setIsGeneratingPrompt(true);
    socket.send(
      JSON.stringify({
        type: "enhance_prompt",
        content: {
          text: currentQuestion,
          files: uploadedFiles?.map((file) => `.${file}`),
        },
      })
    );
  };
  
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) return;

    const files = Array.from(event.target.files);
    setIsUploading(true);

    const fileContentMap: { [filename: string]: string } = {};
    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      files: files.map((file) => file.name),
      fileContents: fileContentMap,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, newUserMessage]);

    const uploadPromises = files.map(async (file) => {
      return new Promise<{ name: string; success: boolean }>(
        async (resolve) => {
          try {
            const reader = new FileReader();
            reader.onload = async (e) => {
              const content = e.target?.result as string;
              fileContentMap[file.name] = content;

              const response = await fetch(`${pythonUrl}/api/upload`, {
                  method: "POST",
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    session_id: sessionId,
                    file: { path: file.name, content },
                  }),
                }
              );

              const result = await response.json();

              if (response.ok) {
                setUploadedFiles((prev) => [...prev, result.file.path]);
                resolve({ name: file.name, success: true });
              } else {
                console.error(`Error uploading ${file.name}:`, result.error);
                resolve({ name: file.name, success: false });
              }
            };
            reader.onerror = () => resolve({ name: file.name, success: false });
            reader.readAsDataURL(file);
          } catch (error) {
            console.error(`Error processing ${file.name}:`, error);
            resolve({ name: file.name, success: false });
          }
        }
      );
    });

    try {
      const results = await Promise.all(uploadPromises);
      const failedUploads = results.filter((r) => !r.success);
      if (failedUploads.length > 0) {
        toast.error(`Failed to upload ${failedUploads.length} file(s)`);
      }
      setMessages((prev) => {
        const updatedMessages = [...prev];
        const messageIndex = updatedMessages.findIndex((m) => m.id === newUserMessage.id);
        if (messageIndex >= 0) {
          updatedMessages[messageIndex].fileContents = fileContentMap;
        }
        return updatedMessages;
      });
    } catch (error) {
      console.error("Error uploading files:", error);
      toast.error("Error uploading files");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };
  const getRemoteURL = (path: string | undefined) => {
    const workspaceId = workspaceInfo?.split("/").pop();
    return `${pythonUrl}/workspace/${workspaceId}/${path}`;
  };


const loadSessionHistory = useCallback(async (isInitialLoad = false) => {
    if (isFetchingHistory || (!isInitialLoad && !hasMoreHistory)) return;

    setIsFetchingHistory(true);

    try {
      const url = new URL(`${pythonUrl}/api/sessions/${sessionId}/events`);
      
      url.searchParams.append("projectId", projectContext?.projectId || "");
      url.searchParams.append("projectType", projectInfo?.type || "");
      url.searchParams.append("limit", "50");
      
      if (!isInitialLoad && historyCursor !== null) {
        url.searchParams.append("before", historyCursor.toString()); 
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Error fetching session events: ${response.statusText}`);
      }

      const data = await response.json();
      const events = data.events || [];

      if (isInitialLoad && events.length > 0 && events[0]?.workspace_dir) {
        setWorkspaceInfo(events[0].workspace_dir);
      }

      if (events.length < 50) {
        setHasMoreHistory(false);
      }

      // Update Cursor logic
      if (events.length > 0) {
        const oldestEvent = events[0]; 
        let newCursor = oldestEvent.timestamp;

        if (typeof newCursor === 'string') {
             if (!newCursor.endsWith("Z") && !newCursor.includes("+")) {
                 newCursor = newCursor + "Z";
             }
             newCursor = new Date(newCursor).getTime() / 1000;
        }

        if ((newCursor === null || newCursor === undefined) && oldestEvent.created_at) {
             let createdAt = oldestEvent.created_at;
             if (!createdAt.endsWith("Z") && !createdAt.includes("+")) {
                 createdAt = createdAt + "Z";
             }
             newCursor = new Date(createdAt).getTime() / 1000;
        }

        if (typeof newCursor === 'number' && !isNaN(newCursor)) {
            setHistoryCursor(newCursor);
        }
      }

      // Process Events - Passing Timestamp
      if (events.length > 0) {
        events.forEach((event: any) => {
           let ts = event.timestamp;
           // Convert API string timestamp to JS Number (Milliseconds)
           if (typeof ts === 'string') {
               if (!ts.endsWith("Z") && !ts.includes("+")) ts = ts + "Z";
               ts = new Date(ts).getTime();
           } else if (typeof ts === 'number') {
               // If float seconds, convert to ms
               if (ts < 10000000000) ts = ts * 1000;
           }

           handleEvent({ 
               ...event.event_payload, 
               id: event.id, 
               timestamp: ts // Pass correct historical time
           }); 
        });
      }

    } catch (error) {
      console.error("Failed to fetch session events:", error);
      toast.error("Failed to load session history");
    } finally {
      setIsFetchingHistory(false);
      setIsLoadingSession(false);
    }
  }, [sessionId, projectContext, projectInfo, accessToken, historyCursor, hasMoreHistory, isFetchingHistory, handleEvent]);

  
  useEffect(() => {
    if (sessionId && projectContext?.projectId && projectInfo?.type) {
      // Reset cursor and load fresh
      setHistoryCursor(null);
      setHasMoreHistory(true);
      loadSessionHistory(true);
    }
  }, [sessionId, projectContext?.projectId, projectInfo?.type]);

  // Initialize device ID on page load
  useEffect(() => {
    let existingDeviceId = Cookies.get("device_id");
    if (!existingDeviceId) {
      existingDeviceId = uuidv4();
      Cookies.set("device_id", existingDeviceId, { expires: 365, sameSite: "strict", secure: window.location.protocol === "https:" });
    }
    // setDeviceId(existingDeviceId);
  }, []);
 
  useEffect(() => {
    if (!socket) return;
  
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        // Use server-provided ID or generate a truly unique one
        const eventId = data.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        handleEvent({ 
          ...data, 
          id: eventId 
        });
      } catch (error) {
        console.error("Error parsing WebSocket data:", error);
      }
    };
  
    socket.addEventListener('message', handleMessage);
  
    return () => {
      socket.removeEventListener('message', handleMessage);
    };
  }, [socket, handleEvent]);
      

  const isBrowserTool = useMemo(() =>
      [
        TOOL.BROWSER_VIEW, 
        TOOL.BROWSER_CLICK, 
        TOOL.BROWSER_ENTER_TEXT,
        TOOL.BROWSER_PRESS_KEY,
        TOOL.BROWSER_GET_SELECT_OPTIONS,
        TOOL.BROWSER_SELECT_DROPDOWN_OPTION, 
        TOOL.BROWSER_SWITCH_TAB,
        TOOL.BROWSER_OPEN_NEW_TAB, 
        TOOL.BROWSER_WAIT, 
        TOOL.BROWSER_SCROLL_DOWN,
        TOOL.BROWSER_SCROLL_UP, 
        TOOL.BROWSER_NAVIGATION, 
        TOOL.BROWSER_RESTART,
      ].includes(currentActionData?.type as TOOL),
    [currentActionData]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  // }
  const handleQuizSubmit = (message: string, modelId: string,modeId: string) => {
    handleQuestionSubmit(message, modelId,'');
  };

  return (
    <div>
      {UserPlanID == "custom_api" ? <APIcontainer/> : ""}
      
      <div className="relative z-0">

        
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#000000]">
            <LayoutGroup>
              <AnimatePresence mode="wait">
                  <motion.div
                    key="chat-view"
                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30, mass: 1 }}
                    className="w-full flex overflow-hidden flex-1 pr-4 pb-4 gap-4"
                  >
                    {/* Chat Messages - Always visible */}
                  <div className={`${
                    activeTab === TAB.NULL || !isTabVisible 
                          ? 'flex-1' 
                          : 'flex-none w-full lg:w-2/5'
                      } min-w-0`}>
                        <ChatMessage
                          className="h-full"
                          messages={messages}
                          handleCancelQuery={handleCancelQuery}
                          thinkingMessage={ThinkingContent}
                          stream={stream}
                          isLoading={isLoading && !isReceivingReport}
                          isCompleted={isCompleted}
                          workspaceInfo={workspaceInfo}
                          handleClickAction={handleClickAction}
                          isUploading={isUploading}
                          isUseDeepResearch={isUseDeepResearch}
                          isReplayMode={isReplayMode}
                          currentQuestion={currentQuestion}
                          messagesEndRef={messagesEndRef}
                          setCurrentQuestion={setCurrentQuestion}
                          handleKeyDown={handleKeyDown}
                          handleQuestionSubmit={handleQuestionSubmit}
                          handleFileUpload={handleFileUpload}
                          isGeneratingPrompt={isGeneratingPrompt}
                          handleEnhancePrompt={handleEnhancePrompt}
                          isReceivingReport={isReceivingReport}
                          deepResearchReport={deepResearchReport}
                          deepResearchSteps={deepResearchSteps}
                          onQuizSubmit={handleQuizSubmit}
                          selectedModelId={selectedModel}
                          isFullWidth={activeTab === TAB.NULL} 
                          UserPlanID={UserPlanID}
                          streamingContent={streamingContent}
                          isStreamingCode={isStreamingCode}
                          onApplyNote={onApplyNote}
                          onToggleTab={toggleTabVisibility}
                          hasActiveTab={activeTab !== TAB.NULL}
                          isTabVisible={isTabVisible}
                          onAgentModeChange={onAgentModeChange}
                          currentAgentMode={currentAgentMode}
                          currentAgentType={currentAgentType}
                          onModelChange={onModelChange}         
                          currentModel={selectedModel}   
                          userinfo={userinfo}
                          onLoadMore={() => loadSessionHistory(false)}
                          hasMoreHistory={hasMoreHistory}
                          isLoadingHistory={isFetchingHistory}
                        />
                      </div>
  
                    {activeTab !== TAB.NULL && isTabVisible && (
                      <div className="flex-1 bg-gray-900/80 border border-gray-700/50 p-4 rounded-2xl min-w-0">
                        <div className="pb-4 bg-neutral-850 flex items-center justify-between">
                          <div className="flex gap-x-2">
                            {activeTab == TAB.BROWSER && (
                              <button
                                onClick={() => setActiveTab(TAB.BROWSER)}
                                className="cursor-pointer px-4 py-2 rounded-lg border transition-all duration-200 flex items-center gap-2 bg-blue-600 text-white border-blue-600 shadow-lg"
                              >
                                <Globe className="size-4" />
                                Browser
                              </button>
                            )}
  
                            {activeTab == TAB.CODE && (
                              <button
                                onClick={() => setActiveTab(TAB.CODE)}
                                className="cursor-pointer px-4 py-2 rounded-lg border transition-all duration-200 flex items-center gap-2 bg-blue-600 text-white border-blue-600 shadow-lg"
                              >
                                <Code className="size-4" />
                                Code
                              </button>
                            )}
  
                            {activeTab == TAB.TERMINAL && (
                              <button
                                onClick={() => setActiveTab(TAB.TERMINAL)}
                                className="cursor-pointer px-4 py-2 rounded-lg border transition-all duration-200 flex items-center gap-2 bg-blue-600 text-white border-blue-600 shadow-lg"
                              >
                                <TerminalIcon className="size-4" />
                                Terminal
                              </button>
                            )}
  
                            {activeTab == TAB.THINKING && (
                              <button
                                onClick={() => setActiveTab(TAB.THINKING)}
                                className="cursor-pointer px-4 py-2 rounded-lg border transition-all duration-200 flex items-center gap-2 bg-blue-600 text-white border-blue-600 shadow-lg"
                              >
                                <Brain className="size-4" />
                                Thinking
                              </button>
                            )}
                          </div>
                        </div>
  
                        {/* Tab Content */}
                        <Browser
                          className={activeTab === TAB.BROWSER && (currentActionData?.type === TOOL.VISIT || isBrowserTool) ? "" : "hidden"}
                          url={currentActionData?.data?.tool_input?.url || browserUrl}
                          screenshot={isBrowserTool ? (currentActionData?.data.result as string) : undefined}
                          raw={currentActionData?.type === TOOL.VISIT ? (currentActionData?.data?.result as string) : undefined}
                        />
  
                        <SearchBrowser
                          className={activeTab === TAB.BROWSER && currentActionData?.type === TOOL.WEB_SEARCH ? "" : "hidden"}
                          keyword={currentActionData?.data.tool_input?.query}
                          search_results={currentActionData?.type === TOOL.WEB_SEARCH && currentActionData?.data?.result ? parseJson(currentActionData?.data?.result as string) : undefined}
                        />
                        
                        <ThinkingCom
                          className={activeTab === TAB.THINKING ? "block" : "hidden"}
                          token={streamingTokens}
                        />
  
                        <ImageBrowser
                          className={activeTab === TAB.BROWSER && currentActionData?.type === TOOL.IMAGE_GENERATE ? "" : "hidden"}
                          url={currentActionData?.data.tool_input?.output_filename}
                          image={getRemoteURL(currentActionData?.data.tool_input?.output_filename)}
                        />
  
                        <CodeEditor
                          currentActionData={currentActionData}
                          activeTab={activeTab as TAB}
                          className={activeTab === TAB.CODE ? "" : "hidden"}
                          workspaceInfo={workspaceInfo}
                          workspaceId={sessionId ?? undefined}
                          authToken={accessToken}
                          activeFile={activeFileCodeEditor}
                          setActiveFile={setActiveFileCodeEditor}
                          filesContent={filesContent}
                          isReplayMode={isReplayMode}
                          isStreamingCode={isStreamingCode}
                          streamingContent={streamingContent}
                        />
                        <Terminal
                          ref={xtermRef}
                          className={activeTab === TAB.TERMINAL ? "" : "hidden"}
                        />
                      </div>
                    )}
                  </motion.div>

              </AnimatePresence>
            </LayoutGroup>
          
        </div>
      </div>
    </div>
  )};


export default AICollaborate;