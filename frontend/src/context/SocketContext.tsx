import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { socket } from "../API";

export interface NowPlayingPayload {
  user: string;
  song: { title: string; artist: string; album: string; duration: number };
  playback: { positionMs: number; isPlaying: boolean };
  media: { url: string; albumArtUrl: string };
  timestamp: number;
}

export interface ConnectedUser {
  sid: string;
  username: string;
  isHost: boolean;
  isActive: boolean;
}

export interface ChatMessage {
  id: string;
  username: string;
  text: string;
  sentAt: string;
}

interface SocketContextValue {
  isConnected: boolean;
  mySid: string | null;
  nowPlaying: NowPlayingPayload | null;
  socket: typeof socket;
  activeHost: string | null;
  isJamActive: boolean;
  isHost: boolean;
  isJoining: boolean;
  setIsHost: (value: boolean) => void;
  setIsJoining: (value: boolean) => void;
  jamPlayback: { isPlaying: boolean } | null;
  queue: any[];
  connectedUsers: ConnectedUser[];
  chatMessages: ChatMessage[];
  sendChatMessage: (text: string) => void;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

export const SocketProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [mySid, setMySid] = useState<string | null>(socket.id || null);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingPayload | null>(null);
  const [activeHost, setActiveHost] = useState<string | null>(null);
  const [queue, setQueue] = useState<any[]>([]);
  const [jamPlayback, setJamPlayback] = useState<{ isPlaying: boolean } | null>(
    null,
  );
  const [isHost, setIsHost] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const isJamActive = !!activeHost;

  const sendChatMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    socket.emit("chat_message", { text: trimmed });
  }, []);

  useEffect(() => {
    if (!socket.connected) socket.connect();

    const onConnect = () => {
      console.log("Socket connected");
      setIsConnected(true);
      setMySid(socket.id || null);
    };

    const onDisconnect = () => {
      console.log("Socket disconnected");
      setIsConnected(false);
    };

    const onJamAnnounced = (data: {
      hostName: string | null;
      trackId: string | null;
      isPlaying?: boolean;
    }) => {
      setActiveHost(data.hostName);
      if (typeof data.isPlaying === "boolean") {
        setJamPlayback({ isPlaying: data.isPlaying });
      }
    };

    const onJamFinished = () => {
      setActiveHost(null);
      setJamPlayback(null);
      setIsHost(false);
      setIsJoining(false);
      setQueue([]);
      setNowPlaying(null);
    };
    const onJamLeave = () => {
      console.log("leaving jam")
      setQueue([]);
      setNowPlaying(null);
      setIsJoining(false);
    };

    const onUsers = (
      data: Record<
        string,
        { username: string; isHost: boolean; isActive?: boolean }
      >,
    ) => {
      const list: ConnectedUser[] = Object.entries(data).map(([sid, info]) => ({
        sid,
        username: info.username,
        isHost: info.isHost,
        isActive: info.isActive !== false,
      }));
      setConnectedUsers(list);

      const me = list.find((u) => u.sid === socket.id);
      if (me && me.isHost !== isHost) {
        setIsHost(me.isHost);
      }
    };

    const onJamHostLost = (data: { hostName: string | null }) => {
      if (!data.hostName) return;
      setConnectedUsers((prev) =>
        prev.map((u) =>
          u.username === data.hostName ? { ...u, isActive: false } : u,
        ),
      );
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("now_playing", setNowPlaying);
    socket.on("jam_announced", onJamAnnounced);
    socket.on("jam_finished", onJamFinished);
    socket.on("jam_playback", setJamPlayback);
    socket.on("queue_update", setQueue);
    socket.on("users", onUsers);
    socket.on("jam_host_lost", onJamHostLost);
    socket.on("leaveJam" , onJamLeave)
    socket.on("chat_message", (msg) => setChatMessages((p) => [...p, msg]));

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("now_playing", setNowPlaying);
      socket.off("jam_announced", onJamAnnounced);
      socket.off("jam_finished", onJamFinished);
      socket.off("jam_playback", setJamPlayback);
      socket.off("queue_update", setQueue);
      socket.off("users", onUsers);
      socket.off("jam_host_lost", onJamHostLost);
      socket.off("chat_message");

    socket.off("leaveJam" , onJamLeave)
    };
  }, [isHost]);

  return (
    <SocketContext.Provider
      value={{
        isConnected,
        mySid,
        nowPlaying,
        socket,
        activeHost,
        isJamActive,
        isHost,
        isJoining,
        setIsHost,
        setIsJoining,
        jamPlayback,
        queue,
        connectedUsers,
        chatMessages,
        sendChatMessage,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export function useGlobalSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx)
    throw new Error("useGlobalSocket must be used within a SocketProvider");
  return ctx;
}
