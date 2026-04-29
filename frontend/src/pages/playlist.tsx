import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Switch from "../components/form/switch/Switch";
import {
  fetchPlaylistSongs,
  fetchPlaylistGenerate,
  fetchGetUsers,
  PlaylistSong,
  PlaylistStats,
  fetchLogin,
  appendPlaylist,
  fetchGetConfig,
  getSong,
  getCoverArtUrl,
  generateDiscoveryQueue,
  fetchDiscoveryPlaylistId,
} from "../API/API";
import { useNavigate } from "react-router";

type ExplicitFilter = "strict" | "allow_cleaned" | "all";
type SortKey = "title" | "artist" | "genre" | "signal" | "date_added";
type SyncMode = "regenerate" | "append";
type PlaylistType = "tunelog_blend" | "discovery_queue";
type DiscoveryDateMode = "slider" | "calendar";

interface SlotValues {
  positive: number;
  repeat: number;
  partial: number;
  skip: number;
  [key: string]: number;
}
interface WeightValues {
  repeat: number;
  positive: number;
  partial: number;
  skip: number;
  [key: string]: number;
}
interface Preset {
  id: string;
  label: string;
  desc: string;
  slots: SlotValues;
  weights: WeightValues;
}

const SIGNAL_ORDER: (keyof SlotValues)[] = [
  "positive",
  "repeat",
  "partial",
  "skip",
];

// Per-type page sizes
const BLEND_PAGE_SIZE = 10;
const DISCOVERY_PAGE_SIZE = 15;

const INITIAL_PRESETS: Preset[] = [
  {
    id: "default",
    label: "Default",
    desc: "Your saved global backend settings",
    slots: { positive: 0.35, repeat: 0.35, partial: 0.25, skip: 0.05 },
    weights: { repeat: 3, positive: 2, partial: 0, skip: -2 },
  },
  {
    id: "discovery",
    label: "Discovery",
    desc: "More unheard songs, fewer repeats",
    slots: { positive: 0.2, repeat: 0.15, partial: 0.6, skip: 0.05 },
    weights: { repeat: 2, positive: 2, partial: 2, skip: -1 },
  },
  {
    id: "favorites",
    label: "Favourites",
    desc: "Heavy on repeats and positives",
    slots: { positive: 0.45, repeat: 0.45, partial: 0.1, skip: 0 },
    weights: { repeat: 5, positive: 3, partial: 1, skip: 0 },
  },
  {
    id: "custom",
    label: "Custom",
    desc: "Set your own ratios and weights",
    slots: { positive: 0.35, repeat: 0.35, partial: 0.25, skip: 0.05 },
    weights: { repeat: 3, positive: 2, partial: 0, skip: -2 },
  },
];

const SIGNAL_CONFIG: Record<
  string,
  {
    label: string;
    color: string;
    lightBg: string;
    darkBg: string;
    lightText: string;
    darkText: string;
    dot: string;
  }
> = {
  skip: {
    label: "Skip",
    color: "#E24B4A",
    lightBg: "#FCEBEB",
    darkBg: "rgba(226,75,74,0.12)",
    lightText: "#A32D2D",
    darkText: "#F09595",
    dot: "#E24B4A",
  },
  partial: {
    label: "Partial",
    color: "#EF9F27",
    lightBg: "#FAEEDA",
    darkBg: "rgba(239,159,39,0.12)",
    lightText: "#854F0B",
    darkText: "#FAC775",
    dot: "#EF9F27",
  },
  positive: {
    label: "Complete",
    color: "#639922",
    lightBg: "#EAF3DE",
    darkBg: "rgba(99,153,34,0.12)",
    lightText: "#3B6D11",
    darkText: "#97C459",
    dot: "#639922",
  },
  repeat: {
    label: "Repeat",
    color: "#7F77DD",
    lightBg: "#EEEDFE",
    darkBg: "rgba(127,119,221,0.12)",
    lightText: "#534AB7",
    darkText: "#AFA9EC",
    dot: "#7F77DD",
  },
  unheard: {
    label: "Unheard",
    color: "#378ADD",
    lightBg: "#E6F1FB",
    darkBg: "rgba(55,138,221,0.12)",
    lightText: "#185FA5",
    darkText: "#85B7EB",
    dot: "#378ADD",
  },
  wildcard: {
    label: "Wildcard",
    color: "#D4537E",
    lightBg: "#FBEAF0",
    darkBg: "rgba(212,83,126,0.12)",
    lightText: "#993556",
    darkText: "#ED93B1",
    dot: "#D4537E",
  },
};

const SLOT_COLORS: Record<string, string> = {
  positive: "#639922",
  repeat: "#7F77DD",
  partial: "#EF9F27",
  skip: "#E24B4A",
  unheard: "#378ADD",
  wildcard: "#D4537E",
};

