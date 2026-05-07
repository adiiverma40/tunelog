import { useMemo, useState } from "react";
import { useThemeTokens } from "./components/playlistShared";
import {
  fetchListenbrainzPlaylists,
  fetchListenbrainzPlaylistTracks,
  matchTracksWithNavidrome,
  createNavidromePlaylist,
} from "../../API/API";
import type { LBPlaylist, LBTrack } from "../../API/API";

type TabMode = "user" | "created_for_you";

type ListenbrainzPlaylistProps = {
  dark: boolean;
  isMobile: boolean;
};

function SkeletonPlaylistCard({ dark }: { dark: boolean }) {
  const bg = dark ? "#1a1a1f" : "#f0f0ec";
  const shimmer = dark ? "#222228" : "#e4e4e0";
  const border = dark ? "#222228" : "#e8e8e4";
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 10,
        border: `1px solid ${border}`,
        display: "flex",
        flexDirection: "column",
        gap: 7,
      }}
    >
      <div
        style={{
          width: "72%",
          height: 13,
          borderRadius: 4,
          background: shimmer,
        }}
      />
      <div
        style={{ width: "40%", height: 10, borderRadius: 4, background: bg }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 2,
        }}
      >
        <div
          style={{ width: "28%", height: 10, borderRadius: 4, background: bg }}
        />
        <div
          style={{ width: 50, height: 20, borderRadius: 5, background: bg }}
        />
      </div>
    </div>
  );
}

function SkeletonTrackRows({
  dark,
  isMobile,
}: {
  dark: boolean;
  isMobile: boolean;
}) {
  const bg = dark ? "#1a1a1f" : "#f0f0ec";
  const shimmer = dark ? "#222228" : "#e4e4e0";
  const rowBorder = dark ? "#18181c" : "#f0f0ec";
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} style={{ borderBottom: `1px solid ${rowBorder}` }}>
          {/* Art */}
          <td style={{ padding: "9px 10px 9px 12px" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: bg,
                flexShrink: 0,
              }}
            />
          </td>
          <td style={{ padding: "9px 10px" }}>
            <div
              style={{
                width: `${52 + (i % 4) * 12}%`,
                height: 12,
                borderRadius: 4,
                background: shimmer,
                marginBottom: 5,
              }}
            />
            {isMobile && (
              <div
                style={{
                  width: "38%",
                  height: 10,
                  borderRadius: 4,
                  background: bg,
                }}
              />
            )}
          </td>
          {!isMobile && (
            <td style={{ padding: "9px 10px" }}>
              <div
                style={{
                  width: "75%",
                  height: 11,
                  borderRadius: 4,
                  background: bg,
                }}
              />
            </td>
          )}
          {!isMobile && (
            <td style={{ padding: "9px 10px" }}>
              <div
                style={{
                  width: "60%",
                  height: 11,
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

function AlbumArt({
  src,
  alt,
  dark,
  size = 40,
}: {
  src?: string | null;
  alt: string;
  dark: boolean;
  size?: number;
}) {
  const fallback = dark
    ? "linear-gradient(135deg, #2b2b33 0%, #17171c 100%)"
    : "linear-gradient(135deg, #eceae6 0%, #d8d4ce 100%)";

  if (!src) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          background: fallback,
          border: "1px solid rgba(127,127,127,0.12)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width={size * 0.4}
          height={size * 0.4}
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(127,127,127,0.35)"
          strokeWidth="1.5"
        >
          <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        objectFit: "cover",
        border: "1px solid rgba(127,127,127,0.12)",
        flexShrink: 0,
        background: fallback,
      }}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

function PlaylistCard({
  playlist,
  active,
  onClick,
  dark,
  accentColor,
}: {
  playlist: LBPlaylist;
  active: boolean;
  onClick: () => void;
  dark: boolean;
  accentColor: string;
}) {
  const border = dark ? "#222228" : "#e8e8e4";
  const card = dark ? "#131316" : "#ffffff";
  const txtPrim = dark ? "#f0f0ee" : "#18181a";
  const txtMute = dark ? "#555552" : "#a0a09c";

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        background: active ? `${accentColor}12` : card,
        border: `1px solid ${active ? accentColor : border}`,
        borderRadius: 10,
        padding: "12px 14px",
        cursor: "pointer",
        transition: "all 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: 5,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: active ? accentColor : txtPrim,
            lineHeight: 1.35,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {playlist.title}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 7px",
            borderRadius: 5,
            background: dark ? "#1e1e24" : "#f0f0ec",
            color: txtMute,
            flexShrink: 0,
          }}
        >
          {playlist.track_count ?? "?"} tracks
        </span>
      </div>
      <span style={{ fontSize: 11, color: txtMute }}>
        by {playlist.creator}
      </span>
    </button>
  );
}

