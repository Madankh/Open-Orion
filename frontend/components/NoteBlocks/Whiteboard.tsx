import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Tldraw, Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { WhiteboardBlock } from '@/typings/agent';
import { Minimize2 } from 'lucide-react';
import { WhiteboardHeader, WhiteboardFooter } from './whiteboardComponent/WhiteBoardHeader';
import { WhiteboardAIAssistant } from './whiteboardComponent/AIAssistantTabs';
import { getWhiteboardSnapshotInfo } from './whiteboardSnapshot';
const { toRichText } = await import('tldraw');
// Define shape interface for AI actions - use Record for flexible shape data
interface AIShapeData {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  x?: number;
  y?: number;
  [key: string]: unknown; // Allow additional properties
}

// Update the WhiteboardBlock interface to make content optional
interface FlexibleWhiteboardBlock extends Omit<WhiteboardBlock, 'content' | 'type'> {
  content?: WhiteboardBlock['content'];
  type?: "education" | string; // Allow any string
}

const Whiteboard: React.FC<{
  block?: FlexibleWhiteboardBlock; // Use the flexible interface
  darkMode: boolean;
  updateBlock?: (id: string | number, content: { content?: unknown; title?: string }) => void;
  deleteBlock?: (id: string | number) => void;
  onAIRequest?: (blockId: string | number, prompt: string) => void;
  mainAIHandler?: (prompt: string, context?: unknown) => Promise<void>;
  showAIAssistant?: boolean;
}> = ({
  block,
  darkMode,
  updateBlock,
  mainAIHandler,
  showAIAssistant = true,
}) => {
    const [pendingAIAction, setPendingAIAction] = useState<{
      action: 'add' | 'modify' | 'replace';
      shapes: AIShapeData[];
      explanation: string;
    } | null>(null);
    const [showAIPreview, setShowAIPreview] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [whiteboardData, setWhiteboardData] = useState(block?.content || null);
    const [isExpanded, setIsExpanded] = useState(true);
    const [whiteboardTitle, setWhiteboardTitle] = useState(block?.title || 'Untitled Whiteboard');
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [currentEditor, setCurrentEditor] = useState<Editor | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const whiteboardPropsRef = useRef({ block, updateBlock, title: whiteboardTitle });

    useEffect(() => {
      whiteboardPropsRef.current = { block, updateBlock, title: whiteboardTitle };
    }, [block, updateBlock, whiteboardTitle]);

    useEffect(() => {
      if (block?.content?.aiShapes && block?.content?.aiAction) {
      console.log('🎨 AI shapes detected in whiteboard:', {
        action: block.content.aiAction,
        shapeCount: block.content.aiShapes.length,
        explanation: block.content.explanation
      });

        setPendingAIAction({
          action: block.content.aiAction,
          shapes: block.content.aiShapes,
          explanation: block.content.explanation || 'AI generated content'
        });
        setShowAIPreview(true);
      }
    }, [block?.content?.aiShapes, block?.content?.aiAction]);

    // Save whiteboard data when it changes
    const handleWhiteboardChange = useCallback((editor: Editor) => {
      if (!editor) return;

      try {
        const snapshot = editor.getSnapshot();
        setWhiteboardData(snapshot);

        const { block: activeBlock, updateBlock: updateActiveBlock, title } = whiteboardPropsRef.current;
        if (updateActiveBlock && activeBlock) {
          // Save the snapshot directly as content
          updateActiveBlock(activeBlock.id, {
            content: snapshot, // This should be the tldraw document structure
            title
          });
        }
      } catch (error) {
        console.error('Failed to save whiteboard data:', error);
      }
    }, []);

    const handleTitleSave = () => {
      setIsEditingTitle(false);
      if (updateBlock && block) {
        updateBlock(block.id, {
          content: whiteboardData,
          title: whiteboardTitle
        });
      }
    };

    const handleExport = useCallback(async () => {
      if (!currentEditor) return;

      try {
        const shapeIds = Array.from(currentEditor.getCurrentPageShapeIds());
        if (shapeIds.length === 0) return;

        const { blob } = await currentEditor.toImage(shapeIds, {
          format: 'png',
          background: true,
          scale: 2,
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${whiteboardTitle.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Export failed:', error);
      }
    }, [currentEditor, whiteboardTitle]);

    const clearWhiteboard = () => {
      if (window.confirm('Are you sure you want to clear the whiteboard? This action cannot be undone.')) {
        if (currentEditor) {
          currentEditor.selectAll();
          currentEditor.deleteShapes(currentEditor.getSelectedShapeIds());
        }
        setWhiteboardData(null);
        if (updateBlock && block) {
          updateBlock(block.id, { content: null, title: whiteboardTitle });
        }
      }
    };

   const handleAIRequestWithContext = async (prompt: string) => {
     try {
       if (!currentEditor) {
         console.log('❌ No editor available');
         return;
       }
   
       // Get selected shape IDs FIRST
       const selectedShapeIds = currentEditor.getSelectedShapeIds();
       const hasSelection = selectedShapeIds.length > 0;
   
       console.log('🔍 Selection check:', {
         selectedCount: selectedShapeIds.length,
         selectedIds: selectedShapeIds,
         hasSelection
       });
   
       // Get ALL shapes from the page
       const allShapes = currentEditor.getCurrentPageShapes();
       
       // Filter to get ONLY selected shapes if there's a selection
       const shapesToSend = hasSelection 
         ? allShapes.filter(shape => selectedShapeIds.includes(shape.id))
         : allShapes;
   
       console.log('📊 Shapes to send:', {
         totalShapes: allShapes.length,
         shapesToSend: shapesToSend.length,
         willSendAll: !hasSelection
       });
   
       const whiteboardContext = {
         // ONLY send the filtered shapes
         shapes: shapesToSend.map(shape => ({
           id: shape.id,
           type: shape.type,
           props: shape.props,
           x: shape.x,
           y: shape.y
         })),
         viewport: currentEditor.getViewportPageBounds(),
         camera: currentEditor.getCamera(),
         selectedShapeIds: selectedShapeIds, // IDs of selected shapes
         hasSelection: hasSelection, // Flag to indicate selection
         title: whiteboardTitle,
         type: block?.type || 'general',
         shapeCount: shapesToSend.length, // Count of shapes being sent
         totalShapeCount: allShapes.length // Total on whiteboard
       };
   
       console.log('📤 Sending context to AI:', {
         shapeCount: whiteboardContext.shapeCount,
         hasSelection: whiteboardContext.hasSelection,
         selectedIds: whiteboardContext.selectedShapeIds
       });
   
       if (mainAIHandler) {
         await mainAIHandler(prompt, {
           whiteboardContent: whiteboardContext,
           blockId: block?.id
         });
       }
     } catch (error) {
       console.error('❌ AI request failed:', error);
     }
   };

  const applyAIShapes = useCallback(async () => {
    if (!currentEditor || !pendingAIAction) return;
  
    const mapColorToTLDraw = (color: string): string => {
      const colorMap: Record<string, string> = {
        'purple': 'violet', 'pink': 'light-red', 'cyan': 'light-blue',
        'lime': 'light-green', 'brown': 'orange', 'gray': 'grey',
        'black': 'black', 'grey': 'grey', 'light-violet': 'light-violet',
        'violet': 'violet', 'blue': 'blue', 'light-blue': 'light-blue',
        'yellow': 'yellow', 'orange': 'orange', 'green': 'green',
        'light-green': 'light-green', 'light-red': 'light-red',
        'red': 'red', 'white': 'white'
      };
      return colorMap[color.toLowerCase()] || 'black';
    };
  
    try {
      const { action, shapes } = pendingAIAction;
      console.log('🎨 Applying AI shapes:', { action, shapeCount: shapes.length });
  
      // Import toRichText from tldraw
      const { toRichText } = await import('tldraw');
  
      // Handle clear for replace action
      if (action === 'replace') {
        console.log('🔄 Clearing existing shapes...');
        currentEditor.selectAll();
        currentEditor.deleteShapes(currentEditor.getSelectedShapeIds());
      }
  
      // Create or update all shapes WITH text included from the start
      shapes.forEach((shapeData, index) => {
        try {
          const baseConfig: Record<string, unknown> = {
            type: shapeData.type,
            x: shapeData.x || 0,
            y: shapeData.y || 0
          };
  
          const hasText = !!shapeData.props?.text;
  
          if (shapeData.type === 'geo' && shapeData.props) {
            baseConfig.props = {
              geo: shapeData.props.geo || 'rectangle',
              w: shapeData.props.w || 200,
              h: shapeData.props.h || 100,
              color: mapColorToTLDraw(String(shapeData.props.color || 'black')),
              fill: shapeData.props.fill || 'none',
              size: shapeData.props.size || 'm',
              dash: 'draw',
              font: 'draw',
              align: 'middle',
              verticalAlign: 'middle',
              richText: hasText ? toRichText(String(shapeData.props.text)) : toRichText('')  // Set empty if no text
            };
          } else if (shapeData.type === 'arrow' && shapeData.props) {
            baseConfig.props = {
              start: shapeData.props.start || { x: 0, y: 0 },
              end: shapeData.props.end || { x: 100, y: 0 },
              arrowheadEnd: shapeData.props.arrowheadEnd || 'arrow',
              color: mapColorToTLDraw(String(shapeData.props.color || 'black')),
              size: 'm',
              dash: 'draw'
            };
          } else if (shapeData.type === 'text' && shapeData.props) {
            const fontSize = Number(shapeData.props.fontSize || 18);
            baseConfig.props = {
              size: fontSize > 24 ? 'xl' : fontSize > 18 ? 'l' : 'm',
              color: mapColorToTLDraw(String(shapeData.props.color || 'black')),
              font: shapeData.props.font || 'sans',
              w: shapeData.props.w || 300,
              autoSize: false,
              scale: 1,
              richText: hasText ? toRichText(String(shapeData.props.text)) : toRichText('')  // Set empty if no text
            };
          } else {
            baseConfig.props = shapeData.props || {};
          }
  
          // For modify action, try to find existing shape
          if (action === 'modify') {
            // const existingShapes = currentEditor.getCurrentPageShapes();
            // const existingShape = existingShapes.find(shape =>
            //   shape.type === shapeData.type &&
            //   Math.abs(shape.x - (shapeData.x || 0)) < 50 &&
            //   Math.abs(shape.y - (shapeData.y || 0)) < 50
            // );
  
            // if (existingShape) {
            //   console.log(`🔧 Updating existing shape ${index + 1}`);
            //   currentEditor.updateShape({
            //     id: existingShape.id,
            //     ...baseConfig
            //   });
            //   return;
            // }
          }
  
          // Create new shape
          // currentEditor.createShape(baseConfig);
          // console.log(`✅ Created ${shapeData.type} ${index + 1}/${shapes.length}`);
  
        } catch (error) {
          console.error(`❌ Failed to create shape ${index + 1}:`, error);
        }
      });
  
      // Zoom and save
      currentEditor.zoomToFit();
      handleWhiteboardChange(currentEditor);
      console.log('✅ All shapes and text applied!');
  
      // Clear preview immediately
      setPendingAIAction(null);
      setShowAIPreview(false);
  
    } catch (error) {
      console.error('❌ Failed to apply AI shapes:', error);
    }
  }, [currentEditor, pendingAIAction, handleWhiteboardChange]);

    const rejectAIShapes = useCallback(() => {
      setPendingAIAction(null);
      setShowAIPreview(false);

      // Clear AI action from block content
      if (updateBlock && block) {
        updateBlock(block.id, {
          content: {
            ...block.content,
            aiShapes: null,
            aiAction: null
          }
        });
      }
    }, [updateBlock, block]);

    const getHeight = () => {
      if (isFullscreen) return 'h-full';
      if (!isExpanded) return 'h-16';
      return 'h-[600px]';
    };

    const fullscreenStyles = isFullscreen ? {
      position: 'fixed' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9999,
      background: darkMode ? '#1f2937' : '#ffffff'
    } : {};
    
    return (
      <div
        ref={containerRef}
        className={`relative ${isFullscreen ? '' : 'my-6'} rounded-xl overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'
          } shadow-lg border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}
        style={fullscreenStyles}
      >
        <WhiteboardHeader
          title={whiteboardTitle}
          blockType={block?.type}
          isExpanded={isExpanded}
          isFullscreen={isFullscreen}
          isEditingTitle={isEditingTitle}
          onTitleChange={setWhiteboardTitle}
          onStartEditTitle={() => setIsEditingTitle(true)}
          onSaveTitle={handleTitleSave}
          onToggleExpand={() => setIsExpanded(!isExpanded)}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          onExport={handleExport}
          onClear={clearWhiteboard}
          darkMode={darkMode}
        />

        {isFullscreen && (
          <button
            onClick={() => setIsFullscreen(false)}
            className={`absolute bottom-19 right-4 right-4 z-20 p-3 rounded-lg transition-colors shadow-lg ${darkMode
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
              }`}
            title="Back to Canvas"
          >
            <Minimize2 size={20} />
          </button>
        )}

        {isExpanded && (
          <div className={`${getHeight()} w-full ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
            <Tldraw
              // forceMobile
              autoFocus={false}
              persistenceKey={block ? `whiteboard-${block.id}` : 'default-whiteboard'}
              onMount={(editor: Editor) => {
                setCurrentEditor(editor);

                // Load whiteboard data if available
                if (block?.content) {
                  try {
                    const { snapshot, store } = getWhiteboardSnapshotInfo(block.content);
                    if (snapshot && store) {
                      // Newer tldraw versions wrap the store in `document`; older snapshots
                      // expose it at the top level. loadSnapshot supports both formats.
                      editor.loadSnapshot(snapshot);
                    } else {
                      console.warn('Invalid whiteboard snapshot; starting with an empty board.', {
                        contentType: typeof block.content,
                        contentKeys: typeof block.content === 'object' ? Object.keys(block.content) : [],
                      });
                    }

                  } catch (error) {
                    console.error('Failed to load whiteboard snapshot:', error);
                  }
                } else {
                  // New boards have no saved snapshot yet.
                }

                // Set up change handler
                const handleChange = () => {
                  handleWhiteboardChange(editor);
                };
                editor.on('change', handleChange);

                return () => {
                  editor.off('change', handleChange);
                };
              }}
            >
              {showAIAssistant && (
                <WhiteboardAIAssistant
                  onAIRequest={handleAIRequestWithContext}
                  darkMode={darkMode}
                  isFullscreen={isFullscreen}
                  whiteboardType={block?.type || 'general'}
                  editor={currentEditor}
                />
              )}
            </Tldraw>

            {/* AI Preview Overlay - ADD THIS HERE */}
            {showAIPreview && pendingAIAction && (
              <div className="absolute inset-0 z-30 bg-black bg-opacity-50 flex items-center justify-center">
                <div className={`max-w-md p-6 rounded-lg shadow-xl ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                  } border`}>
                  <h3 className={`text-lg font-semibold mb-3 ${darkMode ? 'text-gray-200' : 'text-gray-800'
                    }`}>
                    AI Whiteboard Suggestion
                  </h3>

                  <p className={`mb-4 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'
                    }`}>
                    {pendingAIAction.explanation}
                  </p>

                  <div className={`mb-4 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                    Action: <span className="font-medium capitalize">{pendingAIAction.action}</span> •
                    Shapes: <span className="font-medium">{pendingAIAction.shapes.length}</span>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={applyAIShapes}
                      className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      Apply Changes
                    </button>
                    <button
                      onClick={rejectAIShapes}
                      className={`flex-1 px-4 py-2 rounded-lg transition-colors font-medium ${darkMode
                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!isFullscreen && isExpanded && (
          <WhiteboardFooter
            shapeCount={currentEditor?.getCurrentPageShapes().length || 0}
            darkMode={darkMode}
          />
        )}

      </div>
    );
  };

export default Whiteboard;
