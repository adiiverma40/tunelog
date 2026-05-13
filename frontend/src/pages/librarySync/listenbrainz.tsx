import { useState, useEffect } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import {
  useDarkMode,
  useMediaQuery,
} from "../playlist/components/playlistShared";
import {
  fetchLBLibraryRecommendations,
  getCoverArtUrl,
  type LBLibrarySong,
  type LBMissingSong,
} from "../../API/API";

function useTokens(dark: boolean) {
  return {
    card: dark ? "#131316" : "#ffffff",
    cardBorder: dark ? "#222228" : "#e8e8e4",
    sectionBg: dark ? "#0f0f12" : "#f5f5f2",
    rowHover: dark ? "#18181f" : "#f8f8f5",
    rowBorder: dark ? "#18181c" : "#f0f0ec",
    textPrimary: dark ? "#f0f0ee" : "#18181a",
    textSecondary: dark ? "#999994" : "#555550",
    textMuted: dark ? "#444440" : "#b0b0aa",
    accent: "#EB743B",
    green: dark ? "#97C459" : "#3B6D11",
    greenBg: dark ? "rgba(99,153,34,.14)" : "#EAF3DE",
    red: dark ? "#F09595" : "#A32D2D",
    redBg: dark ? "rgba(226,75,74,.12)" : "#FCEBEB",
  };
}

type T = ReturnType<typeof useTokens>;

function ArtFallback({ size, dark }: { size: number; dark: boolean }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        flexShrink: 0,
        background: dark
          ? "linear-gradient(135deg,#2b2b33 0%,#17171c 100%)"
          : "linear-gradient(135deg,#eceae6 0%,#d8d4ce 100%)",
        border: "1px solid rgba(127,127,127,.1)",
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
        stroke="rgba(127,127,127,.35)"
        strokeWidth="1.5"
      >
        <path d="M9 19V6l12-3v13M9 19c0 1.1-1.34 2-3 2s-3-.9-3-2 1.34-2 3-2 3 .9 3 2zm12-3c0 1.1-1.34 2-3 2s-3-.9-3-2 1.34-2 3-2 3 .9 3 2zM9 10l12-3" />
      </svg>
    </div>
  );
}

function NavidromeArt({
  navidromeId,
  title,
  size = 40,
  dark,
}: {
  navidromeId: string;
  title: string;
  size?: number;
  dark: boolean;
}) {
  const [err, setErr] = useState(false);
  if (err || !navidromeId) return <ArtFallback size={size} dark={dark} />;
  return (
    <img
      src={getCoverArtUrl(navidromeId)}
      alt={title}
      loading="lazy"
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        objectFit: "cover",
        flexShrink: 0,
        border: "1px solid rgba(127,127,127,.1)",
      }}
      onError={() => setErr(true)}
    />
  );
}

function MBArt({
  releaseId,
  title,
  size = 40,
  dark,
}: {
  releaseId: string | null | undefined;
  title: string;
  size?: number;
  dark: boolean;
}) {
  const [err, setErr] = useState(false);
  if (err || !releaseId) return <ArtFallback size={size} dark={dark} />;
  return (
    <img
      src={`https://coverartarchive.org/release/${releaseId}/front-250`}
      alt={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        objectFit: "cover",
        flexShrink: 0,
        border: "1px solid rgba(127,127,127,.1)",
      }}
      onError={() => setErr(true)}
    />
  );
}

function UserChip({ username, accent }: { username: string; accent: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 4,
        background: `${accent}18`,
        border: `1px solid ${accent}40`,
        color: accent,
        whiteSpace: "nowrap",
      }}
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
      {username}
    </span>
  );
}

