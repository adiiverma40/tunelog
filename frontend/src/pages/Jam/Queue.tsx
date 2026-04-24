import { useState, useEffect } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { useGlobalSocket } from "../../context/SocketContext";

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const NAVIDROME_URL =
  import.meta.env.VITE_NAVIDROME_URL || "http://localhost:4533";
const NAVIDROME_VERSION = "1.16.1";
const NAVIDROME_CLIENT = "tunelog";

interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  coverArt?: string;
  user?: string;
}

interface Playlist {
  id: string;
  name: string;
  songCount: number;
  duration: number;
  owner: string;
  coverArt?: string;
  comment?: string;
}

function formatTime(s: number) {
  if (!s) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function buildAuthParams() {
  const username = localStorage.getItem("tunelog_user") || "";
  const password = localStorage.getItem("tunelog_password") || "";
  return new URLSearchParams({
    u: username,
    p: password,
    v: NAVIDROME_VERSION,
    c: NAVIDROME_CLIENT,
    f: "json",
  });
}

function buildSearchParams(query: string) {
  const params = buildAuthParams();
  params.set("query", query);
  params.set("artistCount", "5");
  params.set("albumCount", "5");
  params.set("songCount", "10");
  return params.toString();
}

function buildCoverArtUrl(coverArtId?: string) {
  if (!coverArtId) return null;
  const params = buildAuthParams();
  return `${NAVIDROME_URL}/rest/getCoverArt?id=${encodeURIComponent(coverArtId)}&${params.toString()}`;
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

function UserBadge({ username }: { username: string }) {
  const display = getDisplayName(username);
  const avatar = getAvatarUrl(username);
  const color = getUserColor(username);

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-100 bg-gray-50 px-1.5 py-0.5 dark:border-gray-700 dark:bg-white/[0.04]">
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
      <span className="max-w-[80px] truncate text-[11px] font-medium text-gray-500 dark:text-gray-400">
        {display}
      </span>
    </span>
  );
}

function normalizeQueuePayload(payload: any): Track[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.map((item: any) => ({
      id: String(item.id ?? item.song_id ?? crypto.randomUUID()),
      title: item.title ?? "Unknown Track",
      artist: item.artist ?? "Unknown Artist",
      album: item.album,
      duration: Number(item.duration ?? 0),
      coverArt: item.coverArt,
      user: item.user ?? item.by,
    }));
  }
  if (typeof payload === "object") {
    return Object.entries(payload).map(([id, item]: any) => ({
      id: String(item?.id ?? id),
      title: item?.title ?? "Unknown Track",
      artist: item?.artist ?? "Unknown Artist",
      album: item?.album,
      duration: Number(item?.duration ?? 0),
      coverArt: item?.coverArt,
      user: item?.user ?? item?.by,
    }));
  }
  return [];
}

function QueueTrackCard({
  track,
  index,
  isActive = false,
  ghost = false,
}: {
  track: Track;
  index?: number;
  isActive?: boolean;
  ghost?: boolean;
}) {
  const coverUrl = buildCoverArtUrl(track.coverArt);
  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
        ghost
          ? "border border-brand-400/60 bg-white shadow-xl dark:bg-gray-900"
          : isActive
            ? "bg-brand-500/8"
            : ""
      }`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        className="flex-shrink-0 text-gray-300 dark:text-gray-600"
      >
        <circle cx="3" cy="3" r="1.2" fill="currentColor" />
        <circle cx="9" cy="3" r="1.2" fill="currentColor" />
        <circle cx="3" cy="6" r="1.2" fill="currentColor" />
        <circle cx="9" cy="6" r="1.2" fill="currentColor" />
        <circle cx="3" cy="9" r="1.2" fill="currentColor" />
        <circle cx="9" cy="9" r="1.2" fill="currentColor" />
      </svg>

      <span
        className={`w-5 flex-shrink-0 text-center text-xs tabular-nums ${
          isActive
            ? "font-semibold text-brand-500"
            : "text-gray-300 dark:text-gray-600"
        }`}
      >
        {isActive ? (
          <span className="inline-block animate-pulse">▶</span>
        ) : (
          (index ?? 0) + 1
        )}
      </span>
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={track.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-sm">🎵</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium leading-tight ${
            isActive ? "text-brand-500" : "text-gray-800 dark:text-white/90"
          }`}
        >
          {track.title}
        </p>
        <p className="truncate text-xs text-gray-400 leading-tight mt-0.5">
          {track.artist}
          {track.album ? ` · ${track.album}` : ""}
        </p>
        {track.user && (
          <div className="mt-1">
            <UserBadge username={track.user} />
          </div>
        )}
      </div>

      <span className="flex-shrink-0 text-xs tabular-nums text-gray-400">
        {formatTime(track.duration)}
      </span>
    </div>
  );
}

