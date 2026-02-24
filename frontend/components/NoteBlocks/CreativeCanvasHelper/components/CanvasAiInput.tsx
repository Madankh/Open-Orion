import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Loader2, ArrowUp, Bot, CornerDownRight, Layers } from 'lucide-react';
import { NodeData, ColorTheme } from '@/typings/agent';
import { COLORS } from '../../../NoteBlocks/CreativeCanvasHelper/components/constants'; 
import { isGroupNode } from '../../../NoteBlocks/CreativeCanvasHelper/components/CanvasHelpers'; 

import { motion, AnimatePresence } from 'framer-motion';

// --- Types ---
export interface LLMModel {
    id: string;
    name: string;
    provider: string;
    description?: string;
}

interface CanvasAiInputProps {
    prompt: string;
    setPrompt: (val: string) => void;
    onSubmit: (e?: React.FormEvent) => void;
    isLoading: boolean;
    selectedNode: NodeData | null | undefined; // For the "Context" header
    nodes: NodeData[]; // To count children for groups
    
    // Model Selection Props
    selectedModelId: string;
    onModelChange: (id: string) => void;
    availableModels: LLMModel[];
}

export const CanvasAiInput: React.FC<CanvasAiInputProps> = ({
    prompt,
    setPrompt,
    onSubmit,
    isLoading,
    selectedNode,
    nodes,
    selectedModelId,
    onModelChange,
    availableModels
}) => {
    const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const currentModel = availableModels.find(m => m.id === selectedModelId) || availableModels[0];

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsModelDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Auto-resize textarea
    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setPrompt(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (prompt.trim()) onSubmit();
        }
    };

    return (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 w-full max-w-3xl px-6" onMouseDown={(e) => e.stopPropagation()}>
            <div className={`flex flex-col bg-white/90 backdrop-blur-md shadow-2xl shadow-blue-900/10 rounded-[28px] border border-gray-200 transition-all duration-300 focus-within:ring-4 focus-within:ring-blue-50/50 focus-within:border-blue-200 ${isLoading ? 'ring-4 ring-purple-50 border-purple-200' : ''}`}>

                {/* --- CONTEXT HEADER (Only if a node is selected) --- */}
                {selectedNode && (
                    <div className="flex flex-col px-4 pt-3 pb-2 border-b border-gray-100 bg-gray-50/50 rounded-t-[28px] animate-in slide-in-from-bottom-2 fade-in duration-200">
                        <div className="flex items-center gap-2 mb-1.5 opacity-60">
                            <CornerDownRight size={14} className="text-blue-500" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                Context: {isGroupNode(selectedNode) ? 'Group' : 'Node'}
                            </span>
                        </div>

                        <div className="flex gap-3">
                            <div className={`w-1 rounded-full ${COLORS[selectedNode.color as ColorTheme]?.split(' ')[0].replace('bg-', 'bg-') || 'bg-gray-400'}`}></div>
                            <div className="flex-1 min-w-0">
                                <div className="font-semibold text-gray-800 text-sm truncate mb-0.5">{selectedNode.title || 'Untitled'}</div>
                                {!isGroupNode(selectedNode) && (
                                    <div className="text-xs text-gray-500 line-clamp-2 leading-relaxed bg-white/50 p-2 rounded-lg border border-gray-100">
                                        {selectedNode.content ?
                                            selectedNode.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 150)
                                            : <span className="italic opacity-50">No content...</span>
                                        }
                                    </div>
                                )}
                                {isGroupNode(selectedNode) && (
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <Layers size={12} />
                                        <span>{nodes.filter(n => n.parentId === selectedNode.id).length} items inside</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- INPUT AREA --- */}
                <div className="relative flex flex-col w-full rounded-2xl bg-white transition-all duration-300 ease-out border border-gray-200">
                    <textarea
                        ref={inputRef}
                        className="w-full bg-transparent text-gray-800 text-[15px] placeholder:text-gray-400 font-medium px-4 pt-4 pb-2 min-h-[56px] outline-none resize-none leading-relaxed rounded-t-2xl"
                        style={{ height: '56px' }}
                        value={prompt}
                        disabled={isLoading}
                        placeholder={selectedNode ? "Ask a follow-up..." : "Start a new topic..."}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                    />

                    {/* --- BOTTOM TOOLBAR --- */}
                    <div className="flex items-center justify-between px-2 pb-2">
                        <div className="flex items-center gap-2 px-2">
                            {/* AI Label */}
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 bg-gray-50">
                                <Sparkles size={14} className={isLoading ? "text-purple-500 animate-spin" : "text-purple-500"} />
                                <span>AI</span>
                            </div>

                            {/* MODEL SELECTOR BUTTON */}
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    type="button"
                                    onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                                    disabled={isLoading}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors border border-transparent hover:border-gray-200"
                                >
                                    <Bot size={14} />
                                    <span className="max-w-[100px] truncate">{currentModel.name}</span>
                                </button>

                                {/* DROPDOWN MENU */}
                                <AnimatePresence>
                                    {isModelDropdownOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                            transition={{ duration: 0.1 }}
                                            className="absolute bottom-full left-0 mb-2 w-72 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-[100]"
                                        >
                                            <div className="p-3 border-b border-gray-100 bg-gray-50">
                                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Select Model</h3>
                                            </div>
                                            <div className="max-h-60 overflow-y-auto py-1">
                                                {availableModels.map((model) => (
                                                    <button
                                                        key={model.id}
                                                        onClick={() => {
                                                            onModelChange(model.id);
                                                            setIsModelDropdownOpen(false);
                                                        }}
                                                        className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors group ${
                                                            selectedModelId === model.id ? "bg-blue-50" : ""
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <div className={`font-medium text-sm ${selectedModelId === model.id ? 'text-blue-700' : 'text-gray-700'}`}>
                                                                    {model.name}
                                                                </div>
                                                                <div className="text-[10px] text-gray-400 group-hover:text-blue-400/70">
                                                                    {model.provider}
                                                                </div>
                                                            </div>
                                                            {selectedModelId === model.id && (
                                                                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                                                            )}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* SUBMIT BUTTON */}
                        <button
                            onClick={() => onSubmit()}
                            disabled={!prompt.trim() || isLoading}
                            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200
                                ${!prompt.trim() || isLoading 
                                    ? 'text-gray-300 cursor-not-allowed bg-gray-100' 
                                    : 'bg-black text-white hover:bg-gray-800 shadow-md hover:-translate-y-0.5'}`}
                        >
                            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2.5} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};