function StatCard({
  label,
  value,
  color,
  bg,
  textMuted,
}: {
  label: string;
  value: number | string;
  color: string;
  bg: string;
  textMuted: string;
}) {
  return (
    <div
      style={{
        padding: "14px 18px",
        borderRadius: 12,
        background: bg,
        border: `1px solid ${color}30`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: textMuted,
          margin: 0,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 22,
          fontWeight: 800,
          color,
          margin: 0,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function TH({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <th
      style={{
        padding: "9px 12px",
        textAlign: "left",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function SkeletonRows({
  dark,
  isMobile,
}: {
  dark: boolean;
  isMobile: boolean;
}) {
  const bg = dark ? "#1a1a1f" : "#f0f0ec";
  const shimmer = dark ? "#222228" : "#e4e4e0";
  const border = dark ? "#18181c" : "#f0f0ec";
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} style={{ borderBottom: `1px solid ${border}`, height: 58 }}>
          <td style={{ padding: "9px 6px 9px 12px", textAlign: "center" }}>
            <div
              style={{
                width: 18,
                height: 10,
                borderRadius: 4,
                background: bg,
                margin: "0 auto",
              }}
            />
          </td>
          <td style={{ padding: "9px 10px" }}>
            <div
              style={{ width: 40, height: 40, borderRadius: 8, background: bg }}
            />
          </td>
          <td style={{ padding: "9px 12px" }}>
            <div
              style={{
                width: `${50 + (i % 4) * 12}%`,
                height: 12,
                borderRadius: 4,
                background: shimmer,
                marginBottom: 5,
              }}
            />
            <div
              style={{
                width: "40%",
                height: 10,
                borderRadius: 4,
                background: bg,
              }}
            />
          </td>
          {!isMobile && (
            <td style={{ padding: "9px 12px" }}>
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
            <td style={{ padding: "9px 12px" }}>
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
          {!isMobile && (
            <td style={{ padding: "9px 12px" }}>
              <div
                style={{
                  width: 52,
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

const PAGE_SIZE = 20;

function PaginationBar({
  page,
  total,
  onChange,
  dark,
  accent,
  cardBorder,
}: {
  page: number;
  total: number;
  onChange: (p: number) => void;
  dark: boolean;
  accent: string;
  cardBorder: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (totalPages <= 1) return null;

  const pages: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (
      let i = Math.max(2, page - 1);
      i <= Math.min(totalPages - 1, page + 1);
      i++
    )
      pages.push(i);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  const btn: React.CSSProperties = {
    width: 30,
    height: 30,
    borderRadius: 7,
    border: `1px solid ${cardBorder}`,
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
    transition: "all .15s",
    color: dark ? "#ccc" : "#444",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        padding: "10px 14px",
        borderTop: `1px solid ${cardBorder}`,
        background: dark ? "#0f0f12" : "#f9f9f6",
      }}
    >
      <button
        style={{ ...btn, opacity: page === 1 ? 0.35 : 1 }}
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
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
      {pages.map((p, i) =>
        p === "…" ? (
          <span
            key={`d${i}`}
            style={{
              width: 24,
              textAlign: "center",
              fontSize: 12,
              color: dark ? "#444" : "#bbb",
            }}
          >
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p as number)}
            style={{
              ...btn,
              background: p === page ? accent : "transparent",
              color: p === page ? "#fff" : dark ? "#ccc" : "#444",
              border: `1px solid ${p === page ? accent : cardBorder}`,
            }}
          >
            {p}
          </button>
        ),
      )}
      <button
        style={{ ...btn, opacity: page === totalPages ? 0.35 : 1 }}
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
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
  );
}

function Tab({
  active,
  onClick,
  children,
  accent,
  count,
  dark,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  accent: string;
  count: number;
  dark: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 16px",
        borderRadius: "8px 8px 0 0",
        border: "none",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
        background: active ? (dark ? "#131316" : "#ffffff") : "transparent",
        color: active ? accent : dark ? "#555552" : "#a0a09c",
        borderBottom: active ? `2px solid ${accent}` : "2px solid transparent",
        transition: "all .15s",
        display: "flex",
        alignItems: "center",
        gap: 7,
      }}
    >
      {children}
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          padding: "1px 6px",
          borderRadius: 4,
          background: active ? `${accent}20` : dark ? "#1e1e24" : "#ececea",
          color: active ? accent : dark ? "#555" : "#aaa",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function SongRow({
  idx,
  art,
  title,
  artist,
  album,
  forUser,
  //   dark,
  isMobile,
  t,
}: {
  idx: number;
  art: React.ReactNode;
  title: string;
  artist: string;
  album: string | null;
  forUser: string;
  dark: boolean;
  isMobile: boolean;
  t: T;
}) {
  return (
    <tr
      style={{ borderBottom: `1px solid ${t.rowBorder}` }}
      onMouseEnter={(e) => (e.currentTarget.style.background = t.rowHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <td
        style={{
          padding: "8px 6px 8px 12px",
          textAlign: "center",
          color: t.textMuted,
          fontSize: 11,
          fontWeight: 500,
          verticalAlign: "middle",
        }}
      >
        {idx}
      </td>
      <td style={{ padding: "8px 8px 8px 10px", verticalAlign: "middle" }}>
        {art}
      </td>
      <td
        style={{
          padding: "8px 12px",
          verticalAlign: "middle",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: t.textPrimary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "block",
            }}
          >
            {title}
          </span>
          {isMobile && (
            <span
              style={{
                fontSize: 11,
                color: t.textSecondary,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "block",
              }}
            >
              {artist}
            </span>
          )}
          {isMobile && album && (
            <span
              style={{
                fontSize: 10,
                color: t.textMuted,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "block",
                fontStyle: "italic",
              }}
            >
              {album}
            </span>
          )}
          {isMobile && (
            <div style={{ marginTop: 2 }}>
              <UserChip username={forUser} accent={t.accent} />
            </div>
          )}
        </div>
      </td>
      {!isMobile && (
        <td
          style={{
            padding: "8px 12px",
            verticalAlign: "middle",
            overflow: "hidden",
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: t.textSecondary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "block",
            }}
          >
            {artist}
          </span>
        </td>
      )}
      {!isMobile && (
        <td
          style={{
            padding: "8px 12px",
            verticalAlign: "middle",
            overflow: "hidden",
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: t.textMuted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "block",
              fontStyle: album ? "normal" : "italic",
            }}
          >
            {album || "—"}
          </span>
        </td>
      )}
      {!isMobile && (
        <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>
          <UserChip username={forUser} accent={t.accent} />
        </td>
      )}
    </tr>
  );
}

function TableWrapper({
  loading,
  empty,
  children,
  isMobile,
  dark,
  t,
  colSpan,
}: {
  loading: boolean;
  empty: boolean;
  children: React.ReactNode;
  isMobile: boolean;
  dark: boolean;
  t: T;
  colSpan: number;
}) {
  const thStyle: React.CSSProperties = {
    color: t.textMuted,
    background: dark ? "#0f0f12" : "#f5f5f2",
    borderBottom: `1px solid ${t.cardBorder}`,
    position: "sticky",
    top: 0,
    zIndex: 1,
  };

  return (
    <div style={{ overflowX: "auto", flex: 1, minHeight: 0 }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          <col style={{ width: 40 }} />
          <col style={{ width: 52 }} />
          <col />
          {!isMobile && <col style={{ width: "22%" }} />}
          {!isMobile && <col style={{ width: "22%" }} />}
          {!isMobile && <col style={{ width: 90 }} />}
        </colgroup>
        <thead>
          <tr>
            <TH style={{ ...thStyle, textAlign: "center" }}>#</TH>
            <TH style={thStyle} />
            <TH style={thStyle}>Title</TH>
            {!isMobile && <TH style={thStyle}>Artist</TH>}
            {!isMobile && <TH style={thStyle}>Album</TH>}
            {!isMobile && <TH style={thStyle}>For</TH>}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonRows dark={dark} isMobile={isMobile} />
          ) : empty ? (
            <tr>
              <td
                colSpan={colSpan}
                style={{
                  padding: 40,
                  textAlign: "center",
                  color: t.textMuted,
                  fontSize: 13,
                }}
              >
                No songs found.
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

type TabKey = "library" | "missing";

export default function ListenbrainzLibrary() {
  const dark = useDarkMode();
  const isMobile = useMediaQuery("(max-width: 640px)");
  const t = useTokens(dark);

  const [inLibrary, setInLibrary] = useState<LBLibrarySong[]>([]);
  const [missing, setMissing] = useState<LBMissingSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("library");
  const [libPage, setLibPage] = useState(1);
  const [misPage, setMisPage] = useState(1);

  useEffect(() => {
    fetchLBLibraryRecommendations()
      .then((res) => {
        if (res.status === "ok") {
          setInLibrary(res.in_library ?? []);
          setMissing(res.not_in_library ?? []);
        } else {
          setError((res as any).reason ?? "Failed to load.");
        }
      })
      .catch(() => setError("Network error."))
      .finally(() => setLoading(false));
  }, []);

  const total = inLibrary.length + missing.length;
  const colSpan = isMobile ? 3 : 6;

  const libDisplayed = inLibrary.slice(
    (libPage - 1) * PAGE_SIZE,
    libPage * PAGE_SIZE,
  );
  const misDisplayed = missing.slice(
    (misPage - 1) * PAGE_SIZE,
    misPage * PAGE_SIZE,
  );

  return (
    <div style={{ minHeight: "100vh" }}>
      <style>{`@keyframes lbspin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <PageMeta
        title="LB Library | TuneLog"
        description="ListenBrainz recommended songs vs your library"
      />
      <PageBreadcrumb pageTitle="LB Library" />

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr",
            gap: 12,
          }}
        >
          <StatCard
            label="Total Recommended"
            value={loading ? "—" : total}
            color={t.accent}
            bg={`${t.accent}10`}
            textMuted={t.textMuted}
          />
          <StatCard
            label="In Library"
            value={loading ? "—" : inLibrary.length}
            color={t.green}
            bg={t.greenBg}
            textMuted={t.textMuted}
          />
          <StatCard
            label="Not In Library"
            value={loading ? "—" : missing.length}
            color={t.red}
            bg={t.redBg}
            textMuted={t.textMuted}
          />
        </div>

        {error && (
          <p style={{ fontSize: 12, fontWeight: 600, color: t.red, margin: 0 }}>
            {error}
          </p>
        )}

        <div
          style={{
            background: t.card,
            border: `1px solid ${t.cardBorder}`,
            borderRadius: 14,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              padding: "6px 10px 0",
              gap: 2,
              background: dark ? "#0f0f12" : "#f5f5f2",
              borderBottom: `1px solid ${t.cardBorder}`,
            }}
          >
            <Tab
              active={activeTab === "library"}
              onClick={() => setActiveTab("library")}
              accent={t.accent}
              count={inLibrary.length}
              dark={dark}
            >
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
              In Library
            </Tab>
            <Tab
              active={activeTab === "missing"}
              onClick={() => setActiveTab("missing")}
              accent={t.accent}
              count={missing.length}
              dark={dark}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              Not In Library
            </Tab>
          </div>

          {activeTab === "library" ? (
            <>
              <TableWrapper
                loading={loading}
                empty={!loading && libDisplayed.length === 0}
                isMobile={isMobile}
                dark={dark}
                t={t}
                colSpan={colSpan}
              >
                {libDisplayed.map((song, i) => (
                  <SongRow
                    key={song.navidrome_id}
                    idx={(libPage - 1) * PAGE_SIZE + i + 1}
                    art={
                      <NavidromeArt
                        navidromeId={song.navidrome_id}
                        title={song.title}
                        size={40}
                        dark={dark}
                      />
                    }
                    title={song.title}
                    artist={song.artist}
                    album={song.album}
                    forUser={song.for_user}
                    dark={dark}
                    isMobile={isMobile}
                    t={t}
                  />
                ))}
              </TableWrapper>
              <PaginationBar
                page={libPage}
                total={inLibrary.length}
                onChange={setLibPage}
                dark={dark}
                accent={t.accent}
                cardBorder={t.cardBorder}
              />
            </>
          ) : (
            <>
              <TableWrapper
                loading={loading}
                empty={!loading && misDisplayed.length === 0}
                isMobile={isMobile}
                dark={dark}
                t={t}
                colSpan={colSpan}
              >
                {misDisplayed.map((song, i) => (
                  <SongRow
                    key={`${song.recording_mbid}-${i}`}
                    idx={(misPage - 1) * PAGE_SIZE + i + 1}
                    art={
                      <MBArt
                        releaseId={song.release_mbid}
                        title={song.title}
                        size={40}
                        dark={dark}
                      />
                    }
                    title={song.title}
                    artist={song.artist}
                    album={song.album}
                    forUser={song.for_user}
                    dark={dark}
                    isMobile={isMobile}
                    t={t}
                  />
                ))}
              </TableWrapper>
              <PaginationBar
                page={misPage}
                total={missing.length}
                onChange={setMisPage}
                dark={dark}
                accent={t.accent}
                cardBorder={t.cardBorder}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
