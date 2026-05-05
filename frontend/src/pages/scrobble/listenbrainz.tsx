import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import MiniPlayer from "../Jam/MiniPlayer";

const PAGE_SIZE = 10;
const BASE_URL = import.meta.env.VITE_API_URL || "";
const NAVIDROME_URL = import.meta.env.VITE_NAVIDROME_URL || "";

export interface ListenBrainzEntry {
  id: number;
  song_id: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  signal: string | null;
  tag: string | null;
  comment: string | null;
  timestamp: string;
}

type ActiveTab = "matched" | "itunes" | "unmatched";
type MatchedSubFilter = "all" | "matched" | "duplicate";
type SortKey = "title" | "artist" | "time" | "signal" | "score";

export interface MatchedEntry {
  id: string;
  song_name: string;
  artist: string;
  album: string;
  song_id: string | null;
  listened_at: string;
  tag: "matched" | "duplicate";
  signal: string | null;
}

export interface ItunesEntry {
  id: string;
  song_name: string;
  artist: string;
  album: string;
  song_id: string | null;
  listened_at: string;
  score: number | null;
}

export interface UnmatchedEntry {
  id: string;
  raw_title: string;
  raw_artist: string;
  listened_at: string;
  comment: string | null;
}

export interface ParsedData {
  matched: MatchedEntry[];
  itunes: ItunesEntry[];
  unmatched: UnmatchedEntry[];
}

export async function getListenbrainzLog(): Promise<ListenBrainzEntry[]> {
  const token =
    localStorage.getItem("tunelog_token") ||
    sessionStorage.getItem("tunelog_token");
  const res = await fetch(`${BASE_URL}/api/listenbrainz`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch listenbrainz log");
  return res.json();
}

async function deleteListenbrainzEntry(id: string): Promise<void> {
  const token =
    localStorage.getItem("tunelog_token") ||
    sessionStorage.getItem("tunelog_token");
  const res = await fetch(`${BASE_URL}/api/listenbrainz/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to delete entry");
}

function getCoverArtUrl(songId: string | null): string | null {
  if (!songId) return null;
  const u = localStorage.getItem("tunelog_user") || "";
  const p = localStorage.getItem("tunelog_password") || "";
  return `${NAVIDROME_URL}/rest/getCoverArt?id=${songId}&u=${u}&p=${p}&v=1.12.0&c=tunelog`;
}

function parseScore(comment: string | null): number | null {
  if (!comment || comment === "no_match") return null;
  const n = parseFloat(comment.replace(/'/g, ""));
  return isNaN(n) ? null : n;
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

const SIGNAL_CONFIG: Record<
  string,
  {
    label: string;
    lightBg: string;
    darkBg: string;
    lightText: string;
    darkText: string;
    color: string;
  }
> = {
  skip: {
    label: "Skip",
    color: "#E24B4A",
    lightBg: "#FCEBEB",
    darkBg: "rgba(226,75,74,0.15)",
    lightText: "#A32D2D",
    darkText: "#F09595",
  },
  partial: {
    label: "Partial",
    color: "#EF9F27",
    lightBg: "#FAEEDA",
    darkBg: "rgba(239,159,39,0.15)",
    lightText: "#854F0B",
    darkText: "#FAC775",
  },
  positive: {
    label: "Complete",
    color: "#639922",
    lightBg: "#EAF3DE",
    darkBg: "rgba(99,153,34,0.15)",
    lightText: "#3B6D11",
    darkText: "#97C459",
  },
  complete: {
    label: "Complete",
    color: "#639922",
    lightBg: "#EAF3DE",
    darkBg: "rgba(99,153,34,0.15)",
    lightText: "#3B6D11",
    darkText: "#97C459",
  },
  repeat: {
    label: "Repeat",
    color: "#7F77DD",
    lightBg: "#EEEDFE",
    darkBg: "rgba(127,119,221,0.15)",
    lightText: "#534AB7",
    darkText: "#AFA9EC",
  },
};

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
  size = 38,
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

function SignalPill({
  signal,
  dark,
}: {
  signal: string | null;
  dark: boolean;
}) {
  if (!signal)
    return <span className="text-xs text-gray-300 dark:text-gray-600">—</span>;
  const s = SIGNAL_CONFIG[signal] ?? SIGNAL_CONFIG["partial"];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
      style={{
        backgroundColor: dark ? s.darkBg : s.lightBg,
        color: dark ? s.darkText : s.lightText,
      }}
    >
      {s.label}
    </span>
  );
}

function TagBadge({ tag }: { tag: "matched" | "duplicate" }) {
  return tag === "duplicate" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 flex-shrink-0" />
      Duplicate
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700 dark:bg-green-400/15 dark:text-green-400 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 flex-shrink-0" />
      Unique
    </span>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null)
    return <span className="text-xs text-gray-300 dark:text-gray-600">—</span>;
  const color =
    score >= 95
      ? {
          bg: "bg-green-100 dark:bg-green-400/15",
          text: "text-green-700 dark:text-green-400",
        }
      : score >= 80
        ? {
            bg: "bg-amber-100 dark:bg-amber-400/15",
            text: "text-amber-700 dark:text-amber-400",
          }
        : {
            bg: "bg-red-100 dark:bg-red-400/15",
            text: "text-red-700 dark:text-red-400",
          };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tabular-nums ${color.bg} ${color.text}`}
    >
      {score.toFixed(1)}%
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
      {active ? `${label} ↑` : label}
    </button>
  );
}

function SubFilterPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1 rounded-md text-xs font-semibold border transition-colors ${
            value === o.value
              ? "bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white"
              : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 bg-transparent"
          }`}
        >
          {o.label}
        </button>
      ))}
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

interface TableControlRowProps {
  filterEl: React.ReactNode;
  sortKeys: SortKey[];
  sort: SortKey;
  paginated: boolean;
  onSortChange: (k: SortKey) => void;
  onPaginatedChange: (v: boolean) => void;
  total: number;
  page: number;
  totalPages: number;
  visibleCount: number;
}

function TableControlRow({
  filterEl,
  sortKeys,
  sort,
  paginated,
  onSortChange,
  onPaginatedChange,
  total,
  page,
  totalPages,
  visibleCount,
}: TableControlRowProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {filterEl}
        <div className="flex items-center gap-3 flex-wrap">
          <PaginationToggle value={paginated} onChange={onPaginatedChange} />
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
              Sort
            </span>
            {sortKeys.map((k) => (
              <SortButton
                key={k}
                label={k.charAt(0).toUpperCase() + k.slice(1)}
                active={sort === k}
                onClick={() => onSortChange(k)}
              />
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        {total} entries
        {paginated
          ? ` · page ${page}/${Math.max(totalPages, 1)}`
          : ` · showing ${Math.min(visibleCount, total)}`}
      </p>
    </div>
  );
}

function MatchedTable({
  entries,
  dark,
}: {
  entries: MatchedEntry[];
  dark: boolean;
}) {
  const [filter, setFilter] = useState<MatchedSubFilter>("all");
  const [sort, setSort] = useState<SortKey>("time");
  const [paginated, setPaginated] = useState(true);
  const [page, setPage] = useState(1);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loaderRef = useRef<HTMLDivElement>(null);

  const uniqueCount = entries.filter((e) => e.tag === "matched").length;
  const dupCount = entries.filter((e) => e.tag === "duplicate").length;

  const filtered = entries.filter((e) =>
    filter === "all" ? true : e.tag === filter,
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "title") return a.song_name.localeCompare(b.song_name);
    if (sort === "artist") return a.artist.localeCompare(b.artist);
    if (sort === "signal")
      return (a.signal ?? "").localeCompare(b.signal ?? "");
    return (
      new Date(b.listened_at).getTime() - new Date(a.listened_at).getTime()
    );
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
  }, [filter, sort]);

  const handleToggle = (v: boolean) => {
    setPaginated(v);
    setPage(1);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <div className="flex flex-col gap-4">
      <TableControlRow
        filterEl={
          <SubFilterPills<MatchedSubFilter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `All (${entries.length})` },
              { value: "matched", label: `Unique (${uniqueCount})` },
              { value: "duplicate", label: `Duplicates (${dupCount})` },
            ]}
          />
        }
        sortKeys={["title", "artist", "time", "signal"]}
        sort={sort}
        paginated={paginated}
        onSortChange={setSort}
        onPaginatedChange={handleToggle}
        total={sorted.length}
        page={page}
        totalPages={totalPages}
        visibleCount={visibleCount}
      />

      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
        <table className="w-full text-sm min-w-full sm:min-w-[600px]">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 w-10">
                #
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Song
              </th>
              <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Artist
              </th>
              <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Listened At
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Signal
              </th>
              <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Tag
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
            {displayed.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-600"
                >
                  No entries for this filter.
                </td>
              </tr>
            ) : (
              displayed.map((entry, i) => (
                <tr
                  key={entry.id}
                  className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors"
                >
                  <td className="hidden sm:table-cell px-4 py-3 text-xs text-gray-400 dark:text-gray-600 tabular-nums">
                    {paginated ? (page - 1) * PAGE_SIZE + i + 1 : i + 1}
                  </td>
                  <td className="px-4 py-3 max-w-[160px] sm:max-w-none">
                    <div className="flex items-center gap-3">
                      <AlbumArt
                        src={getCoverArtUrl(entry.song_id)}
                        alt={entry.song_name}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="font-medium text-gray-800 dark:text-white/90 truncate text-sm leading-tight"
                          title={entry.song_name}
                        >
                          {entry.song_name}
                        </p>
                        <p
                          className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5 sm:hidden"
                          title={entry.artist}
                        >
                          {entry.artist}
                        </p>
                        <p
                          className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5 hidden sm:block"
                          title={entry.album}
                        >
                          {entry.album}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-[140px] truncate">
                    {entry.artist}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-xs text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap">
                    {formatTime(entry.listened_at)}
                  </td>
                  <td className="px-4 py-3">
                    <SignalPill signal={entry.signal} dark={dark} />
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3">
                    <TagBadge tag={entry.tag} />
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

function ItunesTable({ entries }: { entries: ItunesEntry[]; dark: boolean }) {
  const [sort, setSort] = useState<SortKey>("time");
  const [paginated, setPaginated] = useState(true);
  const [page, setPage] = useState(1);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loaderRef = useRef<HTMLDivElement>(null);

  const sorted = [...entries].sort((a, b) => {
    if (sort === "title") return a.song_name.localeCompare(b.song_name);
    if (sort === "artist") return a.artist.localeCompare(b.artist);
    if (sort === "score") return (b.score ?? 0) - (a.score ?? 0);
    return (
      new Date(b.listened_at).getTime() - new Date(a.listened_at).getTime()
    );
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
  }, [sort]);

  const handleToggle = (v: boolean) => {
    setPaginated(v);
    setPage(1);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <div className="flex flex-col gap-4">
      <TableControlRow
        filterEl={
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
            All iTunes Matches ({entries.length})
          </div>
        }
        sortKeys={["title", "artist", "time", "score"]}
        sort={sort}
        paginated={paginated}
        onSortChange={setSort}
        onPaginatedChange={handleToggle}
        total={sorted.length}
        page={page}
        totalPages={totalPages}
        visibleCount={visibleCount}
      />

      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
        <table className="w-full text-sm min-w-full sm:min-w-[600px]">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 w-10">
                #
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Song
              </th>
              <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Artist
              </th>
              <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Listened At
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Score
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
            {displayed.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-600"
                >
                  No iTunes matches yet.
                </td>
              </tr>
            ) : (
              displayed.map((entry, i) => (
                <tr
                  key={entry.id}
                  className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors"
                >
                  <td className="hidden sm:table-cell px-4 py-3 text-xs text-gray-400 dark:text-gray-600 tabular-nums">
                    {paginated ? (page - 1) * PAGE_SIZE + i + 1 : i + 1}
                  </td>
                  <td className="px-4 py-3 max-w-[160px] sm:max-w-none">
                    <div className="flex items-center gap-3">
                      <AlbumArt
                        src={getCoverArtUrl(entry.song_id)}
                        alt={entry.song_name}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="font-medium text-gray-800 dark:text-white/90 truncate text-sm leading-tight"
                          title={entry.song_name}
                        >
                          {entry.song_name}
                        </p>
                        <p
                          className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5 sm:hidden"
                          title={entry.artist}
                        >
                          {entry.artist}
                        </p>
                        <p
                          className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5 hidden sm:block"
                          title={entry.album}
                        >
                          {entry.album}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-[140px] truncate">
                    {entry.artist}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-xs text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap">
                    {formatTime(entry.listened_at)}
                  </td>
                  <td className="px-4 py-3">
                    <ScoreBadge score={entry.score} />
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

function UnmatchedTable({
  entries,
  onDelete,
}: {
  entries: UnmatchedEntry[];
  onDelete: (id: string) => void;
}) {
  const [sort, setSort] = useState<SortKey>("time");
  const [paginated, setPaginated] = useState(true);
  const [page, setPage] = useState(1);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const loaderRef = useRef<HTMLDivElement>(null);

  const sorted = [...entries].sort((a, b) => {
    if (sort === "title") return a.raw_title.localeCompare(b.raw_title);
    if (sort === "artist") return a.raw_artist.localeCompare(b.raw_artist);
    return (
      new Date(b.listened_at).getTime() - new Date(a.listened_at).getTime()
    );
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
  }, [sort]);

  const handleToggle = (v: boolean) => {
    setPaginated(v);
    setPage(1);
    setVisibleCount(PAGE_SIZE);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteListenbrainzEntry(id);
      onDelete(id);
    } catch {
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <TableControlRow
        filterEl={
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
            All Unmatched ({entries.length})
          </div>
        }
        sortKeys={["title", "artist", "time"]}
        sort={sort}
        paginated={paginated}
        onSortChange={setSort}
        onPaginatedChange={handleToggle}
        total={sorted.length}
        page={page}
        totalPages={totalPages}
        visibleCount={visibleCount}
      />

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
              <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Artist
              </th>
              <th className="hidden sm:table-cell text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Listened At
              </th>
              <th className="w-12 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
            {displayed.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-600"
                >
                  No unmatched entries.
                </td>
              </tr>
            ) : (
              displayed.map((entry, i) => (
                <tr
                  key={entry.id}
                  className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors"
                >
                  <td className="hidden sm:table-cell px-4 py-3 text-xs text-gray-400 dark:text-gray-600 tabular-nums">
                    {paginated ? (page - 1) * PAGE_SIZE + i + 1 : i + 1}
                  </td>
                  <td className="px-4 py-3 max-w-[160px] sm:max-w-none">
                    <div className="flex items-center gap-3">
                      <div className="w-[38px] h-[38px] rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className="text-gray-300 dark:text-gray-700"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-sm text-gray-700 dark:text-gray-300 truncate leading-tight"
                          title={entry.raw_title}
                        >
                          {entry.raw_title}
                        </p>
                        <p
                          className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5 sm:hidden"
                          title={entry.raw_artist}
                        >
                          {entry.raw_artist}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-[140px] truncate">
                    {entry.raw_artist}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-xs text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap">
                    {formatTime(entry.listened_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition-colors disabled:opacity-40"
                      title="Delete entry"
                    >
                      {deletingId === entry.id ? (
                        <svg
                          className="animate-spin"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                        </svg>
                      ) : (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6M14 11v6M9 6V4h6v2" />
                        </svg>
                      )}
                    </button>
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

export default function ListenBrainzImport() {
  const navigate = useNavigate();
  const dark = useDarkMode();
  const [activeTab, setActiveTab] = useState<ActiveTab>("matched");
  const [data, setData] = useState<ParsedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token =
      localStorage.getItem("tunelog_token") ||
      sessionStorage.getItem("tunelog_token");
    if (!token) {
      navigate("/signin");
      return;
    }

    getListenbrainzLog()
      .then((logData) => {
        const matched: MatchedEntry[] = [];
        const itunes: ItunesEntry[] = [];
        const unmatched: UnmatchedEntry[] = [];

        logData.forEach((entry) => {
          const tag = entry.tag ?? "";

          if (tag === "matched" || tag === "duplicate") {
            matched.push({
              id: String(entry.id),
              song_name: entry.title || "Unknown Title",
              artist: entry.artist || "Unknown Artist",
              album: entry.album || "Unknown Album",
              song_id: entry.song_id,
              listened_at: entry.timestamp,
              tag: tag as "matched" | "duplicate",
              signal: entry.signal,
            });
          } else if (tag === "itunes") {
            itunes.push({
              id: String(entry.id),
              song_name: entry.title || "Unknown Title",
              artist: entry.artist || "Unknown Artist",
              album: entry.album || "Unknown Album",
              song_id: entry.song_id,
              listened_at: entry.timestamp,
              score: parseScore(entry.comment),
            });
          } else if (tag === "unmatched") {
            unmatched.push({
              id: String(entry.id),
              raw_title: entry.title || "Unknown Title",
              raw_artist: entry.artist || "Unknown Artist",
              listened_at: entry.timestamp,
              comment: entry.comment,
            });
          }
        });

        setData({ matched, itunes, unmatched });
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [navigate]);

  const handleDelete = (id: string) => {
    if (!data) return;
    setData({ ...data, unmatched: data.unmatched.filter((e) => e.id !== id) });
  };

  const total =
    (data?.matched.length ?? 0) +
    (data?.itunes.length ?? 0) +
    (data?.unmatched.length ?? 0);
  const uniqueCount =
    data?.matched.filter((e) => e.tag === "matched").length ?? 0;
  const dupCount =
    data?.matched.filter((e) => e.tag === "duplicate").length ?? 0;
  const itunesCount = data?.itunes.length ?? 0;
  const unmatchedCount = data?.unmatched.length ?? 0;

  const statCards = [
    { label: "Total Fetched", value: total, color: undefined },
    { label: "Unique Matches", value: uniqueCount, color: "#639922" },
    { label: "Duplicates", value: dupCount, color: "#EF9F27" },
    { label: "iTunes", value: itunesCount, color: "#7F77DD" },
    { label: "Unmatched", value: unmatchedCount, color: "#E24B4A" },
  ];

  const tabs: { id: ActiveTab; label: string; count: number; dot: string }[] = [
    {
      id: "matched",
      label: "Matched",
      count: data?.matched.length ?? 0,
      dot: "#639922",
    },
    { id: "itunes", label: "iTunes", count: itunesCount, dot: "#7F77DD" },
    {
      id: "unmatched",
      label: "Unmatched",
      count: unmatchedCount,
      dot: "#E24B4A",
    },
  ];

  return (
    <>
      <PageMeta
        title="ListenBrainz Import — TuneLog"
        description="Review songs imported from ListenBrainz"
      />
      <PageBreadcrumb pageTitle="ListenBrainz" />

      <div className="space-y-5">
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                ListenBrainz
              </h4>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Last import results
              </p>
            </div>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-green-600 dark:text-green-500">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Ready
            </span>
          </div>
          <div className="p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {statCards.map((c) => (
              <div
                key={c.label}
                className="rounded-xl bg-gray-50 dark:bg-gray-800/70 border border-gray-100 dark:border-gray-700/50 p-4"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                  {c.label}
                </p>
                <p
                  className="text-2xl font-semibold tabular-nums text-gray-800 dark:text-white/90"
                  style={c.color ? { color: c.color } : undefined}
                >
                  {loading ? "—" : String(c.value)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-wrap gap-3">
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {activeTab === "matched"
                  ? "Matched Songs"
                  : activeTab === "itunes"
                    ? "iTunes Matches"
                    : "Unmatched Songs"}
              </h4>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {activeTab === "matched"
                  ? `${uniqueCount} unique · ${dupCount} duplicates`
                  : activeTab === "itunes"
                    ? `${itunesCount} matched via iTunes API`
                    : `${unmatchedCount} unidentified · delete to clean up`}
              </p>
            </div>

            <div className="flex items-center rounded-xl bg-gray-100 dark:bg-gray-800 p-1 gap-0.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    activeTab === tab.id
                      ? "bg-white dark:bg-gray-700 text-gray-800 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tab.dot }}
                  />
                  {tab.label}
                  {!loading && (
                    <span className="ml-0.5 text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
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
                  Loading import results…
                </p>
              </div>
            ) : activeTab === "matched" ? (
              <MatchedTable entries={data?.matched ?? []} dark={dark} />
            ) : activeTab === "itunes" ? (
              <ItunesTable entries={data?.itunes ?? []} dark={dark} />
            ) : (
              <UnmatchedTable
                entries={data?.unmatched ?? []}
                onDelete={handleDelete}
              />
            )}
          </div>
        </div>
      </div>

      <MiniPlayer />
    </>
  );
}
