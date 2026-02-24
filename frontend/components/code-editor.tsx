"use client";

import type { editor } from "monaco-editor";
import { Editor, Monaco } from "@monaco-editor/react";
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  ChevronRight as ChevronRightIcon,
  Zap,
  Eye,
  EyeOff,
  CheckCircle,
  RefreshCw,
  Monitor,
  Code,
} from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { ActionStep, TAB } from "@/typings/agent";
import { Button } from "./ui/button";

const ROOT_NAME = "Curiosity_run_time";

// Color theme configuration
const colorTheme = {
  // Background colors
  primary: "#1e1e1e", 
  secondary: "#252526", 
  tertiary: "#2d2d30",  
  
  // Border colors
  border: "#3e3e42",    
  activeBorder: "#007acc",   
  
  // Text colors
  textPrimary: "#ffffff",  
  textSecondary: "#cccccc",  
  textMuted: "#969696",        
  textActive: "#007acc",       
  
  // Interactive colors
  hover: "#2a2d2e",     
  active: "#37373d",        
  focus: "#007acc",             
  
  // Accent colors
  accent: "#007acc",          
  success: "#4caf50",      
  warning: "#ff9800",          
  error: "#f44336",
  
  // Stream-specific colors
  streamBackground: "#0a2e0a",     
  streamBorder: "#2d5a2d",         
  streamText: "#90ee90",           
  staticBackground: "#1e1e1e",     
  staticBorder: "#3e3e42",
  completedStream: "#1a4d1a",      
  completedStreamBorder: "#4a7c4a", 
  
  // Preview colors
  previewBackground: "#f5f5f5",
  previewBorder: "#e0e0e0",
};

// Font theme configuration
const fontTheme = {
  code: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Consolas', 'Courier New', monospace",
  ui: "'Inter', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', sans-serif",
  editorFontSize: 14,           
  uiFontSize: 13,               
  breadcrumbFontSize: 12,       
  explorerFontSize: 13,         
  fontWeightNormal: '400',
  fontWeightMedium: '500',
  fontWeightSemibold: '600',
  fontWeightBold: '700',
  editorLineHeight: 1.4,        
  uiLineHeight: 1.5,            
  letterSpacingNormal: 0,
  letterSpacingWide: 0.025,
  letterSpacingWider: 0.05,
};

// Map file extensions to Monaco editor language IDs
const languageMap: { [key: string]: string } = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  json: "json", md: "markdown", css: "css", scss: "scss", less: "less",
  html: "html", xml: "xml", yaml: "yaml", yml: "yaml", py: "python",
  rb: "ruby", php: "php", java: "java", cpp: "cpp", c: "c", cs: "csharp",
  go: "go", rs: "rust", swift: "swift", kt: "kotlin", sql: "sql",
  sh: "shell", bash: "bash", dockerfile: "dockerfile", vue: "vue",
  svelte: "svelte", graphql: "graphql", env: "plaintext",
};

interface FileStructure {
  name: string;
  type: "file" | "folder";
  children?: FileStructure[];
  language?: string;
  value?: string;
  path: string;
}

// Enhanced file content state
interface FileContentState {
  workspaceContent: string;    
  streamContent: string;       
  finalContent: string;        
  isStreaming: boolean;        
  streamCompleted: boolean;    
  lastStreamUpdate: number;    
}

type ContentSource = 'stream' | 'workspace' | 'completed-stream' | 'none';

// New view modes
type ViewMode = 'code' | 'preview' | 'split';

interface CodeEditorProps {
  className?: string;
  currentActionData?: ActionStep;
  workspaceInfo?: string;
  workspaceId?: string;
  authToken?: string;
  activeFile?: string;
  setActiveFile?: (file: string) => void;
  filesContent?: { [filename: string]: string };
  isReplayMode?: boolean;
  isStreamingCode?: boolean;
  streamingContent?: string;
  activeTab?: TAB;
  customColors?: Partial<typeof colorTheme>;
  customFonts?: Partial<typeof fontTheme>;
}