function SortableQueueRow({
  track,
  index,
  isActive,
  isDragging,
}: {
  track: Track;
  index: number;
  isActive: boolean;
  isDragging: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: track.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`cursor-grab rounded-xl transition-colors active:cursor-grabbing ${
        isDragging
          ? "opacity-25"
          : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
      }`}
    >
      <QueueTrackCard track={track} index={index} isActive={isActive} />
    </div>
  );
}

function LibraryTrackRow({
  track,
  index,
  onAdd,
}: {
  track: Track;
  index?: number;
  onAdd?: (t: Track) => void;
}) {
  const coverUrl = buildCoverArtUrl(track.coverArt);
  return (
    <div className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]">
      {index !== undefined && (
        <span className="w-5 flex-shrink-0 text-center text-xs tabular-nums text-gray-300 dark:text-gray-600">
          {index + 1}
        </span>
      )}
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={track.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-sm">🎵</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
          {track.title}
        </p>
        <p className="truncate text-xs text-gray-400">
          {track.artist}
          {track.album ? ` · ${track.album}` : ""}
        </p>
      </div>
      <span className="flex-shrink-0 text-xs tabular-nums text-gray-400">
        {formatTime(track.duration)}
      </span>
      {onAdd && (
        <button
          onClick={() => onAdd(track)}
          className="ml-1 flex-shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-400 opacity-0 transition-all group-hover:opacity-100 hover:border-brand-500 hover:bg-brand-500/5 hover:text-brand-500 dark:border-gray-700"
        >
          + Queue
        </button>
      )}
    </div>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-10">
      <span className="text-3xl opacity-30">{icon}</span>
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

const CARD_H = "h-[720px]";

export default function Queue() {
  const { socket } = useGlobalSocket();

  const [queue, setQueue] = useState<Track[]>([]);
  const [activeQueueId] = useState<string | null>(null);
  const [draggingTrack, setDraggingTrack] = useState<Track | null>(null);

  const [librarySearch, setLibrarySearch] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(
    null,
  );
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [playlistTracksLoading, setPlaylistTracksLoading] = useState(false);

  const [rightTab, setRightTab] = useState<"search" | "playlists">("search");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  useEffect(() => {
    const onQueueUpdate = (payload: any) =>
      setQueue(normalizeQueuePayload(payload));
    socket.on("queue_update", onQueueUpdate);
    socket.emit("get_queue");
    return () => {
      socket.off("queue_update", onQueueUpdate);
    };
  }, [socket]);

  function handleDragStart(event: DragStartEvent) {
    setDraggingTrack(queue.find((t) => t.id === event.active.id) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingTrack(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = queue.findIndex((t) => t.id === active.id);
    const newIdx = queue.findIndex((t) => t.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(queue, oldIdx, newIdx);
    setQueue(reordered);
    socket.emit(
      "reorder_queue",
      reordered.map((t) => ({
        song_id: t.id,
        title: t.title,
        artist: t.artist,
        coverArt: t.coverArt,
        duration: t.duration,
        user: t.user,
      })),
    );
  }

  useEffect(() => {
    async function fetchPlaylists() {
      setPlaylistsLoading(true);
      try {
        const params = buildAuthParams();
        const res = await fetch(
          `${NAVIDROME_URL}/rest/getPlaylists?${params.toString()}`,
        );
        const data = await res.json();
        const raw = data?.["subsonic-response"]?.playlists?.playlist ?? [];
        const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
        setPlaylists(
          list.map((p: any) => ({
            id: String(p.id),
            name: p.name ?? "Untitled",
            songCount: Number(p.songCount ?? 0),
            duration: Number(p.duration ?? 0),
            owner: p.owner ?? "",
            coverArt: p.coverArt,
            comment: p.comment,
          })),
        );
      } catch (err) {
        console.error("Failed to fetch playlists:", err);
      } finally {
        setPlaylistsLoading(false);
      }
    }
    fetchPlaylists();
  }, []);

  async function handleSelectPlaylist(pl: Playlist) {
    setSelectedPlaylist(pl);
    setPlaylistTracks([]);
    setPlaylistTracksLoading(true);
    try {
      const params = buildAuthParams();
      const res = await fetch(
        `${NAVIDROME_URL}/rest/getPlaylist?id=${encodeURIComponent(pl.id)}&${params.toString()}`,
      );
      const data = await res.json();
      const raw = data?.["subsonic-response"]?.playlist?.entry ?? [];
      const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
      setPlaylistTracks(
        list.map((s: any) => ({
          id: String(s.id),
          title: s.title ?? "Unknown Track",
          artist: s.artist ?? "Unknown Artist",
          album: s.album,
          duration: Number(s.duration ?? 0),
          coverArt: s.coverArt,
        })),
      );
    } catch (err) {
      console.error("Failed to fetch playlist tracks:", err);
      setPlaylistTracks([]);
    } finally {
      setPlaylistTracksLoading(false);
    }
  }

  function handleAddToQueue(t: Track) {
    socket.emit("add_queue", {
      song_id: t.id,
      title: t.title,
      artist: t.artist,
      coverArt: t.coverArt,
      duration: t.duration,
      user: localStorage.getItem("tunelog_user"),
    });
  }
  useEffect(() => {
    if (!librarySearch.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const params = buildSearchParams(librarySearch.trim());
        const res = await fetch(`${NAVIDROME_URL}/rest/search3?${params}`);
        const data = await res.json();
        const songs = data?.["subsonic-response"]?.searchResult3?.song || [];
        const songList = Array.isArray(songs) ? songs : songs ? [songs] : [];
        setSearchResults(
          songList.map((s: any) => ({
            id: String(s.id),
            title: s.title ?? "Unknown Track",
            artist: s.artist ?? "Unknown Artist",
            album: s.album,
            duration: Number(s.duration ?? 0),
            coverArt: s.coverArt,
          })),
        );
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [librarySearch]);

  const totalQueueTime = queue.reduce((acc, t) => acc + t.duration, 0);

  return (
    <div>
      <PageMeta
        title="Queue | TuneLog"
        description="Manage your playback queue"
      />
      <PageBreadcrumb pageTitle="Queue" />

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 lg:col-span-5">
          <div
            className={`flex flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${CARD_H}`}
          >
            <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <div>
                <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                  Up Next
                </h4>
                <p className="mt-0.5 text-xs text-gray-400">
                  {queue.length} {queue.length === 1 ? "track" : "tracks"}
                  {queue.length > 0 && (
                    <span className="ml-1 text-gray-300 dark:text-gray-600">
                      ·
                    </span>
                  )}
                  {queue.length > 0 && (
                    <span className="ml-1">{formatTime(totalQueueTime)}</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => socket.emit("clear_queue")}
                disabled={queue.length === 0}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-700 dark:text-gray-400 dark:hover:border-red-500/40 dark:hover:bg-red-500/5 dark:hover:text-red-400"
              >
                Clear all
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2">
              {queue.length === 0 ? (
                <EmptyState
                  icon="🎵"
                  message="Queue is empty — add some tracks"
                />
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={queue.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {queue.map((track, i) => (
                      <SortableQueueRow
                        key={track.id}
                        track={track}
                        index={i}
                        isActive={track.id === activeQueueId}
                        isDragging={draggingTrack?.id === track.id}
                      />
                    ))}
                  </SortableContext>
                  <DragOverlay dropAnimation={null}>
                    {draggingTrack && (
                      <QueueTrackCard track={draggingTrack} ghost />
                    )}
                  </DragOverlay>
                </DndContext>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-7">
          <div
            className={`flex flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${CARD_H}`}
          >
            <div className="flex flex-shrink-0 items-center gap-1 border-b border-gray-100 px-5 py-3 dark:border-gray-800">
              {(["search", "playlists"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setRightTab(tab);
                    if (tab === "search") {
                      setSelectedPlaylist(null);
                      setPlaylistTracks([]);
                    }
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                    rightTab === tab
                      ? "bg-gray-100 text-gray-800 dark:bg-white/[0.08] dark:text-white/90"
                      : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {rightTab === "search" && (
              <>
                <div className="flex-shrink-0 border-b border-gray-100 px-5 py-3 dark:border-gray-800">
                  <div className="relative">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      placeholder="Search tracks in Navidrome…"
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-700 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-300 dark:focus:bg-white/[0.06]"
                    />
                    {librarySearch && (
                      <button
                        onClick={() => setLibrarySearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-2 py-2">
                  {isSearching ? (
                    <EmptyState icon="🔍" message="Searching…" />
                  ) : librarySearch.trim() === "" ? (
                    <EmptyState
                      icon="🎧"
                      message="Type to search your library"
                    />
                  ) : searchResults.length === 0 ? (
                    <EmptyState icon="😶" message="No results found" />
                  ) : (
                    searchResults.map((track, i) => (
                      <LibraryTrackRow
                        key={track.id}
                        track={track}
                        index={i}
                        onAdd={handleAddToQueue}
                      />
                    ))
                  )}
                </div>
              </>
            )}

            {rightTab === "playlists" && (
              <>
                {selectedPlaylist && (
                  <div className="flex flex-shrink-0 items-center gap-3 border-b border-gray-100 px-5 py-3 dark:border-gray-800">
                    <button
                      onClick={() => {
                        setSelectedPlaylist(null);
                        setPlaylistTracks([]);
                      }}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 transition-colors hover:border-brand-400 hover:text-brand-500 dark:border-gray-700 dark:text-gray-400"
                    >
                      ← Back
                    </button>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                        {selectedPlaylist.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {selectedPlaylist.songCount} songs · by{" "}
                        {selectedPlaylist.owner}
                      </p>
                    </div>
                    {playlistTracks.length > 0 && (
                      <button
                        onClick={() => playlistTracks.forEach(handleAddToQueue)}
                        className="ml-auto flex-shrink-0 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/20"
                      >
                        + Add all
                      </button>
                    )}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto px-2 py-2">
                  {!selectedPlaylist ? (
                    <>
                      {playlistsLoading ? (
                        <EmptyState icon="⏳" message="Loading playlists…" />
                      ) : playlists.length === 0 ? (
                        <EmptyState icon="📭" message="No playlists found" />
                      ) : (
                        playlists.map((pl) => {
                          const coverUrl = buildCoverArtUrl(pl.coverArt);
                          return (
                            <div
                              key={pl.id}
                              onClick={() => handleSelectPlaylist(pl)}
                              className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                            >
                              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-500/10">
                                {coverUrl ? (
                                  <img
                                    src={coverUrl}
                                    alt={pl.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="text-base">🎵</span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                                  {pl.name}
                                </p>
                                <p className="truncate text-xs text-gray-400">
                                  {pl.comment ? pl.comment : `by ${pl.owner}`}
                                </p>
                              </div>
                              <div className="flex flex-shrink-0 flex-col items-end gap-0.5">
                                <span className="text-xs tabular-nums text-gray-400">
                                  {pl.songCount} songs
                                </span>
                                <span className="text-xs tabular-nums text-gray-300 dark:text-gray-600">
                                  {formatTime(pl.duration)}
                                </span>
                              </div>
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="ml-1 flex-shrink-0 text-gray-300 opacity-0 transition-all group-hover:opacity-100 dark:text-gray-600"
                              >
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                            </div>
                          );
                        })
                      )}
                    </>
                  ) : (
                    <>
                      {playlistTracksLoading ? (
                        <EmptyState icon="⏳" message="Loading tracks…" />
                      ) : playlistTracks.length === 0 ? (
                        <EmptyState
                          icon="📭"
                          message="No tracks in this playlist"
                        />
                      ) : (
                        playlistTracks.map((track, i) => (
                          <LibraryTrackRow
                            key={track.id || i}
                            track={track}
                            index={i}
                            onAdd={handleAddToQueue}
                          />
                        ))
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
