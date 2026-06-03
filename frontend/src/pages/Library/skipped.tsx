
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import MiniPlayer from "../Jam/MiniPlayer";
import { getSkippedSongs } from "../../API/API";
import type { SkippedSong } from "../../API/API";

const PAGE_SIZE = 10;
const NAVIDROME_URL = import.meta.env.VITE_NAVIDROME_URL || "";

type SortKey = "title" | "artist" | "album" | "time" | "duration" | "count";

type AggregatedSong = SkippedSong & { count: number };

function getCoverArtUrl(songId: string | null): string | null {
  if (!songId) return null;
  const u = localStorage.getItem("tunelog_user") || "";
  const p = localStorage.getItem("tunelog_password") || "";
  return `${NAVIDROME_URL}/rest/getCoverArt?id=${songId}&u=${u}&p=${p}&v=1.12.0&c=tunelog`;
}

function formatTime(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function useDarkMode() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark")),
    );
    obs.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function AlbumArt({
  src,
  alt,
  size = 40,
}: {
  src?: string | null;
  alt: string;
  size?: number;
}) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div
        className="rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0"
        style={{ width: size, height: size }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-gray-400 dark:text-gray-600"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErr(true)}
      className="rounded-lg object-cover flex-shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

function SkipBadge({ dark }: { dark: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
      style={{
        backgroundColor: dark ? "rgba(226,75,74,0.15)" : "#FCEBEB",
        color: dark ? "#F09595" : "#A32D2D",
      }}
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="5 4 15 12 5 20 5 4" />
        <line x1="19" y1="5" x2="19" y2="19" />
      </svg>
      Skipped
    </span>
  );
}

function PaginationToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium select-none">
        Pagination
      </span>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none ${value ? "bg-indigo-500" : "bg-gray-300 dark:bg-gray-600"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
}

function PaginationControls({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const getPaginationItems = () => {
    if (totalPages <= 7)
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (page <= 4) return [1, 2, 3, 4, 5, "...", totalPages];
    if (page >= totalPages - 3)
      return [
        1,
        "...",
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      ];
    return [1, "...", page - 1, page, page + 1, "...", totalPages];
  };

  return (
    <div className="flex items-center justify-center gap-1 pt-1 flex-wrap">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 1}
        className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ← Prev
      </button>
      {getPaginationItems().map((p, index) =>
        p === "..." ? (
          <span
            key={`e-${index}`}
            className="px-2 text-gray-400 dark:text-gray-600 select-none"
          >
            &hellip;
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPage(p as number)}
            className={`w-8 h-7 rounded-lg text-xs font-semibold transition-colors ${
              p === page
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                : "text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        onClick={() => onPage(page + 1)}
        disabled={page === totalPages}
        className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next →
      </button>
    </div>
  );
}

function SortButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-md text-xs font-semibold border transition-colors ${
        active
          ? "text-white border-indigo-500 bg-indigo-500 dark:border-indigo-400 dark:bg-indigo-400"
          : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 bg-transparent"
      }`}
    >
      {active ? `${label} ↓` : label}
    </button>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none"
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search title, artist, album…"
        className="pl-8 pr-4 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400 dark:focus:border-indigo-500 transition-all w-56"
      />
    </div>
  );
}


function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-400/10 flex items-center justify-center">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-red-400 dark:text-red-500"
        >
          <polygon points="5 4 15 12 5 20 5 4" />
          <line x1="19" y1="5" x2="19" y2="19" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-700 dark:text-white/80">
          {filtered ? "No matches found" : "No skipped songs"}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {filtered
            ? "Try adjusting your search query"
            : "Songs you skip will appear here"}
        </p>
      </div>
    </div>
  );
}

function SkippedTable({
  entries,
  dark,
}: {
  entries: SkippedSong[];
  dark: boolean;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("count");
  const [paginated, setPaginated] = useState(true);
  const [page, setPage] = useState(1);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loaderRef = useRef<HTMLDivElement>(null);

  const aggregatedEntries = useMemo(() => {
    const map = new Map<string, AggregatedSong>();
    entries.forEach((e) => {
      const key = e.song_id || e.id;
      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.count += 1;
        if (new Date(e.timestamp) > new Date(existing.timestamp)) {
          existing.timestamp = e.timestamp;
        }
      } else {
        map.set(key, { ...e, count: 1 });
      }
    });
    return Array.from(map.values());
  }, [entries]);

  const filtered = aggregatedEntries.filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (e.title ?? "").toLowerCase().includes(q) ||
      (e.artist ?? "").toLowerCase().includes(q) ||
      (e.album ?? "").toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "count") return b.count - a.count; 
    if (sort === "title") return (a.title ?? "").localeCompare(b.title ?? "");
    if (sort === "artist")
      return (a.artist ?? "").localeCompare(b.artist ?? "");
    if (sort === "album") return (a.album ?? "").localeCompare(b.album ?? "");
    if (sort === "duration") return (b.duration ?? 0) - (a.duration ?? 0);
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const displayed = paginated
    ? sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : sorted.slice(0, visibleCount);

  useEffect(() => {
    if (paginated || !loaderRef.current) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setVisibleCount((c) => c + PAGE_SIZE);
      },
      { threshold: 0.1 },
    );
    obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [paginated]);

  useEffect(() => {
    setPage(1);
    setVisibleCount(PAGE_SIZE);
  }, [search, sort]);

  const handleToggle = (v: boolean) => {
    setPaginated(v);
    setPage(1);
    setVisibleCount(PAGE_SIZE);
  };

  const sortKeys: SortKey[] = ["count", "time", "title", "artist", "album", "duration"];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchInput value={search} onChange={setSearch} />
          <div className="flex items-center gap-3 flex-wrap">
            <PaginationToggle value={paginated} onChange={handleToggle} />
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                Sort
              </span>
              {sortKeys.map((k) => (
                <SortButton
                  key={k}
                  label={k.charAt(0).toUpperCase() + k.slice(1)}
                  active={sort === k}
                  onClick={() => setSort(k)}
                />
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {sorted.length} unique skipped songs
          {paginated
            ? ` · page ${page}/${Math.max(totalPages, 1)}`
            : ` · showing ${Math.min(visibleCount, sorted.length)}`}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
        <table className="w-full text-sm min-w-full sm:min-w-[640px]">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 w-10">
                #
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Song
              </th>
              <th className="hidden md:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Artist
              </th>
              <th className="hidden lg:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Album
              </th>
              <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Last Skipped
              </th>
              <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Duration
              </th>
              <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Count
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Signal
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
            {displayed.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState filtered={search.trim().length > 0} />
                </td>
              </tr>
            ) : (
              displayed.map((entry, i) => (
                <tr
                  key={entry.id}
                  className="hover:bg-red-50/40 dark:hover:bg-red-400/5 transition-colors group"
                >
                  <td className="hidden sm:table-cell px-4 py-3 text-xs text-gray-400 dark:text-gray-600 tabular-nums">
                    {paginated ? (page - 1) * PAGE_SIZE + i + 1 : i + 1}
                  </td>

                  <td className="px-4 py-3 max-w-[160px] sm:max-w-none">
                    <div className="flex items-center gap-3">
                      <div className="relative flex-shrink-0">
                        <AlbumArt
                          src={getCoverArtUrl(entry.song_id)}
                          alt={entry.title ?? "Song"}
                          size={40}
                        />
                        <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center shadow-sm">
                          <svg
                            width="7"
                            height="7"
                            viewBox="0 0 24 24"
                            fill="white"
                            stroke="white"
                            strokeWidth="1"
                          >
                            <polygon points="5 4 15 12 5 20 5 4" />
                            <line x1="19" y1="5" x2="19" y2="19" />
                          </svg>
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="font-medium text-gray-800 dark:text-white/90 truncate text-sm leading-tight"
                          title={entry.title ?? undefined}
                        >
                          {entry.title ?? "Unknown Title"}
                        </p>
                        <p
                          className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5 md:hidden"
                          title={entry.artist ?? undefined}
                        >
                          {entry.artist ?? "Unknown Artist"}
                        </p>
                        <p
                          className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5 hidden md:block lg:hidden"
                          title={entry.album ?? undefined}
                        >
                          {entry.album ?? "Unknown Album"}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="hidden md:table-cell px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-[140px] truncate">
                    {entry.artist ?? "—"}
                  </td>

                  <td className="hidden lg:table-cell px-4 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-[160px] truncate">
                    {entry.album ?? "—"}
                  </td>

                  <td className="hidden sm:table-cell px-4 py-3 text-xs text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap">
                    {formatTime(entry.timestamp)}
                  </td>

                  <td className="hidden sm:table-cell px-4 py-3 text-xs text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap">
                    {formatDuration(entry.duration)}
                  </td>

                  <td className="hidden sm:table-cell px-4 py-3 text-xs font-medium text-gray-600 dark:text-gray-300 tabular-nums whitespace-nowrap">
                    {entry.count}x
                  </td>

                  <td className="px-4 py-3">
                    <SkipBadge dark={dark} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {paginated ? (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          onPage={setPage}
        />
      ) : (
        visibleCount < sorted.length && (
          <div ref={loaderRef} className="flex justify-center py-4">
            <span className="text-xs text-gray-400 dark:text-gray-600 animate-pulse">
              Loading more…
            </span>
          </div>
        )
      )}
    </div>
  );
}

export default function SkippedSongs() {
  const navigate = useNavigate();
  const dark = useDarkMode();

  const [entries, setEntries] = useState<SkippedSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token =
      localStorage.getItem("tunelog_token") ||
      sessionStorage.getItem("tunelog_token");
    if (!token) {
      navigate("/signin");
      return;
    }

    getSkippedSongs()
      .then((data) => {
        setEntries(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError("Failed to load skipped songs.");
        setLoading(false);
      });
  }, [navigate]);

  const uniqueArtists = new Set(entries.map((e) => e.artist).filter(Boolean))
    .size;
  const mostSkipped = (() => {
    const counts: Record<string, number> = {};
    entries.forEach((e) => {
      if (e.artist) counts[e.artist] = (counts[e.artist] ?? 0) + 1;
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : "—";
  })();

  const statCards = [
    {
      label: "Total Skip Events",
      value: entries.length,
      color: "#E24B4A",
    },
    {
      label: "Artists",
      value: uniqueArtists,
      color: undefined,
    },
    {
      label: "Most Skipped",
      value: loading ? "—" : mostSkipped,
      isText: true,
      color: "#EF9F27",
    },
  ];

  return (
    <>
      <PageMeta
        title="Skipped Songs — TuneLog"
        description="Browse all songs you've skipped"
      />
      <PageBreadcrumb pageTitle="Skipped Songs" />

      <div className="space-y-5">
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Skipped Songs
              </h4>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Songs with a skip signal
              </p>
            </div>
            <span
              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "#E24B4A" }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="none"
              >
                <polygon points="5 4 15 12 5 20 5 4" />
                <rect x="17" y="4" width="3" height="16" rx="1" />
              </svg>
              Skip
            </span>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {statCards.map((c) => (
              <div
                key={c.label}
                className="rounded-xl bg-gray-50 dark:bg-gray-800/70 border border-gray-100 dark:border-gray-700/50 p-4"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                  {c.label}
                </p>
                <p
                  className={`font-semibold tabular-nums text-gray-800 dark:text-white/90 truncate ${
                    c.isText ? "text-base" : "text-2xl"
                  }`}
                  style={c.color ? { color: c.color } : undefined}
                >
                  {loading ? "—" : String(c.value)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                All Skipped Tracks
              </h4>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {loading
                  ? "Loading…"
                  : `${entries.length} total skip events logged`}
              </p>
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <svg
                  className="animate-spin text-gray-400 dark:text-gray-600"
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                <p className="text-sm text-gray-400 dark:text-gray-600">
                  Loading skipped songs…
                </p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <p className="text-sm text-red-500 dark:text-red-400">
                  {error}
                </p>
              </div>
            ) : (
              <SkippedTable entries={entries} dark={dark} />
            )}
          </div>
        </div>
      </div>

      <MiniPlayer />
    </>
  );
}