const EXPLICIT_CONFIG: Record<string, { label: string; color: string }> = {
  explicit: { label: "E", color: "#E24B4A" },
  cleaned: { label: "C", color: "#EF9F27" },
  notExplicit: { label: "✓", color: "#639922" },
  notInItunes: { label: "?", color: "#888780" },
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

const toISODate = (d: Date | null) => {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

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

// ─── Inline Date Range Picker ────────────────────────────────────────────────
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
              inRange = isInRange(d),
              future = isFuture(d),
              isToday = isSameDay(d, today);
            let bg = "transparent",
              color = future ? textMuted : textPrimary,
              borderRadius = 8;
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

// ─── Lazy Album Art ───────────────────────────────────────────────────────────
function LazyAlbumArt({
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
          className="object-cover rounded-md"
          style={{
            width: size,
            height: size,
            borderRadius: 6,
            display: "block",
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

// ─── Skeleton Rows ────────────────────────────────────────────────────────────
function SkeletonRows({
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
              style={{ width: 55, height: 20, borderRadius: 6, background: bg }}
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

// ─── Signal Pill ──────────────────────────────────────────────────────────────
function SignalPill({ signal, dark }: { signal: string; dark: boolean }) {
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

// ─── Slot Bar ─────────────────────────────────────────────────────────────────
function SlotBar({ slots }: { slots: SlotValues }) {
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

// ─── Slider Row ───────────────────────────────────────────────────────────────
function SliderRow({
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

const normaliseSlots = (updated: SlotValues): SlotValues => {
  const total = Object.values(updated).reduce((a, b) => a + b, 0);
  if (total === 0) return updated;
  return {
    positive: updated.positive / total,
    repeat: updated.repeat / total,
    partial: updated.partial / total,
    skip: updated.skip / total,
  };
};

async function fetchPlaylistFromNavidrome(playlistId: string): Promise<any[]> {
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

// ─── Pagination Component ─────────────────────────────────────────────────────
function Pagination({
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

// ─── Infinite Scroll Sentinel ─────────────────────────────────────────────────
function InfiniteScrollSentinel({
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
      {
        root: rootRef?.current ?? null,
        rootMargin: "80px",
      },
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

// ─── Hooks ────────────────────────────────────────────────────────────────────
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

function useMediaQuery(query: string) {
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Playlist() {
  const dark = useDarkMode();
  const navigate = useNavigate();
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  const isMobile = useMediaQuery("(max-width: 640px)");

  const [users, setUsers] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [playlistSize, setPlaylistSize] = useState(40);
  const [explicitFilter, setExplicitFilter] = useState<ExplicitFilter>("all");
  const [activeTab, setActiveTab] = useState<"generate" | "settings">(
    "generate",
  );
  const [playlistType, setPlaylistType] =
    useState<PlaylistType>("tunelog_blend");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState("");
  const [coverArtMap, setCoverArtMap] = useState<Record<string, string>>({});
  const [loadingSongs, setLoadingSongs] = useState(false);

  // Pagination state
  const [usePagination, setUsePagination] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [infiniteCount, setInfiniteCount] = useState(20); // how many rows shown in infinite mode

  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortAsc, setSortAsc] = useState(true);
  const [showExplicit, setShowExplicit] = useState(true);
  const [showCleaned, setShowCleaned] = useState(true);
  const [showClean, setShowClean] = useState(true);

  const [genreInjection, setGenreInjection] = useState(true);
  const [syncMode, setSyncMode] = useState<SyncMode>("regenerate");
  const [songs, setSongs] = useState<PlaylistSong[]>([]);
  const [stats, setStats] = useState<PlaylistStats | null>(null);
  const [presets, setPresets] = useState<Preset[]>(INITIAL_PRESETS);
  const [selectedPreset, setSelectedPreset] = useState<string>("default");
  const [customSlots, setCustomSlots] = useState<SlotValues>(
    INITIAL_PRESETS[3].slots,
  );
  const [customWeights, setCustomWeights] = useState<WeightValues>(
    INITIAL_PRESETS[3].weights,
  );

  const [dateMode, setDateMode] = useState<DiscoveryDateMode>("slider");
  const [dayRange, setDayRange] = useState(10);
  const [calFrom, setCalFrom] = useState<Date | null>(
    new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  );
  const [calTo, setCalTo] = useState<Date | null>(new Date());
  const [backtrack, setBacktrack] = useState(true);
  const [dqNavidromeSongs, setDqNavidromeSongs] = useState<any[]>([]);
  const [dqDynamicStats, setDqDynamicStats] = useState({
    total: 0,
    dateFrom: "—",
    dateTo: "—",
  });

  const tableRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Dynamic page size based on type
  const PAGE_SIZE =
    playlistType === "tunelog_blend" ? BLEND_PAGE_SIZE : DISCOVERY_PAGE_SIZE;
  // Initial infinite scroll batch size mirrors page size
  const INFINITE_BATCH = PAGE_SIZE;

  const activeSlots =
    selectedPreset === "custom"
      ? customSlots
      : presets.find((p) => p.id === selectedPreset)!.slots;
  const activeWeights =
    selectedPreset === "custom"
      ? customWeights
      : presets.find((p) => p.id === selectedPreset)!.weights;

  // Theme tokens
  const card = dark ? "#131316" : "#ffffff";
  const cardBorder = dark ? "#222228" : "#e8e8e4";
  const textPrimary = dark ? "#f0f0ee" : "#18181a";
  const textSecondary = dark ? "#888884" : "#6b6b67";
  const textMuted = dark ? "#555552" : "#a0a09c";
  const inputBg = dark ? "#1a1a1f" : "#f3f3f0";
  const inputBorder = dark ? "#2a2a30" : "#ddddd8";
  const cardPadding = isMobile ? 14 : 20;

  const generateColor =
    playlistType === "tunelog_blend" ? "#7F77DD" : "#378ADD";
  const generateGradient =
    playlistType === "tunelog_blend"
      ? "linear-gradient(135deg, #7F77DD 0%, #534AB7 100%)"
      : "linear-gradient(135deg, #378ADD 0%, #185FA5 100%)";

  const sectionLabel: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: textMuted,
    display: "block",
    marginBottom: 8,
  };
  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    textAlign: "left",
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: textMuted,
    whiteSpace: "nowrap",
    borderBottom: `1px solid ${cardBorder}`,
  };

  useEffect(() => {
    fetchGetConfig()
      .then((cfg) => {
        setPlaylistSize(cfg.playlist_generation.playlist_size);
        const fetchedSlots = {
          positive: cfg.playlist_generation.slot_ratios.positive,
          repeat: cfg.playlist_generation.slot_ratios.repeat,
          partial: cfg.playlist_generation.slot_ratios.partial,
          skip: cfg.playlist_generation.slot_ratios.skip,
        };
        const fetchedWeights = {
          positive: cfg.playlist_generation.signal_weights.positive,
          repeat: cfg.playlist_generation.signal_weights.repeat,
          partial: cfg.playlist_generation.signal_weights.partial,
          skip: cfg.playlist_generation.signal_weights.skip,
        };
        setPresets((prev) =>
          prev.map((p) =>
            p.id === "default"
              ? { ...p, slots: fetchedSlots, weights: fetchedWeights }
              : p,
          ),
        );
        setCustomSlots(fetchedSlots);
        setCustomWeights(fetchedWeights);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const token =
      localStorage.getItem("tunelog_token") ||
      sessionStorage.getItem("tunelog_token");
    if (!token) {
      navigate("/signin");
      return;
    }
    const admin =
      localStorage.getItem("tunelog_user") ??
      sessionStorage.getItem("tunelog_user") ??
      "";
    const adminPD =
      localStorage.getItem("tunelog_password") ??
      sessionStorage.getItem("tunelog_password") ??
      "";
    fetchLogin({ username: admin, password: adminPD })
      .catch(() => {})
      .finally(() => {
        fetchGetUsers({ admin, adminPD }).then((res) => {
          if (res.status === "ok" && res.users) {
            const usernames = res.users.map((u: any) => u.username);
            setUsers(usernames);
            if (usernames.length > 0) setSelectedUser(usernames[0]);
          }
        });
      });
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    setLoadingSongs(true);
    setCurrentPage(1);
    setInfiniteCount(INFINITE_BATCH);

    const loadBlend = fetchPlaylistSongs(selectedUser).then((res) => {
      if (res.status === "ok") {
        setSongs(res.songs);
        setStats(res.stats);
      }
    });
    const loadDiscovery = async () => {
      try {
        const idRes = await fetchDiscoveryPlaylistId(selectedUser);
        if (idRes.status === "success" && idRes.id) {
          setDqNavidromeSongs(await fetchPlaylistFromNavidrome(idRes.id));
        } else setDqNavidromeSongs([]);
      } catch {
        console.error("Failed fetching initial discovery queue");
      }
    };
    Promise.all([loadBlend, loadDiscovery()]).finally(() =>
      setLoadingSongs(false),
    );
  }, [selectedUser]);

  useEffect(() => {
    const activeSongs =
      playlistType === "tunelog_blend" ? songs : dqNavidromeSongs;
    const getSafeId = (s: any) => s.song_id || s.id;
    if (!activeSongs.length) return;
    const uniqueIds = [
      ...new Set(activeSongs.map((s) => getSafeId(s)).filter(Boolean)),
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
          if (r.created && playlistType === "discovery_queue")
            dates.push(new Date(r.created).getTime());
        }
      });
      setCoverArtMap(map);
      if (playlistType === "discovery_queue" && dates.length > 0) {
        setDqDynamicStats({
          total: activeSongs.length,
          dateFrom: new Date(Math.min(...dates)).toISOString().slice(0, 10),
          dateTo: new Date(Math.max(...dates)).toISOString().slice(0, 10),
        });
      }
    });
  }, [songs, dqNavidromeSongs, playlistType]);

  // Reset pagination/infinite scroll when filters/sort/type changes
  useEffect(() => {
    setCurrentPage(1);
    setInfiniteCount(INFINITE_BATCH);
  }, [
    playlistType,
    sortKey,
    sortAsc,
    showExplicit,
    showCleaned,
    showClean,
    usePagination,
  ]);

  const handleGenerateBlend = async () => {
    if (!selectedUser) return;
    setIsGenerating(true);
    setGenerateMsg("");
    try {
      const res =
        syncMode === "regenerate"
          ? await fetchPlaylistGenerate(
              selectedUser,
              explicitFilter,
              playlistSize,
              activeSlots,
              activeWeights,
              genreInjection,
            )
          : await appendPlaylist(
              selectedUser,
              explicitFilter,
              playlistSize,
              activeSlots,
              activeWeights,
              genreInjection,
            );
      if (res.status === "ok") {
        setGenerateMsg(`✓ ${res.songs_added ?? res.size_requested} songs`);
        const updated = await fetchPlaylistSongs(selectedUser);
        if (updated.status === "ok") {
          setSongs(updated.songs);
          setStats(updated.stats);
        }
        setCurrentPage(1);
        setInfiniteCount(INFINITE_BATCH);
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

  const handleGenerateDiscovery = async () => {
    if (!selectedUser) return;
    setIsGenerating(true);
    setGenerateMsg("");
    setDqNavidromeSongs([]);
    setDqDynamicStats({ total: 0, dateFrom: "—", dateTo: "—" });
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
          const naviSongs = await fetchPlaylistFromNavidrome(idRes.id);
          setDqNavidromeSongs(naviSongs);
          setGenerateMsg(`✓ Synced ${naviSongs.length} songs from Navidrome`);
          setCurrentPage(1);
          setInfiniteCount(INFINITE_BATCH);
        } else {
          setGenerateMsg(`Error: Could not retrieve Discovery Playlist ID`);
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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key);
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

  // Derived song list
  const rawSongs =
    playlistType === "tunelog_blend"
      ? songs
      : dqNavidromeSongs.map((s) => ({
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
        if (sortKey === "signal" && playlistType === "tunelog_blend")
          cmp = (a.signal ?? "").localeCompare(b.signal ?? "");
        if (sortKey === "date_added" && playlistType === "discovery_queue")
          cmp = (a.date_added ?? "").localeCompare(b.date_added ?? "");
        return sortAsc ? cmp : -cmp;
      }),
    [visibleSongs, sortKey, sortAsc, playlistType],
  );

  const totalPages = Math.max(1, Math.ceil(sortedSongs.length / PAGE_SIZE));

  // Which songs to actually render
  const displayedSongs = useMemo(() => {
    if (usePagination)
      return sortedSongs.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
      );
    return sortedSongs.slice(0, infiniteCount);
  }, [sortedSongs, usePagination, currentPage, PAGE_SIZE, infiniteCount]);

  const hasMoreInfinite = !usePagination && infiniteCount < sortedSongs.length;

  const signalCounts =
    playlistType === "tunelog_blend"
      ? sortedSongs.reduce<Record<string, number>>((acc, s: any) => {
          const sig = s.signal ?? "unheard";
          acc[sig] = (acc[sig] ?? 0) + 1;
          return acc;
        }, {})
      : {};

  const blendStatItems = [
    { label: "Total", value: stats?.total_songs?.toString() ?? "—" },
    { label: "Showing", value: sortedSongs.length.toString() },
    { label: "Top Genre", value: stats?.top_genre ?? "—" },
    {
      label: "Generated",
      value: formatLastGenerated(stats?.last_generated ?? null),
    },
  ];
  const dqStatItems = [
    { label: "Total Songs", value: dqDynamicStats.total.toString() },
    { label: "Target Size", value: playlistSize.toString() },
    {
      label: "Date Range",
      value:
        dqDynamicStats.dateFrom !== "—"
          ? `${dqDynamicStats.dateFrom.slice(5)} → ${dqDynamicStats.dateTo.slice(5)}`
          : "—",
    },
    { label: "Backtrack", value: backtrack ? "On" : "Off" },
  ];
  const currentStats =
    playlistType === "tunelog_blend" ? blendStatItems : dqStatItems;

  // ── Table rows renderer (shared between both modes) ──────────────────────────
  const renderRows = () =>
    displayedSongs.map((song: any, idx) => {
      const globalIdx = usePagination
        ? (currentPage - 1) * PAGE_SIZE + idx + 1
        : idx + 1;
      return (
        <tr
          key={song.song_id}
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
                coverArtId={coverArtMap[song.song_id] ?? null}
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
            {playlistType === "tunelog_blend" ? (
              song.signal ? (
                <SignalPill signal={song.signal} dark={dark} />
              ) : (
                <span style={{ color: textMuted, fontSize: 12 }}>—</span>
              )
            ) : (
              <span
                style={{ fontSize: 11, color: textMuted, whiteSpace: "nowrap" }}
              >
                {song.date_added?.slice(0, 10) ?? "—"}
              </span>
            )}
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
    <div style={{ minHeight: "100vh" }}>
      <PageMeta
        title="Playlist | TuneLog"
        description="Generate and manage TuneLog playlists"
      />
      <PageBreadcrumb pageTitle="Playlist" />

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* ── Playlist Type Switcher ── */}
        <div
          style={{
            background: card,
            border: `1px solid ${cardBorder}`,
            borderRadius: 14,
            padding: isMobile ? "10px 12px" : "12px 16px",
            display: "flex",
            alignItems: isMobile ? "flex-start" : "center",
            justifyContent: "space-between",
            flexDirection: isMobile ? "column" : "row",
            gap: 12,
          }}
        >
          <div>
            <p
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: textPrimary,
                margin: 0,
              }}
            >
              Playlist Type
            </p>
            <p style={{ fontSize: 11, color: textMuted, margin: "2px 0 0" }}>
              Choose how this playlist is built
            </p>
          </div>
          <div
            style={{
              display: "flex",
              background: dark ? "#1a1a1f" : "#f0f0ec",
              borderRadius: 10,
              padding: 3,
              gap: 3,
              alignSelf: isMobile ? "stretch" : "auto",
            }}
          >
            {[
              {
                value: "tunelog_blend" as PlaylistType,
                label: "TuneLog Blend",
                accent: "#7F77DD",
                icon: (
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                ),
              },
              {
                value: "discovery_queue" as PlaylistType,
                label: "Discovery Queue",
                accent: "#378ADD",
                icon: (
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                ),
              },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setPlaylistType(opt.value);
                  setActiveTab("generate");
                  setCurrentPage(1);
                  setInfiniteCount(INFINITE_BATCH);
                }}
                style={{
                  flex: 1,
                  padding: isMobile ? "8px 10px" : "7px 16px",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  background:
                    playlistType === opt.value
                      ? dark
                        ? "#252530"
                        : "#ffffff"
                      : "transparent",
                  color: playlistType === opt.value ? opt.accent : textMuted,
                  transition: "all 0.15s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  boxShadow:
                    playlistType === opt.value
                      ? "0 1px 4px rgba(0,0,0,0.12)"
                      : "none",
                  whiteSpace: "nowrap",
                }}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Stats Row ── */}
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
          {currentStats.map((item) => (
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

        {/* ── Signal Distribution Bar (blend only) ── */}
        {playlistType === "tunelog_blend" && sortedSongs.length > 0 && (
          <div
            style={{
              background: card,
              border: `1px solid ${cardBorder}`,
              borderRadius: 14,
              padding: `${cardPadding}px`,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                alignItems: isMobile ? "flex-start" : "center",
                justifyContent: "space-between",
                marginBottom: 10,
                gap: 10,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: textSecondary,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Signal Distribution
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {Object.entries(signalCounts).map(([sig, count]) => {
                  const cfg = SIGNAL_CONFIG[sig];
                  if (!cfg) return null;
                  return (
                    <span
                      key={sig}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 11,
                        color: textSecondary,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          backgroundColor: cfg.dot,
                        }}
                      />
                      {cfg.label} {count}
                    </span>
                  );
                })}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                height: 6,
                borderRadius: 3,
                overflow: "hidden",
                gap: 1,
              }}
            >
              {Object.entries(signalCounts).map(([sig, count]) => (
                <div
                  key={sig}
                  style={{
                    flex: count,
                    backgroundColor: SLOT_COLORS[sig] ?? "#888",
                    transition: "flex 0.4s ease",
                  }}
                  title={`${sig}: ${count}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Main Grid ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isLargeScreen ? "340px 1fr" : "1fr",
            gap: 20,
            alignItems: "start",
          }}
        >
          {/* Left Panel */}
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

            {/* Generate Card */}
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
                    style={{ width: "100%", accentColor: generateColor }}
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
                {playlistType === "tunelog_blend" ? (
                  <div>
                    <label style={sectionLabel}>Mode</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      {(["regenerate", "append"] as SyncMode[]).map((m) => (
                        <button
                          key={m}
                          onClick={() => setSyncMode(m)}
                          style={{
                            flex: 1,
                            padding: "8px 0",
                            borderRadius: 8,
                            border: `1px solid ${syncMode === m ? generateColor : inputBorder}`,
                            background:
                              syncMode === m
                                ? "rgba(127,119,221,0.12)"
                                : inputBg,
                            color:
                              syncMode === m ? generateColor : textSecondary,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                        >
                          {m === "regenerate" ? "↺ Regenerate" : "+ Append"}
                        </button>
                      ))}
                    </div>
                    <p style={{ fontSize: 11, color: textMuted, marginTop: 6 }}>
                      {syncMode === "regenerate"
                        ? "Clears and rebuilds from scratch."
                        : "Adds songs without removing existing ones."}
                    </p>
                  </div>
                ) : (
                  <>
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
                        {(["slider", "calendar"] as DiscoveryDateMode[]).map(
                          (m) => (
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
                                color:
                                  dateMode === m ? generateColor : textMuted,
                                transition: "all 0.15s",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 5,
                              }}
                            >
                              {m === "slider" ? "Slider" : "Calendar"}
                            </button>
                          ),
                        )}
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
                              color: generateColor,
                            }}
                          >
                            {dayRange === 0
                              ? "Today only"
                              : `Last ${dayRange} days`}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={90}
                          step={1}
                          value={dayRange}
                          onChange={(e) => setDayRange(Number(e.target.value))}
                          style={{ width: "100%", accentColor: generateColor }}
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
                        accentColor={generateColor}
                      />
                    )}
                  </>
                )}
                <button
                  onClick={
                    playlistType === "tunelog_blend"
                      ? handleGenerateBlend
                      : handleGenerateDiscovery
                  }
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
                      : generateGradient,
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
                  ) : playlistType === "tunelog_blend" ? (
                    "Generate Playlist"
                  ) : (
                    "Generate Discovery Queue"
                  )}
                </button>
                {generateMsg && (
                  <p
                    style={{
                      fontSize: 12,
                      color: generateMsg.startsWith("✓")
                        ? "#639922"
                        : "#E24B4A",
                      textAlign: "center",
                      margin: 0,
                    }}
                  >
                    {generateMsg}
                  </p>
                )}
              </div>
            )}

            {/* Settings Card */}
            {(isLargeScreen || activeTab === "settings") && (
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
                {playlistType === "discovery_queue" && (
                  <>
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
                  </>
                )}

                {/* ── Pagination Toggle ── */}
                {/* <div
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
                      Pagination
                    </p>
                    <p
                      style={{
                        fontSize: 11,
                        color: textMuted,
                        margin: "4px 0 0",
                      }}
                    >
                      {usePagination
                        ? `Pages of ${PAGE_SIZE} songs`
                        : "Continuous scroll"}
                    </p>
                  </div>
                  <Switch
                    label=""
                    defaultChecked={usePagination}
                    onChange={setUsePagination}
                  />
                </div> */}

                {/* <div style={{ height: 1, background: cardBorder }} /> */}

                <div>
                  <label style={{ ...sectionLabel, marginBottom: 10 }}>
                    Explicit Filter
                  </label>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    {(
                      [
                        {
                          value: "strict",
                          label: "Strict",
                          desc: "Clean only",
                        },
                        {
                          value: "allow_cleaned",
                          label: "Allow Cleaned",
                          desc: "Clean + censored + unknown",
                        },
                        {
                          value: "all",
                          label: "All",
                          desc: "Include everything",
                        },
                      ] as {
                        value: ExplicitFilter;
                        label: string;
                        desc: string;
                      }[]
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
                          border: `1px solid ${explicitFilter === opt.value ? generateColor : inputBorder}`,
                          background:
                            explicitFilter === opt.value
                              ? `${generateColor}1A`
                              : inputBg,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            border: `2px solid ${explicitFilter === opt.value ? generateColor : inputBorder}`,
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
                                background: generateColor,
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
                                explicitFilter === opt.value
                                  ? generateColor
                                  : textPrimary,
                              margin: 0,
                            }}
                          >
                            {opt.label}
                          </p>
                          <p
                            style={{
                              fontSize: 11,
                              color: textMuted,
                              margin: 0,
                            }}
                          >
                            {opt.desc}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ height: 1, background: cardBorder }} />

                <div>
                  <label style={{ ...sectionLabel, marginBottom: 10 }}>
                    Show in Table
                  </label>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
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
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
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

                {playlistType === "tunelog_blend" && (
                  <>
                    <div style={{ height: 1, background: cardBorder }} />
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <p
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: textPrimary,
                            margin: 0,
                          }}
                        >
                          Genre Injection
                        </p>
                        <p
                          style={{
                            fontSize: 11,
                            color: textMuted,
                            margin: "3px 0 0",
                          }}
                        >
                          Forces genre diversity in the playlist.
                        </p>
                      </div>
                      <Switch
                        label=""
                        defaultChecked={genreInjection}
                        onChange={setGenreInjection}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right Panel */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              overflow: "hidden",
            }}
          >
            {playlistType === "tunelog_blend" && (
              <div
                style={{
                  background: card,
                  border: `1px solid ${cardBorder}`,
                  borderRadius: 14,
                  padding: cardPadding,
                }}
              >
                <div style={{ marginBottom: 16 }}>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: textPrimary,
                      margin: 0,
                    }}
                  >
                    Playlist Profile
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: textMuted,
                      margin: "3px 0 0",
                    }}
                  >
                    Controls slot distribution and signal scoring.
                  </p>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    marginBottom: 16,
                    flexWrap: "wrap",
                  }}
                >
                  {INITIAL_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPreset(p.id)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 20,
                        border: `1px solid ${selectedPreset === p.id ? generateColor : inputBorder}`,
                        background:
                          selectedPreset === p.id
                            ? `${generateColor}24`
                            : inputBg,
                        color:
                          selectedPreset === p.id
                            ? generateColor
                            : textSecondary,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      background: dark ? "#0f0f12" : "#f9f9f6",
                      borderRadius: 10,
                      padding: 14,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: textMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        margin: "0 0 12px",
                      }}
                    >
                      Slot Ratios
                    </p>
                    {selectedPreset === "custom" ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        {(Object.keys(customSlots) as (keyof SlotValues)[]).map(
                          (key) => (
                            <SliderRow
                              key={key}
                              label={key as string}
                              value={customSlots[key]}
                              min={0}
                              max={1}
                              step={0.05}
                              color={SLOT_COLORS[key] ?? "#888"}
                              onChange={(v) =>
                                setCustomSlots((prev) =>
                                  normaliseSlots({ ...prev, [key]: v }),
                                )
                              }
                            />
                          ),
                        )}
                        <SlotBar slots={customSlots} />
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        {(
                          Object.entries(activeSlots) as [string, number][]
                        ).map(([key, val]) => (
                          <div
                            key={key}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                color: textSecondary,
                                width: 52,
                                textTransform: "capitalize",
                              }}
                            >
                              {key}
                            </span>
                            <div
                              style={{
                                flex: 1,
                                height: 4,
                                borderRadius: 2,
                                background: dark ? "#1e1e24" : "#e8e8e4",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${val * 100}%`,
                                  height: "100%",
                                  backgroundColor: SLOT_COLORS[key] ?? "#888",
                                  borderRadius: 2,
                                  transition: "width 0.3s",
                                }}
                              />
                            </div>
                            <span
                              style={{
                                fontSize: 11,
                                color: textMuted,
                                width: 28,
                                textAlign: "right",
                              }}
                            >
                              {Math.round(val * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      background: dark ? "#0f0f12" : "#f9f9f6",
                      borderRadius: 10,
                      padding: 14,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: textMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        margin: "0 0 12px",
                      }}
                    >
                      Signal Weights
                    </p>
                    {selectedPreset === "custom" ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        {SIGNAL_ORDER.map((key) => (
                          <SliderRow
                            key={key}
                            label={key as string}
                            value={customWeights[key]}
                            min={-5}
                            max={5}
                            step={1}
                            color={SLOT_COLORS[key] ?? "#888"}
                            onChange={(v) =>
                              setCustomWeights((prev) => ({
                                ...prev,
                                [key]: v,
                              }))
                            }
                          />
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        {SIGNAL_ORDER.map((key) => {
                          const val = activeWeights[key];
                          return (
                            <div
                              key={key}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 11,
                                  color: textSecondary,
                                  width: 52,
                                  textTransform: "capitalize",
                                }}
                              >
                                {key}
                              </span>
                              <div
                                style={{
                                  flex: 1,
                                  display: "flex",
                                  alignItems: "center",
                                }}
                              >
                                <div
                                  style={{
                                    flex: 1,
                                    height: 4,
                                    borderRadius: "2px 0 0 2px",
                                    background: dark ? "#1e1e24" : "#e8e8e4",
                                    overflow: "hidden",
                                    display: "flex",
                                    justifyContent: "flex-end",
                                  }}
                                >
                                  {val < 0 && (
                                    <div
                                      style={{
                                        width: `${(Math.abs(val) / 5) * 100}%`,
                                        height: "100%",
                                        backgroundColor: "#E24B4A",
                                        borderRadius: 2,
                                      }}
                                    />
                                  )}
                                </div>
                                <div
                                  style={{
                                    width: 1,
                                    height: 10,
                                    background: dark ? "#333" : "#ccc",
                                    flexShrink: 0,
                                  }}
                                />
                                <div
                                  style={{
                                    flex: 1,
                                    height: 4,
                                    borderRadius: "0 2px 2px 0",
                                    background: dark ? "#1e1e24" : "#e8e8e4",
                                    overflow: "hidden",
                                  }}
                                >
                                  {val > 0 && (
                                    <div
                                      style={{
                                        width: `${(val / 5) * 100}%`,
                                        height: "100%",
                                        backgroundColor:
                                          SLOT_COLORS[key] ?? "#888",
                                        borderRadius: 2,
                                      }}
                                    />
                                  )}
                                </div>
                              </div>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: val < 0 ? "#E24B4A" : "#639922",
                                  width: 24,
                                  textAlign: "right",
                                }}
                              >
                                {val > 0 ? `+${val}` : val}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Song Table */}
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
              {/* Table header */}
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
                {/* LEFT: Title + meta */}
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: textPrimary,
                      margin: 0,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {playlistType === "tunelog_blend"
                      ? "Current Playlist"
                      : "Discovery Queue"}
                  </p>

                  <p
                    style={{
                      fontSize: 11,
                      color: textMuted,
                      margin: 0,
                    }}
                  >
                    {selectedUser} · {sortedSongs.length} songs
                    {usePagination &&
                      totalPages > 1 &&
                      ` · page ${currentPage}/${totalPages}`}
                    {!usePagination &&
                      sortedSongs.length > 0 &&
                      ` · showing ${Math.min(infiniteCount, sortedSongs.length)}`}
                  </p>
                </div>

                {/* RIGHT: Controls */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                    justifyContent: isMobile ? "flex-start" : "flex-end",
                  }}
                >
                  {/* Pagination toggle (compact pill) */}
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

                    <Switch
                      label=""
                      defaultChecked={usePagination}
                      onChange={setUsePagination}
                    />
                  </div>

                  {/* Sort group */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
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

                    {[
                      "title",
                      "artist",
                      "genre",
                      playlistType === "tunelog_blend"
                        ? "signal"
                        : "date_added",
                    ].map((k) => (
                      <button
                        key={k}
                        onClick={() => handleSort(k as SortKey)}
                        style={{
                          padding: "5px 10px",
                          borderRadius: 7,
                          border: `1px solid ${
                            sortKey === k ? generateColor : inputBorder
                          }`,
                          background:
                            sortKey === k
                              ? `${generateColor}18`
                              : dark
                                ? "#1a1a1f"
                                : "#ffffff",
                          color: sortKey === k ? generateColor : textSecondary,
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

              {/* Table body */}
              <div
                ref={tableScrollRef}
                style={{
                  overflowX: "auto",
                  width: "100%",
                  maxHeight: usePagination ? "none" : "70vh",
                  overflowY: usePagination ? "visible" : "auto",
                }}
              >
                {loadingSongs ? (
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
                        <th style={thStyle}>
                          {playlistType === "tunelog_blend"
                            ? "Signal"
                            : "Added"}
                        </th>
                        {!isMobile && <th style={thStyle}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      <SkeletonRows count={8} dark={dark} isMobile={isMobile} />
                    </tbody>
                  </table>
                ) : sortedSongs.length === 0 ? (
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
                        <th style={thStyle}>
                          {playlistType === "tunelog_blend"
                            ? "Signal"
                            : "Added"}
                        </th>
                        {!isMobile && <th style={thStyle}></th>}
                      </tr>
                    </thead>
                    <tbody>{renderRows()}</tbody>
                  </table>
                )}
                {!loadingSongs && !usePagination && hasMoreInfinite && (
                  <InfiniteScrollSentinel
                    onVisible={handleLoadMore}
                    dark={dark}
                    rootRef={tableScrollRef}
                  />
                )}
              </div>

              {/* Pagination (when enabled) */}
              {!loadingSongs &&
                usePagination &&
                sortedSongs.length > PAGE_SIZE && (
                  <Pagination
                    page={currentPage}
                    totalPages={totalPages}
                    onPage={handlePageChange}
                    dark={dark}
                    accentColor={generateColor}
                  />
                )}

              {/* End of list indicator for infinite mode */}
              {!loadingSongs &&
                !usePagination &&
                !hasMoreInfinite &&
                sortedSongs.length > 0 && (
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
                      All {sortedSongs.length} songs loaded
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
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
