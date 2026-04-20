import { useEffect, useState } from "react";
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

  const { socket, isConnected, activeHost } = useGlobalSocket();
  // console.log(track?.coverArt)
  const [loading, setLoading] = useState(false);
  const [isHost, setIsHost] = useState(
    localStorage.getItem("isHost") === "true",
  );
  const [isJoining, setIsJoining] = useState(
    localStorage.getItem("isJoining") === "true",
  );

  useEffect(() => {
    setIsOnNowPlayingPage(true);
    return () => setIsOnNowPlayingPage(false);
  }, [setIsOnNowPlayingPage]);

  useEffect(() => {
    const syncFlags = () => {
      setIsHost(localStorage.getItem("isHost") === "true");
      setIsJoining(localStorage.getItem("isJoining") === "true");
    };
    window.addEventListener("storage", syncFlags);
    return () => window.removeEventListener("storage", syncFlags);
  }, []);

  const canControl = isHost || (!activeHost && !isJoining);

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
      if (localStorage.getItem("isJoining") !== "true") return;
      if (localStorage.getItem("isHost") === "true") return;
      const audio = (window as Window & { __audioRef?: HTMLAudioElement })
        .__audioRef;
      if (!audio) return;
      if (data.isPlaying && audio.paused) audio.play().catch(() => {});
      else if (!data.isPlaying && !audio.paused) audio.pause();
    };
    socket.on("jam_playback", onPlaybackSync);
    return () => {
      socket.off("jam_playback", onPlaybackSync);
    };
  }, [socket]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleStartJam = () => {
    socket.emit("start_jam", {
      username: localStorage.getItem("tunelog_user"),
      trackId: track?.id,
    });
    localStorage.setItem("isHost", "true");
    localStorage.removeItem("isJoining");
    setIsHost(true);
    setIsJoining(false);
  };

  const handleStopJam = () => {
    socket.emit("stop_jam");
    localStorage.removeItem("isHost");
    setIsHost(false);
  };

  const handleJoinJam = () => {
    localStorage.setItem("isJoining", "true");
    setIsJoining(true);
    socket.emit("nowPlaying", {});
  };

  const handleLeaveJam = () => {
    localStorage.removeItem("isJoining");
    setIsJoining(false);
  };

  const upNext = queue.filter((t) => t.title !== track?.title);

  return (
    <div>
      <PageMeta
        title="Now Playing | TuneLog"
        description="Currently playing track"
      />
      <PageBreadcrumb pageTitle="Now Playing" />

      {/* Jam session banners */}
      <div className="space-y-3 mb-6">
        {activeHost && !isHost && (
          <div className="flex items-center justify-between rounded-2xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/30 dark:bg-blue-500/5">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
              </span>
              <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                {activeHost} is hosting a Jam Session!
              </p>
            </div>
            {isJoining ? (
              <button
                onClick={handleLeaveJam}
                className="text-xs font-bold text-gray-500 hover:text-red-500"
              >
                Leave Jam
              </button>
            ) : (
              <button
                onClick={handleJoinJam}
                className="rounded-lg bg-blue-500 px-4 py-2 text-xs font-bold text-white shadow-lg transition-all hover:bg-blue-600"
              >
                Join & Sync
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center gap-3">
            <div
              className={`h-3 w-3 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {isHost
                ? "You are the Host"
                : isJoining
                  ? "Listening to Jam"
                  : "Private Listening"}
            </span>
          </div>
          {isHost ? (
            <button
              onClick={handleStopJam}
              className="rounded-lg bg-red-500/10 px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-500/20"
            >
              Stop Jam
            </button>
          ) : !activeHost ? (
            <button
              onClick={handleStartJam}
              disabled={!track}
              className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-brand-600 disabled:opacity-50"
            >
              Start Jam Session
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="animate-pulse text-sm text-gray-400">
            Loading now playing...
          </p>
        </div>
      ) : !track ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-sm text-gray-400">Nothing is playing right now</p>
          <p className="mt-1 text-xs text-gray-400">
            Start a song in Navidrome and it'll appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4 md:gap-6">
          {/* ── Player card ── */}
          <div className="col-span-12 xl:col-span-7">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
              {/* Cover + meta inline */}
              <div className="flex gap-5 items-start mb-6">
                {track.coverArt ? (
                  <img
                    src={track.coverArt}
                    alt={track.album ?? "Cover art"}
                    className="h-20 w-20 rounded-xl object-cover shadow-md flex-shrink-0"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                    <span className="text-3xl">🎵</span>
                  </div>
                )}
                <div className="min-w-0 flex-1 pt-0.5">
                  <h2 className="truncate text-xl font-semibold text-gray-800 dark:text-white/90 leading-tight">
                    {track.title}
                  </h2>
                  <p className="truncate text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {track.artist}
                  </p>
                  {track.album && (
                    <p className="truncate text-xs text-gray-400 mt-0.5">
                      {track.album}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs tabular-nums text-gray-400">
                      {formatTime(duration || track.duration || 0)}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        isPlaying
                          ? "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                          isPlaying
                            ? "bg-green-500 animate-pulse"
                            : "bg-gray-400"
                        }`}
                      />
                      {isPlaying ? "Playing" : "Paused"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mb-5">
                <div
                  className={`group h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 ${
                    canControl
                      ? "cursor-pointer"
                      : "cursor-not-allowed opacity-60"
                  }`}
                  onClick={(e) => {
                    if (!canControl) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const nextTime =
                      ((e.clientX - rect.left) / rect.width) * duration;
                    seek(nextTime);
                    if (isHost)
                      socket.emit("sync_time", {
                        positionMs: Math.floor(nextTime * 1000),
                      });
                  }}
                >
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-xs tabular-nums text-gray-400">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={prev}
                  disabled={!canControl}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700 transition-all hover:bg-gray-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-white/90 dark:hover:bg-gray-700"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M6 19V5h2v14H6zm3.5-7L18 5v14l-8.5-7z" />
                  </svg>
                </button>

                <button
                  onClick={togglePlay}
                  disabled={!canControl}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shadow transition-all hover:bg-brand-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPlaying ? (
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                  ) : (
                    <svg
                      className="ml-0.5 h-4 w-4"
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
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700 transition-all hover:bg-gray-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-white/90 dark:hover:bg-gray-700"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M18 5v14h-2V5h2zM6 19V5l8.5 7L6 19z" />
                  </svg>
                </button>

                <div className="flex flex-1 items-center gap-2">
                  <button
                    onClick={toggleMute}
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-white"
                  >
                    {isMuted || volume === 0 ? (
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M3.63 3.63a1 1 0 0 0-1.41 1.41L7.29 10.1 7 10.4V13.6l.29.29-4.07 4.08a1 1 0 1 0 1.41 1.41L21.37 2.63a1 1 0 0 0-1.41-1.41L3.63 3.63zM11 5.17L9.39 6.78 11 8.39V5.17zM11 18.83l-4-3.27V8.55l-2-2V15.6l6 4.9v-1.67z" />
                      </svg>
                    ) : (
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                      </svg>
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="h-1.5 w-28 cursor-pointer accent-brand-500"
                  />
                </div>
              </div>

              {!canControl && (
                <p className="mt-3 text-xs text-gray-400">
                  Controlled by host — synced playback
                </p>
              )}
            </div>
          </div>
          <div className="col-span-12 xl:col-span-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] h-full">
              <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Up Next
              </p>
              {upNext.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <span className="text-3xl">🎶</span>
                  <p className="text-sm text-gray-400">Queue is empty</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {upNext.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                    >
                      <span className="w-4 flex-shrink-0 text-right text-xs tabular-nums text-gray-300 dark:text-gray-600">
                        {idx + 1}
                      </span>
                      {item.coverArtUrl ? (
                        <img
                          src={item.coverArtUrl}
                          alt={item.album ?? "cover"}
                          className="h-9 w-9 flex-shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
                          <span className="text-sm">🎵</span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                          {item.title}
                        </p>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {item.artist}
                        </p>
                      </div>
                      {item.duration != null && (
                        <span className="flex-shrink-0 text-xs tabular-nums text-gray-400">
                          {formatTime(item.duration)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
