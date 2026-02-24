"use client";

import { motion } from "framer-motion";
import { Check, Brain, Loader2 } from "lucide-react";
import { useMemo, useRef } from "react";
import QuestionInput from "@/components/question-input";
import { ActionStep, Message } from "@/typings/agent";
import DeepResearchReport from "./DeepResearchReport";
import DeepResearchStep, { DeepStep } from "@/components/DeepResearchStep";
import ThinkingAnimation from '../components/thinking/thinkinganimation';
import ChatBubbleList from "./ChatBubble";
import QuizComponent from "./QuizComponent";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { UploadedResource } from '@/typings/agent';
// 1. IMPORT VIRTUOSO
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

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

// ... [Keep other Interfaces: FileUploadStatus, AgentMode, etc. same as before] ...
interface AgentMode {
  id: 'general' | 'student';
  name: string;
  icon: React.ComponentType<unknown>;
  description: string;
  color: string;
}

interface QuizQuestion {
  adaptive_reasoning: string;
  answer: string;
  difficulty: "easy" | "medium" | "hard";
  estimated_time: number;
  explanation: string;
  hints: string[];
  options: string[];
  question: string;
  topic: string;
  type: "multiple_choice" | "true_false" | "short_answer";
}

interface AdaptiveQuestionData {
  adaptation_strategy: string;
  content: string;
  learning_objectives: string[];
  questions: QuizQuestion[];
}

interface ChatMessageProps {
  className: string;
  messages: Message[];
  handleCancelQuery: () => void;
  thinkingMessage: Message[];
  stream: Message[];
  isLoading: boolean;
  isCompleted: boolean;
  workspaceInfo: string;
  isUploading: boolean;
  isUseDeepResearch: boolean;
  isReplayMode: boolean;
  currentQuestion: string;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  handleClickAction: (action: ActionStep | undefined, isReplay?: boolean) => void;
  setCurrentQuestion: (question: string) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleQuestionSubmit: (question: string, modelToUse: string, modeId: string, referencedResources: UploadedResource[]) => void;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isGeneratingPrompt: boolean;
  handleEnhancePrompt: () => void;
  isReceivingReport: boolean;
  deepResearchReport: string;
  deepResearchSteps: DeepStep[];
  onQuizSubmit?: (message: string, modelId: string, modeId: string) => void;
  selectedModelId?: string;
  selectedMode?: AgentMode;
  onModeSelect?: (mode: AgentMode) => void;
  isFullWidth?: boolean;
  UserPlanID?: string;
  streamingContent?: string;
  isStreamingCode?: boolean;
  onApplyNote?: (noteContent: string, messageId?: string) => void;
  onToggleTab?: () => void;
  hasActiveTab?: boolean;
  isTabVisible?: boolean;
  onAgentModeChange?: (mode: string, type: string) => void;
  currentAgentMode?: string;
  currentAgentType?: string;
  onModelChange?: (modelId: string) => void;
  currentModel?: string;
  userinfo?: UserInfo;
  onLoadMore?: () => void;
  hasMoreHistory?: boolean;
  isLoadingHistory?: boolean;
}

