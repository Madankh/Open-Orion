import { useEffect, useRef, useCallback } from 'react';
import { useCollab } from './Yjs';

// Hook for tracking typing in text inputs/textareas
export const useTypingTracker = (
  elementId: string, 
  component: 'notepad' | 'ai_chat',
  blockId?: number
) => {
  const { updatePresence, broadcastTypingInAI } = useCollab();
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastContentRef = useRef<string>('');

  const handleTyping = useCallback((content: string) => {
    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (content !== lastContentRef.current) {
      lastContentRef.current = content;
      
      // Update typing presence immediately
      updatePresence({
        currentlyTyping: {
          component,
          content: content.slice(0, 100), 
          blockId
        }
      });

      // For AI queries, also use the specialized broadcast
      if (component === 'ai_chat' && content.trim()) {
        broadcastTypingInAI(content, component, blockId);
      }
    }

    // Set timeout to clear typing status
    typingTimeoutRef.current = setTimeout(() => {
      updatePresence({
        currentlyTyping: null
      });
      lastContentRef.current = '';
    }, 2000); // Clear after 2 seconds of no typing

  }, [updatePresence, broadcastTypingInAI, component, blockId]);

  useEffect(() => {
    const element = document.getElementById(elementId);
    if (!element) return;

    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      handleTyping(target.value);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Track special keys
      if (e.key === 'Enter' || e.key === 'Escape') {
        updatePresence({
          currentlyTyping: null
        });
      }
    };

    element.addEventListener('input', handleInput);
    element.addEventListener('keydown', handleKeyDown);

    return () => {
      element.removeEventListener('input', handleInput);
      element.removeEventListener('keydown', handleKeyDown);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [elementId, handleTyping, updatePresence]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      updatePresence({
        currentlyTyping: null
      });
    };
  }, [updatePresence]);
};

// Hook for tracking text selection
export const useSelectionTracker = (
  containerRef: React.RefObject<HTMLElement>,
  component: 'notepad' | 'ai_chat'
) => {
  const { updatePresence } = useCollab();
  const selectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSelection = useCallback(() => {
    if (!containerRef.current) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const selectedText = range.toString();

    if (selectedText.length > 0) {
      // Get selection position relative to container
      const containerRect = containerRef.current.getBoundingClientRect();
      const rangeRect = range.getBoundingClientRect();
      
      const relativeX = rangeRect.left - containerRect.left;
      const relativeY = rangeRect.top - containerRect.top;

      updatePresence({
        selection: {
          text: selectedText.slice(0, 50), // Limit selection text
          startX: relativeX,
          startY: relativeY,
          width: rangeRect.width,
          height: rangeRect.height
        },
        activeComponent: component
      });

      // Clear selection after delay
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }
      
      selectionTimeoutRef.current = setTimeout(() => {
        updatePresence({
          selection: null
        });
      }, 3000);
    }
  }, [updatePresence, component, containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseUp = () => {
      setTimeout(handleSelection, 10); // Small delay to ensure selection is finalized
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Track text selection with keyboard (Shift + arrows)
      if (e.shiftKey) {
        setTimeout(handleSelection, 10);
      }
    };

    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('keyup', handleKeyUp);

    return () => {
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('keyup', handleKeyUp);
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }
    };
  }, [handleSelection]);
};

// Hook for tracking component focus/blur
export const useComponentTracker = (
  elementRef: React.RefObject<HTMLElement>,
  component: 'notepad' | 'ai_chat' | 'whiteboard' | 'sidebar'
) => {
  const { updatePresence } = useCollab();

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleFocus = () => {
      updatePresence({
        activeComponent: component,
        lastSeen: Date.now()
      });
    };

    const handleBlur = () => {
      // Don't immediately clear component - user might just be switching tabs
      setTimeout(() => {
        updatePresence({
          activeComponent: null
        });
      }, 1000);
    };

    const handleClick = () => {
      updatePresence({
        activeComponent: component,
        lastSeen: Date.now()
      });
    };

    element.addEventListener('focus', handleFocus, true);
    element.addEventListener('blur', handleBlur, true);
    element.addEventListener('click', handleClick);

    return () => {
      element.removeEventListener('focus', handleFocus, true);
      element.removeEventListener('blur', handleBlur, true);
      element.removeEventListener('click', handleClick);
    };
  }, [updatePresence, component]);
};

// Hook for AI query status tracking
export const useAIQueryTracker = () => {
  const { updateAIInteraction, broadcastAIResponse } = useCollab();

  const trackQueryStart = useCallback((query: string, component: 'notepad' | 'ai_chat', blockId?: number) => {
    updateAIInteraction({
      type: 'typing_query',
      query,
      component,
      blockId,
      timestamp: Date.now()
    });
  }, [updateAIInteraction]);

  const trackResponseReceived = useCallback((response: string, originalQuery: string, component: 'notepad' | 'ai_chat', blockId?: number) => {
    broadcastAIResponse(response, originalQuery, component, blockId);
  }, [broadcastAIResponse]);

  const trackQueryEnd = useCallback(() => {
    updateAIInteraction({
      type: 'idle',
      timestamp: Date.now()
    });
  }, [updateAIInteraction]);

  return {
    trackQueryStart,
    trackResponseReceived,
    trackQueryEnd
  };
};

// Hook for scroll synchronization (optional feature)
export const useScrollSync = (
  containerRef: React.RefObject<HTMLElement>,
  component: 'notepad' | 'ai_chat'
) => {
  const { updatePresence } = useCollab();
  const throttleRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (throttleRef.current) return;

      throttleRef.current = setTimeout(() => {
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        
        const scrollPercentage = scrollHeight > clientHeight 
          ? (scrollTop / (scrollHeight - clientHeight)) * 100 
          : 0;

        updatePresence({
          scrollPosition: {
            component,
            percentage: scrollPercentage,
            timestamp: Date.now()
          }
        });

        throttleRef.current = null;
      }, 100); // Throttle to 10fps
    };

    container.addEventListener('scroll', handleScroll);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
      }
    };
  }, [updatePresence, component]);
};