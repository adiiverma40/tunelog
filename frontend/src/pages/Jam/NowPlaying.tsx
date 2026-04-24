import { useEffect, useState, useRef } from "react";
import { usePlayer, Track } from "../../context/PlayerContext";
import { useGlobalSocket } from "../../context/SocketContext";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";

function formatTime(s: number) {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function getDisplayName(username: string): string {
  return localStorage.getItem(`tunelog_displayname_${username}`) || username;
}

function getAvatarUrl(username: string): string | null {
  return localStorage.getItem(`tunelog_avatar_${username}`);
}

function getUserColor(username: string): string {
  const colors = [
    "bg-violet-500",
    "bg-sky-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-teal-500",
    "bg-indigo-500",
    "bg-orange-500",
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++)
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

async function fetchNowPlayingTrack(): Promise<Track | null> {
  return {
    id: "",
    title: "Start Jam Or Join In",
    artist: "",
    album: "",
    coverArt: "",
    streamUrl: "",
    duration: 0,
  };
}

function UserBadge({ username }: { username: string }) {
  const display = getDisplayName(username);
  const avatar = getAvatarUrl(username);
  const color = getUserColor(username);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 dark:border-gray-700 dark:bg-white/[0.05]">
      <span
        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-[9px] font-bold text-white ${avatar ? "" : color}`}
      >
        {avatar ? (
          <img
            src={avatar}
            alt={display}
            className="h-full w-full object-cover"
          />
        ) : (
          display[0]?.toUpperCase()
        )}
      </span>
      <span className="max-w-[72px] truncate text-[11px] font-medium text-gray-700 dark:text-gray-300">
        {display}
      </span>
    </span>
  );
}

function SeekBar({
  progress,
  currentTime,
  duration,
  canControl,
  onSeek,
}: {
  progress: number;
  currentTime: number;
  duration: number;
  canControl: boolean;
  onSeek: (t: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);
  const [hoverX, setHoverX] = useState(0);

  function getTime(clientX: number) {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    return (
      Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration
    );
  }

  return (
    <div className="select-none">
      <div
        ref={barRef}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onMouseMove={(e) => setHoverX(e.clientX)}
        onClick={(e) => canControl && onSeek(getTime(e.clientX))}
        className={`group relative h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-800 ${canControl ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
      >
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-brand-500 transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-brand-500 shadow-md opacity-0 transition-opacity group-hover:opacity-100 border-2 border-white dark:border-gray-900"
          style={{ left: `calc(${progress}% - 7px)` }}
        />
        {hovering && canControl && barRef.current && (
          <div
            className="pointer-events-none absolute -top-8 rounded bg-gray-800 px-2 py-1 text-[10px] text-white shadow-lg dark:bg-gray-700"
            style={{
              left: `${Math.max(
                0,
                Math.min(
                  barRef.current.offsetWidth - 32,
                  ((hoverX - barRef.current.getBoundingClientRect().left) /
                    barRef.current.offsetWidth) *
                    barRef.current.offsetWidth -
                    16,
                ),
              )}px`,
            }}
          >
            {formatTime(getTime(hoverX))}
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

function VolumeControl({
  volume,
  isMuted,
  onVolume,
  onToggleMute,
}: {
  volume: number;
  isMuted: boolean;
  onVolume: (v: number) => void;
  onToggleMute: () => void;
}) {
  const effective = isMuted ? 0 : volume;
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onToggleMute}
        className="text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200"
      >
        {effective === 0 ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3.63 3.63a1 1 0 0 0-1.41 1.41L7.29 10.1 7 10.4V13.6l.29.29-4.07 4.08a1 1 0 1 0 1.41 1.41L21.37 2.63a1 1 0 0 0-1.41-1.41L3.63 3.63zM11 5.17L9.39 6.78 11 8.39V5.17zM11 18.83l-4-3.27V8.55l-2-2V15.6l6 4.9v-1.67z" />
          </svg>
        ) : effective < 0.5 ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 9v6h4l5 5V4l-5 5H7zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
          </svg>
        )}
      </button>
      <div className="relative h-1.5 w-24 rounded-full bg-gray-200 dark:bg-gray-800">
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-brand-500"
          style={{ width: `${effective * 100}%` }}
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={effective}
          onChange={(e) => onVolume(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}

function UpNextRow({ track, index }: { track: Track; index: number }) {
  return (
    <div className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]">
      <span className="w-4 flex-shrink-0 text-right text-xs tabular-nums text-gray-400">
        {index + 1}
      </span>
      {(track as any).coverArtUrl || track.coverArt ? (
        <img
          src={(track as any).coverArtUrl || track.coverArt}
          alt={track.album ?? "cover"}
          className="h-10 w-10 flex-shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
          <span className="text-sm opacity-50">🎵</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
          {track.title}
        </p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {track.artist}
        </p>
        {(track as any).user && (
          <div className="mt-1.5">
            <UserBadge username={(track as any).user} />
          </div>
        )}
      </div>
      {track.duration != null && (
        <span className="flex-shrink-0 text-xs tabular-nums text-gray-400">
          {formatTime(track.duration)}
        </span>
      )}
    </div>
  );
}

export default function NowPlaying() {
  const {
    track,
    queue,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    play,
    togglePlay,
    next,
    prev,
    seek,
    setVolume,
    toggleMute,
    setIsOnNowPlayingPage,
  } = usePlayer();

  const {
    socket,
    isConnected,
    activeHost,
    isJamActive,
    isHost,
    isJoining,
    setIsHost,
    setIsJoining,
    jamPlayback,
  } = useGlobalSocket();

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsOnNowPlayingPage(true);
    return () => setIsOnNowPlayingPage(false);
  }, [setIsOnNowPlayingPage]);

  const canControl = isHost || !isJamActive;

  useEffect(() => {
    if (!track) {
      setLoading(true);
      fetchNowPlayingTrack()
        .then((t) => {
          if (t) play(t);
        })
        .finally(() => setLoading(false));
    }
  }, [track, play]);

  useEffect(() => {
    const onPlaybackSync = (data: { isPlaying: boolean }) => {
      if (!isJoining || isHost) return;
      const audio = (window as any).__audioRef as HTMLAudioElement | undefined;
      if (!audio) return;
      if (data.isPlaying && audio.paused) audio.play().catch(() => {});
      else if (!data.isPlaying && !audio.paused) audio.pause();
    };
    socket.on("jam_playback", onPlaybackSync);
    return () => {
      socket.off("jam_playback", onPlaybackSync);
    };
  }, [socket, isJoining, isHost]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const upNext = queue.filter((t) => t.title !== track?.title);
  const upNextLimited = upNext.slice(0, 3);
  const coverSrc = (track as any)?.coverArtUrl || track?.coverArt || null;

  const handleStartJam = () => {
    socket.emit("start_jam", { trackId: track?.id });
    setIsHost(true);
    setIsJoining(false);
  };
  const handleStopJam = () => {
    socket.emit("stop_jam");
    setIsHost(false);
    setIsJoining(false);
  };
  const handleJoinJam = () => {
    setIsJoining(true);
    setIsHost(false);
    socket.emit("joinJam");
  };
  const handleLeaveJam = () => {
    socket.emit("leave_jam");
    setIsJoining(false);
  };

  const handleSeek = (t: number) => {
    seek(t);
    if (isHost) socket.emit("sync_time", { positionMs: Math.floor(t * 1000) });
  };

  const jamLabel = isHost
    ? "Hosting"
    : isJoining
      ? "In Jam"
      : activeHost
        ? "Jam Active"
        : "Private";

  const jamDot = isHost
    ? "bg-brand-500"
    : isJoining
      ? "bg-blue-500"
      : isConnected
        ? "bg-green-500"
        : "bg-red-500";

  return (
    <div>
      <PageMeta
        title="Now Playing | TuneLog"
        description="Currently playing track"
      />
      <PageBreadcrumb pageTitle="Now Playing" />

      {activeHost && !isHost && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-blue-200/60 bg-blue-50/60 px-5 py-3 dark:border-blue-900/30 dark:bg-blue-500/5">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
            </span>
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">
              <span className="font-bold">{activeHost}</span> is hosting a Jam
              Session
            </p>
          </div>
          {isJoining ? (
            <button
              onClick={handleLeaveJam}
              className="text-xs font-semibold text-gray-500 transition-colors hover:text-red-500"
            >
              Leave Jam
            </button>
          ) : (
            <button
              onClick={handleJoinJam}
              className="rounded-xl bg-blue-500 px-4 py-1.5 text-xs font-bold text-white shadow transition-all hover:bg-blue-600 active:scale-95"
            >
              Join & Sync
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="animate-pulse text-sm text-gray-400">Loading…</p>
        </div>
      ) : !track ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <span className="text-4xl opacity-30">🎵</span>
          <p className="text-sm text-gray-400">Nothing is playing right now</p>
          <p className="text-xs text-gray-400">
            Start a song in Navidrome and it'll appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="col-span-1 lg:col-span-2 flex flex-col justify-between rounded-3xl border border-gray-200 bg-white p-6 md:p-8 dark:border-gray-800 dark:bg-white/[0.02] shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${jamDot}`} />
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {jamLabel}
                </span>
                {jamPlayback && (
                  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-white/[0.05] dark:text-gray-400">
                    Jam {jamPlayback.isPlaying ? "▶" : "⏸"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isHost ? (
                  <button
                    onClick={handleStopJam}
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-500 transition-all hover:bg-red-100 dark:border-red-900/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 active:scale-95"
                  >
                    Stop Jam
                  </button>
                ) : !activeHost ? (
                  <button
                    onClick={handleStartJam}
                    disabled={!track}
                    className="rounded-xl bg-brand-500 px-3 py-1.5 text-xs font-bold text-white shadow transition-all hover:bg-brand-600 active:scale-95 disabled:opacity-40"
                  >
                    Start Jam
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center md:items-end gap-6 mb-8 text-center md:text-left">
              <div className="flex-shrink-0">
                {coverSrc ? (
                  <img
                    src={coverSrc}
                    alt={track.album ?? "Cover"}
                    className="h-48 w-48 rounded-2xl object-cover shadow-lg border border-gray-100 dark:border-gray-800"
                  />
                ) : (
                  <div className="flex h-48 w-48 items-center justify-center rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-800 shadow-sm">
                    <span className="text-5xl opacity-40">🎵</span>
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 w-full">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
                  {track.album || "Unknown Album"}
                </p>
                <h2 className="text-2xl font-bold leading-tight text-gray-900 dark:text-white md:text-3xl lg:text-4xl truncate">
                  {track.title}
                </h2>
                <p className="mt-1.5 text-base md:text-lg font-medium text-gray-500 dark:text-gray-400 truncate">
                  {track.artist}
                </p>

                <div className="mt-4 flex items-center justify-center md:justify-start gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border ${
                      isPlaying
                        ? "bg-green-50 border-green-200 text-green-600 dark:bg-green-500/10 dark:border-green-500/20 dark:text-green-400"
                        : "bg-gray-50 border-gray-200 text-gray-500 dark:bg-white/[0.02] dark:border-gray-800 dark:text-gray-400"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isPlaying
                          ? "animate-pulse bg-green-500 dark:bg-green-400"
                          : "bg-gray-400 dark:bg-gray-500"
                      }`}
                    />
                    {isPlaying ? "Playing" : "Paused"}
                  </span>
                  {!canControl && (
                    <span className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-medium text-blue-600 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400">
                      Host controlled
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-auto">
              <SeekBar
                progress={progress}
                currentTime={currentTime}
                duration={duration || track.duration || 0}
                canControl={canControl}
                onSeek={handleSeek}
              />

              <div className="mt-6 flex items-center justify-between">
                <div className="w-24 hidden md:block"></div>

                <div className="flex items-center justify-center gap-4 flex-1">
                  <button
                    onClick={prev}
                    disabled={!canControl}
                    className="flex h-12 w-12 items-center justify-center rounded-full text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/10 dark:hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <svg
                      className="h-6 w-6"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M6 19V5h2v14H6zm3.5-7L18 5v14l-8.5-7z" />
                    </svg>
                  </button>

                  <button
                    onClick={togglePlay}
                    disabled={!canControl}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg transition-all hover:scale-105 hover:bg-brand-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isPlaying ? (
                      <svg
                        className="h-7 w-7"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                      </svg>
                    ) : (
                      <svg
                        className="ml-1 h-7 w-7"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>

                  <button
                    onClick={next}
                    disabled={!canControl}
                    className="flex h-12 w-12 items-center justify-center rounded-full text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/10 dark:hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <svg
                      className="h-6 w-6"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M18 5v14h-2V5h2zM6 19V5l8.5 7L6 19z" />
                    </svg>
                  </button>
                </div>

                <div className="w-auto md:w-24 flex justify-end">
                  <VolumeControl
                    volume={volume}
                    isMuted={isMuted}
                    onVolume={setVolume}
                    onToggleMute={toggleMute}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-1 flex flex-col rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02] shadow-sm">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Up Next
              </h3>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                {upNext.length} in queue
              </span>
            </div>

            <div className="flex-1 p-3">
              {upNextLimited.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 py-12">
                  <span className="text-3xl opacity-20">🎶</span>
                  <p className="text-sm text-gray-400">Queue is empty</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {upNextLimited.map((item, idx) => (
                    <UpNextRow key={item.id || idx} track={item} index={idx} />
                  ))}

                  {upNext.length > 3 && (
                    <div className="px-3 pt-3 pb-1 text-center">
                      <p className="text-xs text-gray-400 font-medium">
                        + {upNext.length - 3} more track
                        {upNext.length - 3 > 1 ? "s" : ""}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
