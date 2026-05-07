import React, { useEffect, useRef, useState, useMemo } from "react";
import { getCoverArtUrl } from "../../../API/API";
import {
  SIGNAL_CONFIG,
  SLOT_COLORS,
  SlotValues,
  // WeightValues,
  EXPLICIT_CONFIG,
  // SIGNAL_ORDER,
  // normaliseSlots,
} from "../shared/PlaylistTypes";

export function useThemeTokens(dark: boolean, isMobile: boolean) {
  return {
    card: dark ? "#131316" : "#ffffff",
    cardBorder: dark ? "#222228" : "#e8e8e4",
    textPrimary: dark ? "#f0f0ee" : "#18181a",
    textSecondary: dark ? "#888884" : "#6b6b67",
    textMuted: dark ? "#555552" : "#a0a09c",
    inputBg: dark ? "#1a1a1f" : "#f3f3f0",
    inputBorder: dark ? "#2a2a30" : "#ddddd8",
    cardPadding: isMobile ? 14 : 20,
    sectionLabel: {
      fontSize: 11,
      fontWeight: 600,
      textTransform: "uppercase" as const,
      letterSpacing: "0.07em",
      color: dark ? "#555552" : "#a0a09c",
      display: "block",
      marginBottom: 8,
    },
    thStyle: {
      padding: "8px 12px",
      textAlign: "left" as const,
      fontSize: 10,
      fontWeight: 700,
      textTransform: "uppercase" as const,
      letterSpacing: "0.08em",
      color: dark ? "#555552" : "#a0a09c",
      whiteSpace: "nowrap" as const,
      borderBottom: `1px solid ${dark ? "#222228" : "#e8e8e4"}`,
    },
  };
}

export function useDarkMode() {
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

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) setMatches(media.matches);
    const listener = () => setMatches(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [matches, query]);
  return matches;
}

export async function fetchPlaylistFromNavidrome(
  playlistId: string,
): Promise<any[]> {
  const baseUrl = import.meta.env.VITE_NAVIDROME_URL;
  const user =
    localStorage.getItem("tunelog_user") ||
    sessionStorage.getItem("tunelog_user");
  const pass =
    localStorage.getItem("tunelog_password") ||
    sessionStorage.getItem("tunelog_password");
  if (!baseUrl || !user || !pass) return [];
  const url = `${baseUrl}/rest/getPlaylist?id=${playlistId}&u=${user}&p=${pass}&v=1.16.1&c=tunelog&f=json`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data["subsonic-response"]?.playlist?.entry || [];
  } catch {
    return [];
  }
}

