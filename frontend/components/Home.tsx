import React, { useEffect, useState } from "react";
import Sidebar from "./NoteBlocks/sidebar";
import AINotePad from "./KnowledgeTap";
import AIcollaborate from "./NoteBlocks/AICollaborate";
import { useSelector } from "react-redux";
import { toast } from 'sonner';
import { ProjectAPI } from "./NoteBlocks/apipoint";
import CollabProvider from "./Y_realtime/Yjs";
import RealTimeCursorSystem from "./Y_realtime/CollabPresence";
import Creative_canvas from "./NoteBlocks/Creative_canvas"
import CuriosityLab from "./NoteBlocks/defaultpage";
import { ApiKeys } from "@/typings/agent";
import { pythonUrl,nodeUrl } from "../apiurl"

interface RootState {
  user: {
    currentUser?: {
      id?:string;
      user?: { _id: string, email: string };
    };
    accessToken: string;
  };
}

interface InitAgentContent {
  tool_args: {
    deep_research: boolean;
    pdf: boolean;
    mode:string,
    model_id:string,
    agent_type:string,
    media_generation: boolean;
    audio_generation: boolean;
    browser: boolean;
  };
  api_keys?: ApiKeys; 
  session_context?: {  
    list_id: string;
    topic_id: string;
    work_id: string;
    session_id: string;
  };
}