function StatusBadge({ track, dark }: { track: LBTrack; dark: boolean }) {
  if (track.navidrome_id === undefined) return null;
  const found = Boolean(track.navidrome_id);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 8px",
        borderRadius: 5,
        whiteSpace: "nowrap",
        background: found
          ? dark
            ? "rgba(99,153,34,0.14)"
            : "#EAF3DE"
          : dark
            ? "rgba(226,75,74,0.12)"
            : "#FCEBEB",
        color: found
          ? dark
            ? "#97C459"
            : "#3B6D11"
          : dark
            ? "#F09595"
            : "#A32D2D",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: found ? "#639922" : "#E24B4A",
          flexShrink: 0,
        }}
      />
      {found ? "In Library" : "Not Found"}
    </span>
  );
}

function Spin({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      style={{ animation: "lbspin 0.8s linear infinite", flexShrink: 0 }}
    >
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  );
}

export default function ListenbrainzPlaylist({
  dark,
  isMobile,
}: ListenbrainzPlaylistProps) {
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
    thStyle,
  } = tokens;

  const accentColor = "#EB743B";
  const gradient = "linear-gradient(135deg, #EB743B 0%, #C45520 100%)";

  const [lbUsername, setLbUsername] = useState("");
  const [playlists, setPlaylists] = useState<LBPlaylist[]>([]);
  const [activeTab, setActiveTab] = useState<TabMode>("user");
  const [selectedPlaylist, setSelectedPlaylist] = useState<LBPlaylist | null>(
    null,
  );
  const [tracks, setTracks] = useState<LBTrack[]>([]);
  const [hasMatched, setHasMatched] = useState(false);

  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [statusMsg, setStatusMsg] = useState("");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [hasFetched, setHasFetched] = useState(false);

  const mobileShowTracks = isMobile && !!selectedPlaylist;

  const visiblePlaylists = useMemo(
    () => playlists.filter((p) => p.type === activeTab),
    [playlists, activeTab],
  );
  const matchedCount = useMemo(
    () => tracks.filter((t) => Boolean(t.navidrome_id)).length,
    [tracks],
  );

  const handleFetchPlaylists = async () => {
    setLoadingPlaylists(true);
    setStatusMsg("");
    setSelectedPlaylist(null);
    setTracks([]);
    setHasMatched(false);
    try {
      const res = await fetchListenbrainzPlaylists(lbUsername.trim());
      if (res?.status === "ok") {
        setPlaylists(Array.isArray(res.playlists) ? res.playlists : []);
        setHasFetched(true);
      } else {
        setStatusMsg(`Error: ${res?.reason ?? "Unknown error"}`);
      }
    } catch {
      setStatusMsg("Failed to fetch playlists");
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const handleViewPlaylist = async (playlist: LBPlaylist) => {
    if (selectedPlaylist?.id === playlist.id) return;
    setSelectedPlaylist(playlist);
    setNewPlaylistName(playlist.title ?? "");
    setLoadingTracks(true);
    setTracks([]);
    setHasMatched(false);
    setStatusMsg("");
    try {
      const res = await fetchListenbrainzPlaylistTracks(
        playlist.id,
        lbUsername.trim(),
      );
      if (res?.status === "ok") {
        setTracks(Array.isArray(res.tracks) ? res.tracks : []);
      } else {
        setStatusMsg(`Error: ${res?.reason ?? "Unknown error"}`);
      }
    } catch {
      setStatusMsg("Failed to load tracks");
    } finally {
      setLoadingTracks(false);
    }
  };

  const handleMatchTracks = async () => {
    if (!tracks.length) return;
    setIsMatching(true);
    setStatusMsg("");
    try {
      const res = await matchTracksWithNavidrome(tracks);
      if (res?.status === "ok") {
        setTracks(Array.isArray(res.tracks) ? res.tracks : []);
        setHasMatched(true);
        setStatusMsg(
          `✓ Matched ${res.matched_count ?? 0} of ${tracks.length} tracks`,
        );
      } else {
        setStatusMsg(`Match error: ${res?.reason ?? "Unknown error"}`);
      }
    } catch {
      setStatusMsg("Failed to run matching");
    } finally {
      setIsMatching(false);
    }
  };

  const handleSaveToNavidrome = async () => {
    const ids = tracks
      .map((t) => t.navidrome_id)
      .filter((id): id is string => Boolean(id));
    if (!ids.length || !newPlaylistName.trim()) return;
    setIsSaving(true);
    setStatusMsg("");
    try {
      const res = await createNavidromePlaylist(newPlaylistName.trim(), ids);
      if (res?.status === "ok") {
        setStatusMsg(
          `✓ "${newPlaylistName.trim()}" created with ${ids.length} songs`,
        );
        setNewPlaylistName("");
      } else {
        setStatusMsg(`Error: ${res?.reason ?? "Unknown error"}`);
      }
    } catch {
      setStatusMsg("Failed to save playlist");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackToList = () => {
    setSelectedPlaylist(null);
    setTracks([]);
    setHasMatched(false);
    setStatusMsg("");
  };

  const panelMaxH: React.CSSProperties = {
    maxHeight: "calc(100vh - 240px)",
    minHeight: 400,
  };

  const PlaylistPanel = (
    <div
      style={{
        background: card,
        border: `1px solid ${cardBorder}`,
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        ...(!isMobile ? panelMaxH : {}),
      }}
    >
      <div
        style={{
          display: "flex",
          padding: "6px 8px 0",
          gap: 2,
          background: dark ? "#0f0f12" : "#f5f5f2",
          borderBottom: `1px solid ${cardBorder}`,
          flexShrink: 0,
        }}
      >
        {(
          [
            { value: "user" as TabMode, label: "Created" },
            { value: "created_for_you" as TabMode, label: "Created For You" },
          ] as { value: TabMode; label: string }[]
        ).map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: "7px 7px 0 0",
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              background: activeTab === tab.value ? card : "transparent",
              color: activeTab === tab.value ? accentColor : textMuted,
              borderBottom:
                activeTab === tab.value
                  ? `2px solid ${accentColor}`
                  : "2px solid transparent",
              transition: "all 0.15s",
            }}
          >
            {tab.label}
            <span
              style={{
                marginLeft: 5,
                fontSize: 10,
                padding: "1px 5px",
                borderRadius: 4,
                background: dark ? "#1e1e24" : "#ececea",
                color: textMuted,
              }}
            >
              {playlists.filter((p) => p.type === tab.value).length}
            </span>
          </button>
        ))}
      </div>

      <div
        style={{
          overflowY: "auto",
          flex: 1,
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {loadingPlaylists ? (
          Array.from({ length: 5 }).map((_, i) => (
            <SkeletonPlaylistCard key={i} dark={dark} />
          ))
        ) : !hasFetched ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              padding: "40px 16px",
            }}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke={textMuted}
              strokeWidth="1.4"
            >
              <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <p
              style={{
                fontSize: 12,
                color: textMuted,
                margin: 0,
                textAlign: "center",
              }}
            >
              Enter a username above and fetch to get started.
            </p>
          </div>
        ) : visiblePlaylists.length === 0 ? (
          <p
            style={{
              fontSize: 12,
              color: textMuted,
              textAlign: "center",
              padding: "30px 0",
              margin: 0,
            }}
          >
            No playlists found.
          </p>
        ) : (
          visiblePlaylists.map((pl) => (
            <PlaylistCard
              key={pl.id}
              playlist={pl}
              active={selectedPlaylist?.id === pl.id}
              onClick={() => handleViewPlaylist(pl)}
              dark={dark}
              accentColor={accentColor}
            />
          ))
        )}
      </div>
    </div>
  );

  const TrackPanel = (
    <div
      style={{
        background: card,
        border: `1px solid ${cardBorder}`,
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        ...(!isMobile ? panelMaxH : {}),
      }}
    >
      <div
        style={{
          padding: "13px 16px",
          borderBottom: `1px solid ${cardBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            minWidth: 0,
            flex: 1,
          }}
        >
          {isMobile && (
            <button
              onClick={handleBackToList}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: "transparent",
                border: "none",
                color: textSecondary,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                padding: 0,
                marginBottom: 6,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
              All Playlists
            </button>
          )}
          <p
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: textPrimary,
              margin: 0,
              letterSpacing: "-0.01em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {selectedPlaylist?.title ?? "Select a playlist"}
          </p>
          <p style={{ fontSize: 11, color: textMuted, margin: 0 }}>
            {selectedPlaylist
              ? `${selectedPlaylist.creator} · ${tracks.length} tracks${hasMatched ? ` · ${matchedCount} matched` : ""}`
              : "Click any playlist on the left to view tracks"}
          </p>
        </div>

        {selectedPlaylist && !loadingTracks && tracks.length > 0 && (
          <button
            onClick={handleMatchTracks}
            disabled={isMatching || hasMatched}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              border: "none",
              cursor: isMatching || hasMatched ? "not-allowed" : "pointer",
              background: hasMatched
                ? dark
                  ? "#1e1e24"
                  : "#f0f0ec"
                : isMatching
                  ? dark
                    ? "#2a2a30"
                    : "#e0e0dc"
                  : gradient,
              color: hasMatched
                ? dark
                  ? "#639922"
                  : "#3B6D11"
                : isMatching
                  ? textMuted
                  : "#fff",
              fontSize: 12,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
              transition: "all 0.2s",
              flexShrink: 0,
            }}
          >
            {isMatching ? (
              <>
                <Spin color={textMuted} size={12} /> Matching…
              </>
            ) : hasMatched ? (
              <>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Matched
              </>
            ) : (
              <>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Match with Library
              </>
            )}
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", overflowY: "auto", flex: 1 }}>
        {!selectedPlaylist ? (
          // Empty state
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              padding: "52px 20px",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke={textMuted}
              strokeWidth="1.3"
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            <p
              style={{
                fontSize: 13,
                color: textMuted,
                margin: 0,
                textAlign: "center",
              }}
            >
              {hasFetched
                ? "Select a playlist to view its tracks."
                : "Fetch playlists first."}
            </p>
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
            }}
          >
            <colgroup>
              <col style={{ width: 58 }} />
              <col />
              {!isMobile && <col style={{ width: "24%" }} />}
              {!isMobile && <col style={{ width: "22%" }} />}
              {hasMatched && !isMobile && <col style={{ width: 110 }} />}{" "}
            </colgroup>
            <thead>
              <tr style={{ background: dark ? "#0f0f12" : "#f5f5f2" }}>
                <th style={thStyle} />
                <th style={thStyle}>Title</th>
                {!isMobile && <th style={thStyle}>Artist</th>}
                {!isMobile && <th style={thStyle}>Album</th>}
                {hasMatched && !isMobile && <th style={thStyle}>Status</th>}
              </tr>
            </thead>
            <tbody>
              {loadingTracks ? (
                <SkeletonTrackRows dark={dark} isMobile={isMobile} />
              ) : tracks.length === 0 ? (
                <tr>
                  <td
                    colSpan={isMobile ? 2 : hasMatched ? 5 : 4}
                    style={{
                      padding: 32,
                      textAlign: "center",
                      color: textMuted,
                      fontSize: 13,
                    }}
                  >
                    No tracks found.
                  </td>
                </tr>
              ) : (
                tracks.map((t, idx) => (
                  <tr
                    key={t.mbid || `${t.title}-${idx}`}
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
                    <td
                      style={{
                        padding: "8px 10px 8px 12px",
                        verticalAlign: "middle",
                      }}
                    >
                      <AlbumArt
                        src={t.cover_art_url}
                        alt={t.title}
                        dark={dark}
                        size={40}
                      />
                    </td>

                    <td
                      style={{
                        padding: "8px 10px",
                        verticalAlign: "middle",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
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
                            display: "block",
                          }}
                        >
                          {t.title}
                        </span>
                        {isMobile && (
                          <span
                            style={{
                              fontSize: 11,
                              color: textSecondary,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              display: "block",
                            }}
                          >
                            {t.artist}
                          </span>
                        )}
                        {isMobile && hasMatched && (
                          <div style={{ marginTop: 3 }}>
                            <StatusBadge track={t} dark={dark} />
                          </div>
                        )}
                      </div>
                    </td>

                    {!isMobile && (
                      <td
                        style={{
                          padding: "8px 10px",
                          verticalAlign: "middle",
                          overflow: "hidden",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: textSecondary,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "block",
                          }}
                        >
                          {t.artist}
                        </span>
                      </td>
                    )}

                    {!isMobile && (
                      <td
                        style={{
                          padding: "8px 10px",
                          verticalAlign: "middle",
                          overflow: "hidden",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: textMuted,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "block",
                            fontStyle: t.album ? "normal" : "italic",
                          }}
                        >
                          {t.album || "—"}
                        </span>
                      </td>
                    )}

                    {hasMatched && !isMobile && (
                      <td
                        style={{ padding: "8px 10px", verticalAlign: "middle" }}
                      >
                        <StatusBadge track={t} dark={dark} />
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {hasMatched && matchedCount > 0 && (
        <div
          style={{
            padding: "11px 14px",
            borderTop: `1px solid ${cardBorder}`,
            background: dark ? "#0f0f12" : "#f9f9f6",
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <span
            style={{ fontSize: 12, color: textMuted, whiteSpace: "nowrap" }}
          >
            {matchedCount} song{matchedCount !== 1 ? "s" : ""} ready
          </span>
          <input
            type="text"
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveToNavidrome()}
            placeholder="Playlist name…"
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${newPlaylistName.trim() ? accentColor : inputBorder}`,
              background: inputBg,
              color: textPrimary,
              fontSize: 13,
              outline: "none",
              transition: "border-color 0.15s",
            }}
          />
          <button
            onClick={handleSaveToNavidrome}
            disabled={isSaving || !newPlaylistName.trim()}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              cursor:
                isSaving || !newPlaylistName.trim() ? "not-allowed" : "pointer",
              background:
                isSaving || !newPlaylistName.trim()
                  ? dark
                    ? "#2a2a30"
                    : "#e0e0dc"
                  : gradient,
              color: isSaving || !newPlaylistName.trim() ? textMuted : "#fff",
              fontSize: 12,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
              transition: "all 0.2s",
            }}
          >
            {isSaving ? (
              <>
                <Spin color={textMuted} size={12} /> Saving…
              </>
            ) : (
              <>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Create Playlist
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`@keyframes lbspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div
        style={{
          background: card,
          border: `1px solid ${cardBorder}`,
          borderRadius: 14,
          padding: cardPadding,
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "flex-end",
          gap: 14,
        }}
      >
        <div
          style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}
        >
          <label style={sectionLabel}>ListenBrainz Username</label>
          <input
            type="text"
            placeholder="Leave empty for default user"
            value={lbUsername}
            onChange={(e) => setLbUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFetchPlaylists()}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: `1px solid ${inputBorder}`,
              background: inputBg,
              color: textPrimary,
              fontSize: 13,
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
          <p style={{ fontSize: 11, color: textMuted, margin: 0 }}>
            Falls back to the active Navidrome username when left empty.
          </p>
        </div>

        <button
          onClick={handleFetchPlaylists}
          disabled={loadingPlaylists}
          style={{
            padding: "11px 24px",
            borderRadius: 10,
            border: "none",
            cursor: loadingPlaylists ? "not-allowed" : "pointer",
            background: loadingPlaylists
              ? dark
                ? "#2a2a30"
                : "#e0e0dc"
              : gradient,
            color: loadingPlaylists ? textMuted : "#fff",
            fontSize: 13,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 8,
            whiteSpace: "nowrap",
            transition: "all 0.2s",
            alignSelf: "flex-end",
          }}
        >
          {loadingPlaylists ? (
            <>
              <Spin color={textMuted} /> Fetching…
            </>
          ) : (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 .49-4.69" />
              </svg>
              Fetch Playlists
            </>
          )}
        </button>
      </div>

      {statusMsg && (
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: statusMsg.startsWith("✓") ? "#639922" : "#E24B4A",
            margin: 0,
            padding: "0 2px",
          }}
        >
          {statusMsg}
        </p>
      )}

      {!isMobile ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "280px 1fr",
            gap: 16,
            alignItems: "start",
          }}
        >
          {PlaylistPanel}
          {TrackPanel}
        </div>
      ) : mobileShowTracks ? (
        TrackPanel
      ) : (
        PlaylistPanel
      )}
    </div>
  );
}