const CodeEditor = ({
  className,
  currentActionData,
  workspaceInfo,
  workspaceId,
  authToken,
  activeFile,
  setActiveFile,
  filesContent,
  isReplayMode,
  isStreamingCode,
  streamingContent,
  activeTab,
  customColors,
  customFonts,
}: CodeEditorProps) => {
  const [activeLanguage, setActiveLanguage] = useState<string>("plaintext");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [fileStructure, setFileStructure] = useState<FileStructure[]>([]);
  const [fileContentMap, setFileContentMap] = useState<{ [path: string]: string }>({});
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // Enhanced file content management
  const [fileStates, setFileStates] = useState<{ [filePath: string]: FileContentState }>({});
  const [currentStreamingFile, setCurrentStreamingFile] = useState<string | null>(null);
  
  // New state for view management
  const [viewMode, setViewMode] = useState<ViewMode>('code');
  const [previewContent, setPreviewContent] = useState<string>("");
  const [isPreviewAutoRefresh, setIsPreviewAutoRefresh] = useState<boolean>(true);

  // Merge custom colors and fonts with default themes
  const theme = { ...colorTheme, ...customColors };
  const fonts = { ...fontTheme, ...customFonts };

  const getFileLanguage = (fileName: string): string => {
    const extension = fileName.split(".").pop()?.toLowerCase() || "";
    if (fileName.toLowerCase() === "dockerfile") {
      return languageMap["dockerfile"];
    }
    return languageMap[extension] || "plaintext";
  };

  // Check if file is HTML/web content
  const isWebFile = (filePath: string): boolean => {
    const extension = filePath.split(".").pop()?.toLowerCase() || "";
    return ['html', 'htm', 'css', 'js', 'jsx', 'vue', 'svelte'].includes(extension);
  };

  // Check if current active file should show preview
  const shouldShowPreviewOption = (): boolean => {
    return activeFile ? isWebFile(activeFile) : false;
  };
  // Generate HTML content for preview
  const generatePreviewContent = (): string => {
    if (!activeFile) return "";
    
    const fileName = activeFile.split('/').pop()?.toLowerCase() || "";
    const content = getFileDisplayContent(activeFile);
    
    if (!content) return "";

    // If it's an HTML file, return as-is
    if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
      return content;
    }
    
    // If it's CSS, wrap in a basic HTML structure
    if (fileName.endsWith('.css')) {
      return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CSS Preview</title>
    <style>
${content}
    </style>
</head>
<body>
    <div class="container">
        <h1>CSS Preview</h1>
        <p>This is a preview of your CSS styles. Add HTML elements to see the styling in action.</p>
        <div class="sample-content">
            <h2>Sample Header</h2>
            <p>This is sample paragraph text to demonstrate your CSS styles.</p>
            <button>Sample Button</button>
            <div class="box">Sample Box</div>
        </div>
    </div>
</body>
</html>`;
    }
    
    // If it's JavaScript, wrap in HTML with console output
    if (fileName.endsWith('.js') || fileName.endsWith('.jsx')) {
      return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JavaScript Preview</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
        .console { background: #000; color: #00ff00; padding: 15px; border-radius: 5px; font-family: monospace; }
        .output { margin-top: 20px; }
        h1 { color: #333; }
    </style>
</head>
<body>
    <h1>JavaScript Preview</h1>
    <div class="console" id="console">Console Output:<br></div>
    <div class="output" id="output"></div>
    
    <script>
        // Override console.log to display in our console div
        const originalLog = console.log;
        const consoleDiv = document.getElementById('console');
        const outputDiv = document.getElementById('output');
        
        console.log = function(...args) {
            originalLog.apply(console, args);
            consoleDiv.innerHTML += args.join(' ') + '<br>';
        };
        
        try {
${content}
        } catch (error) {
            consoleDiv.innerHTML += 'Error: ' + error.message + '<br>';
        }
    </script>
</body>
</html>`;
    }
    
    return content;
  };

  useEffect(() => {
    if (shouldShowPreviewOption() && (isPreviewAutoRefresh || viewMode === 'preview' || viewMode === 'split')) {
      const newContent = generatePreviewContent();
      setPreviewContent(newContent);
    }
  }, [activeFile, fileStates, isPreviewAutoRefresh, viewMode]);

  // Refresh preview manually
  const refreshPreview = () => {
    if (shouldShowPreviewOption()) {
      const newContent = generatePreviewContent();
      setPreviewContent(newContent);
    }
  };

  // Enhanced stream parsing function
  function parseStreamingContent(input: string): { filePath: string; content: string; isComplete: boolean; command?: string } | null {
    if (!input || typeof input !== 'string') {
      return null;
    }

    const pathMatch = input.match(/"path":\s*"([^"]+)"/);
    
    if (pathMatch) {
      const filePath = pathMatch[1];
      const normalizedPath = filePath.startsWith(workspaceInfo || "") 
        ? filePath 
        : `${workspaceInfo}/${filePath}`.replace(/\/+/g, '/');

      const fileTextStart = input.indexOf('"file_text": "');
      if (fileTextStart !== -1) {
        const contentStart = fileTextStart + '"file_text": "'.length;
        let contentEnd = input.length;
        
        let foundEnd = false;
        for (let i = contentStart; i < input.length - 1; i++) {
          if (input[i] === '"' && input[i-1] !== '\\') {
            const nextNonSpace = input.substring(i + 1).match(/^\s*[},]/);
            if (nextNonSpace) {
              contentEnd = i;
              foundEnd = true;
              break;
            }
          }
        }
        
        const rawContent = input.substring(contentStart, contentEnd);
        
        const displayContent = rawContent
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .replace(/\\t/g, '\t')
          .replace(/\\r/g, '\r');
        
        const isComplete = foundEnd && (
          input.includes('"status":"complete"') || 
          input.includes('"stream_complete":true') ||
          !isStreamingCode
        );
        
        const commandMatch = input.match(/"command":\s*"([^"]+)"/);
        const command = commandMatch ? commandMatch[1] : 'update';

        return { 
          filePath: normalizedPath, 
          content: displayContent, 
          isComplete, 
          command 
        };
      }
    }

    const fileMarkerMatch = input.match(/File:\s*([^\n]+)\n([\s\S]*?)(?=\nFile:|$)/);
    if (fileMarkerMatch) {
      const filePath = fileMarkerMatch[1].trim();
      const content = fileMarkerMatch[2] || "";
      const normalizedPath = filePath.startsWith(workspaceInfo || "") 
        ? filePath 
        : `${workspaceInfo}/${filePath}`.replace(/\/+/g, '/');

      return { filePath: normalizedPath, content, isComplete: !isStreamingCode, command: 'update' };
    }

    return null;
  }

  const ensureFileInStructure = (filePath: string) => {
    if (!filePath || !workspaceInfo) return;

    const relativePath = filePath.replace(workspaceInfo, '').replace(/^\/+/, '');
    const pathParts = relativePath.split('/').filter(Boolean);
    
    if (pathParts.length === 0) return;

    const fileExists = (items: FileStructure[], targetPath: string): boolean => {
      return items.some(item => {
        if (item.path === targetPath) return true;
        if (item.children) return fileExists(item.children, targetPath);
        return false;
      });
    };

    if (!fileExists(fileStructure, filePath)) {
      setFileStructure(prev => {
        const newStructure = JSON.parse(JSON.stringify(prev));
        
        let currentLevel = newStructure;
        let currentPath = workspaceInfo;
        
        for (let i = 0; i < pathParts.length - 1; i++) {
          const folderName = pathParts[i];
          currentPath = `${currentPath}/${folderName}`;
          
          let folder = currentLevel.find((item: FileStructure) => 
            item.name === folderName && item.type === 'folder'
          );
          
          if (!folder) {
            folder = {
              name: folderName,
              type: 'folder',
              path: currentPath,
              children: []
            };
            currentLevel.push(folder);
          }
          
          currentLevel = folder.children!;
        }
        
        const fileName = pathParts[pathParts.length - 1];
        const newFile: FileStructure = {
          name: fileName,
          type: 'file',
          path: filePath,
          language: getFileLanguage(fileName),
          value: ''
        };
        
        currentLevel.push(newFile);
        
        return newStructure;
      });

      let currentPath = workspaceInfo;
      const foldersToExpand = new Set<string>();
      
      for (let i = 0; i < pathParts.length - 1; i++) {
        currentPath = `${currentPath}/${pathParts[i]}`;
        foldersToExpand.add(currentPath);
      }
      
      setExpandedFolders(prev => new Set([...prev, ...foldersToExpand]));
    }
  };

  // Process streaming content and update file states
  useEffect(() => {
    if (!isStreamingCode || !streamingContent) {
      if (currentStreamingFile && fileStates[currentStreamingFile]?.isStreaming) {
        setFileStates(prev => {
          const newStates = { ...prev };
          if (newStates[currentStreamingFile]) {
            newStates[currentStreamingFile] = {
              ...newStates[currentStreamingFile],
              isStreaming: false,
              streamCompleted: true,
              finalContent: newStates[currentStreamingFile].streamContent,
            };
          }
          return newStates;
        });
        setCurrentStreamingFile(null);
      }
      return;
    }

    const parsed = parseStreamingContent(streamingContent);
    if (!parsed) {
      return;
    }

    const { filePath, content, isComplete, command } = parsed;
    
    if (!content && !isComplete) {
      return;
    }
    
    ensureFileInStructure(filePath);

    setFileStates(prev => {
      const newStates = { ...prev };
      
      const currentState = newStates[filePath] || {
        workspaceContent: fileContentMap[filePath] || "",
        streamContent: "",
        finalContent: fileContentMap[filePath] || "",
        isStreaming: false,
        streamCompleted: false,
        lastStreamUpdate: 0,
      };

      newStates[filePath] = {
        ...currentState,
        streamContent: content,
        isStreaming: !isComplete,
        streamCompleted: isComplete,
        finalContent: isComplete ? content : currentState.finalContent,
        lastStreamUpdate: Date.now(),
      };

      return newStates;
    });

    if (!isComplete) {
      setCurrentStreamingFile(filePath);
      
      if (!activeFile || (command === 'create' && activeFile !== filePath)) {
        setActiveFile?.(filePath);
      }
    } else if (currentStreamingFile === filePath) {
      setCurrentStreamingFile(null);
    }

    if (activeFile === filePath && editorRef.current && content) {
      const currentValue = editorRef.current.getValue();
      if (content !== currentValue) {
        editorRef.current.setValue(content);
      }
    }

  }, [isStreamingCode, streamingContent, activeFile, currentStreamingFile, fileContentMap, workspaceInfo]);

  // Rest of the existing functions (loadDirectory, loadFileContent, etc.)
  const loadDirectory = async (path: string, workspaceId: string, authToken?: string) => {
    try {
      if (!workspaceId) {
        throw new Error("Workspace ID is required");
      }
      const response = await fetch("/api/files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken && { "Authorization": authToken }),
        },
        body: JSON.stringify({ path, workspaceId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to load directory: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const files = data.files || [];
      
      setFileStructure(files);
      setExpandedFolders(new Set([path]));
      
      const contentMap: { [path: string]: string } = {};
      const allFileStates: { [path: string]: FileContentState } = {};
      
      const extractContent = (items: FileStructure[]) => {
        items.forEach(item => {
          if (item.type === "file") {
            const fileContent = item.value || "";
            contentMap[item.path] = fileContent;
            
            allFileStates[item.path] = {
              workspaceContent: fileContent,
              streamContent: "",
              finalContent: fileContent,
              isStreaming: false,
              streamCompleted: false,
              lastStreamUpdate: 0,
            };
          }
          if (item.children) {
            extractContent(item.children);
          }
        });
      };
      
      extractContent(files);
      setFileContentMap(contentMap);
      
      setFileStates(prev => {
        const newStates = { ...allFileStates };
        
        Object.keys(prev).forEach(filePath => {
          if (prev[filePath].isStreaming || prev[filePath].streamCompleted) {
            if (!allFileStates[filePath]) {
              newStates[filePath] = prev[filePath];
            }
          }
        });
        
        return newStates;
      });
      
      
    } catch (error) {
      console.error("Error loading directory:", error);
      setFileStructure([]);
    }
  };

  const loadFileContent = async (filePath: string, workspaceId: string, authToken?: string): Promise<string> => {
    try {
      if (!workspaceId) {
        throw new Error("Workspace ID is required");
      }

      const response = await fetch("/api/files/content", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken && { "Authorization": authToken }),
        },
        body: JSON.stringify({ path: filePath, workspaceId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to load file content: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      return data.content || "";
    } catch (error) {
      console.error("Error loading file:", error);
      return "";
    }
  };

  useEffect(() => {
    if (workspaceInfo && workspaceId && activeTab === TAB.CODE) {
      const loadTimeout = setTimeout(() => {
        loadDirectory(workspaceInfo, workspaceId, authToken);
      }, 100);
      
      return () => clearTimeout(loadTimeout);
    }
  }, [currentActionData, workspaceInfo, workspaceId, authToken, activeTab]);

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  // Get content source for a file
  const getFileContentSource = (filePath: string): ContentSource => {
    const state = fileStates[filePath];
    if (!state) return 'none';
    
    if (state.isStreaming) return 'stream';
    if (state.streamCompleted) return 'completed-stream';
    if (state.workspaceContent) return 'workspace';
    return 'none';
  };

  // Get display content for a file
  const getFileDisplayContent = (filePath: string): string => {
    const state = fileStates[filePath];
    if (!state) return "";
    
    if (state.isStreaming && state.streamContent) {
      return state.streamContent;
    }
    
    if (state.streamCompleted && state.finalContent) {
      return state.finalContent;
    }
    
    return state.workspaceContent || "";
  };

  // Enhanced breadcrumb with view mode controls
  const renderBreadcrumb = () => {
    if (!activeFile || !workspaceInfo) return null;

    const relativePath = activeFile.replace(workspaceInfo, "");
    const parts = relativePath.split("/").filter(Boolean);
    const fileName = parts[parts.length - 1];
    const folderName = ROOT_NAME;
    const contentSource = getFileContentSource(activeFile);
    const fileState = fileStates[activeFile];
    const showPreview = shouldShowPreviewOption();

    const getSourceLabel = () => {
      switch (contentSource) {
        case 'stream':
          return `Live Streaming: ${fileName}`;
        case 'completed-stream':
          return `Stream Complete: ${fileName}`;
        case 'workspace':
          return `Workspace: ${fileName}`;
        default:
          return fileName;
      }
    };

    const getBreadcrumbStyle = () => {
      switch (contentSource) {
        case 'stream':
          return {
            backgroundColor: theme.streamBackground,
            borderColor: theme.streamBorder,
          };
        case 'completed-stream':
          return {
            backgroundColor: theme.completedStream,
            borderColor: theme.completedStreamBorder,
          };
        default:
          return {
            backgroundColor: theme.tertiary,
            borderColor: theme.border,
          };
      }
    };

    return (
      <div 
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ 
          ...getBreadcrumbStyle(),
          color: theme.textMuted,
          fontFamily: fonts.ui,
          fontSize: `${fonts.breadcrumbFontSize}px`,
          fontWeight: fonts.fontWeightNormal,
          lineHeight: fonts.uiLineHeight,
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: theme.textMuted }}>{folderName}</span>
          <ChevronRightIcon className="h-4 w-4" />
          <span style={{ 
            color: contentSource === 'stream' ? theme.streamText : theme.textPrimary,
            fontWeight: fonts.fontWeightMedium 
          }}>
            {getSourceLabel()}
          </span>
          {fileState?.isStreaming && (
            <div className="flex items-center gap-1 ml-2">
              <div 
                className="w-2 h-2 rounded-full"
                style={{ 
                  backgroundColor: theme.streamText,
                  animation: 'pulse 1s infinite'
                }}
              />
              <span style={{ 
                color: theme.streamText,
                fontSize: '11px',
              }}>
                Streaming content...
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {showPreview && (
            <div className="flex items-center gap-1" style={{ borderLeft: `1px solid ${theme.border}`, paddingLeft: '12px' }}>
              <Button
                size="sm"
                variant={viewMode === 'code' ? 'default' : 'ghost'}
                onClick={() => setViewMode('code')}
                className="h-6 px-2 font-sans" // Changed from font-mono to font-sans
                style={{
                  backgroundColor: viewMode === 'code' ? theme.accent : 'transparent',
                  color: viewMode === 'code' ? '#ffffff' : theme.textMuted,
                  fontSize: '11px',
                  fontFamily: 'Inter, system-ui, sans-serif', // Custom font family
                  fontWeight: '500', // Medium weight
                }}
              >
                <Code className="h-3 w-3 mr-1" />
                Code
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'preview' ? 'default' : 'ghost'}
                onClick={() => setViewMode('preview')}
                className="h-6 px-2 font-sans" // Changed from font-mono to font-sans
                style={{
                  backgroundColor: viewMode === 'preview' ? theme.accent : 'transparent',
                  color: viewMode === 'preview' ? '#ffffff' : theme.textMuted,
                  fontSize: '11px',
                  fontFamily: 'Inter, system-ui, sans-serif', // Custom font family
                  fontWeight: '500', // Medium weight
                }}
              >
                <Monitor className="h-3 w-3 mr-1" />
                Preview
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'split' ? 'default' : 'ghost'}
                onClick={() => setViewMode('split')}
                className="h-6 px-2 font-sans" // Changed from font-mono to font-sans
                style={{
                  backgroundColor: viewMode === 'split' ? theme.accent : 'transparent',
                  color: viewMode === 'split' ? '#ffffff' : theme.textMuted,
                  fontSize: '11px',
                  fontFamily: 'Inter, system-ui, sans-serif', // Custom font family
                  fontWeight: '500', // Medium weight
                }}
              >
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-current mr-1" style={{ opacity: 0.7 }} />
                  <div className="w-2 h-2 bg-current" style={{ opacity: 0.7 }} />
                </div>
                Split
              </Button>
                                 
              {/* Preview Controls */}
              <div className="flex items-center gap-1 ml-2" style={{ borderLeft: `1px solid ${theme.border}`, paddingLeft: '8px' }}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={refreshPreview}
                  className="h-6 px-2 font-sans" // Changed from font-mono to font-sans
                  style={{
                    color: theme.textMuted,
                    fontSize: '11px',
                    fontFamily: 'Inter, system-ui, sans-serif', // Custom font family
                    fontWeight: '500', // Medium weight
                  }}
                  title="Refresh Preview"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsPreviewAutoRefresh(!isPreviewAutoRefresh)}
                  className="h-6 px-2 font-sans" // Changed from font-mono to font-sans
                  style={{
                    color: isPreviewAutoRefresh ? theme.accent : theme.textMuted,
                    fontSize: '11px',
                    fontFamily: 'Inter, system-ui, sans-serif', // Custom font family
                    fontWeight: '500', // Medium weight
                  }}
                  title={isPreviewAutoRefresh ? "Disable Auto Refresh" : "Enable Auto Refresh"}
                >
                  {isPreviewAutoRefresh ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          )}

          {contentSource === 'stream' && (
            <div 
              className="text-xs px-2 py-1 rounded"
              style={{
                backgroundColor: theme.streamBorder,
                color: theme.streamText,
              }}
            >
              LIVE
            </div>
          )}
        </div>
      </div>
    );
  };

useEffect(() => {
  const loadContent = async () => {
    if (!activeFile) {
      setActiveLanguage("plaintext");
      return;
    }

    const filePath = activeFile.startsWith(workspaceInfo || "") ? activeFile : `${workspaceInfo}/${activeFile}`;
    setActiveLanguage(getFileLanguage(filePath));

    const existingState = fileStates[activeFile];
    
    // Skip loading if we already have streaming content
    if (existingState?.isStreaming || existingState?.streamCompleted) {
      return;
    }

    let workspaceContent = "";
    
    if (isReplayMode && filesContent) {
      // In replay mode, try multiple path variations to find the content
      const pathVariations = [
        activeFile,                    // exact path
        filePath,                      // with workspace prefix
        activeFile.replace(workspaceInfo || "", "").replace(/^\/+/, ""), // relative path
        activeFile.split('/').pop() || activeFile, // just filename
      ];
      
      for (const pathVariation of pathVariations) {
        if (filesContent[pathVariation]) {
          workspaceContent = filesContent[pathVariation];
          break;
        }
      }
      
      if (!workspaceContent) {
      }
    } else if (fileContentMap[activeFile]) {
      workspaceContent = fileContentMap[activeFile];
    } else if (workspaceId && !isReplayMode) {
      try {
        workspaceContent = await loadFileContent(filePath, workspaceId, authToken);
      } catch (error) {
        console.error("❌ Error loading file content:", error);
      }
    }

    // Always update the file state, even if content is empty
    setFileStates(prev => {
      const newState = {
        workspaceContent,
        streamContent: existingState?.streamContent || "",
        finalContent: existingState?.finalContent || workspaceContent,
        isStreaming: existingState?.isStreaming || false,
        streamCompleted: existingState?.streamCompleted || false,
        lastStreamUpdate: existingState?.lastStreamUpdate || 0,
      };
       
      return {
        ...prev,
        [activeFile]: newState
      };
    });

    // Force editor update after a short delay to ensure state is updated
    setTimeout(() => {
      if (editorRef.current && activeFile === activeFile) {
        const displayContent = workspaceContent || "";
        editorRef.current.setValue(displayContent);
      }
    }, 50);
  };

  loadContent();
}, [activeFile, workspaceInfo, workspaceId, authToken, filesContent, fileContentMap, isReplayMode]);


useEffect(() => {
  if (activeFile && editorRef.current) {
    const content = getFileDisplayContent(activeFile);
    const currentValue = editorRef.current.getValue();
    
    
    if (content !== currentValue) {
      editorRef.current.setValue(content);
      
      if (monacoRef.current) {
        monacoRef.current.editor.setTheme(getEditorTheme());
      }
    }
  }
}, [activeFile, fileStates]);

  const renderFileTree = (items: FileStructure[]) => {

    const sortedItems = [...items].sort((a, b) => {
      if (a.type === b.type) {
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      }
      return a.type === "folder" ? -1 : 1;
    });

    return sortedItems.map((item) => {
      const fullPath = item.path;
      const fileState = fileStates[fullPath];

      if (item.type === "folder") {
        const isExpanded = expandedFolders.has(fullPath);
        return (
          <div key={fullPath}>
            <Button
              className="flex items-center gap-2 w-full px-2 py-1 text-left justify-start"
              style={{
                backgroundColor: 'transparent',
                color: theme.textSecondary,
                border: 'none',
                fontFamily: fonts.ui,
                fontSize: `${fonts.explorerFontSize}px`,
                fontWeight: fonts.fontWeightNormal,
                lineHeight: fonts.uiLineHeight,
                letterSpacing: fonts.letterSpacingNormal,
              }}
              onClick={() => toggleFolder(fullPath)}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.hover; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <Folder className="h-4 w-4" style={{ color: theme.accent }} />
              {item.name}
            </Button>
            {isExpanded && item.children && (
              <div className="ml-4">{renderFileTree(item.children)}</div>
            )}
          </div>
        );
      }

      const isActive = activeFile === fullPath;
      const contentSource = getFileContentSource(fullPath);
      const isWebFile_ = isWebFile(fullPath);
      
      const getFileStyle = () => {
        if (!isActive) return { backgroundColor: 'transparent', color: theme.textSecondary };
        
        switch (contentSource) {
          case 'stream':
            return { 
              backgroundColor: theme.streamBackground, 
              color: theme.streamText,
              borderLeft: `3px solid ${theme.streamBorder}`
            };
          case 'completed-stream':
            return { 
              backgroundColor: theme.completedStream, 
              color: theme.success,
              borderLeft: `3px solid ${theme.completedStreamBorder}`
            };
          default:
            return { 
              backgroundColor: theme.active, 
              color: theme.textActive,
              borderLeft: `3px solid ${theme.activeBorder}`
            };
        }
      };

      const getStatusIcon = () => {
        if (fileState?.isStreaming) {
          return <Zap className="h-3 w-3 ml-auto" style={{ color: theme.streamText, animation: 'pulse 2s infinite' }} />;
        }
        if (fileState?.streamCompleted) {
          return <CheckCircle className="h-3 w-3 ml-auto" style={{ color: theme.success }} />;
        }
        if (isWebFile_ && isActive) {
          return <Monitor className="h-3 w-3 ml-auto" style={{ color: theme.accent }} />;
        }
        return null;
      };
      
      return (
        <Button
          key={fullPath}
          className="flex items-center gap-2 w-full px-2 py-1 text-left justify-start"
          style={{
            ...getFileStyle(),
            border: 'none',
            borderLeft: isActive ? getFileStyle().borderLeft : '3px solid transparent',
            fontFamily: fonts.ui,
            fontSize: `${fonts.explorerFontSize}px`,
            fontWeight: isActive ? fonts.fontWeightMedium : fonts.fontWeightNormal,
            lineHeight: fonts.uiLineHeight,
            letterSpacing: fonts.letterSpacingNormal,
          }}
          onClick={() => {
            setActiveFile?.(fullPath);
            // Auto-switch to preview for HTML files
            if (isWebFile(fullPath) && viewMode === 'code') {
              setViewMode('split');
            }
          }}
          onMouseEnter={(e) => {
            if (!isActive) { e.currentTarget.style.backgroundColor = theme.hover; }
          }}
          onMouseLeave={(e) => {
            if (!isActive) { e.currentTarget.style.backgroundColor = 'transparent'; }
          }}
        >
          <File className="h-4 w-4" style={{ color: theme.textMuted }} />
          {item.name}
          {getStatusIcon()}
        </Button>
      );
    });
  };

  // Get editor content for active file
  const getEditorContent = (): string => {
    if (!activeFile) return "";
    return getFileDisplayContent(activeFile);
  };

  // Get editor theme based on content source
  const getEditorTheme = (): string => {
    if (!activeFile) return 'custom-dark';
    const contentSource = getFileContentSource(activeFile);
    
    switch (contentSource) {
      case 'stream':
        return 'stream-theme';
      case 'completed-stream':
        return 'completed-stream-theme';
      default:
        return 'custom-dark';
    }
  };

  // Update editor when active file content changes
  useEffect(() => {
    if (activeFile && editorRef.current) {
      const content = getEditorContent();
      const currentValue = editorRef.current.getValue();
      
      if (content !== currentValue) {
        editorRef.current.setValue(content);
        
        if (monacoRef.current) {
          monacoRef.current.editor.setTheme(getEditorTheme());
        }
      }
    }
  }, [activeFile, fileStates]);

  // Render the main content area based on view mode
  const renderMainContent = () => {
    const showCode = viewMode === 'code' || viewMode === 'split';
    const showPreview = (viewMode === 'preview' || viewMode === 'split') && shouldShowPreviewOption();

    if (viewMode === 'split') {
      return (
        <div className="flex flex-1 h-full">
          {/* Code Editor */}
          <div className="flex-1 flex flex-col" style={{ borderRight: `1px solid ${theme.border}` }}>
            <Editor
              theme={getEditorTheme()}
              language={activeLanguage}
              height="100%"
              value={getEditorContent()}
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                readOnly: activeFile ? (fileStates[activeFile]?.isStreaming || false) : false,
                theme: getEditorTheme(),
                fontFamily: fonts.code,
                fontSize: fonts.editorFontSize,
                lineHeight: fonts.editorLineHeight,
                fontWeight: fonts.fontWeightNormal,
                letterSpacing: fonts.letterSpacingNormal,
                fontLigatures: true,
                renderLineHighlight: 'gutter',
                cursorBlinking: activeFile && fileStates[activeFile]?.isStreaming ? 'solid' : 'smooth',
                cursorSmoothCaretAnimation: activeFile && fileStates[activeFile]?.isStreaming ? 'off' : 'on',
              }}
              beforeMount={(monaco) => {
                monacoRef.current = monaco;
                
                // Define themes
                monaco.editor.defineTheme('custom-dark', {
                  base: 'vs-dark',
                  inherit: true,
                  rules: [
                    { token: 'comment', foreground: theme.textMuted.replace('#', '') },
                    { token: 'keyword', foreground: theme.accent.replace('#', '') },
                    { token: 'string', foreground: theme.success.replace('#', '') },
                    { token: 'number', foreground: theme.warning.replace('#', '') },
                  ],
                  colors: {
                    'editor.background': theme.staticBackground,
                    'editor.foreground': theme.textPrimary,
                    'editor.lineHighlightBackground': theme.hover,
                    'editor.selectionBackground': theme.active,
                    'editorLineNumber.foreground': theme.textMuted,
                    'editorLineNumber.activeForeground': theme.textActive,
                  }
                });

                monaco.editor.defineTheme('stream-theme', {
                  base: 'vs-dark',
                  inherit: true,
                  rules: [
                    { token: 'comment', foreground: theme.textMuted.replace('#', '') },
                    { token: 'keyword', foreground: theme.streamText.replace('#', '') },
                    { token: 'string', foreground: theme.success.replace('#', '') },
                    { token: 'number', foreground: theme.warning.replace('#', '') },
                  ],
                  colors: {
                    'editor.background': theme.streamBackground,
                    'editor.foreground': theme.streamText,
                    'editor.lineHighlightBackground': theme.streamBorder,
                    'editor.selectionBackground': theme.streamBorder,
                    'editorLineNumber.foreground': theme.textMuted,
                    'editorLineNumber.activeForeground': theme.streamText,
                    'editorGutter.background': theme.streamBackground,
                  }
                });

                monaco.editor.defineTheme('completed-stream-theme', {
                  base: 'vs-dark',
                  inherit: true,
                  rules: [
                    { token: 'comment', foreground: theme.textMuted.replace('#', '') },
                    { token: 'keyword', foreground: theme.success.replace('#', '') },
                    { token: 'string', foreground: theme.success.replace('#', '') },
                    { token: 'number', foreground: theme.warning.replace('#', '') },
                  ],
                  colors: {
                    'editor.background': theme.completedStream,
                    'editor.foreground': theme.success,
                    'editor.lineHighlightBackground': theme.completedStreamBorder,
                    'editor.selectionBackground': theme.completedStreamBorder,
                    'editorLineNumber.foreground': theme.textMuted,
                    'editorLineNumber.activeForeground': theme.success,
                    'editorGutter.background': theme.completedStream,
                  }
                });
              }}
              onMount={(editor) => {
                editorRef.current = editor;
                if (monacoRef.current) {
                  monacoRef.current.editor.setTheme(getEditorTheme());
                }
              }}
            />
          </div>

          {/* Live Preview */}
          <div className="flex-1 flex flex-col">
            <div 
              className="px-3 py-2 border-b text-sm font-medium"
              style={{ 
                backgroundColor: theme.previewBackground,
                borderColor: theme.previewBorder,
                color: '#333333',
                fontFamily: fonts.ui,
              }}
            >
              Live Preview
            </div>
            <iframe
              ref={iframeRef}
              sandbox="allow-scripts allow-same-origin allow-modals allow-forms"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                backgroundColor: '#ffffff',
              }}
              srcDoc={previewContent}
              title="Live Preview"
            />
          </div>
        </div>
      );
    }

    if (showPreview && !showCode) {
      return (
        <div className="flex-1 flex flex-col">
          <div 
            className="px-3 py-2 border-b text-sm font-medium"
            style={{ 
              backgroundColor: theme.previewBackground,
              borderColor: theme.previewBorder,
              color: '#333333',
              fontFamily: fonts.ui,
            }}
          >
            Live Preview
          </div>
          <iframe
            ref={iframeRef}
            sandbox="allow-scripts allow-same-origin allow-modals allow-forms"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              backgroundColor: '#ffffff',
            }}
            srcDoc={previewContent}
            title="Live Preview"
          />
        </div>
      );
    }

    // Default code view
    return (
      <div className="flex-1 flex flex-col">
        <Editor
          theme={getEditorTheme()}
          language={activeLanguage}
          height="100%"
          value={getEditorContent()}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            readOnly: activeFile ? (fileStates[activeFile]?.isStreaming || false) : false,
            theme: getEditorTheme(),
            fontFamily: fonts.code,
            fontSize: fonts.editorFontSize,
            lineHeight: fonts.editorLineHeight,
            fontWeight: fonts.fontWeightNormal,
            letterSpacing: fonts.letterSpacingNormal,
            fontLigatures: true,
            renderLineHighlight: 'gutter',
            cursorBlinking: activeFile && fileStates[activeFile]?.isStreaming ? 'solid' : 'smooth',
            cursorSmoothCaretAnimation: activeFile && fileStates[activeFile]?.isStreaming ? 'off' : 'on',
          }}
          beforeMount={(monaco) => {
            monacoRef.current = monaco;
            
            // Define themes (same as above)
            monaco.editor.defineTheme('custom-dark', {
              base: 'vs-dark',
              inherit: true,
              rules: [
                { token: 'comment', foreground: theme.textMuted.replace('#', '') },
                { token: 'keyword', foreground: theme.accent.replace('#', '') },
                { token: 'string', foreground: theme.success.replace('#', '') },
                { token: 'number', foreground: theme.warning.replace('#', '') },
              ],
              colors: {
                'editor.background': theme.staticBackground,
                'editor.foreground': theme.textPrimary,
                'editor.lineHighlightBackground': theme.hover,
                'editor.selectionBackground': theme.active,
                'editorLineNumber.foreground': theme.textMuted,
                'editorLineNumber.activeForeground': theme.textActive,
              }
            });

            monaco.editor.defineTheme('stream-theme', {
              base: 'vs-dark',
              inherit: true,
              rules: [
                { token: 'comment', foreground: theme.textMuted.replace('#', '') },
                { token: 'keyword', foreground: theme.streamText.replace('#', '') },
                { token: 'string', foreground: theme.success.replace('#', '') },
                { token: 'number', foreground: theme.warning.replace('#', '') },
              ],
              colors: {
                'editor.background': theme.streamBackground,
                'editor.foreground': theme.streamText,
                'editor.lineHighlightBackground': theme.streamBorder,
                'editor.selectionBackground': theme.streamBorder,
                'editorLineNumber.foreground': theme.textMuted,
                'editorLineNumber.activeForeground': theme.streamText,
                'editorGutter.background': theme.streamBackground,
              }
            });

            monaco.editor.defineTheme('completed-stream-theme', {
              base: 'vs-dark',
              inherit: true,
              rules: [
                { token: 'comment', foreground: theme.textMuted.replace('#', '') },
                { token: 'keyword', foreground: theme.success.replace('#', '') },
                { token: 'string', foreground: theme.success.replace('#', '') },
                { token: 'number', foreground: theme.warning.replace('#', '') },
              ],
              colors: {
                'editor.background': theme.completedStream,
                'editor.foreground': theme.success,
                'editor.lineHighlightBackground': theme.completedStreamBorder,
                'editor.selectionBackground': theme.completedStreamBorder,
                'editorLineNumber.foreground': theme.textMuted,
                'editorLineNumber.activeForeground': theme.success,
                'editorGutter.background': theme.completedStream,
              }
            });
          }}
          onMount={(editor) => {
            editorRef.current = editor;
            if (monacoRef.current) {
              monacoRef.current.editor.setTheme(getEditorTheme());
            }
          }}
        />
      </div>
    );
  };

  return (
    <div
      className={`flex flex-col h-[calc(100vh-178px)] rounded-xl shadow-sm overflow-hidden ${className}`}
      style={{ 
        backgroundColor: theme.primary,
        border: `1px solid ${theme.border}` 
      }}
    >
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
      
      <div className="flex flex-1 h-full">
        {/* File Explorer */}
        <div 
          className="w-64 flex flex-col"
          style={{ 
            backgroundColor: theme.secondary,
            borderRight: `1px solid ${theme.border}` 
          }}
        >
          <div 
            className="px-3 py-1 font-medium border-b"
            style={{ 
              color: theme.textMuted,
              borderColor: theme.border,
              fontFamily: fonts.ui,
              fontSize: `${fonts.uiFontSize}px`,
              fontWeight: fonts.fontWeightMedium,
              lineHeight: fonts.uiLineHeight,
              letterSpacing: fonts.letterSpacingNormal,
            }}
          >
            {ROOT_NAME}
          </div>
          <div className="overflow-y-auto flex-1">
            {renderFileTree(fileStructure)}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {renderBreadcrumb()}
          {renderMainContent()}
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;