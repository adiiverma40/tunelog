import { useState, useEffect } from "react";
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
} from "../API/API";
import { useNavigate } from "react-router";

type ExplicitFilter = "strict" | "allow_cleaned" | "all";
type SortKey = "title" | "artist" | "genre" | "signal";
type SyncMode = "regenerate" | "append";

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
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [matches, query]);
  return matches;
}

function AlbumArt({
  coverArtId,
  title,
  size = 40,
}: {
  coverArtId: string | null;
  title: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [coverArtId]);

  if (coverArtId && !failed) {
    return (
      <img
        src={getCoverArtUrl(coverArtId)}
        alt={title}
        onError={() => setFailed(true)}
        className="object-cover rounded-md flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-md flex items-center justify-center flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: "var(--fallback-art-bg, #1a1a2e)",
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: size * 0.45, height: size * 0.45, opacity: 0.4 }}
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
  );
}

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

export default function Playlist() {
  const dark = useDarkMode();
  const navigate = useNavigate();

  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  const isMobile = useMediaQuery("(max-width: 640px)");

  const [users, setUsers] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [playlistSize, setPlaylistSize] = useState(40);
  const [explicitFilter, setExplicitFilter] = useState<ExplicitFilter>("all");
  const [genreInjection, setGenreInjection] = useState(true);
  const [syncMode, setSyncMode] = useState<SyncMode>("regenerate");
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortAsc, setSortAsc] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState("");
  const [songs, setSongs] = useState<PlaylistSong[]>([]);
  const [stats, setStats] = useState<PlaylistStats | null>(null);
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [showExplicit, setShowExplicit] = useState(true);
  const [showCleaned, setShowCleaned] = useState(true);
  const [showClean, setShowClean] = useState(true);
  const [coverArtMap, setCoverArtMap] = useState<Record<string, string>>({});
  const [presets, setPresets] = useState<Preset[]>(INITIAL_PRESETS);
  const [selectedPreset, setSelectedPreset] = useState<string>("default");
  const [customSlots, setCustomSlots] = useState<SlotValues>(
    INITIAL_PRESETS[3].slots,
  );
  const [customWeights, setCustomWeights] = useState<WeightValues>(
    INITIAL_PRESETS[3].weights,
  );
  const [activeTab, setActiveTab] = useState<"generate" | "settings">(
    "generate",
  );

  const activeSlots =
    selectedPreset === "custom"
      ? customSlots
      : presets.find((p) => p.id === selectedPreset)!.slots;
  const activeWeights =
    selectedPreset === "custom"
      ? customWeights
      : presets.find((p) => p.id === selectedPreset)!.weights;

  // const bg = dark ? "#0d0d0f" : "#f7f7f5";
  const card = dark ? "#131316" : "#ffffff";
  const cardBorder = dark ? "#222228" : "#e8e8e4";
  const textPrimary = dark ? "#f0f0ee" : "#18181a";
  const textSecondary = dark ? "#888884" : "#6b6b67";
  const textMuted = dark ? "#555552" : "#a0a09c";
  const inputBg = dark ? "#1a1a1f" : "#f3f3f0";
  const inputBorder = dark ? "#2a2a30" : "#ddddd8";

  const cardPadding = isMobile ? 14 : 20;

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
    fetchPlaylistSongs(selectedUser)
      .then((res) => {
        if (res.status === "ok") {
          setSongs(res.songs);
          setStats(res.stats);
        }
      })
      .finally(() => setLoadingSongs(false));
  }, [selectedUser]);

  useEffect(() => {
    if (!songs.length) return;
    const uniqueIds = [...new Set(songs.map((s) => s.song_id).filter(Boolean))];
    Promise.all(
      uniqueIds.map(async (id) => {
        const song = await getSong(id);
        return song?.coverArt
          ? ([id, song.coverArt] as [string, string])
          : null;
      }),
    ).then((results) => {
      const map: Record<string, string> = {};
      results.forEach((r) => {
        if (r) map[r[0]] = r[1];
      });
      setCoverArtMap(map);
    });
  }, [songs]);

  const handleGenerate = async () => {
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
    if (sortKey === "title") cmp = (a.title ?? "").localeCompare(b.title ?? "");
    if (sortKey === "artist")
      cmp = (a.artist ?? "").localeCompare(b.artist ?? "");
    if (sortKey === "genre") cmp = (a.genre ?? "").localeCompare(b.genre ?? "");
    if (sortKey === "signal")
      cmp = (a.signal ?? "").localeCompare(b.signal ?? "");
    return sortAsc ? cmp : -cmp;
  });

  const signalCounts = sortedSongs.reduce<Record<string, number>>((acc, s) => {
    const sig = s.signal ?? "unheard";
    acc[sig] = (acc[sig] ?? 0) + 1;
    return acc;
  }, {});

  const statItems = [
    { label: "Total", value: stats?.total_songs?.toString() ?? "—" },
    { label: "Showing", value: sortedSongs.length.toString() },
    { label: "Top Genre", value: stats?.top_genre ?? "—" },
    {
      label: "Generated",
      value: formatLastGenerated(stats?.last_generated ?? null),
    },
  ];

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

  return (
    <div style={{ minHeight: "100vh" }}>
      <PageMeta
        title="Playlist | TuneLog"
        description="Generate and manage TuneLog playlists"
      />
      <PageBreadcrumb pageTitle="Playlist" />

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
        {sortedSongs.length > 0 && (
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
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      color: textMuted,
                      display: "block",
                      marginBottom: 8,
                    }}
                  >
                    User
                  </label>
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
                    <label
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        color: textMuted,
                      }}
                    >
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
                    style={{ width: "100%", accentColor: "#7F77DD" }}
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

                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      color: textMuted,
                      display: "block",
                      marginBottom: 8,
                    }}
                  >
                    Mode
                  </label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {(["regenerate", "append"] as SyncMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => setSyncMode(m)}
                        style={{
                          flex: 1,
                          padding: "8px 0",
                          borderRadius: 8,
                          border: `1px solid ${syncMode === m ? "#7F77DD" : inputBorder}`,
                          background:
                            syncMode === m ? "rgba(127,119,221,0.12)" : inputBg,
                          color: syncMode === m ? "#7F77DD" : textSecondary,
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
                      : "linear-gradient(135deg, #7F77DD 0%, #534AB7 100%)",
                    color: isGenerating ? textMuted : "#ffffff",
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    transition: "all 0.2s",
                  }}
                >
                  {isGenerating ? "Generating…" : "Generate Playlist"}
                </button>

                {generateMsg && (
                  <p
                    style={{
                      fontSize: 12,
                      color: generateMsg.startsWith("✓")
                        ? "#639922"
                        : "#E24B4A",
                      textAlign: "center",
                    }}
                  >
                    {generateMsg}
                  </p>
                )}
              </div>
            )}

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
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      color: textMuted,
                      display: "block",
                      marginBottom: 10,
                    }}
                  >
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
                          border: `1px solid ${explicitFilter === opt.value ? "#7F77DD" : inputBorder}`,
                          background:
                            explicitFilter === opt.value
                              ? "rgba(127,119,221,0.10)"
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
                            border: `2px solid ${explicitFilter === opt.value ? "#7F77DD" : inputBorder}`,
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
                                background: "#7F77DD",
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
                                  ? "#7F77DD"
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
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      color: textMuted,
                      display: "block",
                      marginBottom: 10,
                    }}
                  >
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
              </div>
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
                  style={{ fontSize: 11, color: textMuted, margin: "3px 0 0" }}
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
                      border: `1px solid ${selectedPreset === p.id ? "#7F77DD" : inputBorder}`,
                      background:
                        selectedPreset === p.id
                          ? "rgba(127,119,221,0.14)"
                          : inputBg,
                      color:
                        selectedPreset === p.id ? "#7F77DD" : textSecondary,
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
                      {(Object.entries(activeSlots) as [string, number][]).map(
                        ([key, val]) => (
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
                        ),
                      )}
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
                            setCustomWeights((prev) => ({ ...prev, [key]: v }))
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

            <div
              style={{
                background: card,
                border: `1px solid ${cardBorder}`,
                borderRadius: 14,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: isMobile ? "column" : "row",
                  alignItems: isMobile ? "flex-start" : "center",
                  justifyContent: "space-between",
                  padding: `${cardPadding}px`,
                  borderBottom: `1px solid ${cardBorder}`,
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
                    Current Playlist
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: textMuted,
                      margin: "2px 0 0",
                    }}
                  >
                    {selectedUser} · {sortedSongs.length} songs
                  </p>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 11, color: textMuted }}>Sort:</span>
                  {(["title", "artist", "genre", "signal"] as SortKey[]).map(
                    (k) => (
                      <button
                        key={k}
                        onClick={() => handleSort(k)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: `1px solid ${sortKey === k ? "#7F77DD" : inputBorder}`,
                          background:
                            sortKey === k
                              ? "rgba(127,119,221,0.12)"
                              : "transparent",
                          color: sortKey === k ? "#7F77DD" : textMuted,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          textTransform: "capitalize",
                        }}
                      >
                        {k} {sortKey === k ? (sortAsc ? "↑" : "↓") : ""}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div
                style={{
                  maxHeight: 520,
                  overflowY: "auto",
                  overflowX: "auto",
                  width: "100%",
                }}
              >
                {loadingSongs ? (
                  <p
                    style={{
                      padding: "32px 20px",
                      fontSize: 13,
                      color: textMuted,
                    }}
                  >
                    Loading…
                  </p>
                ) : sortedSongs.length === 0 ? (
                  <p
                    style={{
                      padding: "32px 20px",
                      fontSize: 13,
                      color: textMuted,
                    }}
                  >
                    No songs. Generate a playlist first.
                  </p>
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
                        <th style={thStyle}>Signal</th>
                        {!isMobile && <th style={thStyle}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSongs.map((song, idx) => (
                        <tr
                          key={song.song_id}
                          style={{
                            borderBottom: `1px solid ${dark ? "#18181c" : "#f0f0ec"}`,
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background = dark
                              ? "#18181f"
                              : "#f8f8f5")
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
                              {idx + 1}
                            </td>
                          )}
                          <td
                            style={{
                              padding: "8px 12px",
                              minWidth: isMobile ? 0 : 160,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                              }}
                            >
                              <AlbumArt
                                coverArtId={coverArtMap[song.song_id] ?? null}
                                title={song.title}
                                size={34}
                              />
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
                              }}
                            >
                              {song.genre ?? "—"}
                            </td>
                          )}
                          <td style={{ padding: "10px 12px" }}>
                            {song.signal ? (
                              <SignalPill signal={song.signal} dark={dark} />
                            ) : (
                              <span style={{ color: textMuted, fontSize: 12 }}>
                                —
                              </span>
                            )}
                          </td>
                          {!isMobile && (
                            <td style={{ padding: "10px 12px" }}>
                              {song.explicit &&
                              EXPLICIT_CONFIG[song.explicit] ? (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                    background:
                                      EXPLICIT_CONFIG[song.explicit].color +
                                      "20",
                                    color: EXPLICIT_CONFIG[song.explicit].color,
                                  }}
                                >
                                  {EXPLICIT_CONFIG[song.explicit].label}
                                </span>
                              ) : null}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