const Collab: React.FC = () => {
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [activeSession, setActiveSession] = useState<{
    sessionId: string;
    listId: string;
    topicId: string;
    workId: string;
  } | null>(null);
  const [userinfo , setUserInfo] = useState(null)
  const [isMainPageVisible, setIsMainPageVisible] = useState<boolean>(false);
  const [isAIExpanded, setIsAIExpanded] = useState<boolean>(false);
  const user = useSelector((state: RootState) => state.user);
  const accessToken = user?.accessToken;
  const userid = user?.currentUser?.id;
  const [isChecking, setIsChecking] = useState(true);

  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [activeMobileTab, setActiveMobileTab] = useState<"canvas" | "ai">("ai");
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [channelItem_ID, setChannelItemID] = useState<string | null>(null);
  const [workspaceInfo, setWorkspaceInfo] = useState("");
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isDesktopSidebarVisible, setIsDesktopSidebarVisible] = useState<boolean>(true);
  const [WorkspaceType , setWorkspaceType] = useState('Home')

  const [agentMode, setAgentMode] = useState<string>('normal');
  const [agentType, setAgentType] = useState<string>('normal');

  // Collaboration modal states
  const [isCollabModalOpen, setIsCollabModalOpen] = useState<boolean>(false);
  const [collabEmail, setCollabEmail] = useState<string>("");
  const [collabRole, setCollabRole] = useState<"viewer" | "editor" | "admin">("editor");
  const [collaborators, setCollaborators] = useState<Array<{ id: string, email: string, role: string, status: "pending" | "active" }>>([]);
  const [inviteMessage, setInviteMessage] = useState<string>("");
  const [isTransitioning, setIsTransitioning] = useState(false);

  const [projectInfo, setProjectInfo] = useState<{ projectId:string,name: string, type: string } | null>(null);
  const [api] = useState(() => new ProjectAPI());

  const clearSessionData = () => {
    // Clear collaboration data
    setCollaborators([]);
    setCollabEmail("");
    setInviteMessage("");
    setIsCollabModalOpen(false);

    // Close any existing WebSocket
    if (socket) {
      socket.close();
      setSocket(null);
    }

    setIsConnected(false);

    // Dispatch cleanup event for child components
    window.dispatchEvent(new CustomEvent('session-cleanup', {
      detail: {
        sessionId: activeSession?.sessionId,
        clearAll: true
      }
    }));
  };

  const [currentProjectInfo, setCurrentProjectInfo] = useState<{
    projectType?: string;
    projectName?: string;
    projectId?: string;
  } | null>(null);

  let llm_key: string | null = null;
  let image_key: string | null = null;
  let web_key: string | null = null;
  
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
    const initializeFromUrl = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const id = searchParams.get("ChannelItemID");
      setChannelItemID(id);
  
      // If we have a session ID from URL, try to load the workspace context
      if (id && api && accessToken) {
        try {
          // First, we need to get the projects to find the work item
          const response = await api.getProjects();
          const projects = response?.projects || [];
          
          // Find the work item by session ID
          let foundContext = null;
          for (const project of projects) {
            for (const topic of project.topics) {
              const workItems = topic.workItems || topic.work_items;
              const workItemsArray = workItems 
                ? (Array.isArray(workItems) ? workItems : [workItems])
                : [];
              
              const workItem = workItemsArray.find(w => 
                w.sessionId === id || w.session_id === id
              );
              if (workItem) {
                foundContext = {
                  workItem,
                  projectId: project.id,
                  projectName: project.name,
                  projectType: project.type,
                  topicId: topic.id,
                  workType: workItem.type
                };
                break;
              }
            }
            if (foundContext) break;
          }
  
          if (foundContext) {
            // Set the workspace type based on the found work item
            setWorkspaceType(foundContext.workType || 'document');
            
            // Set the active session
            setActiveSession({
              sessionId: id,
              listId: foundContext.projectId,
              topicId: foundContext.topicId,
              workId: foundContext.workItem.id
            });
            
            // Set current project info
            setCurrentProjectInfo({
              projectType: foundContext.projectType,
              projectName: foundContext.projectName,
              projectId: foundContext.projectId
            });
            
            // Show main page
            setIsMainPageVisible(true);
            
          } else {
          }
        } catch (error) {
          console.error("❌ Failed to initialize workspace from URL:", error);
        }
      }
    };
  
    initializeFromUrl();
  }, [api, accessToken]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state) {
        const { sessionId, listId, topicId, workId, worktype, projectType, projectName } = event.state;
        
        setActiveSession({ sessionId, listId, topicId, workId });
        setWorkspaceType(worktype || 'document');
        setCurrentProjectInfo({
          projectType,
          projectName,
          projectId: listId
        });
        setChannelItemID(sessionId);
      }
    };
  
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!accessToken) {
      window.location.href = '/login';
      return;
    }
    setIsChecking(false);
  }, [accessToken, userid]);


  useEffect(() => {
    // When activeSession changes, clear previous data first
    if (activeSession) {
      setIsTransitioning(true);
      clearSessionData();

      // Small delay to ensure cleanup completes
      setTimeout(() => {
        setIsTransitioning(false);
      }, 300);
    }
  }, [activeSession?.sessionId]);
  
  const [UserPlanID, setUserPlanID] = useState<string | null>(null);

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
            setUserInfo(data)
            setUserPlanID(data.plan);
          } catch (err) {
            console.error("Error fetching user data:", err);
          } finally {
          }
      };
    
      fetchUserData();
  }, [accessToken, userid]); 


  const getDefaultModelByPlan = (planId: string | null): string => {
    if (!planId) return 'z-ai/glm-4.5-air:free';
    
    const freePlans = ['free', 'starter'];
    const paidPlans = ['basic', 'premium', 'pro'];
    const custom = ['custom_api'];
    
    if (freePlans.includes(planId.toLowerCase())) {
      return 'z-ai/glm-4.5-air:free';
    } else if (paidPlans.includes(planId.toLowerCase())) {
      return 'z-ai/glm-4.5-air:free'; 
    }else if(custom.includes(planId.toLowerCase())){
      return 'z-ai/glm-4.5-air:free'
    }
    
    return 'z-ai/glm-4.5-air:free'; 
  };  

  // Then use it in your useEffect
  useEffect(() => {
    if (UserPlanID) {
      const defaultModel = getDefaultModelByPlan(UserPlanID);
      setSelectedModel(defaultModel);
    }
  }, [UserPlanID]);

  useEffect(() => {
    if (!accessToken) {
      console.log("❌ Missing accessToken - WebSocket not connecting");
      return;
    }

    if (channelItem_ID === null || channelItem_ID === undefined) {
      return;
    }

    const sessionId = activeSession?.sessionId || channelItem_ID;

    if (!sessionId || sessionId.trim() === '') {
      return;
    }

    const hasActiveSession = !!activeSession;
    const hasDirectUrlAccess = !!channelItem_ID && !activeSession;

    if (!hasActiveSession && !hasDirectUrlAccess) {
      return;
    }

    let ws = null;
    let pingInterval = null;

    const connectWebSocket = () => {
      try {
        const wsUrl = `ws://localhost:8000/ws?token=${encodeURIComponent(accessToken)}&session_id=${encodeURIComponent(sessionId)}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setIsConnected(true);
          setSocket(ws);

          // Set up ping interval
          pingInterval = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, 25000);

          const workspaceMessage = {
            type: "workspace_info",
            content: {
              session_id: sessionId,
              ...(activeSession && {
                list_id: activeSession.listId,
                topic_id: activeSession.topicId,
                work_id: activeSession.workId
              })
            }
          };
          ws.send(JSON.stringify(workspaceMessage));

          let agent_type = agentType;
          let agent_mode = agentMode;
          
          if(WorkspaceType === "document"){
            agent_type = "canvas";
            agent_mode = "creative_canvas";
          } else {
            agent_type = "normal";  
            agent_mode = "normal"; 
          }
          
          setAgentMode(agent_mode);
          setAgentType(agent_type);
          
          const payloadContent:InitAgentContent = {
            tool_args: {
              deep_research: false,
              pdf: true,
              mode: agent_mode,
              agent_type:agent_type,
              model_id: selectedModel,
              media_generation: false,
              audio_generation: false,
              browser: true,
            },
            // Include session context in agent init
            session_context: {
              session_id: sessionId,
              ...(activeSession && {
                list_id: activeSession.listId,
                topic_id: activeSession.topicId,
                work_id: activeSession.workId
              })
            }
          };

          if (UserPlanID === "custom_api") {
            payloadContent.api_keys = {
              llmKey: llm_key,
              imageKey: image_key,
              webKey: web_key, 
            };
          }

          ws.send(JSON.stringify({
            type: "init_agent",
            content: payloadContent,
          }));
        };

        ws.onerror = (error) => {
          console.error("❌ WebSocket error:", error);
          toast.error("WebSocket connection error");
        };

        ws.onclose = () => {
          setIsConnected(false);
          setSocket(null);

          if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'workspace_info' && data.content?.path) {
              setWorkspaceInfo(data.content.path)
              if (channelItem_ID && !activeSession) {
                setActiveSession({
                  sessionId: channelItem_ID,
                  listId: '', 
                  topicId: '',
                  workId: ''
                });
              }
            }
          } catch (error) {
            console.log("Non-JSON WebSocket message:", event.data);
          }
        };

      } catch (error) {
        console.error("❌ Failed to create WebSocket:", error);
        toast.error("Failed to establish connection");
      }
    };
    connectWebSocket();

    // Cleanup function
    return () => {
      if (pingInterval) {
        clearInterval(pingInterval);
      }
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.close(1000, "Component unmounting");
      }
    };
  }, [channelItem_ID, accessToken, activeSession]);

  const handleAgentModeChange = (mode: string, type: string) => {
    setAgentMode(mode);
    setAgentType(type);
    
    // Send update to WebSocket if connected
    if (socket && socket.readyState === WebSocket.OPEN) {
      const payloadContent: InitAgentContent = {
        tool_args: {
          deep_research: false,
          pdf: true,
          mode: mode,
          agent_type: type,
          model_id: selectedModel,
          media_generation: false,
          audio_generation: false,
          browser: true,
        },
        session_context: {
          session_id: activeSession?.sessionId || channelItem_ID || '',
          ...(activeSession && {
            list_id: activeSession.listId,
            topic_id: activeSession.topicId,
            work_id: activeSession.workId
          })
        }
      };
  
      if (UserPlanID === "custom_api") {
        payloadContent.api_keys = {
          llmKey: llm_key,
          imageKey: image_key,
          webKey: web_key,
        };
      }
  
      socket.send(JSON.stringify({
        type: "init_agent",
        content: payloadContent,
      }));
      
      toast.success(`Agent mode changed to: ${mode}`);
    }
  };
  
  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    
    // Update agent with new model
    if (socket && socket.readyState === WebSocket.OPEN) {
      let agent_type = agentType;
      let agent_mode = agentMode;
      
      if (WorkspaceType === "document") {
        agent_type = "canvas";
        agent_mode = "creative_canvas";
      }
  
      const payloadContent: InitAgentContent = {
        tool_args: {
          deep_research: false,
          pdf: true,
          mode: agent_mode,
          agent_type: agent_type,
          model_id: modelId, 
          media_generation: false,
          audio_generation: false,
          browser: true,
        },
        session_context: {
          session_id: activeSession?.sessionId || channelItem_ID || '',
          ...(activeSession && {
            list_id: activeSession.listId,
            topic_id: activeSession.topicId,
            work_id: activeSession.workId
          })
        }
      };
  
      if (UserPlanID === "custom_api") {
        payloadContent.api_keys = {
          llmKey: llm_key,
          imageKey: image_key,
          webKey: web_key,
        };
      }
  
      socket.send(JSON.stringify({
        type: "init_agent",
        content: payloadContent,
      }));
      
      toast.success(`Model changed to: ${modelId}`);
    }
  };
  
  const handleWorkItemSelect = (listId: string, topicId: string, workId: string, worktype: string, sessionId: string, projectInfo?: { projectType?: string; projectName?: string }) => {
    if (isTransitioning) {
      return;
    }
    
    setCurrentProjectInfo({
      projectType: projectInfo?.projectType,
      projectName: projectInfo?.projectName,
      projectId: listId
    });
    
    setWorkspaceType(worktype);
    setActiveSession({ sessionId, listId, topicId, workId });
    setIsMainPageVisible(true);
    
    // Update URL to reflect current state
    const newUrl = `/canvas?ChannelItemID=${sessionId}`;
    setChannelItemID(sessionId);
    window.history.replaceState(
      { 
        sessionId, 
        listId, 
        topicId, 
        workId, 
        worktype,
        projectType: projectInfo?.projectType,
        projectName: projectInfo?.projectName 
      },
      '', 
      newUrl
    );
    
    if (isMobile) setIsSidebarOpen(false);
  };
  
  useEffect(() => {
    if (currentProjectInfo?.projectId && typeof currentProjectInfo?.projectId === 'string') {
      fetchCollaborators();
    }
  }, [currentProjectInfo?.projectId]);

  const fetchCollaborators = async () => {
    if (!currentProjectInfo?.projectId || typeof currentProjectInfo?.projectId !== 'string') return;

    try {
      const response = await api.getProjectCollaborators(currentProjectInfo?.projectId);
      if (response.success) {
        setCollaborators(response?.collaborators);
        setProjectInfo({
          projectId:currentProjectInfo?.projectId,
          name: response?.project_name,
          type: response?.project_type
        });
      }
    } catch (err) {
      console.error('Failed to fetch collaborators:', err);
    }
  };
  const toggleMainPage = () => {
    setIsMainPageVisible((prev) => !prev);
  };

  const toggleAIExpansion = () => {
    setIsAIExpanded((prev) => !prev);
  };

  const toggleDesktopSidebar = () => {
    setIsDesktopSidebarVisible((prev) => !prev);
  };

  // Collaboration handlers
  const openCollabModal = () => {
    setIsCollabModalOpen(true);
  };

  const closeCollabModal = () => {
    setIsCollabModalOpen(false);
    setCollabEmail("");
    setInviteMessage("");
  };

  const handleApplyNote = (noteContent: string) => {

    setNoteBlocksToAdd(prev => [...prev, {
      content: noteContent,
      timestamp: Date.now()
    }]);

    toast.success('Knowledge applied to canvas');
  };

  const [noteBlocksToAdd, setNoteBlocksToAdd] = useState<Array<{
    content: string;
    timestamp: number;
  }>>([]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setDarkMode(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setDarkMode(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const getAICollabWidth = () => {
    if (!isMainPageVisible) return "100%";
    if (isAIExpanded) return "70%";
    return "550px";
  };

  const getMainContentFlex = () => {
    if (!isMainPageVisible) return 0;
    if (isAIExpanded) return "25%";
    return 1;
  };

  const TransitionLoader = () => {
    if (!isTransitioning) return null;

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "rgba(0,0,0,0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            background: darkMode ? "#1f1f1f" : "#ffffff",
            borderRadius: "12px",
            padding: "24px",
            textAlign: "center",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)"
          }}
        >
          <div style={{
            width: "32px",
            height: "32px",
            border: "3px solid #e5e7eb",
            borderTop: "3px solid #3b82f6",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 12px"
          }} />
          <div style={{
            color: darkMode ? "#fff" : "#111",
            fontWeight: "600",
            marginBottom: "4px"
          }}>
            Switching Workspace
          </div>
          <div style={{
            color: darkMode ? "#999" : "#666",
            fontSize: "14px"
          }}>
            Clearing previous session data...
          </div>
        </div>
      </div>
    );
  };

  const handleInviteCollaborator = async () => {
    if (!currentProjectInfo?.projectId || !collabEmail.trim()) {
      toast.error('Missing project ID or email');
      return;
    }

    try {
      const response = await api.addCollaborator(
        currentProjectInfo.projectId,
        collabEmail.trim(),
        collabRole
      );

      if (response.success) {
        setInviteMessage('Request sent successfully!');
        setCollabEmail('');

        // Add the new collaborator to the local state
        setCollaborators(prev => [...prev, {
          id: response.collaborator.id,
          email: response.collaborator.email,
          role: response.collaborator.role,
          status: response.collaborator.status as "pending" | "active"
        }]);

        // Clear message after 3 seconds
        setTimeout(() => setInviteMessage(''), 3000);

        toast.success(`Request sent to ${response.collaborator.email}`);
      }
    } catch (error) {
      console.error('Failed to Request collaborator:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to send invitation';
      setInviteMessage(`Error: ${errorMessage}`);
      toast.error(errorMessage);

      // Clear error message after 5 seconds
      setTimeout(() => setInviteMessage(''), 5000);
    }
  };

  const handleRemoveCollaboratorEnhanced = async (collaboratorId: string) => {
    if (!currentProjectInfo?.projectId) {
      toast.error('Missing project ID');
      return;
    }

    try {
      const response = await api.removeCollaborator(currentProjectInfo.projectId, collaboratorId);

      if (response.success) {
        // Remove from local state
        setCollaborators(prev => prev.filter(c => c.id !== collaboratorId));
        toast.success('Collaborator removed successfully');
      }
    } catch (error) {
      console.error('Failed to remove collaborator:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove collaborator';
      toast.error(errorMessage);
    }
  };

  const CollaborationModal = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [loadingAction, setLoadingAction] = useState('');

    if (!isCollabModalOpen) return null;

    // Check if current project is a group project based on stored info
    const isGroupProject = currentProjectInfo?.projectType === 'group';

    const handleInviteWithLoading = async () => {
      setIsLoading(true);
      setLoadingAction('invite');
      try {
        await handleInviteCollaborator();
      } finally {
        setIsLoading(false);
        setLoadingAction('');
      }
    };

    const handleRemoveWithLoading = async (collaboratorId: string) => {
      setIsLoading(true);
      setLoadingAction('remove');
      try {
        await handleRemoveCollaboratorEnhanced(collaboratorId);
      } finally {
        setIsLoading(false);
        setLoadingAction('');
      }
    };

    return (
      <>
        <div
          onClick={closeCollabModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: darkMode ? "#1f1f1f" : "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              width: "100%",
              maxWidth: "500px",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)"
            }}
          >
            {/* Header */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
              borderBottom: `1px solid ${darkMode ? "#333" : "#e5e7eb"}`,
              paddingBottom: "12px"
            }}>
              <div>
                <h3 style={{
                  margin: 0,
                  color: darkMode ? "#fff" : "#111",
                  fontSize: "18px",
                  fontWeight: "600"
                }}>
                  Team Collaboration
                </h3>
                {currentProjectInfo && (
                  <div style={{
                    fontSize: "14px",
                    color: darkMode ? "#999" : "#666",
                    marginTop: "4px"
                  }}>
                    {currentProjectInfo.projectName} • {currentProjectInfo.projectType} project
                  </div>
                )}
              </div>
              <button
                onClick={closeCollabModal}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "20px",
                  cursor: "pointer",
                  color: darkMode ? "#999" : "#666",
                  padding: "4px"
                }}
              >
                ✕
              </button>
            </div>

            {/* Show different content based on project type */}
            {!isGroupProject ? (
              <div style={{
                textAlign: "center",
                padding: "40px 20px",
                color: darkMode ? "#999" : "#666"
              }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>👤</div>
                <h4 style={{ color: darkMode ? "#ccc" : "#333", marginBottom: "8px" }}>
                  Personal Project
                </h4>
                <p style={{ fontSize: "14px", lineHeight: "1.5" }}>
                  This is a personal project. Collaboration features are available for team projects only.
                  <br /><br />
                  Create a new team project to invite collaborators and work together.
                </p>
              </div>
            ) : (
              <>
                {/* Project Info */}
                <div style={{
                  marginBottom: "24px",
                  padding: "16px",
                  background: darkMode ? "#1e293b" : "#f1f5f9",
                  borderRadius: "8px",
                  border: `1px solid ${darkMode ? "#334155" : "#cbd5e1"}`
                }}>
                  <div style={{
                    color: darkMode ? "#e2e8f0" : "#475569",
                    fontSize: "14px",
                    fontWeight: "500",
                    marginBottom: "8px"
                  }}>
                    Project Collaboration
                  </div>
                  <div style={{
                    color: darkMode ? "#94a3b8" : "#64748b",
                    fontSize: "12px"
                  }}>
                    Manage collaborators for this team project. Invited users will be able to access and edit based on their assigned role.
                  </div>
                </div>

                {/* Add Collaborator Form */}
                <div style={{ marginBottom: "24px" }}>
                  <h4 style={{
                    color: darkMode ? "#ccc" : "#374151",
                    fontSize: "16px",
                    marginBottom: "16px",
                    fontWeight: "500"
                  }}>
                    Invite Collaborators
                  </h4>

                  <div style={{ marginBottom: "16px" }}>
                    <label style={{
                      display: "block",
                      marginBottom: "6px",
                      color: darkMode ? "#ccc" : "#374151",
                      fontSize: "14px",
                      fontWeight: "500"
                    }}>
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={collabEmail}
                      onChange={(e) => setCollabEmail(e.target.value)}
                      placeholder="Enter collaborator's email"
                      disabled={isLoading}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "6px",
                        border: `1px solid ${darkMode ? "#444" : "#d1d5db"}`,
                        background: darkMode ? "#2a2a2a" : "#ffffff",
                        color: darkMode ? "#fff" : "#111",
                        fontSize: "14px",
                        outline: "none",
                        opacity: isLoading ? 0.7 : 1
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label style={{
                      display: "block",
                      marginBottom: "6px",
                      color: darkMode ? "#ccc" : "#374151",
                      fontSize: "14px",
                      fontWeight: "500"
                    }}>
                      Role
                    </label>
                    <select
                      value={collabRole}
                      onChange={(e) => setCollabRole(e.target.value as "viewer" | "editor" | "admin")}
                      disabled={isLoading}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "6px",
                        border: `1px solid ${darkMode ? "#444" : "#d1d5db"}`,
                        background: darkMode ? "#2a2a2a" : "#ffffff",
                        color: darkMode ? "#fff" : "#111",
                        fontSize: "14px",
                        outline: "none",
                        opacity: isLoading ? 0.7 : 1
                      }}
                    >
                      <option value="viewer">Viewer - Can only view</option>
                      <option value="editor">Editor - Can edit content</option>
                      <option value="admin">Admin - Full access</option>
                    </select>
                  </div>

                  <button
                    onClick={handleInviteWithLoading}
                    disabled={!collabEmail.trim() || isLoading}
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: "6px",
                      border: "none",
                      background: (!collabEmail.trim() || isLoading)
                        ? (darkMode ? "#374151" : "#e5e7eb")
                        : (darkMode ? "#4f46e5" : "#3b82f6"),
                      color: (!collabEmail.trim() || isLoading)
                        ? (darkMode ? "#6b7280" : "#9ca3af")
                        : "#ffffff",
                      fontSize: "14px",
                      fontWeight: "500",
                      cursor: (!collabEmail.trim() || isLoading) ? "not-allowed" : "pointer",
                      transition: "all 0.2s ease",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px"
                    }}
                  >
                    {isLoading && loadingAction === 'invite' && (
                      <div style={{
                        width: "16px",
                        height: "16px",
                        border: "2px solid transparent",
                        borderTop: "2px solid currentColor",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite"
                      }} />
                    )}
                    {isLoading && loadingAction === 'invite' ? 'Sending...' : 'Send Invitation'}
                  </button>

                  {inviteMessage && (
                    <div style={{
                      marginTop: "10px",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      background: inviteMessage.startsWith('Error:')
                        ? (darkMode ? "#7f1d1d" : "#fecaca")
                        : (darkMode ? "#065f46" : "#d1fae5"),
                      color: inviteMessage.startsWith('Error:')
                        ? (darkMode ? "#fca5a5" : "#dc2626")
                        : (darkMode ? "#34d399" : "#065f46"),
                      fontSize: "12px",
                      textAlign: "center"
                    }}>
                      {inviteMessage}
                    </div>
                  )}
                </div>

                {/* Current Collaborators List */}
                {collaborators.length > 0 && (
                  <div>
                    <h4 style={{
                      color: darkMode ? "#ccc" : "#374151",
                      fontSize: "16px",
                      marginBottom: "12px",
                      fontWeight: "500"
                    }}>
                      Project Collaborators ({collaborators.length})
                    </h4>

                    <div style={{ maxHeight: "200px", overflow: "auto" }}>
                      {collaborators.map((collab) => (
                        <div
                          key={collab.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "12px",
                            border: `1px solid ${darkMode ? "#333" : "#e5e7eb"}`,
                            borderRadius: "8px",
                            marginBottom: "8px",
                            background: darkMode ? "#2a2a2a" : "#f9fafb"
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{
                              color: darkMode ? "#fff" : "#111",
                              fontSize: "14px",
                              fontWeight: "500",
                              marginBottom: "2px"
                            }}>
                              {collab.email}
                            </div>
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px"
                            }}>
                              <span style={{
                                color: darkMode ? "#999" : "#6b7280",
                                fontSize: "12px",
                                textTransform: "capitalize"
                              }}>
                                {collab.role}
                              </span>
                              <span style={{
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "10px",
                                fontWeight: "500",
                                background: collab.status === 'active'
                                  ? (darkMode ? "#065f46" : "#d1fae5")
                                  : (darkMode ? "#7c2d12" : "#fed7aa"),
                                color: collab.status === 'active'
                                  ? (darkMode ? "#34d399" : "#065f46")
                                  : (darkMode ? "#fdba74" : "#c2410c")
                              }}>
                                {collab.status}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveWithLoading(collab.id)}
                            disabled={isLoading}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: (isLoading && loadingAction === 'remove')
                                ? (darkMode ? "#6b7280" : "#9ca3af")
                                : (darkMode ? "#ef4444" : "#dc2626"),
                              cursor: isLoading ? "not-allowed" : "pointer",
                              fontSize: "16px",
                              padding: "4px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center"
                            }}
                            title="Remove collaborator"
                          >
                            {isLoading && loadingAction === 'remove' ? (
                              <div style={{
                                width: "16px",
                                height: "16px",
                                border: "2px solid transparent",
                                borderTop: "2px solid currentColor",
                                borderRadius: "50%",
                                animation: "spin 1s linear infinite"
                              }} />
                            ) : (
                              '🗑️'
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <style>
          {`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </>
    );
  };

  return (
    <CollabProvider
      sessionId={activeSession?.sessionId || channelItem_ID}
      currentUser={user?.currentUser || null}
      isCollaborativeProject={currentProjectInfo?.projectType === 'group'}
      projectType={currentProjectInfo?.projectType as 'personal' | 'group'}
    >
      <RealTimeCursorSystem
        darkMode={darkMode}
        projectType={currentProjectInfo?.projectType as 'personal' | 'group'}
        currentComponent="notepad"
      >
        <div
          style={{
            display: "flex",
            height: "100vh",
            position: "relative",
            background: darkMode ? "#0b0b0b" : "#fafafa",
          }}
        >
          <TransitionLoader />
          {!isMobile && isDesktopSidebarVisible && (
            <div
              style={{
                width: 321,
                flexShrink: 0,
                borderRight: `1px solid ${darkMode ? "#222" : "#e5e7eb"}`,
                background: darkMode ? "#0f0f0f" : "#fff",
                overflow: "auto",
                transition: "all 0.3s ease"
              }}
            >
              <Sidebar onWorkItemSelect={handleWorkItemSelect} userinfo={userinfo} />
            </div>
          )}
  
          {isMobile && (
            <>
              {!isSidebarOpen && (
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  aria-label="Open sidebar"
                  style={{
                    position: "fixed",
                    top: 12,
                    left: 12,
                    zIndex: 60,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${darkMode ? "#333" : "#e5e7eb"}`,
                    background: darkMode ? "#111" : "#fff",
                  }}
                >
                  ☰
                </button>
              )}
  
              {isSidebarOpen && (
                <>
                  <div
                    style={{
                      position: "fixed",
                      top: 0,
                      left: 0,
                      bottom: 0,
                      width: 280,
                      zIndex: 70,
                      background: darkMode ? "#0f0f0f" : "#fff",
                      boxShadow: "2px 0 12px rgba(0,0,0,0.25)",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <div
                      style={{
                        padding: 10,
                        borderBottom: `1px solid ${darkMode ? "#222" : "#eee"}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <strong style={{ color: darkMode ? "#fff" : "#111" }}>
                        Menu
                      </strong>
                      <button
                        onClick={() => setIsSidebarOpen(false)}
                        aria-label="Close sidebar"
                        style={{
                          padding: "6px 8px",
                          borderRadius: 6,
                          background: "transparent",
                          border: "none",
                          cursor: "pointer"
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    <div style={{
                      overflow: "auto",
                      flex: 1
                    }}>
                      <Sidebar onWorkItemSelect={handleWorkItemSelect} userinfo={userinfo}/>
                    </div>
                  </div>
                  <div
                    onClick={() => setIsSidebarOpen(false)}
                    style={{
                      position: "fixed",
                      inset: 0,
                      background: "rgba(0,0,0,0.35)",
                      zIndex: 65,
                    }}
                  />
                </>
              )}
            </>
          )}
  
          {/* Render different layouts based on WorkspaceType */}
          {WorkspaceType === 'document' ? (
            !isMobile ? (
              <div style={{
                flex: 1,
                display: "flex",
                overflow: "hidden"
              }}>
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  {/* Header with controls */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 12px",
                      borderBottom: `1px solid ${darkMode ? "#333" : "#e5e7eb"}`,
                      backgroundColor: darkMode ? "#2a2a2a" : "#f9fafb",
                    }}
                  >
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      {/* Sidebar Toggle Button */}
                      <button
                        onClick={toggleDesktopSidebar}
                        style={{
                          padding: "6px 8px",
                          fontSize: "14px",
                          borderRadius: "4px",
                          border: `1px solid ${darkMode ? "#555" : "#d1d5db"}`,
                          backgroundColor: darkMode ? "#374151" : "#e5e7eb",
                          color: darkMode ? "#9ca3af" : "#6b7280",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                        title={isDesktopSidebarVisible ? "Hide Sidebar" : "Show Sidebar"}
                      >
                        {isDesktopSidebarVisible ? "◀" : "▶"}
                      </button>

                      <button
                        onClick={openCollabModal}
                        style={{
                          padding: "6px 12px",
                          fontSize: "12px",
                          borderRadius: "4px",
                          border: `1px solid ${darkMode ? "#555" : "#d1d5db"}`,
                          backgroundColor: darkMode ? "#7c3aed" : "#8b5cf6",
                          color: "#ffffff",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                        title="Add Collaborators"
                      >
                        👥 Collaborate
                      </button>
                    </div>
                  </div>

                  <div style={{ flex: 1, overflow: "auto" }}>
                    <Creative_canvas 
                      key={`creative-canvas-${activeSession?.sessionId || 'default'}`}
                      sessionId={activeSession?.sessionId}
                      socket={socket}
                      workspaceInfoFromHome={workspaceInfo}
                      projectInfo={projectInfo}
                      isConnected={isConnected}
                      userinfo={userinfo}
                      selectedModel={selectedModel}
                      onModelChange={handleModelChange}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                paddingTop: "50px"
              }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 12px",
                    borderBottom: `1px solid ${darkMode ? "#333" : "#e5e7eb"}`,
                    backgroundColor: darkMode ? "#121212" : "#fff",
                    position: "fixed",
                    top: 50,
                    left: 0,
                    right: 0,
                    zIndex: 50
                  }}
                >
                  <button
                    onClick={openCollabModal}
                    style={{
                      padding: "6px 10px",
                      fontSize: 12,
                      borderRadius: 6,
                      border: `1px solid ${darkMode ? "#555" : "#d1d5db"}`,
                      backgroundColor: darkMode ? "#7c3aed" : "#8b5cf6",
                      color: "#ffffff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    👥 Collab
                  </button>
                </div>

                <div style={{
                  flex: 1,
                  overflow: "auto",
                  marginTop: "45px"
                }}>
                  <Creative_canvas 
                    key={`creative-canvas-${activeSession?.sessionId || 'default'}`}
                    sessionId={activeSession?.sessionId}
                    socket={socket}
                    workspaceInfoFromHome={workspaceInfo}
                    projectInfo={projectInfo}
                    isConnected={isConnected}
                    userinfo={userinfo}
                    selectedModel={selectedModel}
                    onModelChange={handleModelChange}
                  />
                </div>
              </div>
            )
          ) : WorkspaceType == "Home" ? <div style={{
               flex: 1,
               display: "flex",
               flexDirection: "column", 
               overflow: "hidden",
               height: "100%" 
             }}> <CuriosityLab/></div>
            : (
            !isMobile ? (
              <div style={{
                flex: 1.2,
                display: "flex",
                overflow: "hidden"
              }}>
                {isMainPageVisible && (
                <div
                  style={{
                    flex: getMainContentFlex() as any,
                    minWidth: isAIExpanded ? "300px" : "auto",
                    transition: "all 0.3s ease",
                    overflow: "auto",
                  }}
                >
                  <AINotePad
                    key={`notepad-${activeSession?.sessionId || 'default'}`}
                    sessionId={activeSession?.sessionId}
                    socket={socket}
                    isConnected={isConnected}
                    onApplyNote={handleApplyNote}
                    noteBlocksToAdd={noteBlocksToAdd}
                    onNoteBlocksProcessed={() => setNoteBlocksToAdd([])}
                    projectInfo={projectInfo} 
                    userinfo={userinfo}
                    />
                </div>
                )}
  
                <div
                  style={{
                    width: getAICollabWidth(),
                    flex: isMainPageVisible ? "none" : 1,
                    borderLeft: isMainPageVisible ? `1px solid ${darkMode ? "#333" : "#e5e7eb"}` : "none",
                    backgroundColor: darkMode ? "#1a1a1a" : "#ffffff",
                    display: "flex",
                    flexDirection: "column",
                    transition: "all 0.3s ease",
                    position: "relative",
                    minWidth: 320,
                  }}
                >
                  {/* Header with toggles */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 12px",
                      borderBottom: `1px solid ${darkMode ? "#333" : "#e5e7eb"}`,
                      backgroundColor: darkMode ? "#2a2a2a" : "#f9fafb",
                    }}
                  >
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      {/* Sidebar Toggle Button */}
                      <button
                        onClick={toggleDesktopSidebar}
                        style={{
                          padding: "6px 8px",
                          fontSize: "14px",
                          borderRadius: "4px",
                          border: `1px solid ${darkMode ? "#555" : "#d1d5db"}`,
                          backgroundColor: darkMode ? "#374151" : "#e5e7eb",
                          color: darkMode ? "#9ca3af" : "#6b7280",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                        title={isDesktopSidebarVisible ? "Hide Sidebar" : "Show Sidebar"}
                      >
                        {isDesktopSidebarVisible ? "◀" : "▶"}
                      </button>
  
                      <button
                        onClick={toggleMainPage}
                        style={{
                          padding: "6px 12px",
                          fontSize: "12px",
                          borderRadius: "4px",
                          border: `1px solid ${darkMode ? "#555" : "#d1d5db"}`,
                          backgroundColor: isMainPageVisible
                            ? darkMode
                              ? "#4f46e5"
                              : "#3b82f6"
                            : darkMode
                              ? "#374151"
                              : "#e5e7eb",
                          color: isMainPageVisible
                            ? "#ffffff"
                            : darkMode
                              ? "#9ca3af"
                              : "#6b7280",
                          cursor: "pointer"
                        }}
                      >
                        {isMainPageVisible ? "Hide Canvas" : "Show Canvas"}
                      </button>
  
                      {isMainPageVisible && (
                        <button
                          onClick={toggleAIExpansion}
                          style={{
                            padding: "6px 12px",
                            fontSize: "12px",
                            borderRadius: "4px",
                            border: `1px solid ${darkMode ? "#555" : "#d1d5db"}`,
                            backgroundColor: isAIExpanded
                              ? darkMode
                                ? "#059669"
                                : "#10b981"
                              : darkMode
                                ? "#374151"
                                : "#e5e7eb",
                            color: isAIExpanded
                              ? "#ffffff"
                              : darkMode
                                ? "#9ca3af"
                                : "#6b7280",
                            cursor: "pointer"
                          }}
                        >
                          {isAIExpanded ? "Contract" : "Expand"}
                        </button>
                      )}
  
                      <button
                        onClick={openCollabModal}
                        style={{
                          padding: "6px 12px",
                          fontSize: "12px",
                          borderRadius: "4px",
                          border: `1px solid ${darkMode ? "#555" : "#d1d5db"}`,
                          backgroundColor: darkMode ? "#7c3aed" : "#8b5cf6",
                          color: "#ffffff",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                        title="Add Collaborators"
                      >
                        👥 Collaborate
                      </button>
                    </div>
                  </div>
  
                  <div style={{ flex: 1, overflow: "auto" }}>
                    <AIcollaborate
                      key={`mobile-notepad-${activeSession?.sessionId || 'default'}`}
                      socket={socket}
                      sessionId={activeSession?.sessionId}
                      onApplyNote={handleApplyNote}
                      workspaceInfoFromHome={workspaceInfo}
                      projectInfo={projectInfo}
                      projectContext={{
                        projectId: activeSession?.listId,
                        topicId: activeSession?.topicId,
                        workId: activeSession?.workId,
                        sessionId: activeSession?.sessionId
                      }}
                      onAgentModeChange={handleAgentModeChange} 
                      currentAgentMode={agentMode}              
                      currentAgentType={agentType} 
                      onModelChange={handleModelChange}  
                      currentModel={selectedModel}        
                      userinfo={userinfo}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                paddingTop: "50px"
              }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 12px",
                    borderBottom: `1px solid ${darkMode ? "#333" : "#e5e7eb"}`,
                    backgroundColor: darkMode ? "#121212" : "#fff",
                    position: "fixed",
                    top: 50,
                    left: 0,
                    right: 0,
                    zIndex: 50
                  }}
                >
                  <button
                    onClick={toggleMainPage}
                    style={{
                      padding: "6px 10px",
                      fontSize: 13,
                      borderRadius: 6,
                      border: `1px solid ${darkMode ? "#555" : "#d1d5db"}`,
                      backgroundColor: isMainPageVisible
                        ? darkMode
                          ? "#4f46e5"
                          : "#3b82f6"
                        : darkMode
                          ? "#374151"
                          : "#e5e7eb",
                      color: isMainPageVisible
                        ? "#fff"
                        : darkMode
                          ? "#9ca3af"
                          : "#6b7280",
                      cursor: "pointer"
                    }}
                  >
                    {isMainPageVisible ? "Hide Canvas" : "Show Canvas"}
                  </button>
  
                  <button
                    onClick={openCollabModal}
                    style={{
                      padding: "6px 10px",
                      fontSize: 12,
                      borderRadius: 6,
                      border: `1px solid ${darkMode ? "#555" : "#d1d5db"}`,
                      backgroundColor: darkMode ? "#7c3aed" : "#8b5cf6",
                      color: "#ffffff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    👥 Collab
                  </button>
                </div>
  
                <div style={{
                  flex: 1.2,
                  overflow: "auto",
                  marginTop: "45px"
                }}>
                  {isMainPageVisible ? (
                    <>
                      <AINotePad
                        key={`notepad-${activeSession?.sessionId || 'default'}`}
                        sessionId={activeSession?.sessionId}
                        socket={socket}
                        isConnected={isConnected}
                        onApplyNote={handleApplyNote}
                        noteBlocksToAdd={noteBlocksToAdd}
                        onNoteBlocksProcessed={() => setNoteBlocksToAdd([])}
                        projectInfo={projectInfo} 
                        userinfo={userinfo}/>
  
                      <button
                        onClick={() => setActiveMobileTab(activeMobileTab === "ai" ? "canvas" : "ai")}
                        style={{
                          position: "fixed",
                          bottom: 20,
                          right: 20,
                          width: 56,
                          height: 56,
                          borderRadius: "50%",
                          background: darkMode ? "#4f46e5" : "#3b82f6",
                          color: "#fff",
                          border: "none",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                          cursor: "pointer",
                          fontSize: "24px",
                          zIndex: 55,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}
                      >
                        💬
                      </button>
  
                      {activeMobileTab === "ai" && (
                        <div style={{
                          position: "fixed",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: darkMode ? "#1a1a1a" : "#ffffff",
                          zIndex: 54,
                          display: "flex",
                          flexDirection: "column"
                        }}>
                          <div style={{
                            padding: "12px",
                            borderBottom: `1px solid ${darkMode ? "#333" : "#e5e7eb"}`,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            background: darkMode ? "#121212" : "#fff"
                          }}>
                            <h3 style={{ margin: 0, color: darkMode ? "#fff" : "#000", fontSize: "16px" }}>
                              AI Assistant
                            </h3>
                            <button
                              onClick={() => setActiveMobileTab("canvas")}
                              style={{
                                padding: "6px 12px",
                                background: darkMode ? "#374151" : "#e5e7eb",
                                border: "none",
                                borderRadius: "6px",
                                color: darkMode ? "#fff" : "#000",
                                cursor: "pointer",
                                fontSize: "14px"
                              }}
                            >
                              ✕ Close
                            </button>
                          </div>
                          <div style={{ flex: 1, overflow: "auto" }}>
                            <AIcollaborate
                              key={`mobile-notepad-${activeSession?.sessionId || 'default'}`}
                              socket={socket}
                              sessionId={activeSession?.sessionId}
                              onApplyNote={handleApplyNote}
                              workspaceInfoFromHome={workspaceInfo}
                              projectInfo={projectInfo}
                              projectContext={{
                                projectId: activeSession?.listId,
                                topicId: activeSession?.topicId,
                                workId: activeSession?.workId,
                                sessionId: activeSession?.sessionId
                              }}
                              onAgentModeChange={handleAgentModeChange} 
                              currentAgentMode={agentMode}              
                              currentAgentType={agentType} 
                              onModelChange={handleModelChange}  
                              currentModel={selectedModel}        
                              userinfo={userinfo}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <AIcollaborate
                      key={`mobile-notepad-${activeSession?.sessionId || 'default'}`}
                      socket={socket}
                      sessionId={activeSession?.sessionId}
                      onApplyNote={handleApplyNote}
                      workspaceInfoFromHome={workspaceInfo}
                      projectInfo={projectInfo}
                      projectContext={{
                        projectId: activeSession?.listId,
                        topicId: activeSession?.topicId,
                        workId: activeSession?.workId,
                        sessionId: activeSession?.sessionId
                      }}
                      onAgentModeChange={handleAgentModeChange} 
                      currentAgentMode={agentMode}              
                      currentAgentType={agentType} 
                      onModelChange={handleModelChange}  
                      currentModel={selectedModel}        
                      userinfo={userinfo}
                    />
                  )}
                </div>
              </div>
            )
          )}
          <CollaborationModal />
        </div>
      </RealTimeCursorSystem>
    </CollabProvider>
  );
};

export default Collab;