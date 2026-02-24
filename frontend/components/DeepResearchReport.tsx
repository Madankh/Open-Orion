import { motion } from "framer-motion";
import { BrainCircuit } from "lucide-react";
import Markdown from "@/components/markdown";
import { useState } from "react";

// A simple animated cursor
const Cursor = () => (
  <span className="inline-block w-1.5 h-5 bg-blue-400 ml-1 animate-pulse" />
);

interface DeepResearchReportProps {
  report?: string;
  code?: string; // optional live code block
}

const DeepResearchReport = ({ report, code }: DeepResearchReportProps) => {
  const [showCode, setShowCode] = useState(true);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-gray-800 border border-gray-700 rounded-lg p-4 my-4 w-full max-w-full overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3 text-blue-300">
        <BrainCircuit className="w-5 h-5 flex-shrink-0" />
        <h3 className="font-semibold break-words">
          Task in Progress...
        </h3>
      </div>

      {/* Report Section */}
      <div className="text-gray-200 text-sm leading-relaxed w-full max-w-full overflow-hidden">
        <div className="prose prose-sm prose-invert max-w-none w-full overflow-hidden">
          <div className="markdown-report-content w-full max-w-full overflow-hidden break-words">
            <Markdown>{report}</Markdown>
          </div>
        </div>
        <Cursor />
      </div>

      {/* Code Output Section */}
      {code && (
        <div className="mt-4 bg-black/60 rounded-xl p-3 relative">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-400">Live Code Output</span>
            <button
              onClick={() => setShowCode((s) => !s)}
              className="text-xs text-blue-400 hover:underline"
            >
              {showCode ? "Hide" : "Show"}
            </button>
          </div>

          {showCode && (
            <pre className="whitespace-pre-wrap break-words bg-gray-900 text-green-400 text-sm p-3 rounded-lg overflow-x-auto">
             <code>{code}</code>
            </pre>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default DeepResearchReport;
