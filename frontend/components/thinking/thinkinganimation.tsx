import React from 'react';
import { motion } from 'framer-motion';

// Typing animation
const TypingAnimation = ({ className = "" }) => {
  const [text, setText] = React.useState('');
  const fullText = "Agent thinking...";
  
  React.useEffect(() => {
    let index = 0;
    const timer = setInterval(() => {
      if (index <= fullText.length) {
        setText(fullText.slice(0, index));
        index++;
      } else {
        // Reset and start over
        index = 0;
        setText('');
      }
    }, 200);
    
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`flex items-center ${className}`}>
      <span className="text-gray-300">{text}</span>
      <motion.div
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 1, repeat: Infinity }}
        className="w-0.5 h-4 bg-blue-400 ml-1"
      />
    </div>
  );
};

// Usage examples in your chat component
const ChatLoadingStates = () => {
  return (
    <div className="space-y-4 p-4 bg-gray-900 rounded-lg">
      <TypingAnimation />
    </div>
  );
};

export default ChatLoadingStates;