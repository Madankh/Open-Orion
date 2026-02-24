import React, { useState,useCallback} from 'react';
import { Editor,TLShape } from 'tldraw';
import 'tldraw/tldraw.css';
import {QuickAction,WhiteboardContent,ShapeDescription } from '@/typings/agent';
import { 
  Sparkles, 
  Brain,
  Zap,BookOpen,Lightbulb,FileText,TrendingUp
} from 'lucide-react';


const useWhiteboardContent = (editor: Editor | null) => {
  return useCallback((): WhiteboardContent | null => {
    if (!editor) return null;
    
    // Get selected shape IDs first
    const selectedShapeIds = editor.getSelectedShapeIds();
    const hasSelection = selectedShapeIds.length > 0;
    
    // Get all shapes
    const allShapes = editor.getCurrentPageShapes();
    
    // Filter to selected shapes if there's a selection, otherwise use all
    const shapesToUse = hasSelection 
      ? allShapes.filter(shape => selectedShapeIds.includes(shape.id))
      : allShapes;
    
    const shapeDescriptions: ShapeDescription[] = shapesToUse.map((shape: TLShape) => {
      const bounds = editor.getShapePageBounds(shape);
      return {
        type: shape.type,
        id: shape.id,
        x: Math.round(bounds?.x || 0),
        y: Math.round(bounds?.y || 0),
        width: Math.round(bounds?.w || 0),
        height: Math.round(bounds?.h || 0),
        props: shape.props
      };
    });
    
    return {
      shapeCount: shapesToUse.length,
      shapes: shapeDescriptions,
      viewport: editor.getViewportPageBounds(),
      // Add selection info
      hasSelection: hasSelection,
      selectedShapeIds: selectedShapeIds,
      totalShapeCount: allShapes.length
    };
  }, [editor]);
};

const useQuickActions = (whiteboardType: string) => {
  return useCallback((): QuickAction[] => {
    const commonActions: QuickAction[] = [
      { label: 'Analyze content', prompt: 'Analyze my whiteboard content and provide insights', icon: Brain },
      { label: 'Improve layout', prompt: 'Suggest improvements for better visual organization', icon: Zap }
    ];

    const typeSpecificActions: Record<string, QuickAction[]> = { 
      education: [
        { label: 'Create study guide', prompt: 'Convert this whiteboard into a structured study guide', icon: BookOpen },
        { label: 'Add quiz questions', prompt: 'Generate quiz questions based on this content', icon: FileText },
        { label: 'Explain concepts', prompt: 'Provide detailed explanations for complex concepts on this board', icon: Lightbulb },
        { label: 'Create timeline', prompt: 'Help me organize this information into a timeline', icon: TrendingUp }
      ],
    };

    return [...commonActions, ...(typeSpecificActions[whiteboardType] || [])];
  }, [whiteboardType]);
};

