import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { useGlobalSocket } from "./SocketContext";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  coverArt?: string;
  coverArtUrl?: string;
  streamUrl: string;
  duration?: number;
}

interface PlayerContextValue {
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isOnNowPlayingPage: boolean;
  isHost: boolean;
  play: (track?: Track) => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  setIsOnNowPlayingPage: (val: boolean) => void;
  audioRef: React.RefObject<HTMLAudioElement>;
  queue: Track[];
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(new Audio());
  const [track, setTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnNowPlayingPage, setIsOnNowPlayingPage] = useState(false);

  const { nowPlaying, jamPlayback, socket } = useGlobalSocket();
  const lastSyncTime = useRef<number>(0);
  const trackRef = useRef<Track | null>(null);
  trackRef.current = track;

  const isHost = localStorage.getItem("isHost") === "true";
  const isJoining = localStorage.getItem("isJoining") === "true";
  const inJam = isHost || isJoining;
  console.log("in Jam : ", inJam);
  const [queue, setQueue] = useState<Track[]>([]);

  useEffect(() => {
    socket.emit("get_queue");
    const handleQueueUpdate = (newQueue: Track[]) => {
      setQueue(newQueue);
    };
    socket.on("queue_update", handleQueueUpdate);
    return () => {
      socket.off("queue_update", handleQueueUpdate);
    };
  }, [socket]);

  useEffect(() => {
    const audio = audioRef.current;

    const onTimeUpdate = () => {
      const current = audio.currentTime;
      setCurrentTime(current);
      if (localStorage.getItem("isHost") === "true") {
        if (
          current - lastSyncTime.current >= 1 ||
          current < lastSyncTime.current
        ) {
          lastSyncTime.current = current;
          socket.emit("sync_time", { positionMs: Math.floor(current * 1000) });
        }
      }
    };

    const onDurationChange = () => setDuration(audio.duration || 0);

    const onEnded = () => {
      setIsPlaying(false);
      console.log("music finished");
      const amHost = localStorage.getItem("isHost") === "true";
      const amJoining = localStorage.getItem("isJoining") === "true";
      if (amJoining && !amHost) return;
      if (amHost) {
        socket.emit("jam_next");
        return;
      }

      setQueue((currentQueue) => {
        const currentId = trackRef.current?.id;
        const idx = currentQueue.findIndex((t) => t.id === currentId);
        const nextTrack = currentQueue[idx + 1] ?? null;

        const audio = audioRef.current;

        if (nextTrack) {
          audio.src = nextTrack.streamUrl;
          audio.load();
          setTrack(nextTrack);
          trackRef.current = nextTrack;
          setCurrentTime(0);
          setDuration(0);
          audio.play().catch(console.error);
        } else {
          console.log("Queue ended → stopping player");

          audio.pause();
          audio.currentTime = 0;
          audio.src = "";
          audio.load();

          setTrack(null);
          trackRef.current = null;
          setCurrentTime(0);
          setDuration(0);
        }

        return currentQueue;
      });
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [socket]);

  useEffect(() => {
    const handleRoomSync = (data: { positionMs: number }) => {
      if (localStorage.getItem("isHost") === "true") return;
      if (localStorage.getItem("isJoining") !== "true") return;

      const hostTimeSec = data.positionMs / 1000;
      if (Math.abs(audioRef.current.currentTime - hostTimeSec) > 1.5) {
        audioRef.current.currentTime = hostTimeSec;
      }
      if (audioRef.current.paused) {
        audioRef.current
          .play()
          .catch(() =>
            console.warn("Autoplay blocked — waiting for interaction"),
          );
      }
    };

    socket.on("sync_room_time", handleRoomSync);
    return () => {
      socket.off("sync_room_time", handleRoomSync);
    };
  }, [socket]);

  useEffect(() => {
    if (!jamPlayback) return;
    if (localStorage.getItem("isHost") === "true") return;
    if (localStorage.getItem("isJoining") !== "true") return;
    if (jamPlayback.isPlaying) {
      audioRef.current.play().catch(console.error);
    } else {
      audioRef.current.pause();
    }
  }, [jamPlayback]);

  const play = useCallback((newTrack?: Track) => {
    const audio = audioRef.current;
    if (newTrack && newTrack.id !== trackRef.current?.id) {
      audio.src = newTrack.streamUrl;
      audio.load();
      setTrack(newTrack);
      trackRef.current = newTrack;
      setCurrentTime(0);
      setDuration(0);
    }
    audio.play().catch(console.error);
  }, []);

  const pause = useCallback(() => audioRef.current.pause(), []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    const amHost = localStorage.getItem("isHost") === "true";
    const amJoining = localStorage.getItem("isJoining") === "true";

    if (amJoining && !amHost) return;
    if (audio.paused) {
      audio.play().catch(console.error);
      if (amHost) socket.emit("jam_play");
    } else {
      audio.pause();
      if (amHost) socket.emit("jam_pause");
    }
  }, [socket]);

  const next = useCallback(() => {
    if (localStorage.getItem("isHost") !== "true") return;
    socket.emit("jam_next");
  }, [socket]);

  const prev = useCallback(() => {
    if (localStorage.getItem("isHost") !== "true") return;
    socket.emit("jam_prev");
  }, [socket]);

  const seek = useCallback((time: number) => {
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const setVolume = useCallback((vol: number) => {
    audioRef.current.volume = vol;
    setVolumeState(vol);
    if (vol > 0) setIsMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    audio.muted = !audio.muted;
    setIsMuted(audio.muted);
  }, []);

  useEffect(() => {
    if (!nowPlaying) return;

    const isNewTrack = trackRef.current?.streamUrl !== nowPlaying.media.url;
    if (isNewTrack) {
      play({
        id: nowPlaying.timestamp.toString(),
        title: nowPlaying.song.title,
        artist: nowPlaying.song.artist,
        album: nowPlaying.song.album,
        coverArt: nowPlaying.media.albumArtUrl,
        streamUrl: nowPlaying.media.url,
        duration: nowPlaying.song.duration / 1000,
      });
    }

    const audio = audioRef.current;
    if (nowPlaying.playback.isPlaying && audio.paused) {
      audio.play().catch(console.error);
    } else if (!nowPlaying.playback.isPlaying && !audio.paused) {
      audio.pause();
    }
  }, [nowPlaying, play]);

  return (
    <PlayerContext.Provider
      value={{
        track,
        isPlaying,
        currentTime,
        duration,
        volume,
        isMuted,
        isOnNowPlayingPage,
        isHost,
        play,
        pause,
        togglePlay,
        next,
        prev,
        seek,
        setVolume,
        toggleMute,
        setIsOnNowPlayingPage,
        audioRef,
        queue,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside PlayerProvider");
  return ctx;
}
