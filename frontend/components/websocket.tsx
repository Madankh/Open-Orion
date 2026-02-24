"use client";
import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';

interface WebSocketContextType {
  socket: WebSocket | null;
  isConnected: boolean;
  reconnect: () => void;
  resetConnection: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

interface RootState {
  user: {
    currentUser?: {
      id?: string;
      user?: { _id: string };
    };
    accessToken: string;
  };
}

interface WebSocketProviderProps {
  children: ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const user = useSelector((state: RootState) => state.user);
  const accessToken = user?.accessToken;

  const cleanupConnection = () => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  const createConnection = () => {
    if (!accessToken) return;

    if (socket) {
      socket.close();
    }
    cleanupConnection();
    const ws = new WebSocket(`ws://localhost:8000/ws?token=${encodeURIComponent(accessToken)}`);
    ws.onopen = () => {
      setIsConnected(true);
      
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 25000);
      
      // Send initial workspace info request
      ws.send(JSON.stringify({ type: "workspace_info", content: {} }));
    };

    ws.onclose = () => {
      setIsConnected(false);
      setSocket(null);
      cleanupConnection();
      
      // Auto-reconnect after 3 seconds if we have a token
      if (accessToken) {
        reconnectTimeoutRef.current = setTimeout(() => {
          createConnection();
        }, 3000);
      }
    };

    ws.onerror = () => {
      toast.error("WebSocket connection error");
    };

    setSocket(ws);
  };

  const reconnect = () => {
    createConnection();
  };

  const resetConnection = () => {
    if (socket) {
      socket.close();
    }
    // Create new connection after brief delay
    setTimeout(createConnection, 100);
  };

  // Initialize connection when accessToken is available
  useEffect(() => {
    if (accessToken) {
      createConnection();
    }

    // Cleanup on unmount or token change
    return () => {
      if (socket) {
        socket.close();
      }
      cleanupConnection();
    };
  }, [accessToken]); // Only recreate when token changes

  const contextValue: WebSocketContextType = {
    socket,
    isConnected,
    reconnect,
    resetConnection,
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};