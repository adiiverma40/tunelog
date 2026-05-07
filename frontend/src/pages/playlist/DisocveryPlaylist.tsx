import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import Switch from "../../components/form/switch/Switch";
import {
  getSong,
  generateDiscoveryQueue,
  fetchDiscoveryPlaylistId,
} from "../../API/API";
import {
  ExplicitFilter,
  SortKey,
  DiscoveryDateMode,
  DISCOVERY_PAGE_SIZE,
  toISODate,
} from "./shared/PlaylistTypes";

import {
  useThemeTokens,
  SongTable,
  SharedSettingsPanel,
  fetchPlaylistFromNavidrome,
} from "./components/playlistShared";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function DateRangePicker({
  from,
  to,
  onFromChange,
  onToChange,
  dark,
  accentColor,
}: {
  from: Date | null;
  to: Date | null;
  onFromChange: (d: Date | null) => void;
  onToChange: (d: Date | null) => void;
  dark: boolean;
  accentColor: string;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [hovered, setHovered] = useState<Date | null>(null);

  const card = dark ? "#131316" : "#ffffff";
  const cardBorder = dark ? "#222228" : "#e8e8e4";
  const textPrimary = dark ? "#f0f0ee" : "#18181a";
  const textMuted = dark ? "#555552" : "#a0a09c";
  const textSecondary = dark ? "#888884" : "#6b6b67";
  const inputBg = dark ? "#1a1a1f" : "#f3f3f0";

  const getDaysInMonth = (y: number, m: number) =>
    new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y: number, m: number) =>
    new Date(y, m, 1).getDay();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const isInRange = (d: Date) => {
    const rangeEnd = hovered || to;
    if (!from || !rangeEnd) return false;
    const [s, e] = from <= rangeEnd ? [from, rangeEnd] : [rangeEnd, from];
    return d > s && d < e;
  };
  const isStart = (d: Date) => !!from && isSameDay(d, from);
  const isEnd = (d: Date) => !!to && isSameDay(d, to);
  const isFuture = (d: Date) => d > today;

  const handleDayClick = (d: Date) => {
    if (isFuture(d)) return;
    if (!from || (from && to)) {
      onFromChange(d);
      onToChange(null);
    } else {
      if (d < from) {
        onToChange(from);
        onFromChange(d);
      } else {
        onToChange(d);
      }
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };
  const canGoNext = !(
    viewYear === today.getFullYear() && viewMonth === today.getMonth()
  );
  const days = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const formatDisplay = (d: Date | null) =>
    d ? `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          background: inputBg,
          borderRadius: 10,
          padding: "10px 14px",
          border: `1px solid ${cardBorder}`,
        }}
      >
        <div style={{ flex: 1 }}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              margin: "0 0 2px",
            }}
          >
            From
          </p>
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: from ? accentColor : textMuted,
              margin: 0,
            }}
          >
            {formatDisplay(from)}
          </p>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={textMuted}
          strokeWidth="2"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
        <div style={{ flex: 1, textAlign: "right" }}>
          <p
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              margin: "0 0 2px",
            }}
          >
            To
          </p>
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: to ? accentColor : textMuted,
              margin: 0,
            }}
          >
            {formatDisplay(to)}
          </p>
        </div>
      </div>

      <div
        style={{
          background: dark ? "#0f0f12" : "#f9f9f6",
          borderRadius: 12,
          padding: 14,
          border: `1px solid ${cardBorder}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <button
            onClick={prevMonth}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: `1px solid ${cardBorder}`,
              background: card,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: textSecondary,
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: textPrimary }}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button
            onClick={nextMonth}
            disabled={!canGoNext}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: `1px solid ${cardBorder}`,
              background: card,
              cursor: canGoNext ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: canGoNext ? textSecondary : textMuted,
              opacity: canGoNext ? 1 : 0.4,
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 2,
            marginBottom: 6,
          }}
        >
          {DAY_NAMES.map((d) => (
            <div
              key={d}
              style={{
                textAlign: "center",
                fontSize: 10,
                fontWeight: 700,
                color: textMuted,
                padding: "2px 0",
                letterSpacing: "0.05em",
              }}
            >
              {d}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 2,
          }}
        >
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`e${i}`} />
          ))}
          {Array.from({ length: days }).map((_, i) => {
            const d = new Date(viewYear, viewMonth, i + 1);
            const start = isStart(d),
              end = isEnd(d),
              inRange = isInRange(d);
            const future = isFuture(d);
            const isToday = isSameDay(d, today);
            let bg = "transparent";
            let color = future ? textMuted : textPrimary;
            let borderRadius = 8;
            if (start || end) {
              bg = accentColor;
              color = "#fff";
            } else if (inRange) {
              bg = dark ? `${accentColor}22` : `${accentColor}18`;
              color = accentColor;
              borderRadius = 0;
            }
            return (
              <div
                key={i}
                onMouseEnter={() => !future && setHovered(d)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => handleDayClick(d)}
                style={{
                  textAlign: "center",
                  padding: "6px 0",
                  fontSize: 12,
                  fontWeight: start || end ? 700 : isToday ? 600 : 400,
                  color,
                  background: bg,
                  borderRadius,
                  cursor: future ? "not-allowed" : "pointer",
                  opacity: future ? 0.35 : 1,
                  transition: "background 0.1s, color 0.1s",
                  outline:
                    isToday && !start && !end
                      ? `1px solid ${accentColor}66`
                      : "none",
                  outlineOffset: -1,
                }}
              >
                {i + 1}
              </div>
            );
          })}
        </div>

        <div
          style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}
        >
          {[
            { label: "Today", days: 0 },
            { label: "7d", days: 7 },
            { label: "30d", days: 30 },
            { label: "90d", days: 90 },
          ].map((p) => (
            <button
              key={p.label}
              onClick={() => {
                const t = new Date();
                t.setHours(0, 0, 0, 0);
                const f = new Date(t);
                f.setDate(f.getDate() - p.days);
                onFromChange(p.days === 0 ? t : f);
                onToChange(t);
                setViewMonth(t.getMonth());
                setViewYear(t.getFullYear());
              }}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: `1px solid ${cardBorder}`,
                background: card,
                color: textSecondary,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => {
              onFromChange(null);
              onToChange(null);
            }}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: `1px solid ${cardBorder}`,
              background: card,
              color: textMuted,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

interface DiscoveryPlaylistProps {
  selectedUser: string;
  users: string[];
  setSelectedUser: (u: string) => void;
  dark: boolean;
  isMobile: boolean;
  isLargeScreen: boolean;
}

export default function DiscoveryPlaylist({
  selectedUser,
  users,
  setSelectedUser,
  dark,
  isMobile,
  isLargeScreen,
}: DiscoveryPlaylistProps) {
  const PAGE_SIZE = DISCOVERY_PAGE_SIZE;
  const INFINITE_BATCH = PAGE_SIZE;

  const [navidromeSongs, setNavidromeSongs] = useState<any[]>([]);
  const [coverArtMap, setCoverArtMap] = useState<Record<string, string>>({});
  const [dynamicStats, setDynamicStats] = useState({
    total: 0,
    dateFrom: "—",
    dateTo: "—",
  });

  const [playlistSize, setPlaylistSize] = useState(40);
  const [explicitFilter, setExplicitFilter] = useState<ExplicitFilter>("all");
  const [backtrack, setBacktrack] = useState(true);
  const [dateMode, setDateMode] = useState<DiscoveryDateMode>("slider");
  const [dayRange, setDayRange] = useState(10);
  const [calFrom, setCalFrom] = useState<Date | null>(
    new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  );
  const [calTo, setCalTo] = useState<Date | null>(new Date());

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState("");
  const [loadingSongs, setLoadingSongs] = useState(false);

  const [showExplicit, setShowExplicit] = useState(true);
  const [showCleaned, setShowCleaned] = useState(true);
  const [showClean, setShowClean] = useState(true);

  const [usePagination, setUsePagination] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [infiniteCount, setInfiniteCount] = useState(INFINITE_BATCH);

  const [sortKey, setSortKey] = useState<SortKey>("date_added");
  const [sortAsc, setSortAsc] = useState(false);
  const [activeTab, setActiveTab] = useState<"generate" | "settings">(
    "generate",
  );

  const tableRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  const tokens = useThemeTokens(dark, isMobile);
  const {
    card,
    cardBorder,
    textPrimary,
    // textSecondary,
    textMuted,
    inputBg,
    inputBorder,
    cardPadding,
    sectionLabel,
  } = tokens;

  const accentColor = "#378ADD";
  const gradient = "linear-gradient(135deg, #378ADD 0%, #185FA5 100%)";

  useEffect(() => {
    if (!selectedUser) return;
    setLoadingSongs(true);
    setCurrentPage(1);
    setInfiniteCount(INFINITE_BATCH);
    fetchDiscoveryPlaylistId(selectedUser)
      .then(async (idRes) => {
        if (idRes.status === "success" && idRes.id) {
          setNavidromeSongs(await fetchPlaylistFromNavidrome(idRes.id));
        } else {
          setNavidromeSongs([]);
        }
      })
      .catch(() => setNavidromeSongs([]))
      .finally(() => setLoadingSongs(false));
  }, [selectedUser]);

  useEffect(() => {
    if (!navidromeSongs.length) return;
    const uniqueIds = [
      ...new Set(navidromeSongs.map((s) => s.id).filter(Boolean)),
    ];
    Promise.all(
      uniqueIds.map(async (id) => {
        const song = await getSong(id);
        return song
          ? { id, coverArt: song.coverArt, created: song.created }
          : null;
      }),
    ).then((results) => {
      const map: Record<string, string> = {};
      const dates: number[] = [];
      results.forEach((r) => {
        if (r) {
          if (r.coverArt) map[r.id] = r.coverArt;
          if (r.created) dates.push(new Date(r.created).getTime());
        }
      });
      setCoverArtMap(map);
      if (dates.length > 0) {
        setDynamicStats({
          total: navidromeSongs.length,
          dateFrom: new Date(Math.min(...dates)).toISOString().slice(0, 10),
          dateTo: new Date(Math.max(...dates)).toISOString().slice(0, 10),
        });
      }
    });
  }, [navidromeSongs]);

  useEffect(() => {
    setCurrentPage(1);
    setInfiniteCount(INFINITE_BATCH);
  }, [sortKey, sortAsc, showExplicit, showCleaned, showClean, usePagination]);

  const handleGenerate = async () => {
    if (!selectedUser) return;
    setIsGenerating(true);
    setGenerateMsg("");
    setNavidromeSongs([]);
    setDynamicStats({ total: 0, dateFrom: "—", dateTo: "—" });
    try {
      const payload: any = {
        username: selectedUser,
        size: playlistSize,
        backtrack,
        explicit_filter: explicitFilter,
      };
      if (dateMode === "slider") {
        payload.days_from = 0;
        payload.days_to = dayRange;
      } else {
        payload.date_from = toISODate(calFrom);
        payload.date_to = toISODate(calTo);
      }
      const res = await generateDiscoveryQueue(payload);
      if (res.status === "ok") {
        const idRes = await fetchDiscoveryPlaylistId(selectedUser);
        if (idRes.status === "success" && idRes.id) {
          const songs = await fetchPlaylistFromNavidrome(idRes.id);
          setNavidromeSongs(songs);
          setGenerateMsg(`✓ Synced ${songs.length} songs from Navidrome`);
          setCurrentPage(1);
          setInfiniteCount(INFINITE_BATCH);
        } else {
          setGenerateMsg("Error: Could not retrieve Discovery Playlist ID");
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

  const handleSort = (key: string) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key as SortKey);
      setSortAsc(true);
    }
  };

  const handlePageChange = useCallback((p: number) => {
    setCurrentPage(p);
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleLoadMore = useCallback(() => {
    setInfiniteCount((c) => c + INFINITE_BATCH);
  }, [INFINITE_BATCH]);

  const rawSongs = navidromeSongs.map((s) => ({
    song_id: s.id,
    title: s.title,
    artist: s.artist,
    genre: s.genre,
    date_added: s.created,
    explicit: s.explicit ? "explicit" : "notExplicit",
  }));

  const visibleSongs = rawSongs.filter((song) => {
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

  const sortedSongs = useMemo(
    () =>
      [...visibleSongs].sort((a: any, b: any) => {
        let cmp = 0;
        if (sortKey === "title")
          cmp = (a.title ?? "").localeCompare(b.title ?? "");
        if (sortKey === "artist")
          cmp = (a.artist ?? "").localeCompare(b.artist ?? "");
        if (sortKey === "genre")
          cmp = (a.genre ?? "").localeCompare(b.genre ?? "");
        if (sortKey === "date_added")
          cmp = (a.date_added ?? "").localeCompare(b.date_added ?? "");
        return sortAsc ? cmp : -cmp;
      }),
    [visibleSongs, sortKey, sortAsc],
  );

  const totalPages = Math.max(1, Math.ceil(sortedSongs.length / PAGE_SIZE));
  const hasMoreInfinite = !usePagination && infiniteCount < sortedSongs.length;

  const statItems = [
    { label: "Total Songs", value: dynamicStats.total.toString() },
    { label: "Target Size", value: playlistSize.toString() },
    {
      label: "Date Range",
      value:
        dynamicStats.dateFrom !== "—"
          ? `${dynamicStats.dateFrom.slice(5)} → ${dynamicStats.dateTo.slice(5)}`
          : "—",
    },
    { label: "Backtrack", value: backtrack ? "On" : "Off" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
          gap: 1,
          borderRadius: 14,
          overflow: "hidden",
          border: `1px solid ${cardBorder}`,
        }}
      >
        {statItems.map((item) => (
          <div
            key={item.label}
            style={{
              padding: isMobile ? "12px 14px" : "18px 20px",
              background: card,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: textPrimary,
                letterSpacing: "-0.02em",
              }}
            >
              {item.value}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: textMuted,
              }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isLargeScreen ? "340px 1fr" : "1fr",
          gap: 20,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!isLargeScreen && (
            <div
              style={{
                display: "flex",
                background: card,
                border: `1px solid ${cardBorder}`,
                borderRadius: 14,
                padding: 4,
                gap: 4,
              }}
            >
              {(["generate", "settings"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: 10,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    textTransform: "capitalize",
                    background:
                      activeTab === tab
                        ? dark
                          ? "#1e1e26"
                          : "#f0f0ec"
                        : "transparent",
                    color: activeTab === tab ? textPrimary : textMuted,
                    transition: "all 0.15s",
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}

          {(isLargeScreen || activeTab === "generate") && (
            <div
              style={{
                background: card,
                border: `1px solid ${cardBorder}`,
                borderRadius: 14,
                padding: cardPadding,
                display: "flex",
                flexDirection: "column",
                gap: 18,
              }}
            >
              <div>
                <label style={sectionLabel}>User</label>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1px solid ${inputBorder}`,
                    background: inputBg,
                    color: textPrimary,
                    fontSize: 13,
                    outline: "none",
                  }}
                >
                  {users.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <label style={{ ...sectionLabel, marginBottom: 0 }}>
                    Size
                  </label>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: textPrimary,
                    }}
                  >
                    {playlistSize}
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={playlistSize}
                  onChange={(e) => setPlaylistSize(Number(e.target.value))}
                  style={{ width: "100%", accentColor }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 10,
                    color: textMuted,
                    marginTop: 4,
                  }}
                >
                  <span>10</span>
                  <span>100</span>
                </div>
              </div>

              <div style={{ height: 1, background: cardBorder }} />
              <div>
                <label style={sectionLabel}>Date Range Mode</label>
                <div
                  style={{
                    display: "flex",
                    background: dark ? "#1a1a1f" : "#f0f0ec",
                    borderRadius: 10,
                    padding: 3,
                    gap: 3,
                  }}
                >
                  {(["slider", "calendar"] as DiscoveryDateMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setDateMode(m)}
                      style={{
                        flex: 1,
                        padding: "7px 0",
                        borderRadius: 8,
                        border: "none",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                        background:
                          dateMode === m
                            ? dark
                              ? "#252530"
                              : "#ffffff"
                            : "transparent",
                        color: dateMode === m ? accentColor : textMuted,
                        transition: "all 0.15s",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                      }}
                    >
                      {m === "slider" ? "Slider" : "Calendar"}
                    </button>
                  ))}
                </div>
              </div>

              {dateMode === "slider" ? (
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <label style={{ ...sectionLabel, marginBottom: 0 }}>
                      Days Back
                    </label>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: accentColor,
                      }}
                    >
                      {dayRange === 0 ? "Today only" : `Last ${dayRange} days`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={90}
                    step={1}
                    value={dayRange}
                    onChange={(e) => setDayRange(Number(e.target.value))}
                    style={{ width: "100%", accentColor }}
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 10,
                      color: textMuted,
                      marginTop: 4,
                    }}
                  >
                    <span>Today</span>
                    <span>90 days ago</span>
                  </div>
                </div>
              ) : (
                <DateRangePicker
                  from={calFrom}
                  to={calTo}
                  onFromChange={setCalFrom}
                  onToChange={setCalTo}
                  dark={dark}
                  accentColor={accentColor}
                />
              )}

              <button
                onClick={handleGenerate}
                disabled={isGenerating || !selectedUser}
                style={{
                  width: "100%",
                  padding: "11px 0",
                  borderRadius: 10,
                  border: "none",
                  cursor: isGenerating ? "not-allowed" : "pointer",
                  background: isGenerating
                    ? dark
                      ? "#2a2a30"
                      : "#e0e0dc"
                    : gradient,
                  color: isGenerating ? textMuted : "#ffffff",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {isGenerating ? (
                  <>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      style={{ animation: "spin 0.8s linear infinite" }}
                    >
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                    Generating…
                  </>
                ) : (
                  "Generate Discovery Queue"
                )}
              </button>

              {generateMsg && (
                <p
                  style={{
                    fontSize: 12,
                    color: generateMsg.startsWith("✓") ? "#639922" : "#E24B4A",
                    textAlign: "center",
                    margin: 0,
                  }}
                >
                  {generateMsg}
                </p>
              )}
            </div>
          )}

          {(isLargeScreen || activeTab === "settings") && (
            <SharedSettingsPanel
              dark={dark}
              isMobile={isMobile}
              explicitFilter={explicitFilter}
              setExplicitFilter={setExplicitFilter}
              showExplicit={showExplicit}
              setShowExplicit={setShowExplicit}
              showCleaned={showCleaned}
              setShowCleaned={setShowCleaned}
              showClean={showClean}
              setShowClean={setShowClean}
              accentColor={accentColor}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1 }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: textPrimary,
                      margin: 0,
                    }}
                  >
                    Backtrack
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: textMuted,
                      margin: "4px 0 0",
                    }}
                  >
                    Extend date range if target size isn't met.
                  </p>
                </div>
                <Switch
                  label=""
                  defaultChecked={backtrack}
                  onChange={setBacktrack}
                />
              </div>
              <div style={{ height: 1, background: cardBorder }} />
            </SharedSettingsPanel>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            overflow: "hidden",
          }}
        >
          <SongTable
            songs={sortedSongs}
            coverArtMap={coverArtMap}
            dark={dark}
            isMobile={isMobile}
            loading={loadingSongs}
            usePagination={usePagination}
            setUsePagination={setUsePagination}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={PAGE_SIZE}
            infiniteCount={infiniteCount}
            hasMoreInfinite={hasMoreInfinite}
            onPage={handlePageChange}
            onLoadMore={handleLoadMore}
            sortKey={sortKey}
            sortAsc={sortAsc}
            onSort={handleSort}
            accentColor={accentColor}
            title="Discovery Queue"
            selectedUser={selectedUser}
            signalColumnLabel="Added"
            sortKeys={["title", "artist", "genre", "date_added"]}
            renderSignalCell={(song) => (
              <span
                style={{ fontSize: 11, color: textMuted, whiteSpace: "nowrap" }}
              >
                {song.date_added?.slice(0, 10) ?? "—"}
              </span>
            )}
            tableRef={tableRef as React.RefObject<HTMLDivElement>}
            tableScrollRef={tableScrollRef as React.RefObject<HTMLDivElement>}
          />
        </div>
      </div>
    </div>
  );
}
