import React, {useRef, useEffect } from 'react';
import { 
  Maximize2, 
  Minimize2, 
  Download, 
  MessageSquare, 
  Edit3, 
  Save, 
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const WhiteboardTitle: React.FC<{
  title: string;
  isEditing: boolean;
  onTitleChange: (title: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  darkMode: boolean;
}> = ({ title, isEditing, onTitleChange, onStartEdit, onSave, darkMode }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        onBlur={onSave}
        onKeyPress={(e) => e.key === 'Enter' && onSave()}
        className={`px-3 py-1 text-center font-medium rounded border ${
          darkMode 
            ? 'bg-gray-700 border-gray-600 text-gray-200' 
            : 'bg-white border-gray-300 text-gray-800'
        }`}
        maxLength={50}
      />
    );
  }

  return (
    <button
      onClick={onStartEdit}
      className={`px-3 py-1 font-medium rounded hover:bg-opacity-50 transition-colors flex items-center gap-2 ${
        darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
      }`}
      title="Click to edit title"
    >
      {title}
      <Edit3 size={14} />
    </button>
  );
};

const WhiteboardControls: React.FC<{
  isExpanded: boolean;
  isFullscreen: boolean;
  onToggleExpand: () => void;
  onToggleFullscreen: () => void;
  onExport: () => void;
  onClear: () => void;
  darkMode: boolean;
}> = ({ 
  isExpanded, 
  isFullscreen, 
  onToggleExpand, 
  onToggleFullscreen, 
  onExport, 
  darkMode 
}) => {
  const buttonClass = `p-2 rounded-lg transition-colors ${
    darkMode 
      ? 'hover:bg-gray-700 text-gray-400' 
      : 'hover:bg-gray-200 text-gray-600'
  }`;

  const clearButtonClass = `p-2 rounded-lg transition-colors ${
    darkMode 
      ? 'hover:bg-gray-700 text-red-400' 
      : 'hover:bg-gray-200 text-red-600'
  }`;

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onToggleExpand}
        className={buttonClass}
        title={isExpanded ? 'Collapse whiteboard' : 'Expand whiteboard'}
      >
        {isExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
      
      <button
        onClick={onToggleFullscreen}
        className={buttonClass}
        title="Toggle fullscreen"
      >
        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>

      {isExpanded && (
        <>
          <button
            onClick={onExport}
            className={buttonClass}
            title="Export as image"
          >
            <Download size={16} />
          </button>
          
          <button
            className={clearButtonClass}
            title="Clear whiteboard"
          >
          </button>
        </>
      )}
    </div>
  );
};

export const WhiteboardHeader: React.FC<{
  title: string;
  blockType?: string;
  isExpanded: boolean;
  isFullscreen: boolean;
  isEditingTitle: boolean;
  onTitleChange: (title: string) => void;
  onStartEditTitle: () => void;
  onSaveTitle: () => void;
  onToggleExpand: () => void;
  onToggleFullscreen: () => void;
  onExport: () => void;
  onClear: () => void;
  darkMode: boolean;
}> = ({
  title,
  blockType,
  isExpanded,
  isFullscreen,
  isEditingTitle,
  onTitleChange,
  onStartEditTitle,
  onSaveTitle,
  onToggleExpand,
  onToggleFullscreen,
  onExport,
  onClear,
  darkMode
}) => (
  <div className={`flex items-center justify-between px-4 py-3 border-b ${
    darkMode 
      ? 'bg-gray-800 border-gray-600 text-gray-300' 
      : 'bg-gray-50 border-gray-200 text-gray-700'
  }`}>
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <MessageSquare size={18} className="text-purple-500" />
        <span className="text-sm font-medium">Whiteboard</span>
        {blockType && (
          <span className={`px-2 py-1 text-xs rounded-full ${
            darkMode ? 'bg-purple-900 text-purple-300' : 'bg-purple-100 text-purple-700'
          }`}>
            {blockType}
          </span>
        )}
      </div>
    </div>

    <div className="flex-1 flex justify-center">
      <WhiteboardTitle
        title={title}
        isEditing={isEditingTitle}
        onTitleChange={onTitleChange}
        onStartEdit={onStartEditTitle}
        onSave={onSaveTitle}
        darkMode={darkMode}
      />
    </div>
    
    <WhiteboardControls
      isExpanded={isExpanded}
      isFullscreen={isFullscreen}
      onToggleExpand={onToggleExpand}
      onToggleFullscreen={onToggleFullscreen}
      onExport={onExport}
      onClear={onClear}
      darkMode={darkMode}
    />
  </div>
);

export const WhiteboardFooter: React.FC<{
  shapeCount: number;
  darkMode: boolean;
}> = ({ shapeCount, darkMode }) => (
  <div className={`px-4 py-2 text-xs border-t ${
    darkMode 
      ? 'text-gray-500 border-gray-700 bg-gray-800' 
      : 'text-gray-500 border-gray-200 bg-gray-50'
  }`}>
    <div className="flex items-center justify-between">
      <span>💡 Use the AI assistant for smart suggestions and collaboration</span>
      <div className="flex items-center gap-4">
        <span>Shapes: {shapeCount}</span>
        <span className="flex items-center gap-1">
          <Save size={12} />
          Auto-saved
        </span>
      </div>
    </div>
  </div>
);
