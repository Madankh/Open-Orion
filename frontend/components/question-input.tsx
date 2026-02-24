import { motion } from "framer-motion";
import { ArrowUp, Loader2, Paperclip, X, Bot, Square, Cpu, Brain, FileText, ImageIcon, VideoIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { useState, useEffect, useRef } from "react";
import { getFileIconAndColor } from "@/utils/file-utils";
import {UploadedResource} from '@/typings/agent'
import { useResources } from '../components/NoteBlocks/context/Resource';
interface FileUploadStatus {
  name: string;
  loading: boolean;
  error?: string;
  preview?: string;
  isImage: boolean;
}

interface LLMModel {
  id: string;
  name: string;
  provider: string;
  description?: string;
  icon?: string;
}

interface AgentMode {
  id: 'general' | 'normal'|'student';
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  color: string;
}
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

interface QuestionInputProps {
  className?: string;
  textareaClassName?: string;
  placeholder?: string;
  value: string;
  setValue: (value: string) => void;
  handleCancel?: () => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (question: string, modelToUse: string, mode: string,referencedResources: UploadedResource[]) => void; // Updated to include mode
  handleFileUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploading?: boolean;
  isUseDeepResearch?: boolean;
  setIsUseDeepResearch?: (value: boolean) => void;
  isDisabled?: boolean;
  isGeneratingPrompt?: boolean;
  handleEnhancePrompt?: () => void;
  availableModels?: LLMModel[];
  freeavailableModels?: LLMModel[];
  paiddModels?:LLMModel[];
  selectedModel?: LLMModel;
  onModelSelect?: (model: LLMModel) => void;
  selectedMode?: AgentMode;
  onModeSelect?: (mode: AgentMode) => void;
  isProcessing?: boolean;
  UserPlanID?: string;
  onAgentModeChange?: (mode: string, type: string) => void;
  currentAgentMode?: string;
  currentAgentType?: string;
  onModelChange?: (modelId: string) => void;  
  currentModel?: string;                    
  userinfo?:UserInfo;
}

const defaultModels: LLMModel[] = [
  {id: "z-ai/glm-4.5-air:free", name: "Z-ai", provider: "z-ai/glm-4.5-air:free", description: "z-ai/glm-4.5-air:free" },
  {id: "z-ai/glm-4.7", name: "Z-ai", provider: "z-ai/glm-4.7", description: "z-ai/glm-4.7" },
  { id: "z-ai/glm-4.6", name: "z-ai/glm-4.6", provider: "Z-ai", description: "Best at tool use" },
  { id: "moonshotai/kimi-k2-thinking", name: "Moonshotai", provider: "openai/gpt-4o-mini", description: "" },
  { id: "z-ai/glm-4.6v", name: "Z-ai", provider: "Z-ai", description: "" },
  { id: "anthropic/claude-opus-4.5", name: "Anthropic", provider: "anthropic/claude-opus-4.5", description: "" },
  { id: "anthropic/claude-sonnet-4.5", name: "Anthropic", provider: "anthropic/claude-sonnet-4.5", description: "" },
  { id: "google/gemini-3-pro-preview", name: "Google", provider: "google/gemini-3-pro-preview", description: "" },
  { id: "moonshotai/kimi-k2-0905", name: "Moonshotai", provider: "moonshotai/kimi-k2-0905", description: "" },
  { id: "x-ai/grok-4", name: "X-ai", provider: "x-ai/grok-4", description: "" },
];

const freeModels: LLMModel[] = [
  {id: "z-ai/glm-4.5-air:free", name: "Z-ai", provider: "z-ai/glm-4.5-air:free", description: "z-ai/glm-4.5-air:free" },
  { id: "qwen/qwen3-vl-30b-a3b-instruct", name: "Qwen", provider: "qwen/qwen3-vl-30b-a3b-instruct", description: "Token efficient model" },
  { id: "z-ai/glm-4.5-air:free", name: "Z-ai", provider: "z-ai/glm-4.5-air:free", description: "z-ai/glm-4.5-air:free" },
  { id: "z-ai/glm-4.6", name: "z-ai/glm-4.6", provider: "Z-ai", description: "Best at tool use but cost more token" },
  { id: "mistralai/ministral-14b-2512", name: "Mistralai", provider: "mistralai/ministral-14b-2512", description: "Token efficient model" },
  { id: "z-ai/glm-4.6v", name: "Z-ai", provider: "z-ai/glm-4.6v", description: "Token efficient model" },
  { id: "deepseek/deepseek-v3.2-speciale", name: "Deepseek", provider: "deepseek/deepseek-v3.2-speciale", description: "" },
  { id: "google/gemini-2.5-flash-lite", name: "google", provider: "google/gemini-2.5-flash-lite", description: "Token efficient model" },

];

const paidModels: LLMModel[] = [
  {id: "z-ai/glm-4.5-air:free", name: "Z-ai", provider: "z-ai/glm-4.5-air:free", description: "z-ai/glm-4.5-air:free" },
  { id: "z-ai/glm-4.6", name: "z-ai/glm-4.6", provider: "Z-ai", description: "Best at tool use" },
  { id: "z-ai/glm-4.6v", name: "Z-ai", provider: "Z-ai", description: "z-ai/glm-4.6v" },
  { id: "moonshotai/kimi-k2-thinking", name: "Moonshotai", provider: "moonshotai/kimi-k2-thinking", description: "" },
  { id: "z-ai/glm-4.7", name: "Z-ai", provider: "z-ai/glm-4.7", description: "z-ai/glm-4.7" },
  { id: "z-ai/glm-4-32b", name: "Z-ai", provider: "z-ai/glm-4-32b", description: "" },
  { id: "mistralai/ministral-14b-2512", name: "Mistralai", provider: "mistralai/ministral-14b-2512", description: "" },
  { id: "google/gemini-2.5-flash-lite", name: "google", provider: "google/gemini-2.5-flash-lite", description: "" },
  { id: "qwen/qwen3-vl-30b-a3b-instruct", name: "Qwen", provider: "qwen/qwen3-vl-30b-a3b-instruct", description: "" },
];



export const agentModes: AgentMode[] = [
  {
    id: 'normal',
    name: 'normal',
    icon: Brain,
    description: 'Understand any topics, and discuss any topic',
    color: 'text-blue-400'
  },
  {
    id: 'general',
    name: 'general',
    icon: Cpu,
    description: 'AI agent for research and complex tasks with todo lists. Credits Costs 200-1350 and even more base on complexity',
    color: 'text-blue-400'
  },
];
  const ResourceDropdown = ({ 
    resources, 
    onSelect, 
    position, 
    searchTerm,
    onClose 
  }: { 
    resources: UploadedResource[];
    onSelect: (resource: UploadedResource) => void;
    position: { top: number; left: number };
    searchTerm: string;
    onClose: () => void;
  }) => {
    const [highlightedIndex, setHighlightedIndex] = useState(0);
  
    const filteredResources = resources.filter(r =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  
    const getIcon = (type: string) => {
      switch (type) {
        case 'pdf':
        case 'document':
          return <FileText className="w-4 h-4" />;
        case 'image':
          return <ImageIcon className="w-4 h-4" />;
        case 'video':
        case 'youtube':
          return <VideoIcon className="w-4 h-4" />;
        default:
          return <FileText className="w-4 h-4" />;
      }
    };
  
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightedIndex(prev => Math.min(prev + 1, filteredResources.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (filteredResources[highlightedIndex]) {
            onSelect(filteredResources[highlightedIndex]);
          }
        } else if (e.key === 'Escape') {
          onClose();
        }
      };
  
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [highlightedIndex, filteredResources, onSelect, onClose]);
  
    if (filteredResources.length === 0) {
      return (
        <div
          style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 1000 }}
          className="min-w-[300px] bg-[#2a2b2f] border border-[#ffffff0f] rounded-lg shadow-lg p-4"
        >
          <p className="text-gray-400 text-sm">No files found</p>
        </div>
      );
    }
  
    return (
      <div
        style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 1000 }}
        className="min-w-[300px] max-w-[400px] bg-[#2a2b2f] border border-[#ffffff0f] rounded-lg shadow-lg overflow-hidden"
      >
        <div className="p-2 border-b border-[#ffffff0f]">
          <p className="text-xs text-gray-400">Select files ({filteredResources.length})</p>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {filteredResources.map((resource, index) => (
            <button
              key={resource.id}
              onClick={() => onSelect(resource)}
              className={`w-full px-3 py-2.5 flex items-center gap-3 transition-colors ${
                index === highlightedIndex ? 'bg-[#35363a]' : 'hover:bg-gray-700/50'
              }`}
            >
              <div className="text-gray-400">{getIcon(resource.type)}</div>
              <div className="flex-1 text-left">
                <p className="text-sm text-gray-200 truncate">{resource.name}</p>
                <p className="text-xs text-gray-500">{resource.type.toUpperCase()}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  };

const QuestionInput = ({
  className,
  textareaClassName,
  placeholder,
  value,
  setValue,
  handleCancel,
  handleKeyDown,
  handleSubmit,
  handleFileUpload,
  isUploading = false,
  isDisabled,
  availableModels = defaultModels,
  freeavailableModels=freeModels,
  paiddModels=paidModels,
  selectedModel,
  onModelSelect,
  selectedMode,
  onModeSelect,
  isProcessing = false,
  UserPlanID,
  onAgentModeChange,
  currentAgentMode,
  currentAgentType,
  onModelChange,
  currentModel: currentModelProp,
  userinfo
}: QuestionInputProps) => {
  const [files, setFiles] = useState<FileUploadStatus[]>([]);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const modeDropdownRef = useRef<HTMLDivElement>(null);

  const { resources } = useResources(); 
  const [selectedResources, setSelectedResources] = useState<UploadedResource[]>([]); 
  const [showResourceDropdown, setShowResourceDropdown] = useState(false); 
  const [resourceDropdownPosition, setResourceDropdownPosition] = useState({ top: 0, left: 0 }); 
  const [mentionSearch, setMentionSearch] = useState(''); 
  const textareaRef = useRef<HTMLTextAreaElement>(null);


  const [currentModel, setCurrentModel] = useState<LLMModel>(() => {
  
    if (currentModelProp) {
      const foundModel = [...defaultModels, ...freeModels, ...paidModels].find(
        m => m.id === currentModelProp
      );
      if (foundModel) return foundModel;
    }
    return selectedModel || defaultModels[0];
  });

  const [currentMode, setCurrentMode] = useState<AgentMode>(selectedMode || agentModes[0]);
  const modesToShow = userinfo && userinfo?.token_limit >= 1400 
  ? agentModes 
  : agentModes.filter(mode => mode.id !== 'general');

  useEffect(() => {
    if (selectedModel) {
      setCurrentModel(selectedModel);
    }
  }, [selectedModel]);

  useEffect(() => {
    if (selectedMode) {
      setCurrentMode(selectedMode);
    }
  }, [selectedMode]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsModelDropdownOpen(false);
      }
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(event.target as Node)) {
        setIsModeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (currentModelProp) {
      const foundModel = [...defaultModels, ...freeModels, ...paidModels].find(
        m => m.id === currentModelProp
      );
      if (foundModel) {
        setCurrentModel(foundModel);
      }
    }
  }, [currentModelProp]);


  const removeFile = (fileName: string) => {
    setFiles((prev) => {
      const fileToRemove = prev.find((file) => file.name === fileName);
      if (fileToRemove?.preview) {
        URL.revokeObjectURL(fileToRemove.preview);
      }
      return prev.filter((file) => file.name !== fileName);
    });
  };

  useEffect(() => {
    return () => {
      files.forEach((file) => {
        if (file.preview) URL.revokeObjectURL(file.preview);
      });
    };
  }, [files]);

  const isImageFile = (fileName: string): boolean => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "svg"].includes(ext);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !handleFileUpload) return;

    const newFiles = Array.from(e.target.files).map((file) => {
      const isImage = isImageFile(file.name);
      const preview = isImage ? URL.createObjectURL(file) : undefined;
      return { name: file.name, loading: true, isImage, preview };
    });

    setFiles((prev) => [...prev, ...newFiles]);
    handleFileUpload(e);

    setTimeout(() => {
      setFiles((prev) => prev.map((file) => ({ ...file, loading: false })));
    }, 5000);
  };
  
  useEffect(() => {
    if (currentAgentMode && currentAgentType) {
      // Find the mode that matches
      const matchingMode = agentModes.find(m => m.id === currentAgentMode);
      if (matchingMode) {
        setCurrentMode(matchingMode);
      }
    }
  }, [currentAgentMode, currentAgentType]);

  const handleModelSelect = (model: LLMModel) => {
    setCurrentModel(model);
    onModelSelect?.(model);
    onModelChange?.(model.id);
    setIsModelDropdownOpen(false);
  };

  const handleModeSelect = (mode: AgentMode) => {
    setCurrentMode(mode);
    onModeSelect?.(mode);
    setIsModeDropdownOpen(false);
    
    // ADD THIS LINE to propagate to parent:
    onAgentModeChange?.(mode.id, mode.id);
  };

  const freePlans = ["free", "student"];
  
  const modelsToShow =
    UserPlanID === "custom_api"
      ? availableModels
      : freePlans.includes(UserPlanID)
      ? freeavailableModels
      : paiddModels;

  const handleFormSubmit = () => {
    handleSubmit(value, currentModel.id, currentMode.id,selectedResources);
  };

  // Get dynamic placeholder based on mode
  const getPlaceholder = () => {
    if (placeholder) return placeholder;
    
    if (currentMode.id === 'student') {
      return "Ask me anything you'd like to learn about - I'll explain it step by step...";
    }
    return "Enter your research query or complex question for in-depth analysis...";
  };

  useEffect(() => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      
      if (!textAfterAt.includes(' ')) {
        setMentionSearch(textAfterAt);
        setShowResourceDropdown(true);
        
        const rect = textarea.getBoundingClientRect();
        setResourceDropdownPosition({
          top: rect.top + window.scrollY - 320, // Position above textarea
          left: rect.left + window.scrollX,
        });
      } else {
        setShowResourceDropdown(false);
      }
    } else {
      setShowResourceDropdown(false);
    }
  }, [value]);

  const handleResourceSelect = (resource: UploadedResource) => {
    if (!selectedResources.find(r => r.id === resource.id)) {
      setSelectedResources([...selectedResources, resource]);
    }

    // Remove @mention from text
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const newValue = value.slice(0, lastAtIndex) + value.slice(cursorPos);
      setValue(newValue);
      
      setTimeout(() => {
        textarea.selectionStart = lastAtIndex;
        textarea.selectionEnd = lastAtIndex;
        textarea.focus();
      }, 0);
    }

    setShowResourceDropdown(false);
  };

  return (
    <motion.div
      key="input-view"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ type: "spring", stiffness: 300, damping: 30, mass: 1 }}
      className={`w-full z-50 ${className}`}
    >
      <motion.div
        className="relative rounded-xl"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        {/* File previews */}
        {files.length > 0 && (
          <div className="absolute top-4 left-4 right-2 flex items-center overflow-auto gap-2 z-10">
            {files.map((file) => {
              if (file.isImage && file.preview) {
                return (
                  <div key={file.name} className="relative">
                    <div className="w-20 h-20 rounded-xl overflow-hidden">
                      <img src={file.preview} alt={file.name} className="w-full h-full object-cover" />
                    </div>
                    <button
                      onClick={() => removeFile(file.name)}
                      className="absolute -top-2 -right-2 bg-black rounded-full p-1 hover:bg-gray-700"
                    >
                      <X className="size-4 text-white" />
                    </button>
                    {file.loading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl">
                        <Loader2 className="size-5 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                );
              }

              const { IconComponent, bgColor, label } = getFileIconAndColor(file.name);
              return (
                <div
                  key={file.name}
                  className="flex items-center gap-2 bg-neutral-900 text-white rounded-full px-3 py-2 border border-gray-700 shadow-sm"
                >
                  <div className={`flex items-center justify-center w-10 h-10 ${bgColor} rounded-full`}>
                    {isUploading ? <Loader2 className="size-5 text-white animate-spin" /> : <IconComponent className="size-5 text-white" />}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
                    <span className="text-xs text-gray-400">{label}</span>
                  </div>
                  <button onClick={() => removeFile(file.name)} className="ml-2 rounded-full p-1 hover:bg-gray-700">
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {selectedResources.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 p-2 bg-[#2a2b2f] rounded-lg">
          {selectedResources.map(resource => (
            <div
              key={resource.id}
              className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-900/30 text-blue-300 rounded text-xs border border-blue-700/50"
            >
              {resource.type === 'pdf' || resource.type === 'document' ? <FileText className="w-3 h-3" /> :
               resource.type === 'image' ? <ImageIcon className="w-3 h-3" /> :
               <VideoIcon className="w-3 h-3" />}
              <span className="max-w-[100px] truncate">{resource.name}</span>
              <button
                onClick={() => setSelectedResources(selectedResources.filter(r => r.id !== resource.id))}
                className="hover:bg-blue-400/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        )}

        <Textarea
          className={`w-full p-4 pb-[72px] rounded-xl !text-lg focus:ring-0 resize-none !placeholder-gray-400 !bg-[#35363a] border-[#ffffff0f] shadow-[0px_0px_10px_0px_rgba(0,0,0,0.02)] ${
            files.length > 0 ? "pt-24 h-60" : "h-50"
          } ${textareaClassName}`}
          placeholder={getPlaceholder()}
          value={value}
          ref={textareaRef} 
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isProcessing}
        />

        {showResourceDropdown && (
          <ResourceDropdown
            resources={resources}
            onSelect={handleResourceSelect}
            position={resourceDropdownPosition}
            searchTerm={mentionSearch}
            onClose={() => setShowResourceDropdown(false)}
          />
        )}

        <div className="flex justify-between items-center absolute bottom-0 py-4 m-px w-[calc(100%-4px)] rounded-b-xl bg-[#35363a] px-4">
          <div className="flex items-center gap-x-3">
            {handleFileUpload && (
              <label htmlFor="file-upload" className="cursor-pointer">
                <Button
                  variant="ghost"
                  size="icon"
                  className="hover:bg-gray-700/50 size-10 rounded-full cursor-pointer border border-[#ffffff0f] shadow-sm"
                  onClick={() => document.getElementById("file-upload")?.click()}
                  disabled={isUploading || isProcessing}
                >
                  {isUploading ? <Loader2 className="size-5 text-gray-400 animate-spin" /> : <Paperclip className="size-5 text-gray-400" />}
                </Button>
                <input id="file-upload" type="file" accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.json,.xml" multiple className="hidden" onChange={handleFileChange} disabled={isUploading || isProcessing} />
              </label>
            )}

            {/* Model Selection Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                className="hover:bg-gray-700/50 size-10 rounded-full cursor-pointer border border-[#ffffff0f] shadow-sm"
                disabled={isProcessing}
                title={`Current model: ${currentModel.name}`}
              >
                <Bot className="size-5 text-gray-400" />
              </Button>

              {isModelDropdownOpen && !isProcessing && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-full left-0 mb-2 w-80 bg-[#2a2b2f] border border-[#ffffff0f] rounded-lg shadow-lg overflow-hidden z-50"
                >
                  <div className="p-3 border-b border-[#ffffff0f]">
                    <h3 className="text-sm font-medium text-white mb-1">Select Model</h3>
                    <p className="text-xs text-gray-400">Current: {currentModel.name}</p>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {modelsToShow.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => handleModelSelect(model)}
                        className={`w-full text-left px-4 py-3 hover:bg-[#35363a] transition-colors ${
                          currentModel.id === model.id ? "bg-[#35363a] border-l-2 border-blue-500" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-white text-sm">{model.name}</div>
                            <div className="text-xs text-gray-400">{model.provider}</div>
                            {model.description && <div className="text-xs text-gray-500 mt-1">{model.description}</div>}
                          </div>
                          {currentModel.id === model.id && <div className="w-2 h-2 bg-blue-500 rounded-full"></div>}
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Mode Selection Dropdown */}
            <div className="relative" ref={modeDropdownRef}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)}
                className="hover:bg-gray-700/50 size-10 rounded-full cursor-pointer border border-[#ffffff0f] shadow-sm"
                disabled={isProcessing}
                title={`Current mode: ${currentMode.name}`}
              >
                <currentMode.icon className={`size-5 ${currentMode.color}`} />
              </Button>

              {isModeDropdownOpen && !isProcessing && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-full left-0 mb-2 w-72 bg-[#2a2b2f] border border-[#ffffff0f] rounded-lg shadow-lg overflow-hidden z-50"
                >
                  <div className="p-3 border-b border-[#ffffff0f]">
                    <h3 className="text-sm font-medium text-white mb-1">Select Mode</h3>
                    <p className="text-xs text-gray-400">Current: {currentMode.name}</p>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {modesToShow.map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => handleModeSelect(mode)}
                        className={`w-full text-left px-4 py-3 hover:bg-[#35363a] transition-colors ${
                          currentMode.id === mode.id ? "bg-[#35363a] border-l-2 border-green-500" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <mode.icon className={`size-5 ${mode.color}`} />
                            <div>
                              <div className="font-medium text-white text-sm">{mode.name}</div>
                              <div className="text-xs text-gray-500 mt-1">{mode.description}</div>
                            </div>
                          </div>
                          {currentMode.id === mode.id && <div className="w-2 h-2 bg-green-500 rounded-full"></div>}
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-x-2">
            {isProcessing && handleCancel ? (
              // Show cancel button when processing
              <Button
                onClick={handleCancel}
                className="cursor-pointer !border !border-red-500 bg-red-600 hover:bg-red-700 p-4 size-10 font-bold rounded-full hover:scale-105 active:scale-95 transition-transform shadow-[0_4px_10px_rgba(220,38,38,0.3)]"
                title="Cancel processing"
              >
                <Square className="size-5 text-white fill-white" />
              </Button>
            ) : (
              // Show submit button when not processing
              <Button
                disabled={!value.trim() || isDisabled || isProcessing}
                onClick={handleFormSubmit}
                className="cursor-pointer !border !border-red p-4 size-10 font-bold rounded-full hover:scale-105 active:scale-95 transition-transform shadow-[0_4px_10px_rgba(0,0,0,0.2)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <ArrowUp className="size-5" />
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default QuestionInput;