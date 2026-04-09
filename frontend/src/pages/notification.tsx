
import { useState, useEffect } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import {
  readNotifications,
  markAsRead,
  type StoredSongState,
  type StoredPlaylist,
  type StoredStarredSong,
} from "../hooks/Usenotificationstream";

const formatTime = (iso: string) => {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const avatarColor = (username: string) => {
  const colors = [
    "from-blue-500 to-indigo-600",
    "from-purple-500 to-pink-600",
    "from-green-500 to-teal-600",
    "from-orange-500 to-red-600",
    "from-cyan-500 to-blue-600",
  ];
  return colors[username.charCodeAt(0) % colors.length];
};

const Avatar = ({ username }: { username: string }) => (
  <div
    className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarColor(username)} flex items-center justify-center flex-shrink-0`}
  >
    <span className="text-white text-xs font-bold">
      {username.slice(0, 2).toUpperCase()}
    </span>
  </div>
);


function NowPlayingCard({ item }: { item: StoredSongState }) {
  return (
    <div className="flex items-start gap-4">
      <Avatar username={item.username} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
            <span className="font-semibold text-gray-900 dark:text-white/90">
              {item.username}
            </span>{" "}
            {item.state === "started" ? "started playing":"stopped playing" }{" "}
            <span className="font-semibold text-gray-900 dark:text-white/90">
              {item.song}
            </span>
          </p>
          <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">
            {formatTime(item.receivedAt)}
          </span>
        </div>
        <div className="mt-1">
          <span
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md font-medium ${
              item.state === "stopped"
                ? 
                 "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400":"bg-brand-500/10 text-brand-500"
            }`}
          >
            {item.state === "started" ? "Now Playing":"Stopped"}
          </span>
        </div>
      </div>
    </div>
  );
}

function StarredCard({ item }: { item: StoredStarredSong }) {
  const isNumber = typeof item.star === "number";
  return (
    <div className="flex items-start gap-4">
      <Avatar username={item.username} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
            <span className="font-semibold text-gray-900 dark:text-white/90">
              {item.username}
            </span>{" "}
            rated{" "}
            <span className="font-semibold text-gray-900 dark:text-white/90">
              {item.song}
            </span>
          </p>
          <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">
            {formatTime(item.receivedAt)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          {isNumber ? (
            <>
              <span className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg
                    key={i}
                    width="12"
                    height="12"
                    viewBox="0 0 20 20"
                    fill={i < (item.star as number) ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className={
                      i < (item.star as number)
                        ? "text-yellow-400"
                        : "text-gray-300 dark:text-gray-600"
                    }
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </span>
              <span className="text-xs text-gray-400">{item.star} / 5</span>
            </>
          ) : (
            <span className="text-xs text-yellow-500 dark:text-yellow-400">
              {item.star}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function PlaylistCard({ item }: { item: StoredPlaylist }) {
  const isRegen = item.type === "regenerate";
  return (
    <div className="flex items-start gap-4">
      <Avatar username={item.username} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
            <span className="font-semibold text-gray-900 dark:text-white/90">
              {item.username}
            </span>{" "}
            {isRegen ? "regenerated their playlist" : "appended to their playlist"}
          </p>
          <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">
            {formatTime(item.receivedAt)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md font-medium ${
              isRegen
                ? "bg-purple-500/10 text-purple-500 dark:text-purple-400"
                : "bg-green-500/10 text-green-600 dark:text-green-400"
            }`}
          >
            {isRegen ? "Regenerate" : "Append"}
          </span>
          <span className="text-xs text-gray-400">{item.size} songs</span>
        </div>
      </div>
    </div>
  );
}

type FilterType = "all" | "songState" | "starredSong" | "playlist";

const FILTER_LABELS: Record<FilterType, string> = {
  all: "All",
  songState: "Now Playing",
  starredSong: "Starred",
  playlist: "Playlist",
};

type AnyEvent =
  | { kind: "songState"; data: StoredSongState }
  | { kind: "starredSong"; data: StoredStarredSong }
  | { kind: "playlist"; data: StoredPlaylist };


export default function Notifications() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [stored, setStored] = useState(readNotifications);

  useEffect(() => {
    markAsRead();
    const sync = () => setStored(readNotifications());
    window.addEventListener("tunelog_notif_update", sync);
    return () => window.removeEventListener("tunelog_notif_update", sync);
  }, []);

  const allEvents: AnyEvent[] = [
    ...stored.songState.map((d) => ({ kind: "songState" as const, data: d })),
    ...stored.starredSong.map((d) => ({ kind: "starredSong" as const, data: d })),
    ...stored.playlist.map((d) => ({ kind: "playlist" as const, data: d })),
  ].sort(
    (a, b) =>
      new Date(b.data.receivedAt).getTime() -
      new Date(a.data.receivedAt).getTime()
  );

  const filtered =
    filter === "all" ? allEvents : allEvents.filter((e) => e.kind === filter);

  const counts: Record<FilterType, number> = {
    all: allEvents.length,
    songState: stored.songState.length,
    starredSong: stored.starredSong.length,
    playlist: stored.playlist.length,
  };

  return (
    <>
      <PageMeta
        title="Notifications | TuneLog"
        description="Live activity feed for TuneLog"
      />
      <PageBreadcrumb pageTitle="Notifications" />

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Activity Feed
            </h4>
            <p className="text-sm text-gray-400 mt-0.5">
              {filtered.length} event{filtered.length !== 1 ? "s" : ""}
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
            </span>
            Live
          </span>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {(Object.keys(FILTER_LABELS) as FilterType[]).map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === key
                  ? "border-brand-500 bg-brand-500/10 text-brand-500"
                  : "border-gray-200 text-gray-500 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600"
              }`}
            >
              {FILTER_LABELS[key]}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  filter === key
                    ? "bg-brand-500/20 text-brand-500"
                    : "bg-gray-100 text-gray-400 dark:bg-gray-800"
                }`}
              >
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        <hr className="border-gray-100 dark:border-gray-800 mb-5" />

        <div className="space-y-1">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              No events yet.
            </div>
          ) : (
            filtered.map((event, i) => (
              <div key={`${event.kind}-${event.data.receivedAt}-${i}`}>
                <div className="px-2 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                  {event.kind === "songState" && (
                    <NowPlayingCard item={event.data} />
                  )}
                  {event.kind === "starredSong" && (
                    <StarredCard item={event.data} />
                  )}
                  {event.kind === "playlist" && (
                    <PlaylistCard item={event.data} />
                  )}
                </div>
                {i < filtered.length - 1 && (
                  <hr className="border-gray-100 dark:border-gray-800 mx-2" />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}