export function LazyAlbumArt({
  coverArtId,
  title,
  size = 34,
}: {
  coverArtId: string | null;
  title: string;
  size?: number;
}) {
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setVisible(true);
      },
      { rootMargin: "120px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    setFailed(false);
  }, [coverArtId]);

  return (
    <div ref={ref} style={{ width: size, height: size, flexShrink: 0 }}>
      {visible && coverArtId && !failed ? (
        <img
          src={getCoverArtUrl(coverArtId)}
          alt={title}
          onError={() => setFailed(true)}
          style={{
            width: size,
            height: size,
            borderRadius: 6,
            display: "block",
            objectFit: "cover",
          }}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: 6,
            background: "var(--fallback-art-bg, #1a1a2e)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: size * 0.45, height: size * 0.45, opacity: 0.3 }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

export function SkeletonRows({
  count,
  dark,
  isMobile,
}: {
  count: number;
  dark: boolean;
  isMobile: boolean;
}) {
  const bg = dark ? "#1a1a1f" : "#f0f0ec";
  const shimmer = dark ? "#222228" : "#e4e4e0";
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr
          key={i}
          style={{ borderBottom: `1px solid ${dark ? "#18181c" : "#f0f0ec"}` }}
        >
          {!isMobile && (
            <td style={{ padding: "10px 12px", width: 36 }}>
              <div
                style={{
                  width: 20,
                  height: 12,
                  borderRadius: 4,
                  background: bg,
                }}
              />
            </td>
          )}
          <td style={{ padding: "8px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 6,
                  background: bg,
                  flexShrink: 0,
                }}
              />
              <div>
                <div
                  style={{
                    width: 100 + (i % 3) * 30,
                    height: 12,
                    borderRadius: 4,
                    background: shimmer,
                    marginBottom: 5,
                  }}
                />
                {isMobile && (
                  <div
                    style={{
                      width: 70,
                      height: 10,
                      borderRadius: 4,
                      background: bg,
                    }}
                  />
                )}
              </div>
            </div>
          </td>
          {!isMobile && (
            <td style={{ padding: "10px 12px" }}>
              <div
                style={{
                  width: 80,
                  height: 12,
                  borderRadius: 4,
                  background: bg,
                }}
              />
            </td>
          )}
          {!isMobile && (
            <td style={{ padding: "10px 12px" }}>
              <div
                style={{
                  width: 55,
                  height: 12,
                  borderRadius: 4,
                  background: bg,
                }}
              />
            </td>
          )}
          <td style={{ padding: "10px 12px" }}>
            <div
              style={{
                width: 55,
                height: 20,
                borderRadius: 6,
                background: bg,
              }}
            />
          </td>
          {!isMobile && (
            <td style={{ padding: "10px 12px" }}>
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  background: bg,
                }}
              />
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

export function SignalPill({
  signal,
  dark,
}: {
  signal: string;
  dark: boolean;
}) {
  const s = SIGNAL_CONFIG[signal] ?? SIGNAL_CONFIG["unheard"];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.02em",
        backgroundColor: dark ? s.darkBg : s.lightBg,
        color: dark ? s.darkText : s.lightText,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          backgroundColor: s.dot,
          flexShrink: 0,
        }}
      />
      {s.label}
    </span>
  );
}

export function SlotBar({ slots }: { slots: SlotValues }) {
  return (
    <div
      style={{
        display: "flex",
        borderRadius: 4,
        overflow: "hidden",
        height: 4,
        width: "100%",
        marginTop: 10,
        gap: 1,
      }}
    >
      {(Object.entries(slots) as [string, number][]).map(([key, val]) => (
        <div
          key={key}
          style={{
            width: `${val * 100}%`,
            backgroundColor: SLOT_COLORS[key] ?? "#888",
            transition: "width 0.3s ease",
            borderRadius: 2,
          }}
          title={`${key}: ${Math.round(val * 100)}%`}
        />
      ))}
    </div>
  );
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  color,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  color: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          width: 60,
          fontSize: 12,
          fontWeight: 500,
          color,
          flexShrink: 0,
          textTransform: "capitalize",
        }}
      >
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: color, height: 4, minWidth: 50 }}
      />
      <span
        style={{
          width: 36,
          fontSize: 11,
          color: "#888",
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {step < 1
          ? `${Math.round(value * 100)}%`
          : value > 0
            ? `+${value}`
            : value}
      </span>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onPage,
  dark,
  accentColor,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
  dark: boolean;
  accentColor: string;
}) {
  const textMuted = dark ? "#555552" : "#a0a09c";
  const textPrimary = dark ? "#f0f0ee" : "#18181a";
  const cardBorder = dark ? "#222228" : "#e8e8e4";
  const card = dark ? "#131316" : "#ffffff";

  const pages: (number | "…")[] = useMemo(() => {
    if (totalPages <= 7)
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    const result: (number | "…")[] = [1];
    if (page > 3) result.push("…");
    for (
      let i = Math.max(2, page - 1);
      i <= Math.min(totalPages - 1, page + 1);
      i++
    )
      result.push(i);
    if (page < totalPages - 2) result.push("…");
    result.push(totalPages);
    return result;
  }, [page, totalPages]);

  if (totalPages <= 1) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        borderTop: `1px solid ${cardBorder}`,
      }}
    >
      <span style={{ fontSize: 11, color: textMuted }}>
        Page {page} of {totalPages}
      </span>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            border: `1px solid ${cardBorder}`,
            background: card,
            cursor: page === 1 ? "not-allowed" : "pointer",
            color: page === 1 ? textMuted : textPrimary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: page === 1 ? 0.4 : 1,
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        {pages.map((p, i) => (
          <button
            key={i}
            onClick={() => typeof p === "number" && onPage(p)}
            disabled={p === "…"}
            style={{
              minWidth: 28,
              height: 28,
              padding: "0 6px",
              borderRadius: 7,
              border: `1px solid ${p === page ? accentColor : cardBorder}`,
              background: p === page ? `${accentColor}22` : card,
              color:
                p === page ? accentColor : p === "…" ? textMuted : textPrimary,
              fontSize: 12,
              fontWeight: p === page ? 700 : 400,
              cursor: p === "…" ? "default" : "pointer",
            }}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            border: `1px solid ${cardBorder}`,
            background: card,
            cursor: page === totalPages ? "not-allowed" : "pointer",
            color: page === totalPages ? textMuted : textPrimary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: page === totalPages ? 0.4 : 1,
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function InfiniteScrollSentinel({
  onVisible,
  dark,
  rootRef,
}: {
  onVisible: () => void;
  dark: boolean;
  rootRef?: React.RefObject<HTMLDivElement> | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) onVisible();
      },
      { root: rootRef?.current ?? null, rootMargin: "80px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [onVisible, rootRef]);

  return (
    <div
      ref={ref}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px 0",
        gap: 8,
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke={dark ? "#555552" : "#a0a09c"}
        strokeWidth="2.5"
        style={{ animation: "spin 0.8s linear infinite" }}
      >
        <path d="M21 12a9 9 0 11-6.219-8.56" />
      </svg>
      <span style={{ fontSize: 11, color: dark ? "#555552" : "#a0a09c" }}>
        Loading more…
      </span>
    </div>
  );
}

export interface SongTableProps {
  songs: any[];
  coverArtMap: Record<string, string>;
  dark: boolean;
  isMobile: boolean;
  loading: boolean;
  usePagination: boolean;
  setUsePagination: (v: boolean) => void;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  infiniteCount: number;
  hasMoreInfinite: boolean;
  onPage: (p: number) => void;
  onLoadMore: () => void;
  sortKey: string;
  sortAsc: boolean;
  onSort: (k: string) => void;
  accentColor: string;
  title: string;
  selectedUser: string;
  signalColumnLabel: string;
  sortKeys: string[];
  renderSignalCell: (song: any, dark: boolean) => React.ReactNode;
  tableRef: React.RefObject<HTMLDivElement>;
  tableScrollRef: React.RefObject<HTMLDivElement>;
}

export function SongTable({
  songs,
  coverArtMap,
  dark,
  isMobile,
  loading,
  usePagination,
  setUsePagination,
  currentPage,
  totalPages,
  pageSize,
  infiniteCount,
  hasMoreInfinite,
  onPage,
  onLoadMore,
  sortKey,
  sortAsc,
  onSort,
  accentColor,
  title,
  selectedUser,
  signalColumnLabel,
  sortKeys,
  renderSignalCell,
  tableRef,
  tableScrollRef,
}: SongTableProps) {
  const {
    card,
    cardBorder,
    textPrimary,
    textSecondary,
    textMuted,
    cardPadding,
    thStyle,
    // inputBg,
    inputBorder,
  } = useThemeTokens(dark, isMobile);

  const displayedSongs = usePagination
    ? songs.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : songs.slice(0, infiniteCount);

  const renderRows = () =>
    displayedSongs.map((song: any, idx) => {
      const globalIdx = usePagination
        ? (currentPage - 1) * pageSize + idx + 1
        : idx + 1;
      return (
        <tr
          key={song.song_id ?? song.id ?? idx}
          style={{
            borderBottom: `1px solid ${dark ? "#18181c" : "#f0f0ec"}`,
            transition: "background 0.1s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = dark ? "#18181f" : "#f8f8f5")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          {!isMobile && (
            <td
              style={{
                padding: "10px 12px",
                fontSize: 12,
                color: textMuted,
                fontVariantNumeric: "tabular-nums",
                width: 36,
              }}
            >
              {globalIdx}
            </td>
          )}
          <td style={{ padding: "8px 12px", minWidth: isMobile ? 0 : 160 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <LazyAlbumArt
                coverArtId={coverArtMap[song.song_id ?? song.id] ?? null}
                title={song.title}
                size={34}
              />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: textPrimary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 160,
                  }}
                >
                  {song.title}
                </span>
                {isMobile && (
                  <span
                    style={{
                      fontSize: 11,
                      color: textSecondary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 160,
                    }}
                  >
                    {song.artist}
                  </span>
                )}
              </div>
            </div>
          </td>
          {!isMobile && (
            <td
              style={{
                padding: "10px 12px",
                fontSize: 12,
                color: textSecondary,
                maxWidth: 130,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {song.artist}
            </td>
          )}
          {!isMobile && (
            <td
              style={{
                padding: "10px 12px",
                fontSize: 12,
                color: textMuted,
                textTransform: "capitalize",
                maxWidth: 100,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {song.genre ?? "—"}
            </td>
          )}
          <td style={{ padding: "10px 12px" }}>
            {renderSignalCell(song, dark)}
          </td>
          {!isMobile && (
            <td style={{ padding: "10px 12px" }}>
              {song.explicit && EXPLICIT_CONFIG[song.explicit] ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: EXPLICIT_CONFIG[song.explicit].color + "20",
                    color: EXPLICIT_CONFIG[song.explicit].color,
                  }}
                >
                  {EXPLICIT_CONFIG[song.explicit].label}
                </span>
              ) : null}
            </td>
          )}
        </tr>
      );
    });

  return (
    <div
      ref={tableRef}
      style={{
        background: card,
        border: `1px solid ${cardBorder}`,
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "flex-start" : "center",
          justifyContent: "space-between",
          padding: `${cardPadding}px`,
          borderBottom: `1px solid ${cardBorder}`,
          gap: 14,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <p
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: textPrimary,
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </p>
          <p style={{ fontSize: 11, color: textMuted, margin: 0 }}>
            {selectedUser} · {songs.length} songs
            {usePagination &&
              totalPages > 1 &&
              ` · page ${currentPage}/${totalPages}`}
            {!usePagination &&
              songs.length > 0 &&
              ` · showing ${Math.min(infiniteCount, songs.length)}`}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            justifyContent: isMobile ? "flex-start" : "flex-end",
          }}
        >
          {/* Pagination toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 8,
              background: dark ? "#1a1a1f" : "#f5f5f2",
              border: `1px solid ${cardBorder}`,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: textMuted,
                whiteSpace: "nowrap",
              }}
            >
              {usePagination ? "Pagination" : "Infinite"}
            </span>
            <button
              onClick={() => setUsePagination(!usePagination)}
              style={{
                width: 32,
                height: 18,
                borderRadius: 9,
                border: "none",
                background: usePagination
                  ? accentColor
                  : dark
                    ? "#333"
                    : "#ccc",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s",
                padding: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: usePagination ? 16 : 2,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 0.2s",
                }}
              />
            </button>
          </div>

          {/* Sort buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: textMuted,
                marginRight: 2,
              }}
            >
              Sort
            </span>
            {sortKeys.map((k) => (
              <button
                key={k}
                onClick={() => onSort(k)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 7,
                  border: `1px solid ${sortKey === k ? accentColor : inputBorder}`,
                  background:
                    sortKey === k
                      ? `${accentColor}18`
                      : dark
                        ? "#1a1a1f"
                        : "#ffffff",
                  color: sortKey === k ? accentColor : textSecondary,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  textTransform: "capitalize",
                  transition: "all 0.15s ease",
                }}
              >
                {k.replace("_", " ")}{" "}
                {sortKey === k ? (sortAsc ? "↑" : "↓") : ""}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div
        ref={tableScrollRef}
        style={{
          overflowX: "auto",
          width: "100%",
          maxHeight: usePagination ? "none" : "70vh",
          overflowY: usePagination ? "visible" : "auto",
        }}
      >
        {loading ? (
          <table
            style={{
              width: "100%",
              minWidth: isMobile ? "auto" : 600,
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr style={{ background: dark ? "#0f0f12" : "#f5f5f2" }}>
                {!isMobile && <th style={thStyle}>#</th>}
                <th style={thStyle}>Song</th>
                {!isMobile && <th style={thStyle}>Artist</th>}
                {!isMobile && <th style={thStyle}>Genre</th>}
                <th style={thStyle}>{signalColumnLabel}</th>
                {!isMobile && <th style={thStyle} />}
              </tr>
            </thead>
            <tbody>
              <SkeletonRows count={8} dark={dark} isMobile={isMobile} />
            </tbody>
          </table>
        ) : songs.length === 0 ? (
          <div
            style={{
              padding: "48px 20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke={textMuted}
              strokeWidth="1.5"
            >
              <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <p style={{ fontSize: 13, color: textMuted, margin: 0 }}>
              No songs found. Generate a playlist first.
            </p>
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              minWidth: isMobile ? "auto" : 600,
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr style={{ background: dark ? "#0f0f12" : "#f5f5f2" }}>
                {!isMobile && <th style={thStyle}>#</th>}
                <th style={thStyle}>Song</th>
                {!isMobile && <th style={thStyle}>Artist</th>}
                {!isMobile && <th style={thStyle}>Genre</th>}
                <th style={thStyle}>{signalColumnLabel}</th>
                {!isMobile && <th style={thStyle} />}
              </tr>
            </thead>
            <tbody>{renderRows()}</tbody>
          </table>
        )}
        {!loading && !usePagination && hasMoreInfinite && (
          <InfiniteScrollSentinel
            onVisible={onLoadMore}
            dark={dark}
            rootRef={tableScrollRef}
          />
        )}
      </div>

      {/* Pagination footer */}
      {!loading && usePagination && songs.length > pageSize && (
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          onPage={onPage}
          dark={dark}
          accentColor={accentColor}
        />
      )}

      {/* End-of-list indicator for infinite mode */}
      {!loading && !usePagination && !hasMoreInfinite && songs.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "14px 0",
            gap: 8,
          }}
        >
          <div
            style={{
              flex: 1,
              height: 1,
              background: cardBorder,
              maxWidth: 60,
            }}
          />
          <span style={{ fontSize: 11, color: textMuted }}>
            All {songs.length} songs loaded
          </span>
          <div
            style={{
              flex: 1,
              height: 1,
              background: cardBorder,
              maxWidth: 60,
            }}
          />
        </div>
      )}
    </div>
  );
}

import Switch from "../../../components/form/switch/Switch";
import { ExplicitFilter } from "../shared/PlaylistTypes";

export interface SharedSettingsProps {
  dark: boolean;
  isMobile: boolean;
  explicitFilter: ExplicitFilter;
  setExplicitFilter: (v: ExplicitFilter) => void;
  showExplicit: boolean;
  setShowExplicit: (v: boolean) => void;
  showCleaned: boolean;
  setShowCleaned: (v: boolean) => void;
  showClean: boolean;
  setShowClean: (v: boolean) => void;
  accentColor: string;
  children?: React.ReactNode;
}

export function SharedSettingsPanel({
  dark,
  isMobile,
  explicitFilter,
  setExplicitFilter,
  showExplicit,
  setShowExplicit,
  showCleaned,
  setShowCleaned,
  showClean,
  setShowClean,
  accentColor,
  children,
}: SharedSettingsProps) {
  const {
    card,
    cardBorder,
    textPrimary,
    textMuted,
    // textSecondary,
    inputBg,
    inputBorder,
    cardPadding,
    sectionLabel,
  } = useThemeTokens(dark, isMobile);

  return (
    <div
      style={{
        background: card,
        border: `1px solid ${cardBorder}`,
        borderRadius: 14,
        padding: cardPadding,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* Extra settings slot (e.g. Backtrack for Discovery, Genre Injection for Blend) */}
      {children}

      {/* Explicit Filter */}
      <div>
        <label style={{ ...sectionLabel, marginBottom: 10 }}>
          Explicit Filter
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(
            [
              { value: "strict", label: "Strict", desc: "Clean only" },
              {
                value: "allow_cleaned",
                label: "Allow Cleaned",
                desc: "Clean + censored + unknown",
              },
              { value: "all", label: "All", desc: "Include everything" },
            ] as { value: ExplicitFilter; label: string; desc: string }[]
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setExplicitFilter(opt.value)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${explicitFilter === opt.value ? accentColor : inputBorder}`,
                background:
                  explicitFilter === opt.value ? `${accentColor}1A` : inputBg,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: `2px solid ${explicitFilter === opt.value ? accentColor : inputBorder}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {explicitFilter === opt.value && (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: accentColor,
                    }}
                  />
                )}
              </span>
              <div>
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color:
                      explicitFilter === opt.value ? accentColor : textPrimary,
                    margin: 0,
                  }}
                >
                  {opt.label}
                </p>
                <p style={{ fontSize: 11, color: textMuted, margin: 0 }}>
                  {opt.desc}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: 1, background: cardBorder }} />

      {/* Show in table */}
      <div>
        <label style={{ ...sectionLabel, marginBottom: 10 }}>
          Show in Table
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            {
              label: "Explicit",
              badge: "E",
              color: "#E24B4A",
              value: showExplicit,
              setter: setShowExplicit,
            },
            {
              label: "Cleaned",
              badge: "C",
              color: "#EF9F27",
              value: showCleaned,
              setter: setShowCleaned,
            },
            {
              label: "Clean / Unknown",
              badge: "✓",
              color: "#639922",
              value: showClean,
              setter: setShowClean,
            },
          ].map((row) => (
            <div
              key={row.label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: textPrimary }}>
                  {row.label}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: 4,
                    background: row.color + "22",
                    color: row.color,
                  }}
                >
                  {row.badge}
                </span>
              </div>
              <Switch
                label=""
                defaultChecked={row.value}
                onChange={row.setter}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
