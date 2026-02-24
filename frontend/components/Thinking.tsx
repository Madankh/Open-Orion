"use client";
import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeMathJax from "rehype-mathjax";
import rehypeKatex from "rehype-katex";
import type { Components } from "react-markdown";
import { toast } from "sonner";
import type { Element } from 'hast';

type TokenData = {
  nextThoughtNeeded?: boolean;
  thought?: string;
  thoughtNumber?: number;
  totalThoughts?: number;
  content?: string;
  action?: string;
  status?: string;
};

interface AIActionProps {
  token: string;
  className?: string;
}

interface CodeComponentProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  node?: Element;
}

const AIActionComponent = ({ token, className }: AIActionProps) => {
  const [displayedTokens, setDisplayedTokens] = useState<string>('');
  const [parsedTokens, setParsedTokens] = useState<TokenData[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Moved actions array outside component or memoized it to fix the dependency warning
  // const actions = React.useMemo(() => [
  //   "Analyzing request",
  //   "Processing data",
  //   "Computing solutions", 
  //   "Generating insights",
  //   "Optimizing results",
  //   "Synthesizing response"
  // ], []);

  // Parse token data
  useEffect(() => {
    if (token) {
      try {
        // Try to parse multiple JSON objects
        const jsonObjects = token.split('}{').map((part, index, array) => {
          if (index === 0 && array.length > 1) return part + '}';
          if (index === array.length - 1 && array.length > 1) return '{' + part;
          if (array.length > 1) return '{' + part + '}';
          return part;
        });

        const parsed = jsonObjects.map(jsonStr => {
          try {
            return JSON.parse(jsonStr);
          } catch {
            return { content: jsonStr };
          }
        }).filter(obj => obj);

        setParsedTokens(parsed);
        setIsThinking(parsed.some(p => p.nextThoughtNeeded || p.thought));
        setDisplayedTokens(token);
      } catch (error) {
        setDisplayedTokens(token);
        toast.error(`Failed ${error}`)
        setParsedTokens([]);
      }
    }
  }, [token]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayedTokens]);

  // Enhanced floating particles with more dynamic movement
  const DynamicParticles = () => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(30)].map((_, i) => (
        <div key={i}>
          <div
            className="absolute rounded-full animate-pulse"
            style={{
              width: `${2 + Math.random() * 4}px`,
              height: `${2 + Math.random() * 4}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              background: `linear-gradient(45deg, 
                ${['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'][Math.floor(Math.random() * 5)]}, 
                ${['#1e40af', '#7c3aed', '#0891b2', '#059669', '#d97706'][Math.floor(Math.random() * 5)]})`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${1 + Math.random() * 2}s`,
              boxShadow: '0 0 10px rgba(59, 130, 246, 0.3)',
            }}
          />

          <div
            className="absolute w-1 h-1 bg-white/20 rounded-full animate-ping"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
            }}
          />
        </div>
      ))}
    </div>
  );

  const ThoughtBubble = ({ thought, thoughtNumber, totalThoughts }: { thought: string, thoughtNumber?: number, totalThoughts?: number }) => (
    <div className="bg-gradient-to-r from-purple-900/40 to-blue-900/40 backdrop-blur-sm border border-purple-500/30 rounded-xl p-4 mb-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-blue-500 animate-pulse"></div>
      
      <div className="flex items-start space-x-3">
        <div className="flex-none">
          <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center animate-pulse">
            <span className="text-xs font-bold text-white">🧠</span>
          </div>
        </div>
        
        <div className="flex-1">
          {thoughtNumber && totalThoughts && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-purple-300 font-medium">Thought Process</span>
              <span className="text-xs text-blue-300">{thoughtNumber}/{totalThoughts}</span>
            </div>
          )}
          
          <p className="text-sm text-gray-200 leading-relaxed">{thought}</p>
          
          {thoughtNumber && totalThoughts && (
            <div className="mt-3">
              <div className="w-full bg-gray-700/50 rounded-full h-1">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-1000"
                  style={{ width: `${(thoughtNumber / totalThoughts) * 100}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const ActionCard = ({ action, status }: { action?: string, status?: string }) => (
    <div className="bg-gradient-to-r from-green-900/40 to-emerald-900/40 backdrop-blur-sm border border-green-500/30 rounded-xl p-4 mb-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 to-emerald-500 animate-pulse"></div>
      
      <div className="flex items-start space-x-3">
        <div className="flex-none">
          <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center animate-pulse">
            <span className="text-xs font-bold text-white">⚡</span>
          </div>
        </div>
        
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-green-300 font-medium">Action</span>
            {status && (
              <span className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded-full border border-green-500/30">
                {status}
              </span>
            )}
          </div>
          
          {action && <p className="text-sm text-gray-200 leading-relaxed">{action}</p>}
        </div>
      </div>
    </div>
  );

  // Define custom components with enhanced styling
    const components: Components = {
      code: ({ inline, className, children, ...props }: CodeComponentProps & React.HTMLAttributes<HTMLElement>) => {
        const match = /language-(\w+)/.exec(className || '');
        return !inline && match ? (
          <div className="relative group">
            <pre className="bg-gray-900/70 backdrop-blur-sm border border-gray-600/50 rounded-lg p-4 overflow-x-auto shadow-lg">
              <code className={className} {...props}>
                {children}
              </code>
            </pre>
          </div>
        ) : (
          <code className="bg-gray-800/70 px-2 py-1 rounded text-sm font-mono text-cyan-300 shadow-sm" {...props}>
            {children}
          </code>
        );
      
    },
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-blue-500/70 pl-4 my-4 bg-blue-500/10 py-3 rounded-r-lg backdrop-blur-sm">
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full border border-gray-600/50 rounded-lg overflow-hidden bg-gray-800/30 backdrop-blur-sm">
          {children}
        </table>
      </div>
    ),
    th: ({ children }) => (
      <th className="bg-gray-700/50 border border-gray-600/50 px-4 py-3 text-left font-semibold text-white">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-gray-600/30 px-4 py-2 text-gray-200">
        {children}
      </td>
    ),
  };

  const MarkdownContent = ({ content }: { content: string }) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeHighlight, rehypeRaw, rehypeMathJax, rehypeKatex]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );

  return (
    <div className={`h-[calc(100vh-178px)] flex rounded-xl flex-col overflow-hidden border border-gray-600/50 bg-gradient-to-br from-gray-900/80 via-gray-800/50 to-gray-900/80 backdrop-blur-lg relative shadow-2xl ${className}`}>
      {/* Enhanced background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(147, 51, 234, 0.15) 0%, transparent 50%),
            radial-gradient(circle at 40% 80%, rgba(6, 182, 212, 0.15) 0%, transparent 50%),
            linear-gradient(45deg, rgba(59, 130, 246, 0.05) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(147, 51, 234, 0.05) 25%, transparent 25%)
          `,
          backgroundSize: '400px 400px, 300px 300px, 500px 500px, 60px 60px, 60px 60px'
        }}></div>
      </div>

      <DynamicParticles />

      {/* Premium Header */}
      <div className="flex-none p-4 border-b border-gray-600/50 bg-gray-800/30 backdrop-blur-lg relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex space-x-1">
              <div className="w-3 h-3 rounded-full bg-red-500 shadow-sm shadow-red-500/50"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500 shadow-sm shadow-yellow-500/50"></div>
              <div className="w-3 h-3 rounded-full bg-green-500 shadow-sm shadow-green-500/50"></div>
            </div>
            <h3 className="text-xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              AI Action Center
            </h3>
          </div>
          
          {/* Live status indicator */}
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-sm shadow-green-400/50"></div>
            <span className="text-sm text-green-400 font-medium">
              {isThinking ? 'THINKING' : 'LIVE'}
            </span>
          </div>
        </div>
        
        {/* Header glow effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 via-purple-600/5 to-cyan-600/5 pointer-events-none" />
      </div>

      {/* Enhanced Content */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-6 space-y-4 relative">
        {token.length === 0 ? (
          ""
        ) : (
          <div className="space-y-4">
            {/* Display parsed tokens beautifully */}
            {parsedTokens.length > 0 ? (
              parsedTokens.map((tokenData, index) => (
                <div key={index} className="space-y-2">
                  {tokenData.thought && (
                    <ThoughtBubble 
                      thought={tokenData.thought}
                      thoughtNumber={tokenData.thoughtNumber}
                      totalThoughts={tokenData.totalThoughts}
                    />
                  )}
                  
                  {tokenData.action && (
                    <ActionCard 
                      action={tokenData.action}
                      status={tokenData.status}
                    />
                  )}
                  
                  {tokenData.content && !tokenData.thought && !tokenData.action && (
                    <div className="bg-gray-800/40 backdrop-blur-sm border border-gray-600/40 rounded-lg p-5 hover:bg-gray-700/40 transition-all duration-300 group shadow-lg hover:shadow-xl hover:shadow-blue-500/10">
                      <div className="flex items-start space-x-4">
                        <div className="flex-none">
                          <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full mt-2 group-hover:from-purple-500 group-hover:to-cyan-500 transition-all duration-300 shadow-sm shadow-blue-500/50"></div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <MarkdownContent content={tokenData.content} />
                        </div>
                      </div>
                      <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-600/5 via-purple-600/5 to-cyan-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                    </div>
                  )}
                </div>
              ))
            ) : (
              // Fallback for non-JSON content
              <div className="bg-gray-800/40 backdrop-blur-sm border border-gray-600/40 rounded-lg p-5 hover:bg-gray-700/40 transition-all duration-300 group shadow-lg hover:shadow-xl hover:shadow-blue-500/10">
                <div className="flex items-start space-x-4">
                  <div className="flex-none">
                    <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full mt-2 group-hover:from-purple-500 group-hover:to-cyan-500 transition-all duration-300 shadow-sm shadow-blue-500/50"></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <MarkdownContent content={displayedTokens} />
                  </div>
                </div>
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-600/5 via-purple-600/5 to-cyan-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Enhanced Footer with Premium Stats */}
      <div className="flex-none p-4 border-t border-gray-600/50 bg-gray-800/30 backdrop-blur-lg relative">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-6 text-sm">
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">Tokens:</span>
              <span className="text-white font-semibold">{parsedTokens.length || 1}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">Status:</span>
              <div className="flex items-center space-x-1">
                <div className={`w-2 h-2 rounded-full animate-pulse shadow-sm ${
                  isThinking 
                    ? 'bg-purple-400 shadow-purple-400/50' 
                    : 'bg-green-400 shadow-green-400/50'
                }`}></div>
                <span className={`font-medium ${
                  isThinking ? 'text-purple-400' : 'text-green-400'
                }`}>
                  {isThinking ? 'Processing' : 'Active'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-3 text-xs text-gray-400">
            <div className="flex items-center space-x-1">
              <span>⚡</span>
              <span>Enhanced Mode</span>
            </div>
            <div className="w-px h-4 bg-gray-600"></div>
            <div className="flex items-center space-x-1">
              <span>🚀</span>
              <span>AI Action Center</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIActionComponent;