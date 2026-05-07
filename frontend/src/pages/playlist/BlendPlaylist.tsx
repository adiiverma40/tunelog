import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import Switch from "../../components/form/switch/Switch";
import {
  fetchPlaylistSongs,
  fetchPlaylistGenerate,
  appendPlaylist,
  fetchGetConfig,
  getSong,
  // getCoverArtUrl,
  PlaylistSong,
  PlaylistStats,
} from "../../API/API";

import {
  ExplicitFilter,
  SortKey,
  SyncMode,
  SlotValues,
  WeightValues,
  Preset,
  INITIAL_PRESETS,
  SIGNAL_CONFIG,
  SLOT_COLORS,
  BLEND_PAGE_SIZE,
  formatLastGenerated,
  normaliseSlots,
  SIGNAL_ORDER,
} from "./shared/PlaylistTypes";
import {
  useThemeTokens,
  SignalPill,
  SlotBar,
  SliderRow,
  SongTable,
  SharedSettingsPanel,
} from "./components/playlistShared";

interface BlendPlaylistProps {
  selectedUser: string;
  users: string[];
  setSelectedUser: (u: string) => void;
  dark: boolean;
  isMobile: boolean;
  isLargeScreen: boolean;
}

export default function BlendPlaylist({
  selectedUser,
  users,
  setSelectedUser,
  dark,
  isMobile,
  isLargeScreen,
}: BlendPlaylistProps) {
  const PAGE_SIZE = BLEND_PAGE_SIZE;
  const INFINITE_BATCH = PAGE_SIZE;

  const [songs, setSongs] = useState<PlaylistSong[]>([]);
  const [stats, setStats] = useState<PlaylistStats | null>(null);
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [coverArtMap, setCoverArtMap] = useState<Record<string, string>>({});

  const [playlistSize, setPlaylistSize] = useState(40);
  const [explicitFilter, setExplicitFilter] = useState<ExplicitFilter>("all");
  const [syncMode, setSyncMode] = useState<SyncMode>("regenerate");
  const [genreInjection, setGenreInjection] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState("");

  const [showExplicit, setShowExplicit] = useState(true);
  const [showCleaned, setShowCleaned] = useState(true);
  const [showClean, setShowClean] = useState(true);

  const [usePagination, setUsePagination] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [infiniteCount, setInfiniteCount] = useState(INFINITE_BATCH);

  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortAsc, setSortAsc] = useState(true);

  const [presets, setPresets] = useState<Preset[]>(INITIAL_PRESETS);
  const [selectedPreset, setSelectedPreset] = useState("default");
  const [customSlots, setCustomSlots] = useState<SlotValues>(
    INITIAL_PRESETS[3].slots,
  );
  const [customWeights, setCustomWeights] = useState<WeightValues>(
    INITIAL_PRESETS[3].weights,
  );

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
    textSecondary,
    textMuted,
    inputBg,
    inputBorder,
    cardPadding,
    sectionLabel,
  } = tokens;

  const accentColor = "#7F77DD";
  const gradient = "linear-gradient(135deg, #7F77DD 0%, #534AB7 100%)";

  const activeSlots =
    selectedPreset === "custom"
      ? customSlots
      : presets.find((p) => p.id === selectedPreset)!.slots;
  const activeWeights =
    selectedPreset === "custom"
      ? customWeights
      : presets.find((p) => p.id === selectedPreset)!.weights;

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
    if (!selectedUser) return;
    setLoadingSongs(true);
    setCurrentPage(1);
    setInfiniteCount(INFINITE_BATCH);
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
        return song ? { id, coverArt: song.coverArt } : null;
      }),
    ).then((results) => {
      const map: Record<string, string> = {};
      results.forEach((r) => {
        if (r?.coverArt) map[r.id] = r.coverArt;
      });
      setCoverArtMap(map);
    });
  }, [songs]);

  useEffect(() => {
    setCurrentPage(1);
    setInfiniteCount(INFINITE_BATCH);
  }, [sortKey, sortAsc, showExplicit, showCleaned, showClean, usePagination]);

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
        if (sortKey === "signal")
          cmp = (a.signal ?? "").localeCompare(b.signal ?? "");
        return sortAsc ? cmp : -cmp;
      }),
    [visibleSongs, sortKey, sortAsc],
  );

  const totalPages = Math.max(1, Math.ceil(sortedSongs.length / PAGE_SIZE));
  const hasMoreInfinite = !usePagination && infiniteCount < sortedSongs.length;

  const signalCounts = sortedSongs.reduce<Record<string, number>>(
    (acc, s: any) => {
      const sig = s.signal ?? "unheard";
      acc[sig] = (acc[sig] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const statItems = [
    { label: "Total", value: stats?.total_songs?.toString() ?? "—" },
    { label: "Showing", value: sortedSongs.length.toString() },
    { label: "Top Genre", value: stats?.top_genre ?? "—" },
    {
      label: "Generated",
      value: formatLastGenerated(stats?.last_generated ?? null),
    },
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
                        border: `1px solid ${syncMode === m ? accentColor : inputBorder}`,
                        background:
                          syncMode === m ? "rgba(127,119,221,0.12)" : inputBg,
                        color: syncMode === m ? accentColor : textSecondary,
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
                  "Generate Playlist"
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
              <p style={{ fontSize: 11, color: textMuted, margin: "3px 0 0" }}>
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
                    border: `1px solid ${selectedPreset === p.id ? accentColor : inputBorder}`,
                    background:
                      selectedPreset === p.id ? `${accentColor}24` : inputBg,
                    color:
                      selectedPreset === p.id ? accentColor : textSecondary,
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
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
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
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
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
                                    backgroundColor: SLOT_COLORS[key] ?? "#888",
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
            title="Current Playlist"
            selectedUser={selectedUser}
            signalColumnLabel="Signal"
            sortKeys={["title", "artist", "genre", "signal"]}
            renderSignalCell={(song, d) =>
              song.signal ? (
                <SignalPill signal={song.signal} dark={d} />
              ) : (
                <span style={{ color: textMuted, fontSize: 12 }}>—</span>
              )
            }
            tableRef={tableRef as React.RefObject<HTMLDivElement>}
            tableScrollRef={tableScrollRef as React.RefObject<HTMLDivElement>}
          />
        </div>
      </div>
    </div>
  );
}