const MessageMarkdown = ({ children }: { children: string | null | undefined }) => {
  if (!children) return null;
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]}
        components={{
          a: ({ ...props }) => (
            <a target="_blank" rel="noopener noreferrer" {...props} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};

const ApplyNoteButton = ({
  content,
  messageId,
  onApplyNote
}: {
  content: string;
  messageId?: string;
  onApplyNote?: (noteContent: string, messageId?: string) => void
}) => {
  if (!onApplyNote || !content) return null;
  const handleApplyNote = () => { onApplyNote(content, messageId); };
  return (
    <motion.button
      onClick={handleApplyNote}
      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-[oklch(0.25_0.08_22.75)] hover:bg-gray-700 text-white rounded-lg transition-colors duration-200 mt-2"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      Knowleage Tap
    </motion.button>
  );
};

const ChatMessage = ({
  className,
  messages,
  handleCancelQuery,
  stream,
  isLoading,
  isCompleted,
  workspaceInfo,
  isUploading,
  isUseDeepResearch,
  currentQuestion,
  handleClickAction,
  setCurrentQuestion,
  handleKeyDown,
  handleQuestionSubmit,
  handleFileUpload,
  isGeneratingPrompt,
  handleEnhancePrompt,
  isReceivingReport,
  deepResearchReport,
  deepResearchSteps,
  onQuizSubmit,
  selectedModelId,
  isFullWidth = false,
  UserPlanID,
  streamingContent,
  isStreamingCode,
  onApplyNote,
  onToggleTab,
  hasActiveTab,
  isTabVisible,
  onAgentModeChange,
  currentAgentMode,
  currentAgentType,
  onModelChange,
  currentModel,
  userinfo,
  onLoadMore,
  hasMoreHistory = false,
  isLoadingHistory = false
}: ChatMessageProps) => {

  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Helper functions
  const isQuizMessage = (message: Message) => message.quizData !== undefined;
  const isMessageForUser = (message: Message) => message.MessageForUser?.tool_input?.text !== undefined;
  const hasContent = (message: Message) => message.content !== undefined && message.content !== null && message.content.trim() !== '';
  const hasAction = (message: Message) => message.action !== undefined;
  const isAIMessage = (message: Message) => message.role === 'assistant' || message.sender === 'ai' || message.type === 'ai';

  const getApplyNoteContent = (message: Message) => {
    let content = '';
    if (hasContent(message)) content += message.content || '';
    if (isMessageForUser(message)) {
      const messageForUserContent = message.MessageForUser?.tool_input?.text || '';
      content += content ? '\n\n' + messageForUserContent : messageForUserContent;
    }
    return content.trim();
  };

  const sortedMessages = useMemo(() => {
    const allMessages = [...messages, ...stream];
    return allMessages
      .filter(msg => hasContent(msg) || hasAction(msg) || isMessageForUser(msg) || isQuizMessage(msg))
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }, [messages, stream]);

  // 1. RENDER SINGLE ITEM
  // We apply the padding and full-width logic HERE for each item
  const renderItemContent = (index: number, message: Message) => {
    const messageKey = `${message.id}-${index}`;
    const isFromAI = isAIMessage(message);
    const applyNoteContent = isFromAI ? getApplyNoteContent(message) : '';

    // Define the wrapper class that replicates your original layout
    // px-4 for side margins, max-w-4xl mx-auto for centering when full width
    const layoutClass = `px-4 pb-4 ${isFullWidth ? 'max-w-4xl mx-auto' : ''}`;

    let contentToRender = null;

    if (isQuizMessage(message) && !hasAction(message) && !hasContent(message) && !isMessageForUser(message)) {
      const quizData = message.quizData as AdaptiveQuestionData;
      contentToRender = (
        <QuizComponent
          quizData={quizData}
          onSubmitQuiz={onQuizSubmit || (() => { })}
          selectedModelId={selectedModelId || 'default'}
          className="max-w-4xl mx-auto"
        />
      );
    } else if (isMessageForUser(message) && !hasAction(message) && !hasContent(message) && !isQuizMessage(message)) {
      const textContent = message.MessageForUser?.tool_input?.text || '';
      contentToRender = (
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="flex items-start gap-2">
            <Brain className="size-5 text-blue-400 mt-1 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <MessageMarkdown>{textContent}</MessageMarkdown>
            </div>
          </div>
          {isFromAI && (
            <ApplyNoteButton
              content={textContent}
              messageId={message.id}
              onApplyNote={onApplyNote}
            />
          )}
        </div>
      );
    } else if (hasAction(message) || hasContent(message)) {
      contentToRender = (
        <>
          <ChatBubbleList
            messageList={[message]}
            workspaceInfo={workspaceInfo}
            handleClickAction={handleClickAction}
            onToggleTab={onToggleTab}
            isTabVisible={isTabVisible}
            activeTab={hasActiveTab}
          />
          
          {isMessageForUser(message) && (
            <div className="bg-gray-800 p-4 rounded-lg mt-2">
              <div className="flex items-start gap-2">
                <Brain className="size-5 text-blue-400 mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <MessageMarkdown>{message.MessageForUser?.tool_input?.text || ''}</MessageMarkdown>
                </div>
              </div>
            </div>
          )}
          
          {isQuizMessage(message) && (
            <div className="mt-2">
              <QuizComponent
                quizData={message.quizData as AdaptiveQuestionData}
                onSubmitQuiz={onQuizSubmit || (() => { })}
                selectedModelId={selectedModelId || 'default'}
                className="max-w-4xl mx-auto"
              />
            </div>
          )}

          {isFromAI && applyNoteContent && (
            <ApplyNoteButton
              content={applyNoteContent}
              messageId={message.id}
              onApplyNote={onApplyNote}
            />
          )}
        </>
      );
    }

    if (!contentToRender) return <div />;

    // Wrap the content in the layout div
    return (
      <div key={messageKey} className={layoutClass}>
        {contentToRender}
      </div>
    );
  };

  // 2. FOOTER (Also needs layout classes)
  const Footer = () => (
    <div className={`px-4 pb-4 ${isFullWidth ? 'max-w-4xl mx-auto' : ''}`}>
      {deepResearchSteps?.map((step, index) => (
        <div key={`deep-${step.id}-${index}`} className="w-full min-w-0 overflow-hidden mb-4">
          <DeepResearchStep step={step} />
        </div>
      ))}
      
      {(isReceivingReport || isStreamingCode) && (
        <div className="w-full min-w-0 overflow-hidden break-words mb-4">
          <DeepResearchReport report={deepResearchReport} code={streamingContent} />
          {(deepResearchReport || streamingContent) && (
            <ApplyNoteButton
              content={deepResearchReport || streamingContent || ''}
              messageId="deep-research-report"
              onApplyNote={onApplyNote}
            />
          )}
        </div>
      )}
      
      {isLoading && (
        <div className="mb-4">
          <ThinkingAnimation />
        </div>
      )}

      {isCompleted && (
        <div className="flex gap-x-2 items-center bg-green-50 text-green-600 text-sm p-3 rounded-lg mb-4 max-w-full">
          <Check className="size-4 flex-shrink-0" />
          <span className="break-words">Agent has completed your task.</span>
        </div>
      )}
    </div>
  );

  // 3. HEADER
  const Header = () => (
    <div className="w-full py-4 flex justify-center h-12">
      {hasMoreHistory && (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          {isLoadingHistory && <Loader2 className="animate-spin size-4" />}
          {isLoadingHistory ? "Loading history..." : "Scroll for more"}
        </div>
      )}
    </div>
  );

  return (
    <div className={className}>
      
      <motion.div
        className="w-full h-full max-h-[calc(100vh-230px)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%', width: '100%' }}
          data={sortedMessages}
          itemContent={renderItemContent}
          
          // Chat behavior
          followOutput={(isAtBottom) => {
             return isAtBottom ? 'auto' : false;
          }}
          initialTopMostItemIndex={sortedMessages.length - 1} // Ensure we start at bottom
          alignToBottom // This is crucial for chat interfaces
          
          // Pagination
          startReached={() => {
            if (hasMoreHistory && !isLoadingHistory && onLoadMore) {
              onLoadMore();
            }
          }}
          
          components={{
            Header: Header,
            Footer: Footer,
          }}
          
          // Optional: Add scrollbar styling here if needed on the container
          className="scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
        />
      </motion.div>

      <motion.div
        className="sticky bottom-0 left-0 w-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
       <div className={`w-full ${isFullWidth ? 'max-w-4xl mx-auto' : ''}`}>
        <QuestionInput
          className="p-4 pb-0 w-full max-w-none"
          textareaClassName="h-30 w-full"
          placeholder="Ask me anything..."
          value={currentQuestion}
          setValue={setCurrentQuestion}
          handleCancel={handleCancelQuery}
          handleKeyDown={handleKeyDown}
          handleSubmit={handleQuestionSubmit}
          handleFileUpload={handleFileUpload}
          isUploading={isUploading}
          isUseDeepResearch={isUseDeepResearch}
          isGeneratingPrompt={isGeneratingPrompt}
          handleEnhancePrompt={handleEnhancePrompt}
          isProcessing={isLoading}
          UserPlanID={UserPlanID}
          onAgentModeChange={onAgentModeChange}
          currentAgentMode={currentAgentMode}
          currentAgentType={currentAgentType}
          onModelChange={onModelChange}    
          currentModel={currentModel}     
          userinfo={userinfo}
        />
        </div>
      </motion.div>
    </div>
  );
};

export default ChatMessage;