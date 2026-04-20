import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { socket } from "../API/API";

export interface NowPlayingPayload {
  user: string;
  song: { title: string; artist: string; album: string; duration: number };
  playback: { positionMs: number; isPlaying: boolean };
  media: { url: string; albumArtUrl: string };
  timestamp: number;
}

interface SocketContextValue {
  isConnected: boolean;
  nowPlaying: NowPlayingPayload | null;
  socket: typeof socket;
  activeHost: string | null;
  jamPlayback: { isPlaying: boolean } | null;
  queue: any[];
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

export const SocketProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingPayload | null>(null);
  const [activeHost, setActiveHost] = useState<string | null>(null);
  const [queue, setQueue] = useState<any[]>([]);
  const [jamPlayback, setJamPlayback] = useState<{ isPlaying: boolean } | null>(
    null,
  );
  const onQueueUpdate = (data: any) => {
    // console.log("queue_update:", data);
    setQueue(data);
  };

  useEffect(() => {
    if (!socket.connected) socket.connect();

    const onConnect = () => {
      console.log(" Socket connected");
      setIsConnected(true);
    };

    const onDisconnect = () => {
      console.log("Socket disconnected");
      setIsConnected(false);
    };

    const onNowPlaying = (data: NowPlayingPayload) => {
      console.log("🎵 now_playing:", data);
      setNowPlaying(data);
    };

    const onJamAnnounced = (data: {
      hostName: string;
      trackId: string;
      isPlaying?: boolean;
    }) => {
      console.log("Jam announced by:", data.hostName);
      setActiveHost(data.hostName);

      if (typeof data.isPlaying === "boolean") {
        setJamPlayback({ isPlaying: data.isPlaying });
      }
    };

    const onJamFinished = () => {
      console.log("Jam finished");
      setActiveHost(null);
      setJamPlayback(null);
      localStorage.removeItem("isJoining");
    };

    const onJamPlay = () => {
      console.log("jam_play");
      setJamPlayback({ isPlaying: true });
    };

    const onJamPause = () => {
      console.log("jam_pause");
      setJamPlayback({ isPlaying: false });
    };

    const onJamPlayback = (data: { isPlaying: boolean }) => {
      console.log("⏯ jam_playback:", data.isPlaying ? "play" : "pause");
      setJamPlayback(data);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("now_playing", onNowPlaying);
    socket.on("jam_announced", onJamAnnounced);
    socket.on("jam_finished", onJamFinished);
    socket.on("jam_play", onJamPlay);
    socket.on("jam_pause", onJamPause);
    socket.on("jam_playback", onJamPlayback);
    socket.on("queue_update", onQueueUpdate);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("now_playing", onNowPlaying);
      socket.off("jam_announced", onJamAnnounced);
      socket.off("jam_finished", onJamFinished);
      socket.off("jam_play", onJamPlay);
      socket.off("jam_pause", onJamPause);
      socket.off("jam_playback", onJamPlayback);
      socket.off("queue_update", onQueueUpdate);
    };
  }, []);

  return (
    <SocketContext.Provider
      value={{
        isConnected,
        nowPlaying,
        socket,
        activeHost,
        jamPlayback,
        queue,
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
