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

function normalizeQueuePayload(payload: any): Track[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.map((item: any) => ({
      id: String(item.id ?? item.song_id ?? crypto.randomUUID()),
      title: item.title ?? "Unknown Track",
      artist: item.artist ?? item.user ?? "Unknown Artist",
      album: item.album,
      duration: Number(item.duration ?? 0),
      coverArt: item.coverArt,
    }));
  }
  if (typeof payload === "object") {
    return Object.entries(payload).map(([id, item]: any) => ({
      id: String(item?.id ?? id),
      title: item?.title ?? "Unknown Track",
      artist: item?.artist ?? item?.user ?? "Unknown Artist",
      album: item?.album,
      duration: Number(item?.duration ?? 0),
      coverArt: item?.coverArt,
    }));
  }
  return [];
}

// ── Shared track card UI (used by both sortable row and drag overlay) ─────────
function TrackCard({
  track,
  index,
  active = false,
  ghost = false,
}: {
  track: Track;
  index?: number;
  active?: boolean;
  ghost?: boolean;
}) {
  const coverUrl = buildCoverArtUrl(track.coverArt);
  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ${
        ghost
          ? "shadow-lg border border-brand-400 bg-white dark:bg-gray-900 opacity-95"
          : active
            ? "bg-brand-500/10"
            : ""
      }`}
    >
      <span className="w-3 flex-shrink-0 select-none text-center text-xs text-gray-300 dark:text-gray-600">
        ⠿
      </span>
      {index !== undefined && (
        <span
          className={`w-5 flex-shrink-0 text-center text-xs tabular-nums ${
            active ? "font-semibold text-brand-500" : "text-gray-400"
          }`}
        >
          {active ? "▶" : index + 1}
        </span>
      )}
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={track.album ?? track.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-xs text-gray-400">🎵</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${active ? "text-brand-500" : "text-gray-800 dark:text-white/90"}`}
        >
          {track.title}
        </p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {track.artist}
          {track.album ? ` · ${track.album}` : ""}
        </p>
      </div>
      <span className="flex-shrink-0 text-xs tabular-nums text-gray-400">
        {formatTime(track.duration)}
      </span>
    </div>
  );
}

