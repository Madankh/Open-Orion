"use client";
import { motion } from "framer-motion";
import { Search, Globe, BrainCircuit, FileText } from "lucide-react";
import Markdown from "@/components/markdown"; 

export interface DeepStep {
  id: string;
  type: string;
  data: {
    text?: string;
    query?: string;
    url?: string;
    [key: string]: string | number | boolean | string[] | undefined;
  };
}

interface DeepResearchStepProps {
  step: DeepStep;
}

// Enhanced parser function
const parseThoughtText = (text: string) => {
  text = text.trim();
  
  // Check for 'web_search' tool call
  const webSearchMatch = text.match(/web_search\(queries=\[(.*?)\]\)/);
  if (webSearchMatch && webSearchMatch[1]) {
    const queries = webSearchMatch[1].split(',').map(q => q.trim().replace(/['"]/g, ''));
    return {
      Icon: Search,
      text: `Searching for: ${queries.join(', ')}`,
      color: "text-blue-400",
      useMarkdown: false,
    };
  }
  
  // Check for 'page_visit' tool call
  const pageVisitMatch = text.match(/page_visit\(urls=\[(.*?)\]\)/);
  if (pageVisitMatch && pageVisitMatch[1]) {
    const urls = pageVisitMatch[1].split(',').map(u => u.trim().replace(/['"]/g, ''));
    const displayText = urls.length > 1 ? `Visiting ${urls.length} pages...` : `Visiting: ${urls[0]}`;
    return {
      Icon: Globe,
      text: displayText,
      color: "text-green-400",
      useMarkdown: false,
    };
  }
  
  // Check for specific states
  switch (text) {
    case "analyzing_sources":
      return {
        Icon: BrainCircuit,
        text: "Analyzing gathered information...",
        color: "text-purple-400",
        useMarkdown: false,
      };
    case "writing_report":
      return {
        Icon: FileText,
        text: "Compiling the final report...",
        color: "text-yellow-400",
        useMarkdown: false,
      };
  }
  
  // For general content that might contain markdown/HTML
  return {
    Icon: BrainCircuit,
    text: text,
    color: "text-gray-400",
    useMarkdown: true,
  };
};

const DeepResearchStep = ({ step }: DeepResearchStepProps) => {
  const thoughtText = typeof step.data === 'string' ? step.data : step.data.text || step.type;
  const { Icon, text, color, useMarkdown } = parseThoughtText(thoughtText);
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, type: "spring", stiffness: 200, damping: 20 }}
      className="mb-4 w-full max-w-full overflow-hidden"
    >
      <div className="flex items-start gap-3 text-sm w-full max-w-full">
        <Icon className={`w-4 h-4 flex-shrink-0 mt-1 ${color}`} />
        <div className="text-gray-400 w-full max-w-full min-w-0 flex-1 overflow-hidden">
          {useMarkdown ? (
            <div className="prose prose-sm prose-invert max-w-none w-full overflow-hidden">
              <div className="markdown-content w-full max-w-full overflow-hidden break-words">
                <Markdown>{text}</Markdown>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-full overflow-hidden break-words word-wrap-break-word hyphens-auto">
              {text}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default DeepResearchStep;