import { useState, useEffect } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Switch from "../components/form/switch/Switch";
import Button from "../components/ui/button/Button";
import {
  fetchPlaylistSongs,
  fetchPlaylistGenerate,
  fetchGetUsers,
  PlaylistSong,
  PlaylistStats,
} from "../API/API";
import { useNavigate } from "react-router";



type ExplicitFilter = "strict" | "allow_cleaned" | "all";
type SortKey = "artist" | "genre" | "signal";
type SyncMode = "regenerate" | "append";


const SIGNAL_STYLE: Record<string, string> = {
  repeat:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  positive:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  partial:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  skip: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  unheard: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
};

const EXPLICIT_STYLE: Record<string, string> = {
  explicit: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  cleaned:
    "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
  notExplicit:
    "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  notInItunes: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const EXPLICIT_LABEL: Record<string, string> = {
  explicit: "E",
  cleaned: "C",
  notExplicit: "✓",
  notInItunes: "?",
};

const formatLastGenerated = (raw: string | null) => {
  if (!raw) return "Never";
  const date = new Date(raw.replace(" ", "T") + "Z");
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function Playlist() {

  const [users, setUsers] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [playlistSize, setPlaylistSize] = useState(40);
  const [explicitFilter, setExplicitFilter] =
    useState<ExplicitFilter>("allow_cleaned");
  const [genreInjection, setGenreInjection] = useState(true);
  const [syncMode, setSyncMode] = useState<SyncMode>("regenerate");
  const [sortKey, setSortKey] = useState<SortKey>("artist");
  const [sortAsc, setSortAsc] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState("");
  const [songs, setSongs] = useState<PlaylistSong[]>([]);
  const [stats, setStats] = useState<PlaylistStats | null>(null);
  const [loadingSongs, setLoadingSongs] = useState(false);

  const [showExplicit, setShowExplicit] = useState(true);
  const [showCleaned, setShowCleaned] = useState(true);
  const [showClean, setShowClean] = useState(true);

  
const navigate = useNavigate();

  useEffect(() => {
    const token =
      localStorage.getItem("tunelog_token") ||
      sessionStorage.getItem("tunelog_token");

    if (!token) {
      navigate("/signin");
      return;
    }
  }, []);

  useEffect(() => {
    const admin =
      localStorage.getItem("tunelog_user") ??
      sessionStorage.getItem("tunelog_user") ??
      "";
    const adminPD =
      localStorage.getItem("tunelog_password") ??
      sessionStorage.getItem("tunelog_password") ??
      "";
    fetchGetUsers({ admin, adminPD }).then((res) => {
      if (res.status === "ok" && res.users) {
        const usernames = res.users.map((u) => u.username);
        setUsers(usernames);
        if (usernames.length > 0) setSelectedUser(usernames[0]);
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    setLoadingSongs(true);
    fetchPlaylistSongs(selectedUser)
      .then((res) => {
        if (res.status === "ok") {
          setSongs(res.songs);
          setStats(res.stats);
        }
      })
      .finally(() => setLoadingSongs(false));
  }, [selectedUser]);

  const handleGenerate = async () => {
    if (!selectedUser) return;
    setIsGenerating(true);
    setGenerateMsg("");
    try {
      const res = await fetchPlaylistGenerate(
        selectedUser,
        explicitFilter,
        playlistSize,
      );
      if (res.status === "ok") {
        setGenerateMsg(`✓ Done — ${res.songs_added} songs`);
        const updated = await fetchPlaylistSongs(selectedUser);
        if (updated.status === "ok") {
          setSongs(updated.songs);
          setStats(updated.stats);
        }
      } else {
        setGenerateMsg(`Error: ${res.reason}`);
      }
    } catch {
      setGenerateMsg("Failed to reach server");
    } finally {
      setIsGenerating(false);
      setTimeout(() => setGenerateMsg(""), 3000);
    }
  };

  const handleExport = () => alert("M3U export — coming soon");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const visibleSongs = songs.filter((song) => {
    if (song.explicit === "explicit" && !showExplicit) return false;
    if (song.explicit === "cleaned" && !showCleaned) return false;
    if (
      (song.explicit === "notExplicit" ||
        song.explicit === "notInItunes" ||
        !song.explicit) &&
      !showClean
    )
      return false;
    return true;
  });

  const sortedSongs = [...visibleSongs].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "artist")
      cmp = (a.artist ?? "").localeCompare(b.artist ?? "");
    if (sortKey === "genre") cmp = (a.genre ?? "").localeCompare(b.genre ?? "");
    if (sortKey === "signal")
      cmp = (a.signal ?? "").localeCompare(b.signal ?? "");
    return sortAsc ? -cmp : cmp;
  });

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => handleSort(k)}
      className={`text-xs font-medium flex items-center gap-1 transition-colors ${
        sortKey === k
          ? "text-brand-500"
          : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      }`}
    >
      {label}
      <span className="text-[10px]">
        {sortKey === k ? (sortAsc ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );

  return (
    <div>
      <PageMeta
        title="Playlist | TuneLog"
        description="Generate and manage TuneLog playlists"
      />
      <PageBreadcrumb pageTitle="Playlist" />

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        {/* ── Stats Row ── */}
        <div className="col-span-12 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            {
              label: "Last Generated",
              value: formatLastGenerated(stats?.last_generated ?? null),
            },
            {
              label: "Songs in Playlist",
              value: stats ? stats.total_songs.toLocaleString() : "—",
            },
            { label: "Showing", value: `${sortedSongs.length} songs` },
            { label: "Top Genre", value: stats?.top_genre ?? "—" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                {item.label}
              </p>
              <p className="text-xl font-semibold text-gray-800 dark:text-white/90">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Generate Panel ── */}
        <div className="col-span-12 xl:col-span-7 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-1">
            Generate Playlist
          </h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Scores your library and pushes a personalised playlist to Navidrome.
          </p>

          {/* User selector */}
          <div className="mb-5">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              User
            </p>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {users.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {/* Playlist size slider */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Playlist Size
              </p>
              <span className="text-sm font-semibold text-brand-500">
                {playlistSize} songs
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={playlistSize}
              onChange={(e) => setPlaylistSize(Number(e.target.value))}
              className="w-full accent-brand-500"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>10</span>
              <span>100</span>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Mode
            </p>
            <div className="flex gap-2">
              {(["regenerate", "append"] as SyncMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setSyncMode(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    syncMode === m
                      ? "border-brand-500 bg-brand-500/10 text-brand-500"
                      : "border-gray-200 text-gray-500 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400"
                  }`}
                >
                  {m === "regenerate" ? "🔄 Regenerate" : "➕ Append"}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {syncMode === "regenerate"
                ? "Clears existing playlist and rebuilds from scratch."
                : "Adds new high-scoring songs without removing existing ones."}
            </p>
          </div>

          <div className="flex gap-3 items-center">
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !selectedUser}
              size="sm"
              className="flex-1"
            >
              {isGenerating ? "Generating..." : "🎵 Generate Playlist"}
            </Button>
            <Button onClick={handleExport} size="sm" variant="outline">
              ⬇ M3U
            </Button>
          </div>
          {generateMsg && (
            <p className="text-xs mt-3 text-brand-500">{generateMsg}</p>
          )}
        </div>

        {/* ── Settings Panel ── */}
        <div className="col-span-12 xl:col-span-5 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
          <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-6">
            Playlist Settings
          </h4>

          <div className="space-y-6">
            {/* Explicit filter — affects generation */}
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Explicit Filter
              </p>
              <p className="text-xs text-gray-400 mb-3">
                Controls which songs are included when generating.
              </p>
              <div className="flex flex-col gap-2">
                {(
                  [
                    {
                      value: "strict",
                      label: "Strict",
                      desc: "Only clean songs",
                    },
                    {
                      value: "allow_cleaned",
                      label: "Allow Cleaned",
                      desc: "Clean + censored versions + unknown",
                    },
                    { value: "all", label: "All", desc: "Include everything" },
                  ] as { value: ExplicitFilter; label: string; desc: string }[]
                ).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setExplicitFilter(opt.value)}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      explicitFilter === opt.value
                        ? "border-brand-500 bg-brand-500/10"
                        : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
                    }`}
                  >
                    <span
                      className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                        explicitFilter === opt.value
                          ? "border-brand-500"
                          : "border-gray-300 dark:border-gray-600"
                      }`}
                    >
                      {explicitFilter === opt.value && (
                        <span className="h-2 w-2 rounded-full bg-brand-500 block" />
                      )}
                    </span>
                    <div>
                      <p
                        className={`text-sm font-medium ${explicitFilter === opt.value ? "text-brand-500" : "text-gray-700 dark:text-gray-300"}`}
                      >
                        {opt.label}
                      </p>
                      <p className="text-xs text-gray-400">{opt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <hr className="border-gray-200 dark:border-gray-800" />

            {/* Display filter — affects table only */}
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Show in Table
              </p>
              <p className="text-xs text-gray-400 mb-3">
                Filter what's visible in the song list. Does not affect
                generation.
              </p>
              <div className="flex flex-col gap-3">
                {[
                  {
                    label: "Explicit",
                    badge: "E",
                    badgeStyle:
                      "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
                    value: showExplicit,
                    setter: setShowExplicit,
                  },
                  {
                    label: "Cleaned",
                    badge: "C",
                    badgeStyle:
                      "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
                    value: showCleaned,
                    setter: setShowCleaned,
                  },
                  {
                    label: "Clean / Unknown",
                    badge: "✓",
                    badgeStyle:
                      "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
                    value: showClean,
                    setter: setShowClean,
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between"
                  >
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {row.label}{" "}
                      <span
                        className={`ml-1 rounded px-1 py-0.5 text-xs ${row.badgeStyle}`}
                      >
                        {row.badge}
                      </span>
                    </p>
                    <Switch
                      label=""
                      defaultChecked={row.value}
                      onChange={row.setter}
                    />
                  </div>
                ))}
              </div>
            </div>

            <hr className="border-gray-200 dark:border-gray-800" />

            {/* Genre injection */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Genre Injection
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Forces genre diversity — prevents one genre dominating.
                </p>
              </div>
              <Switch
                label=""
                defaultChecked={genreInjection}
                onChange={setGenreInjection}
              />
            </div>
          </div>
        </div>

        {/* ── Song Table ── */}
        <div className="col-span-12 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
            <div>
              <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Current Playlist
              </h4>
              <p className="text-xs text-gray-400 mt-0.5">
                Tunelog · {selectedUser || "—"} · {sortedSongs.length} songs
                shown
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-400">Sort by:</span>
              <SortBtn k="artist" label="Artist" />
              <SortBtn k="genre" label="Genre" />
              <SortBtn k="signal" label="Signal" />
            </div>
          </div>

          <div className="overflow-x-auto">
            {loadingSongs ? (
              <p className="text-sm text-gray-400 px-6 py-8">Loading...</p>
            ) : sortedSongs.length === 0 ? (
              <p className="text-sm text-gray-400 px-6 py-8">
                No songs found. Generate a playlist first.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-xs text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-6 py-3 font-medium">#</th>
                    <th className="text-left px-4 py-3 font-medium">Title</th>
                    <th className="text-left px-4 py-3 font-medium">Artist</th>
                    <th className="text-left px-4 py-3 font-medium">Genre</th>
                    <th className="text-left px-4 py-3 font-medium">Signal</th>
                    <th className="text-left px-4 py-3 font-medium">
                      Explicit
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {sortedSongs.map((song, idx) => (
                    <tr
                      key={song.song_id}
                      className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-6 py-3 text-gray-400 text-xs">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 dark:text-white/90 truncate max-w-[180px]">
                          {song.title}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs">
                        {song.artist}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                        {song.genre ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${SIGNAL_STYLE[song.signal] ?? ""}`}
                        >
                          {song.signal ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {song.explicit ? (
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${EXPLICIT_STYLE[song.explicit] ?? ""}`}
                          >
                            {EXPLICIT_LABEL[song.explicit] ?? "?"}
                          </span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600 text-xs">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