// ── Sortable wrapper — one row in the queue ───────────────────────────────────
function SortableTrackRow({
  track,
  index,
  active,
  isDraggingThis,
}: {
  track: Track;
  index: number;
  active: boolean;
  isDraggingThis: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: track.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab rounded-xl transition-colors active:cursor-grabbing ${
        isDraggingThis
          ? "opacity-30"
          : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
      }`}
    >
      <TrackCard track={track} index={index} active={active} />
    </div>
  );
}

// ── Plain TrackRow for search / playlist panels ───────────────────────────────
function TrackRow({
  track,
  index,
  onAdd,
  addLabel = "+ Add",
}: {
  track: Track;
  index?: number;
  onAdd?: (t: Track) => void;
  addLabel?: string;
}) {
  const coverUrl = buildCoverArtUrl(track.coverArt);
  return (
    <div className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]">
      {index !== undefined && (
        <span className="w-5 flex-shrink-0 text-center text-xs tabular-nums text-gray-400">
          {index + 1}
        </span>
      )}
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={track.album ?? track.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-xs text-gray-400">🎵</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
          {track.title}
        </p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
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
          className="ml-1 flex-shrink-0 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500 opacity-0 transition-all group-hover:opacity-100 hover:border-brand-500 hover:text-brand-500 dark:border-gray-700 dark:text-gray-400"
        >
          {addLabel}
        </button>
      )}
    </div>
  );
}

const CARD_HEIGHT = "h-[700px]";

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

  // Require pointer to move 8px before drag starts — prevents accidental drags on click
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // ── Socket queue ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onQueueUpdate = (payload: any) =>
      setQueue(normalizeQueuePayload(payload));
    socket.on("queue_update", onQueueUpdate);
    socket.emit("get_queue");
    return () => {
      socket.off("queue_update", onQueueUpdate);
    };
  }, [socket]);

  // ── dnd-kit handlers ───────────────────────────────────────────────────────
  function handleDragStart(event: DragStartEvent) {
    const track = queue.find((t) => t.id === event.active.id);
    setDraggingTrack(track ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingTrack(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = queue.findIndex((t) => t.id === active.id);
    const newIndex = queue.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(queue, oldIndex, newIndex);
    setQueue(reordered); // optimistic local update

    socket.emit(
      "reorder_queue",
      reordered.map((t) => ({
        song_id: t.id,
        title: t.title,
        artist: t.artist,
        coverArt: t.coverArt,
        duration: t.duration,
      })),
    );
  }

  // ── Playlists ──────────────────────────────────────────────────────────────
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
    });
  }

  // ── Library search (debounced) ─────────────────────────────────────────────
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
    }, 500);
    return () => clearTimeout(timer);
  }, [librarySearch]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageMeta
        title="Queue | TuneLog"
        description="Manage your playback queue"
      />
      <PageBreadcrumb pageTitle="Queue" />

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        {/* Queue panel */}
        <div className="col-span-12 lg:col-span-4">
          <div
            className={`flex flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${CARD_HEIGHT}`}
          >
            <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <div>
                <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                  Queue
                </h4>
                <p className="text-xs text-gray-400">
                  {queue.length} tracks · drag to reorder
                </p>
              </div>
              <button
                onClick={() => socket.emit("clear_queue")}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:border-red-400 hover:text-red-400 dark:border-gray-700 dark:text-gray-400"
              >
                Clear
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {queue.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-gray-400">Queue is empty</p>
                </div>
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
                      <SortableTrackRow
                        key={track.id}
                        track={track}
                        index={i}
                        active={track.id === activeQueueId}
                        isDraggingThis={draggingTrack?.id === track.id}
                      />
                    ))}
                  </SortableContext>

                  {/* Floating ghost that follows the cursor while dragging */}
                  <DragOverlay>
                    {draggingTrack && <TrackCard track={draggingTrack} ghost />}
                  </DragOverlay>
                </DndContext>
              )}
            </div>
          </div>
        </div>

        {/* Right panels */}
        <div className="col-span-12 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:col-span-8">
          {/* Library search */}
          <div
            className={`flex flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${CARD_HEIGHT}`}
          >
            <div className="flex-shrink-0 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <h4 className="mb-3 text-base font-semibold text-gray-800 dark:text-white/90">
                Library Search
              </h4>
              <input
                type="text"
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                placeholder="Search Navidrome tracks..."
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {isSearching ? (
                <div className="flex h-full items-center justify-center">
                  <p className="animate-pulse text-sm text-gray-400">
                    Searching...
                  </p>
                </div>
              ) : librarySearch.trim() === "" ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-gray-400">
                    Type to search your library
                  </p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-gray-400">No results found</p>
                </div>
              ) : (
                searchResults.map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    onAdd={handleAddToQueue}
                    addLabel="+ Queue"
                  />
                ))
              )}
            </div>
          </div>

          {/* Playlists */}
          <div
            className={`flex flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${CARD_HEIGHT}`}
          >
            <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <div className="min-w-0">
                {selectedPlaylist ? (
                  <>
                    <h4 className="truncate text-base font-semibold text-gray-800 dark:text-white/90">
                      {selectedPlaylist.name}
                    </h4>
                    <p className="text-xs text-gray-400">
                      {selectedPlaylist.songCount} songs ·{" "}
                      {selectedPlaylist.owner}
                    </p>
                  </>
                ) : (
                  <>
                    <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                      Playlists
                    </h4>
                    <p className="text-xs text-gray-400">
                      {playlists.length} playlists
                    </p>
                  </>
                )}
              </div>
              {selectedPlaylist && (
                <button
                  onClick={() => {
                    setSelectedPlaylist(null);
                    setPlaylistTracks([]);
                  }}
                  className="ml-2 flex-shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:border-brand-500 hover:text-brand-500 dark:border-gray-700 dark:text-gray-400"
                >
                  ← Back
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {!selectedPlaylist && (
                <>
                  {playlistsLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <p className="animate-pulse text-sm text-gray-400">
                        Loading playlists...
                      </p>
                    </div>
                  ) : playlists.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                      <p className="text-sm text-gray-400">
                        No playlists found
                      </p>
                    </div>
                  ) : (
                    playlists.map((pl) => {
                      const coverUrl = buildCoverArtUrl(pl.coverArt);
                      return (
                        <div
                          key={pl.id}
                          onClick={() => handleSelectPlaylist(pl)}
                          className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                        >
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-500/10">
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
                          <div className="flex flex-shrink-0 flex-col items-end gap-1">
                            <span className="text-xs tabular-nums text-gray-400">
                              {pl.songCount} songs
                            </span>
                            <span className="text-xs text-gray-300 opacity-0 transition-all group-hover:opacity-100 dark:text-gray-600">
                              →
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}

              {selectedPlaylist && (
                <>
                  {playlistTracksLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <p className="animate-pulse text-sm text-gray-400">
                        Loading tracks...
                      </p>
                    </div>
                  ) : playlistTracks.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                      <p className="text-sm text-gray-400">
                        No tracks in this playlist
                      </p>
                    </div>
                  ) : (
                    playlistTracks.map((track, i) => (
                      <TrackRow
                        key={track.id || i}
                        track={track}
                        index={i}
                        onAdd={handleAddToQueue}
                        addLabel="+ Queue"
                      />
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
