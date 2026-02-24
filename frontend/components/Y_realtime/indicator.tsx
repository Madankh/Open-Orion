import React, { useState, useEffect, useMemo } from 'react';
import { Users, Eye, Edit3, MessageSquare, Loader2, Monitor, PenTool, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CollaboratorActivity {
  userId: string;
  userEmail: string;
  component: 'notepad' | 'ai_chat' | 'whiteboard';
  blockId?: number;
  action: 'viewing' | 'typing' | 'ai_query' | 'idle';
  content?: string;
  timestamp: number;
  color: string;
}

interface CollaborationIndicatorProps {
  activities: CollaboratorActivity[];
  darkMode?: boolean;
  currentBlockId?: number;
  currentComponent?: 'notepad' | 'ai_chat' | 'whiteboard';
}

const CollaborationIndicator: React.FC<CollaborationIndicatorProps> = ({
  activities,
  darkMode = true,
  currentBlockId,

}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTooltip, setShowTooltip] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Update current time every 5 seconds for smoother "time ago" display
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  // Filter active collaborators (debounced refresh every 5s)
  const activeCollaborators = useMemo(() => {
    return activities.filter(a => now - a.timestamp < 30000);
  }, [activities, now]);

  // Keep the latest activity per user
  const collaboratorsByUser = useMemo(() => {
    const map = new Map<string, CollaboratorActivity>();
    for (const act of activeCollaborators) {
      const prev = map.get(act.userId);
      if (!prev || act.timestamp > prev.timestamp) map.set(act.userId, act);
    }
    return Array.from(map.values());
  }, [activeCollaborators]);

  // Group by component
  const collaboratorsByComponent = useMemo(() => {
    const grouped: Record<string, CollaboratorActivity[]> = {
      notepad: [],
      ai_chat: [],
      whiteboard: []
    };
    collaboratorsByUser.forEach(c => grouped[c.component]?.push(c));
    return grouped;
  }, [collaboratorsByUser]);

  const getDisplayName = (email: string) => {
    const username = email.split('@')[0];
    return username.charAt(0).toUpperCase() + username.slice(1);
  };

  const getComponentLabel = (c: string) =>
    c === 'notepad' ? 'Canvas' : c === 'ai_chat' ? 'AI Chat' : 'Whiteboard';

  const getActivityText = (a: CollaboratorActivity) => {
    const loc = a.component === 'notepad' && a.blockId
      ? `Block #${a.blockId}`
      : getComponentLabel(a.component);
    if (a.action === 'typing') return `Editing ${loc}`;
    if (a.action === 'ai_query') return `Asking AI in ${loc}`;
    if (a.action === 'viewing') return `Viewing ${loc}`;
    return `Active in ${loc}`;
  };

  const getActivityIcon = (a: CollaboratorActivity) => {
    if (a.action === 'typing') return <Edit3 size={12} />;
    if (a.action === 'ai_query') return <Zap size={12} />;
    if (a.action === 'viewing') return <Eye size={12} />;
    return null;
  };

  const getTimeAgo = (timestamp: number) => {
    const s = Math.floor((now - timestamp) / 1000);
    if (s < 5) return 'now';
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m`;
  };

  if (!collaboratorsByUser.length) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '16px',
      right: '16px',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: '8px'
    }}>
      {/* Compact header */}
      <motion.div
        layout
        onClick={() => setIsExpanded(p => !p)}
        whileHover={{ scale: 1.02 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          background: darkMode ? 'rgba(31,41,55,0.95)' : 'rgba(255,255,255,0.95)',
          border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
          borderRadius: '16px',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          backdropFilter: 'blur(12px)',
          minWidth: '200px'
        }}
      >
        <Users size={18} color={darkMode ? '#60a5fa' : '#3b82f6'} />
        <motion.div
          layout
          style={{
            display: 'flex',
            gap: '6px',
            flex: 1,
            overflow: 'hidden'
          }}
        >
          <AnimatePresence>
            {collaboratorsByUser.slice(0, 3).map(c => (
              <motion.div
                key={c.userId}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                onMouseEnter={() => setShowTooltip(c.userId)}
                onMouseLeave={() => setShowTooltip(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px',
                  borderRadius: '12px',
                  background: c.color + '20',
                  border: `1px solid ${c.color}40`,
                  fontSize: '12px',
                  fontWeight: 600,
                  color: darkMode ? '#f3f4f6' : '#111827',
                  position: 'relative'
                }}
              >
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: c.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: '700',
                  color: '#fff'
                }}>
                  {getDisplayName(c.userEmail)[0]}
                </div>
                <span style={{
                  fontSize: '12px',
                  maxWidth: '80px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {getDisplayName(c.userEmail)}
                </span>
                {c.action === 'typing' && (
                  <Loader2
                    size={12}
                    style={{
                      animation: 'spin 1s linear infinite',
                      color: c.color
                    }}
                  />
                )}
                {showTooltip === c.userId && (
                  <div style={{
                    position: 'absolute',
                    top: '32px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    padding: '8px 12px',
                    background: darkMode ? '#1f2937' : '#fff',
                    border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    fontSize: '11px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{c.userEmail}</div>
                    <div style={{ opacity: 0.8, fontSize: 10 }}>
                      {getActivityText(c)} • {getTimeAgo(c.timestamp)}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {collaboratorsByUser.length > 3 && (
            <span style={{
              padding: '4px 8px',
              borderRadius: '12px',
              background: darkMode ? '#4b5563' : '#e5e7eb',
              fontSize: '11px',
              fontWeight: '600'
            }}>
              +{collaboratorsByUser.length - 3}
            </span>
          )}
        </motion.div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ fontSize: 12, color: darkMode ? '#9ca3af' : '#6b7280' }}
        >
          ▼
        </motion.div>
      </motion.div>

      {/* Expanded section */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            layout
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            style={{
              width: '380px',
              maxHeight: '500px',
              overflowY: 'auto',
              background: darkMode ? 'rgba(31,41,55,0.98)' : '#fff',
              border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
              backdropFilter: 'blur(16px)'
            }}
          >
            <div style={{ padding: '16px', borderBottom: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}` }}>
              <div style={{
                fontSize: 16,
                fontWeight: 700,
                color: darkMode ? '#f3f4f6' : '#111827'
              }}>
                Live Collaboration
              </div>
            </div>
            <div style={{ padding: '12px' }}>
              {Object.entries(collaboratorsByComponent).map(([component, collabs]) => (
                collabs.length > 0 && (
                  <div key={component} style={{ marginBottom: 16 }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 12px',
                      background: darkMode ? '#374151' : '#f3f4f6',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600
                    }}>
                      {component === 'notepad' ? <PenTool size={12} /> :
                        component === 'ai_chat' ? <MessageSquare size={12} /> :
                          <Monitor size={12} />}
                      <span>{getComponentLabel(component)}</span>
                      <span style={{
                        marginLeft: 'auto',
                        padding: '2px 6px',
                        borderRadius: 6,
                        background: darkMode ? '#4b5563' : '#e5e7eb',
                        fontSize: 10
                      }}>{collabs.length}</span>
                    </div>
                    {collabs.map(c => {
                      const isSameBlock = currentBlockId && c.blockId === currentBlockId && c.component === 'notepad';
                      return (
                        <motion.div
                          key={c.userId}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          style={{
                            padding: '12px',
                            marginTop: 8,
                            background: isSameBlock
                              ? (darkMode ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.05)')
                              : (darkMode ? '#1f2937' : '#fff'),
                            border: `1px solid ${isSameBlock
                              ? (darkMode ? 'rgba(59,130,246,0.3)' : 'rgba(59,130,246,0.2)')
                              : (darkMode ? '#374151' : '#e5e7eb')}`,
                            borderRadius: 10
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 36,
                              height: 36,
                              borderRadius: '50%',
                              background: c.color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              color: '#fff'
                            }}>{getDisplayName(c.userEmail)[0]}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600 }}>{getDisplayName(c.userEmail)}</div>
                              <div style={{ fontSize: 11, color: darkMode ? '#9ca3af' : '#6b7280' }}>{c.userEmail}</div>
                            </div>
                            <div style={{ fontSize: 11, color: darkMode ? '#9ca3af' : '#6b7280' }}>
                              {getTimeAgo(c.timestamp)}
                            </div>
                          </div>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginTop: 8,
                            background: darkMode ? '#374151' : '#f9fafb',
                            padding: '8px 10px',
                            borderRadius: 6
                          }}>
                            {getActivityIcon(c)}
                            <span style={{ flex: 1 }}>{getActivityText(c)}</span>
                            {isSameBlock && (
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: darkMode ? '#3b82f6' : '#60a5fa',
                                color: '#fff',
                                fontSize: 10
                              }}>Same block</span>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default React.memo(CollaborationIndicator);
