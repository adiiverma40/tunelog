import { useNavigate } from "react-router";
import { usePlayer } from "../../context/PlayerContext";

function formatTime(s: number) {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function MiniPlayer() {
  const {
    track,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    seek,
    volume,
    setVolume,
    isMuted,
    toggleMute,
    isOnNowPlayingPage,
  } = usePlayer();

  const navigate = useNavigate();

  if (!track || isOnNowPlayingPage) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const CoverArt = () =>
    track.coverArt ? (
      <button
        onClick={() => navigate("/nowplaying")}
        title="Open Now Playing"
        className="flex-shrink-0"
      >
        <img
          src={track.coverArt}
          alt={track.album ?? "cover"}
          className="h-10 w-10 rounded-lg object-cover "
        />
      </button>
    ) : (
      <button
        onClick={() => navigate("/now-playing")}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800"
      >
        <span className="text-lg">🎵</span>
      </button>
    );

  const TrackInfo = () => (
    <button
      onClick={() => navigate("/now-playing")}
      className="min-w-0 flex-1 text-left"
    >
      <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
        {track.title}
      </p>
      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
        {track.artist}
      </p>
    </button>
  );

  const MuteBtn = () => (
    <button
      onClick={toggleMute}
      title={isMuted ? "Unmute" : "Mute"}
      className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
    >
      {isMuted || volume === 0 ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3.63 3.63a1 1 0 0 0-1.41 1.41L7.29 10.1 7 10.4V13.6l.29.29-4.07 4.08a1 1 0 1 0 1.41 1.41L21.37 2.63a1 1 0 0 0-1.41-1.41L3.63 3.63zM11 5.17L9.39 6.78 11 8.39V5.17zM11 18.83l-4-3.27V8.55l-2-2V15.6l6 4.9v-1.67z" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
        </svg>
      )}
    </button>
  );

  const PlayPauseBtn = () => (
    <button
      onClick={togglePlay}
      className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white shadow transition-all hover:bg-brand-600 active:scale-95"
    >
      {isPlaying ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
      ) : (
        <svg className="ml-0.5 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
    </button>
  );

  return (
    <>
      <div
        className="fixed bottom-5 left-1/2 z-50 hidden -translate-x-1/2 lg:flex"
        style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.10))" }}
      >
        <div
          className="flex items-center gap-3 rounded-2xl border border-gray-200/80 bg-white/90 px-4 py-3 dark:border-gray-700/60 dark:bg-gray-900/90"
          style={{
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            minWidth: 440,
            maxWidth: 600,
          }}
        >
          <CoverArt />
          <TrackInfo />

          <div className="flex w-36 flex-shrink-0 flex-col gap-1">
            <div
              className="h-1 w-full cursor-pointer rounded-full bg-gray-100 dark:bg-gray-800"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                seek(((e.clientX - rect.left) / rect.width) * duration);
              }}
            >
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] tabular-nums text-gray-400">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <MuteBtn />
          <PlayPauseBtn />
        </div>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 dark:border-gray-800 dark:bg-gray-900/95 lg:hidden"
        style={{ backdropFilter: "blur(12px)" }}
      >
        <div
          className="h-1 w-full cursor-pointer bg-gray-100 dark:bg-gray-800"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seek(((e.clientX - rect.left) / rect.width) * duration);
          }}
        >
          <div
            className="h-full bg-brand-500 transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center gap-3 px-4 py-2.5">
          <CoverArt />
          <TrackInfo />
          <span className="hidden flex-shrink-0 text-xs tabular-nums text-gray-400 sm:block">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <div className="flex flex-shrink-0 items-center gap-1">
            <MuteBtn />
            <PlayPauseBtn />
          </div>
        </div>
      </div>
    </>
  );
}
