import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useCollab } from './Yjs';

interface CursorPosition {
  x: number;
  y: number;
  userId: string;
  userEmail: string;
  color: string;
  component: 'notepad' | 'ai' |'sidebar'|'whiteboard'|'canvas'|'ai_chat'| null;
  action?: 'typing' | 'selecting' | 'idle' | 'ai_query' | 'ai_response';
  actionText?: string;
  blockId?: number;
  lastUpdate: number;
}

interface RealTimeCursorSystemProps {
  darkMode: boolean;
  projectType: 'personal' | 'group';
  currentComponent: 'notepad' | 'ai' | 'whiteboard' | 'sidebar';
  children: React.ReactNode;
}

const RealTimeCursorSystem: React.FC<RealTimeCursorSystemProps> = ({
  darkMode,
  projectType,
  currentComponent,
  children
}) => {
  const { updatePresence, getActiveCollaborators } = useCollab();
  // const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const [cursors, setCursors] = useState<Map<string, CursorPosition>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMousePosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const throttleTimer = useRef<NodeJS.Timeout | null>(null);

  // Update collaborators periodically (only if group project)
  useEffect(() => {
    if (projectType !== 'group') return;
    const updateInterval = setInterval(() => {
      const activeCollabs = getActiveCollaborators();
      // setCollaborators(activeCollabs);
      const newCursors = new Map<string, CursorPosition>();
      activeCollabs.forEach(collab => {
        if (collab.cursor) {
          newCursors.set(collab.userId, {
            x: collab.cursor.x,
            y: collab.cursor.y,
            userId: collab.userId,
            userEmail: collab.email,
            color: collab.color,
            component: collab.activeComponent,
            action: collab.currentlyTyping ? 'typing' :
                   collab.aiInteraction?.type === 'typing_query' ? 'ai_query' :
                   collab.aiInteraction?.type === 'receiving_response' ? 'ai_response' : 'idle',
            actionText: collab.currentlyTyping?.content || collab.aiInteraction?.query,
            blockId: collab.currentlyTyping?.blockId,
            lastUpdate: collab.lastSeen
          });
        }
      });
      setCursors(newCursors);
    }, 100);
    return () => clearInterval(updateInterval);
  }, [getActiveCollaborators, projectType]);

  // Track mouse movement with throttling
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    lastMousePosition.current = { x, y };

    if (throttleTimer.current) return;
    
    throttleTimer.current = setTimeout(() => {
      updatePresence({
        cursor: { x, y },
        activeComponent: currentComponent,
        lastSeen: Date.now()
      });
      throttleTimer.current = null;
    }, 50);
  }, [updatePresence, currentComponent]);

  // Track when user leaves the component
  const handleMouseLeave = useCallback(() => {
    updatePresence({
      cursor: null,
      activeComponent: null
    });
  }, [updatePresence]);

  // Set up mouse tracking (only if group project)
  useEffect(() => {
    if (projectType !== 'group') return;
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      if (throttleTimer.current) clearTimeout(throttleTimer.current);
    };
  }, [handleMouseMove, handleMouseLeave, projectType]);

  // Clean up old cursors (only if group project)
  useEffect(() => {
    if (projectType !== 'group') return;
    const cleanup = setInterval(() => {
      const now = Date.now();
      const staleThreshold = 5000; 
      
      setCursors(prev => {
        const updated = new Map(prev);
        for (const [userId, cursor] of updated.entries()) {
          if (now - cursor.lastUpdate > staleThreshold) {
            updated.delete(userId);
          }
        }
        return updated;
      });
    }, 1000);

    return () => clearInterval(cleanup);
  }, [projectType]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {children}
      {projectType === 'group' &&
        Array.from(cursors.values()).map(cursor => (
          <RemoteCursor key={cursor.userId} cursor={cursor} darkMode={darkMode} />
        ))}
    </div>
  );
};

// Individual cursor component
interface RemoteCursorProps {
  cursor: CursorPosition;
  darkMode: boolean;
}

const RemoteCursor: React.FC<RemoteCursorProps> = ({ cursor }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const now = Date.now();
    const age = now - cursor.lastUpdate;
    if (age > 3000) setIsVisible(false);
    else setIsVisible(true);
  }, [cursor.lastUpdate]);

  const getActionDisplay = () => {
    switch (cursor.action) {
      case 'typing':
        return { icon: '✏️', text: `Typing: ${cursor.actionText?.slice(0, 30)}${(cursor.actionText?.length || 0) > 30 ? '...' : ''}`, bgColor: '#3b82f6' };
      case 'ai_query':
        return { icon: '🤖', text: `Asking AI: ${cursor.actionText?.slice(0, 25)}${(cursor.actionText?.length || 0) > 25 ? '...' : ''}`, bgColor: '#8b5cf6' };
      case 'ai_response':
        return { icon: '⚡', text: 'Receiving AI response...', bgColor: '#10b981' };
      case 'selecting':
        return { icon: '👆', text: 'Selecting', bgColor: '#f59e0b' };
      default:
        return null;
    }
  };

  const actionDisplay = getActionDisplay();
  const componentName = cursor.component === 'notepad' ? 'Canvas' : 
                       cursor.component === 'ai' ? 'AI Chat' :
                       cursor.component === 'whiteboard' ? 'Whiteboard' :
                       cursor.component === 'sidebar' ? 'Sidebar' : '';

  return (
    <div
      style={{
        position: 'absolute',
        left: cursor.x,
        top: cursor.y,
        pointerEvents: 'none',
        zIndex: 9999,
        transform: 'translate(-2px, -2px)',
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.3s ease'
      }}
    >
      {/* Cursor pointer */}
      <svg width="24" height="24" viewBox="0 0 24 24" style={{ filter: `drop-shadow(0 2px 4px rgba(0,0,0,0.3))` }}>
        <path
          d="M5.65376 12.3673H8.33578L9.4907 16.2644C9.50718 16.3319 9.55313 16.3835 9.61454 16.4016C9.66869 16.4164 9.72906 16.3933 9.75938 16.3464L17.4394 5.22062C17.4797 5.16154 17.4767 5.08418 17.4316 5.02814C17.4029 4.9927 17.359 4.97232 17.3144 4.97232C17.2906 4.97232 17.2665 4.97631 17.2428 4.98427L5.65376 12.3673Z"
          fill={cursor.color}
          stroke="white"
          strokeWidth="1.5"
        />
      </svg>

      {/* User label */}
      <div
        style={{
          position: 'absolute',
          left: '20px',
          top: '-8px',
          backgroundColor: cursor.color,
          color: 'white',
          padding: '4px 8px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: '500',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          maxWidth: '200px',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {cursor?.userEmail?.split('@')[0]}
        {componentName && (
          <span style={{ opacity: 0.8, fontSize: '10px', marginLeft: '4px' }}>• {componentName}</span>
        )}
      </div>

      {/* Action bubble */}
      {actionDisplay && (
        <div
          style={{
            position: 'absolute',
            left: '20px',
            top: '20px',
            backgroundColor: actionDisplay.bgColor,
            color: 'white',
            padding: '6px 10px',
            borderRadius: '16px',
            fontSize: '11px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
            maxWidth: '250px',
            animation: 'pulse 2s infinite'
          }}
        >
          <span>{actionDisplay.icon}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {actionDisplay.text}
          </span>
        </div>
      )}

      <style>
        {`
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
        `}
      </style>
    </div>
  );
};

export default RealTimeCursorSystem;
