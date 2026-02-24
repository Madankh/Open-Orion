"use client";

import { motion } from "framer-motion";
import Markdown from "@/components/markdown";
import Action from "@/components/action";
import { Message, ActionStep } from "@/typings/agent";
import { getFileIconAndColor } from "@/utils/file-utils";

interface ChatBubbleListProps {
  messageList: Message[];
  workspaceInfo: string;
  handleClickAction: (action: ActionStep | undefined, isReplay?: boolean) => void;
  onToggleTab?: () => void;
  isTabVisible?: boolean;
  activeTab?: boolean;
}

const ChatBubbleList = ({ messageList, workspaceInfo, handleClickAction,onToggleTab,isTabVisible,activeTab }: ChatBubbleListProps) => {
  return (
    <>
      {messageList.map((message, index) => (
        <motion.div
          key={`${message.id}-${index}`}
          className={`mb-4 ${message.role === "user" ? "text-right" : "text-left"} w-full min-w-0`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 * index, duration: 0.3 }}
        >
          {/* FILES */}
          {message.files && message.files.length > 0 && (
            <div className="flex flex-col gap-2 mb-2">
              {message.files.map((fileName, fileIndex) => {
                const isimg = /\.(jpeg|jpg|gif|png|webp|svg|heic|bmp)$/i.test(fileName);

                if (isimg && message.fileContents?.[fileName]) {
                  return (
                    <div
                      key={`${message.id}-file-${fileIndex}`}
                      className="inline-block ml-auto rounded-3xl overflow-hidden max-w-[320px]"
                    >
                      <div className="w-40 h-40 rounded-xl overflow-hidden">
                        <img
                          src={message.fileContents[fileName]}
                          alt={fileName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  );
                }

                const { IconComponent, bgColor, label } = getFileIconAndColor(fileName);
                return (
                  <div
                    key={`${message.id}-file-${fileIndex}`}
                    className="inline-block ml-auto bg-[#35363a] text-white rounded-2xl px-4 py-3 border border-gray-700 shadow-sm max-w-full"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex items-center justify-center w-12 h-12 ${bgColor} rounded-xl flex-shrink-0`}>
                        <IconComponent className="size-6 text-white" />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-base font-medium truncate">{fileName}</span>
                        <span className="text-left text-sm text-gray-500">{label}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* CONTENT */}
          {message.content && (
            <motion.div
              className={`inline-block text-left rounded-lg ${
                message.role === "user"
                  ? "bg-[#35363a] p-3 text-white max-w-[80%] border border-[#3A3B3F] shadow-sm whitespace-pre-wrap break-words"
                  : "text-white w-full break-words overflow-wrap-anywhere"
              }`}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            >
              {message.role === "user" ? (
                <div className="break-words overflow-wrap-anywhere">{message.content}</div>
              ) : (
                <div className="prose prose-invert max-w-none break-words overflow-wrap-anywhere">
                  <Markdown>{message.content}</Markdown>
                </div>
              )}
            </motion.div>
          )}

          {/* ACTION */}
          {message.action && (
            <motion.div
              className="mt-2 w-full min-w-0"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * index, duration: 0.3 }}
            >
              <Action
                workspaceInfo={workspaceInfo}
                type={message.action.type}
                value={message.action.data}
                onClick={() => handleClickAction(message.action, true)}
                onToggleTab={onToggleTab}
                isTabVisible={isTabVisible}
                activeTab={activeTab}
                actionType={message.action.type}
              />
            </motion.div>
          )}
        </motion.div>
      ))}
    </>
  );
};

export default ChatBubbleList;