const AIAssistantTabs: React.FC<{
  activeTab: "chat" | "suggestions" | "templates";
  onTabChange: (tab: "chat" | "suggestions" | "templates") => void;
  darkMode: boolean;
}> = ({ activeTab, onTabChange, darkMode }) => (
  <div className="flex mt-3 space-x-1">
    {['chat', 'suggestions', 'templates'].map((tab) => (
      <button
        key={tab}
        onClick={() => onTabChange(tab as "chat" | "suggestions" | "templates")}
        className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
          activeTab === tab
            ? darkMode ? 'bg-purple-600 text-white' : 'bg-purple-500 text-white'
            : darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-800'
        }`}
      >
        {tab.charAt(0).toUpperCase() + tab.slice(1)}
      </button>
    ))}
  </div>
);


const AIChatTab: React.FC<{
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onSubmit: () => void;
  isGenerating: boolean;
  darkMode: boolean;
  whiteboardType: string;
}> = ({ prompt, onPromptChange, onSubmit, isGenerating, darkMode, whiteboardType }) => (
  <>
    <div className="mb-4">
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder={`Ask me anything about your ${whiteboardType} whiteboard...`}
        className={`w-full px-3 py-3 text-sm border rounded-lg resize-none h-20 ${
          darkMode 
            ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400' 
            : 'bg-white border-gray-300 text-gray-800 placeholder-gray-500'
        }`}
        onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), onSubmit())}
      />
      <button
        onClick={onSubmit}
        disabled={isGenerating || !prompt.trim()}
        className={`mt-2 w-full py-3 px-4 text-sm font-medium rounded-lg transition-all ${
          isGenerating || !prompt.trim()
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600 transform hover:scale-105'
        }`}
      >
        {isGenerating ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            Analyzing...
          </div>
        ) : (
          'Ask AI Assistant'
        )}
      </button>
    </div>
  </>
);

const AISuggestionsTab: React.FC<{
  quickActions: QuickAction[];
  onActionClick: (action: QuickAction) => void;
  isGenerating: boolean;
  darkMode: boolean;
  whiteboardType: string;
}> = ({ quickActions, onActionClick, isGenerating, darkMode, whiteboardType }) => (
  <div className="space-y-2">
    <p className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'} mb-3`}>
      Quick Actions for {whiteboardType}:
    </p>
    <div className="max-h-64 overflow-y-auto space-y-2">
      {quickActions.map((action, index) => (
        <button
          key={index}
          onClick={() => onActionClick(action)}
          disabled={isGenerating}
          className={`w-full text-left p-3 rounded-lg transition-all group ${
            darkMode 
              ? 'hover:bg-gray-700 text-gray-300 border border-gray-600' 
              : 'hover:bg-gray-50 text-gray-700 border border-gray-200'
          } ${isGenerating ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'}`}
        >
          <div className="flex items-center">
            <action.icon size={16} className="mr-3 text-purple-500" />
            <span className="text-sm font-medium">{action.label}</span>
          </div>
        </button>
      ))}
    </div>
  </div>
);

const AITemplatesTab: React.FC<{
  onTemplateSelect: (template: string) => void;
  darkMode: boolean;
  whiteboardType: string;
}> = ({ onTemplateSelect, darkMode, whiteboardType }) => (
  <div className="space-y-3">
    <p className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
      Smart Templates:
    </p>
    <div className="grid grid-cols-2 gap-2">
      {['Flowchart', 'Mind Map', 'Timeline', 'Diagram'].map((template) => (
        <button
          key={template}
          onClick={() => onTemplateSelect(`Create a ${template.toLowerCase()} template for ${whiteboardType}`)}
          className={`p-3 rounded-lg border text-sm transition-all ${
            darkMode
              ? 'border-gray-600 hover:bg-gray-700 text-gray-300'
              : 'border-gray-200 hover:bg-gray-50 text-gray-700'
          }`}
        >
          {template}
        </button>
      ))}
    </div>
  </div>
);

export const WhiteboardAIAssistant: React.FC<{
  onAIRequest: (prompt: string) => Promise<void>;
  darkMode: boolean;
  isFullscreen: boolean;
  whiteboardType: string;
  editor: Editor | null;
}> = ({ onAIRequest, darkMode, isFullscreen, whiteboardType, editor }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "suggestions" | "templates">("chat");


  const getWhiteboardContent = useWhiteboardContent(editor);
  const getQuickActions = useQuickActions(whiteboardType);

const handleAIRequest = async () => {
  if (!prompt.trim()) return;
  
  setIsGenerating(true);
  try {
    const whiteboardData = getWhiteboardContent();
    
    // Build context message with selection info
    const selectionContext = whiteboardData?.hasSelection 
      ? `User has selected ${whiteboardData.selectedShapeIds.length} out of ${whiteboardData.totalShapeCount} shapes.`
      : `Working with all ${whiteboardData?.shapeCount || 0} shapes on the whiteboard.`;
    
    const contextualPrompt = `
Context: User is working on a ${whiteboardType} whiteboard.
${selectionContext}

Whiteboard content: ${JSON.stringify(whiteboardData, null, 2)}

User request: ${prompt}`;

    await onAIRequest(contextualPrompt);
    setPrompt('');
  } catch (error) {
    console.error('Orion request failed:', error);
  } finally {
    setIsGenerating(false);
  }
};

  const handleQuickAction = (action: QuickAction) => {
    setPrompt(action.prompt);
    handleAIRequest();
  };

  const quickActions = getQuickActions();

  if (!editor) return null;

  return (
    <div className={`absolute ${isFullscreen ? 'bottom-18 right-4' : 'bottom-12 right-2'} z-10`}>
      <button
        onClick={() => setShowAIPanel(!showAIPanel)}
        className={`p-3 rounded-lg transition-all duration-200 shadow-lg ${
          showAIPanel ? 'scale-105' : ''
        } ${
          darkMode 
            ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700' 
            : 'bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600'
        }`}
        title="AI Collaboration Assistant"
      >
        <Sparkles size={20} />
      </button>

      {showAIPanel && (
        <div className={`absolute right-0 bottom-full mb-2 w-96 max-h-96 overflow-hidden rounded-xl shadow-2xl border backdrop-blur-sm ${
          darkMode 
            ? 'bg-gray-800/95 border-gray-600' 
            : 'bg-white/95 border-gray-200'
        }`} style={{ transform: 'translateX(-100%) translateY(-8px)' }}>
          {/* Header */}
          <div className={`p-4 border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between">
              <h3 className={`font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                Collaborate with Orion
              </h3>
              <div className="flex items-center gap-2">
                <div className={`px-2 py-1 text-xs rounded-full ${
                  darkMode ? 'bg-purple-900 text-purple-300' : 'bg-purple-100 text-purple-700'
                }`}>
                  {whiteboardType}
                </div>
                <button
                  onClick={() => setShowAIPanel(false)}
                  className={`p-1 rounded transition-colors ${
                    darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-600'
                  }`}
                  title="Close AI Assistant"
                >
                  ×
                </button>
              </div>
            </div>
            
            <AIAssistantTabs 
              activeTab={activeTab}
              onTabChange={setActiveTab}
              darkMode={darkMode}
            />
          </div>
          
          <div className="p-4 max-h-72 overflow-y-auto">
            {activeTab === 'chat' && (
              <AIChatTab
                prompt={prompt}
                onPromptChange={setPrompt}
                onSubmit={handleAIRequest}
                isGenerating={isGenerating}
                darkMode={darkMode}
                whiteboardType={whiteboardType}
              />
            )}

            {activeTab === 'suggestions' && (
              <AISuggestionsTab
                quickActions={quickActions}
                onActionClick={handleQuickAction}
                isGenerating={isGenerating}
                darkMode={darkMode}
                whiteboardType={whiteboardType}
              />
            )}

            {activeTab === 'templates' && (
              <AITemplatesTab
                onTemplateSelect={setPrompt}
                darkMode={darkMode}
                whiteboardType={whiteboardType}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};