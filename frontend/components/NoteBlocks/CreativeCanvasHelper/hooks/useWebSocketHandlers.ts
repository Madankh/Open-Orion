import { useEffect, useRef } from 'react';
import { NodeData, Connection } from '@/typings/agent';
import { toast } from 'sonner';

interface StreamingState {
  currentStreamingNodeId: string | null;
  streamingContent: string;
  isStreaming: boolean;
  expectingFinalResponse: boolean;
}

interface UseWebSocketHandlersProps {
  socket: WebSocket | null;
  nodesRef: React.RefObject<NodeData[]>;
  connectionsRef: React.RefObject<Connection[]>;
  canvas: {
    zoom: number;
    pan: { x: number; y: number };
    isDragging: boolean;
    dragStart: { x: number; y: number };
    selectedNodeId: string | null;
  };
  setIsLoading: (loading: boolean) => void;
  setIsCompleted: (completed: boolean) => void;
  isCollaborativeMode: boolean;
  collab: any;
  setLocalNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
  setLocalConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
}

export const useWebSocketHandlers = ({
  socket,
  nodesRef,
  connectionsRef,
  canvas,
  setIsLoading,
  setIsCompleted,
  isCollaborativeMode,
  collab,
  setLocalNodes,
  setLocalConnections
}: UseWebSocketHandlersProps) => {
  
  const streamingState = useRef<StreamingState>({
    currentStreamingNodeId: null,
    streamingContent: '',
    isStreaming: false,
    expectingFinalResponse: false
  });

  // Track created nodes to prevent duplicates
  const createdNodesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!socket) {
      console.log('❌ No socket provided to WebSocket handlers');
      return;
    }

    console.log('✅ WebSocket handlers initialized', {
      socketState: socket.readyState,
      isCollaborative: isCollaborativeMode
    });

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'STREAMING_TOKEN') {
          const { content } = data;
          const responseNodeId = content?.node_id;
          
          if (!responseNodeId) {
            console.warn('⚠️ No node_id in streaming token');
            return;
          }

          const sourceNodeId = canvas.selectedNodeId;
          if (!streamingState.current.isStreaming || 
              streamingState.current.currentStreamingNodeId !== responseNodeId) {
            
            console.log('🎬 First token received, initializing stream:', responseNodeId);

            // Check if node already exists
            const existingNode = nodesRef.current?.find(n => n.id === responseNodeId);
            
            if (!existingNode && !createdNodesRef.current.has(responseNodeId)) {
              const sourceNode = nodesRef.current?.find(n => n.id === sourceNodeId);
              
              if (sourceNode) {
                console.log('✨ Creating response node for:', sourceNodeId);
                
                const responseNode: NodeData = {
                  id: responseNodeId,
                  type: 'text',
                  x: sourceNode.x + 450,
                  y: sourceNode.y + (sourceNode.childIds?.length || 0) * 50,
                  width: 420,
                  height: 200,
                  content: '',
                  title: 'AI Response',
                  parentId: sourceNodeId,
                  childIds: [],
                  level: sourceNode.level + 1,
                  color: sourceNode.color,
                  isExpanded: true,
                  isRunning: true
                };

                const newConnection: Connection = {
                  id: `c-${sourceNodeId}-${responseNodeId}`,
                  fromId: sourceNodeId,
                  toId: responseNodeId,
                  strokeStyle: 'solid',
                  arrowType: 'end',
                  color: 'slate',
                  label: ''
                };

                if (isCollaborativeMode) {
                  console.log('🔄 Adding node to Yjs:', responseNodeId);
                  collab.addYCanvasNode(responseNode);
                  collab.updateYCanvasNode(sourceNodeId, {
                    childIds: [...(sourceNode.childIds || []), responseNodeId],
                    isRunning: true
                  });
                  collab.addYCanvasConnection(newConnection);
                } else {
                  console.log('🔄 Adding node to local state:', responseNodeId);
                  
                  // ✅ CRITICAL: Single batched update
                  setLocalNodes(prev => {
                    console.log('📊 Current nodes count:', prev.length);
                    // Add new response node
                    const withNewNode = [...prev, responseNode];
                    
                    // Update source node
                    const updated = withNewNode.map(n => 
                      n.id === sourceNodeId 
                        ? { 
                            ...n, 
                            childIds: [...(n.childIds || []), responseNodeId],
                            isRunning: true 
                          }
                        : n
                    );
                    
                    console.log('✅ Updated nodes count:', updated.length);
                    return updated;
                  });
                  
                  setLocalConnections(prev => {
                    console.log('🔗 Adding connection');
                    return [...prev, newConnection];
                  });
                }

                createdNodesRef.current.add(responseNodeId);
                console.log('✅ Node created successfully:', responseNodeId);
              } else {
                console.error('❌ Source node not found:', sourceNodeId);
              }
            } else {
              console.log('ℹ️ Node already exists, continuing stream');
            }

            // Initialize/reset streaming state
            streamingState.current = {
              currentStreamingNodeId: responseNodeId,
              streamingContent: existingNode?.content || '',
              isStreaming: true,
              expectingFinalResponse: true
            };
          }

          // ============================================
          // APPEND TOKEN TO CONTENT
          // ============================================
          if (content?.type === 'token' && content?.token) {
            const token = content.token;
            streamingState.current.streamingContent += token;

            const contentLength = streamingState.current.streamingContent.length;
            if (contentLength % 50 === 0) {
              console.log('📝 Streaming... length:', contentLength);
            }

            if (isCollaborativeMode) {
              collab.updateYCanvasNode(responseNodeId, {
                content: streamingState.current.streamingContent
              });
            } else {
              // ✅ CRITICAL: Force update with new reference
              setLocalNodes(prev => {
                const updated = prev.map(n =>
                  n.id === responseNodeId
                    ? { ...n, content: streamingState.current.streamingContent }
                    : n
                );
                // Return new array to force re-render
                return [...updated];
              });
            }
          }
        }
        
        // ============================================
        // HANDLE AGENT THINKING
        // ============================================
        else if (data.type === 'agent_thinking' || data.type === 'AGENT_THINKING') {
          if (!streamingState.current.currentStreamingNodeId) return;

          const thinkingText = `\n\n💭 *Thinking: ${data.content?.thought}*\n\n`;
          streamingState.current.streamingContent += thinkingText;

          console.log('💭 Agent thinking:', data.content?.thought);

          if (isCollaborativeMode) {
            collab.updateYCanvasNode(streamingState.current.currentStreamingNodeId, {
              content: streamingState.current.streamingContent
            });
          } else {
            setLocalNodes(prev => prev.map(n =>
              n.id === streamingState.current.currentStreamingNodeId
                ? { ...n, content: streamingState.current.streamingContent }
                : n
            ));
          }
        }
        
        // ============================================
        // HANDLE TOOL PROCESSING
        // ============================================
        else if (data.type === 'Tool_processing' || data.type === 'tool_call') {
          if (!streamingState.current.currentStreamingNodeId) return;

          const toolInput = data.content?.tool_input || JSON.parse(data.content?.token || '{}');
          const toolText = `\n\n🔧 **Using Tool: ${data.content?.tool_name}**\n\`\`\`json\n${JSON.stringify(toolInput, null, 2)}\n\`\`\`\n`;
          streamingState.current.streamingContent += toolText;

          console.log('🔧 Tool processing:', data.content?.tool_name);

          if (isCollaborativeMode) {
            collab.updateYCanvasNode(streamingState.current.currentStreamingNodeId, {
              content: streamingState.current.streamingContent
            });
          } else {
            setLocalNodes(prev => prev.map(n =>
              n.id === streamingState.current.currentStreamingNodeId
                ? { ...n, content: streamingState.current.streamingContent }
                : n
            ));
          }
        }
        
        // ============================================
        // HANDLE TOOL RESULT
        // ============================================
        else if (data.type === 'tool_result') {
          if (!streamingState.current.currentStreamingNodeId) return;

          let resultPreview = 'No result';
          if (data.content?.result) {
            const resultStr = typeof data.content.result === 'string'
              ? data.content.result
              : JSON.stringify(data.content.result, null, 2);
            resultPreview = resultStr.length > 300
              ? resultStr.substring(0, 300) + '...'
              : resultStr;
          }

          const resultText = `\n✅ **Tool Result:**\n\`\`\`\n${resultPreview}\n\`\`\`\n\n`;
          streamingState.current.streamingContent += resultText;

          console.log('✅ Tool result received');

          if (isCollaborativeMode) {
            collab.updateYCanvasNode(streamingState.current.currentStreamingNodeId, {
              content: streamingState.current.streamingContent
            });
          } else {
            setLocalNodes(prev => prev.map(n =>
              n.id === streamingState.current.currentStreamingNodeId
                ? { ...n, content: streamingState.current.streamingContent }
                : n
            ));
          }
        }
        
      else if (data.type === 'agent_response') {
        // ✅ FIX: Correct destructuring
        const responseData = data.content || data;
        const responseNodeId = responseData.node_id || streamingState.current.currentStreamingNodeId;
        const finalContent = responseData.text || '';  // Get text directly from responseData
        
        const sourceNodeId = canvas.selectedNodeId;
        if (!responseNodeId) return;
        
        console.log('🎯 Final response received:', {
          nodeId: responseNodeId,
          contentLength: finalContent.length,
          preview: finalContent.substring(0, 100)
        });
        
        if (isCollaborativeMode) {
          collab.updateYCanvasNode(responseNodeId, {
            content: finalContent,
            isRunning: false
          });
          if (sourceNodeId) {
            collab.updateYCanvasNode(sourceNodeId, {
              isRunning: false
            });
          }
        } else {
          // ✅ Update both nodes in single operation
          setLocalNodes(prev => {
            return prev.map(n => {
              if (n.id === responseNodeId) {
                return { 
                  ...n, 
                  content: finalContent, 
                  isRunning: false 
                };
              }
              if (n.id === sourceNodeId) {
                return { ...n, isRunning: false };
              }
              return n;
            });
          });
        }
      
        // Reset streaming state
        streamingState.current = {
          currentStreamingNodeId: null,
          streamingContent: '',
          isStreaming: false,
          expectingFinalResponse: false
        };
        
        setIsLoading(false);
        setIsCompleted(true);
        console.log('✅ Response complete:', finalContent.length, 'characters');
      }
        
        // ============================================
        // HANDLE ERRORS
        // ============================================
        else if (data.type === 'CANVAS_AI_ERROR' || data.type === 'error') {
          const errorMessage = data.content?.error || data.error || 'Unknown error';
          console.error('❌ Canvas AI Error:', errorMessage);

          if (streamingState.current.currentStreamingNodeId) {
            const errorContent = `❌ Error: ${errorMessage}`;
            
            if (isCollaborativeMode) {
              collab.updateYCanvasNode(streamingState.current.currentStreamingNodeId, {
                content: errorContent,
                error: true,
                isRunning: false
              });
            } else {
              setLocalNodes(prev => prev.map(n =>
                n.id === streamingState.current.currentStreamingNodeId
                  ? { ...n, content: errorContent, error: true, isRunning: false }
                  : n
              ));
            }
          }

          // Reset source node
          if (canvas.selectedNodeId) {
            if (isCollaborativeMode) {
              collab.updateYCanvasNode(canvas.selectedNodeId, {
                isRunning: false,
                error: true
              });
            } else {
              setLocalNodes(prev => prev.map(n =>
                n.id === canvas.selectedNodeId
                  ? { ...n, isRunning: false, error: true }
                  : n
              ));
            }
          }

          streamingState.current = {
            currentStreamingNodeId: null,
            streamingContent: '',
            isStreaming: false,
            expectingFinalResponse: false
          };
          
          setIsLoading(false);
          toast.error(`AI Error: ${errorMessage}`);
        }

      } catch (error) {
        console.error('❌ Error parsing WebSocket message:', error);
        setIsLoading(false);
      }
    };

    const handleError = (error: Event) => {
      console.error('❌ WebSocket error:', error);
    };

    const handleClose = () => {
      console.log('🔌 WebSocket closed');
      createdNodesRef.current.clear();
    };

    socket.addEventListener('message', handleMessage);
    socket.addEventListener('error', handleError);
    socket.addEventListener('close', handleClose);
    
    return () => {
      socket.removeEventListener('message', handleMessage);
      socket.removeEventListener('error', handleError);
      socket.removeEventListener('close', handleClose);
    };
  }, [socket, canvas.selectedNodeId, isCollaborativeMode, collab, setIsLoading, setIsCompleted, setLocalNodes, setLocalConnections, nodesRef]);

  return { streamingState };
};