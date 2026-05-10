import { useState, useEffect, useCallback } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { useDarkMode, useMediaQuery } from "./components/playlistShared";
import {
  fetchLBCFConfig,
  saveLBCFConfig,
  generateLBCFPlaylist,
  fetchLBHasToken,
  setLBToken,
  type LBCFConfig,
  type WeeklyLBFetch,
} from "../../API/API";

function fmtUnix(ts: number | null | undefined): string {
  if (!ts) return "Never";
  return new Date(ts * 1000).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function nextRunLabel(hour: number): string {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const diff = next.getTime() - now.getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function useTokens(dark: boolean) {
  return {
    card: dark ? "#131316" : "#ffffff",
    cardBorder: dark ? "#222228" : "#e8e8e4",
    sectionBg: dark ? "#0f0f12" : "#f5f5f2",
    textPrimary: dark ? "#f0f0ee" : "#18181a",
    textSecondary: dark ? "#999994" : "#555550",
    textMuted: dark ? "#444440" : "#b0b0aa",
    inputBg: dark ? "#1a1a1f" : "#f8f8f5",
    inputBorder: dark ? "#2a2a30" : "#deded8",
    accent: "#EB743B",
    accentGrad: "linear-gradient(135deg,#EB743B 0%,#C45520 100%)",
    green: dark ? "#97C459" : "#3B6D11",
    greenBg: dark ? "rgba(99,153,34,.14)" : "#EAF3DE",
    red: dark ? "#F09595" : "#A32D2D",
    redBg: dark ? "rgba(226,75,74,.12)" : "#FCEBEB",
    amber: dark ? "#F0C070" : "#8B5E00",
    amberBg: dark ? "rgba(240,192,112,.12)" : "#FEF3DC",
  };
}

type T = ReturnType<typeof useTokens>;

function Spin({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      style={{ animation: "lbcfspin .8s linear infinite", flexShrink: 0 }}
    >
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  );
}

function Toggle({
  value,
  onChange,
  disabled,
  accent,
  dark,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  accent: string;
  dark: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        width: 38,
        height: 22,
        borderRadius: 11,
        border: "none",
        background: value ? accent : dark ? "#2a2a30" : "#e0e0dc",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        padding: 0,
        position: "relative",
        flexShrink: 0,
        transition: "background .2s",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 3,
          left: value ? 19 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 4px rgba(0,0,0,.3)",
          transition: "left .18s",
        }}
      />
    </button>
  );
}

function StatusPill({
  label,
  color,
  bg,
}: {
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 5,
        background: bg,
        color,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

function SectionLabel({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}) {
  return (
    <p
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color,
        margin: "0 0 10px",
      }}
    >
      {children}
    </p>
  );
}

function Sep({ border }: { border: string }) {
  return <div style={{ height: 1, background: border, margin: "14px 0" }} />;
}

function Row({
  label,
  hint,
  children,
  textPrimary,
  textMuted,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  textPrimary: string;
  textMuted: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        minHeight: 36,
      }}
    >
      <div>
        <p
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: textPrimary,
            margin: 0,
          }}
        >
          {label}
        </p>
        {hint && (
          <p style={{ fontSize: 11, color: textMuted, margin: "2px 0 0" }}>
            {hint}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function NumInput({
  value,
  onChange,
  min,
  max,
  inputBg,
  inputBorder,
  textPrimary,
  accent,
  width = 72,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  inputBg: string;
  inputBorder: string;
  textPrimary: string;
  accent: string;
  width?: number;
}) {
  const [raw, setRaw] = useState<string>(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) {
      setRaw(String(value));
    }
  }, [value, focused]);

  const commit = (str: string) => {
    const parsed = parseInt(str, 10);
    if (isNaN(parsed)) {
      setRaw(String(value));
      return;
    }
    const clamped =
      min !== undefined && max !== undefined
        ? Math.min(max, Math.max(min, parsed))
        : min !== undefined
          ? Math.max(min, parsed)
          : max !== undefined
            ? Math.min(max, parsed)
            : parsed;
    setRaw(String(clamped));
    onChange(clamped);
  };

  return (
    <input
      type="number"
      value={raw}
      min={min}
      max={max}
      onChange={(e) => {
        const str = e.target.value;
        setRaw(str);
        const parsed = parseInt(str, 10);
        if (!isNaN(parsed)) {
          const clamped =
            min !== undefined && max !== undefined
              ? Math.min(max, Math.max(min, parsed))
              : min !== undefined
                ? Math.max(min, parsed)
                : max !== undefined
                  ? Math.min(max, parsed)
                  : parsed;
          onChange(clamped);
        }
      }}
      onFocus={(e) => {
        setFocused(true);
        e.currentTarget.style.borderColor = accent;
      }}
      onBlur={(e) => {
        setFocused(false);
        commit(e.target.value);
        e.currentTarget.style.borderColor = inputBorder;
      }}
      style={{
        width,
        padding: "7px 10px",
        borderRadius: 8,
        border: `1px solid ${inputBorder}`,
        background: inputBg,
        color: textPrimary,
        fontSize: 13,
        outline: "none",
        textAlign: "center",
        fontVariantNumeric: "tabular-nums",
      }}
    />
  );
}

function CardShell({
  children,
  card,
  cardBorder,
  style,
}: {
  children: React.ReactNode;
  card: string;
  cardBorder: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: card,
        border: `1px solid ${cardBorder}`,
        borderRadius: 14,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({
  title,
  subtitle,
  sectionBg,
  cardBorder,
  textPrimary,
  textMuted,
  children,
}: {
  title: string;
  subtitle?: string;
  sectionBg: string;
  cardBorder: string;
  textPrimary: string;
  textMuted: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: sectionBg,
        borderBottom: `1px solid ${cardBorder}`,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
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
          {title}
        </p>
        {subtitle && (
          <p style={{ fontSize: 11, color: textMuted, margin: "2px 0 0" }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function StatItem({
  label,
  value,
  textPrimary,
  textMuted,
}: {
  label: string;
  value: React.ReactNode;
  textPrimary: string;
  textMuted: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
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
          fontSize: 14,
          fontWeight: 700,
          color: textPrimary,
          margin: 0,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function UserChips({
  users,
  onChange,
  accent,
  card,
  cardBorder,
  textPrimary,
  textMuted,
  inputBg,
  inputBorder,
}: {
  users: string[];
  onChange: (u: string[]) => void;
  accent: string;
  card: string;
  cardBorder: string;
  textPrimary: string;
  textMuted: string;
  inputBg: string;
  inputBorder: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !users.includes(v)) onChange([...users, v]);
    setDraft("");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {users.map((u) => (
          <span
            key={u}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: 6,
              background: `${accent}18`,
              border: `1px solid ${accent}55`,
              color: accent,
            }}
          >
            {u}
            <button
              onClick={() => onChange(users.filter((x) => x !== u))}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: accent,
                padding: 0,
                display: "flex",
                alignItems: "center",
                lineHeight: 1,
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="Add username…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          style={{
            flex: 1,
            padding: "7px 12px",
            borderRadius: 8,
            border: `1px solid ${inputBorder}`,
            background: inputBg,
            color: textPrimary,
            fontSize: 12,
            outline: "none",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = accent)}
          onBlur={(e) => (e.currentTarget.style.borderColor = inputBorder)}
        />
        <button
          onClick={add}
          style={{
            padding: "7px 14px",
            borderRadius: 8,
            border: `1px solid ${cardBorder}`,
            background: card,
            color: textMuted,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function TokenSection({ t, dark }: { t: T; dark: boolean }) {
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tokenStatus, setTokenStatus] = useState<{
    msg: string;
    ok: boolean;
  } | null>(null);

  useEffect(() => {
    fetchLBHasToken()
      .then((res) => {
        if (res.status === "ok") setHasToken(res.has_token);
      })
      .catch(() => setHasToken(false))
      .finally(() => setChecking(false));
  }, []);

  const handleSaveToken = async () => {
    const trimmed = tokenInput.trim();
    if (!trimmed) return;
    setSaving(true);
    setTokenStatus(null);
    try {
      const res = await setLBToken(trimmed);
      if (res.status === "ok") {
        setHasToken(true);
        setTokenInput("");
        setTokenStatus({ msg: "Token saved.", ok: true });
      } else {
        setTokenStatus({ msg: (res as any).reason ?? "Failed.", ok: false });
      }
    } catch {
      setTokenStatus({ msg: "Network error.", ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div>
          <p
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: t.textPrimary,
              margin: 0,
            }}
          >
            ListenBrainz Token
          </p>
          <p style={{ fontSize: 11, color: t.textMuted, margin: "2px 0 0" }}>
            Required for CF recommendations
          </p>
        </div>
        {checking ? (
          <Spin color={t.textMuted} size={13} />
        ) : hasToken ? (
          <StatusPill label="Token set" color={t.green} bg={t.greenBg} />
        ) : (
          <StatusPill label="No token" color={t.red} bg={t.redBg} />
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="password"
          placeholder={
            hasToken ? "Replace existing token…" : "Paste token here…"
          }
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSaveToken()}
          style={{
            flex: 1,
            padding: "7px 12px",
            borderRadius: 8,
            border: `1px solid ${tokenInput.trim() ? t.accent : t.inputBorder}`,
            background: t.inputBg,
            color: t.textPrimary,
            fontSize: 12,
            outline: "none",
            transition: "border-color .15s",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = t.accent)}
          onBlur={(e) =>
            (e.currentTarget.style.borderColor = tokenInput.trim()
              ? t.accent
              : t.inputBorder)
          }
        />
        <button
          onClick={handleSaveToken}
          disabled={saving || !tokenInput.trim()}
          style={{
            padding: "7px 14px",
            borderRadius: 8,
            border: "none",
            cursor: saving || !tokenInput.trim() ? "not-allowed" : "pointer",
            background:
              saving || !tokenInput.trim()
                ? dark
                  ? "#2a2a30"
                  : "#e0e0dc"
                : t.accentGrad,
            color: saving || !tokenInput.trim() ? t.textMuted : "#fff",
            fontSize: 12,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "all .2s",
            whiteSpace: "nowrap",
          }}
        >
          {saving ? (
            <Spin color={t.textMuted} size={12} />
          ) : (
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
          )}
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {tokenStatus && (
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            margin: 0,
            color: tokenStatus.ok ? t.green : t.red,
          }}
        >
          {tokenStatus.msg}
        </p>
      )}
    </div>
  );
}

const DEFAULT_CONFIG: LBCFConfig = {
  size: 50,
  heard: 25,
  unheard: 25,
  unheard_genre_injection: true,
  heard_genre_injection: false,
  last_generated: 0,
  auto_generate_time: 22,
  Name: "Listenbrainz Playlist",
  backfill_unheard_song: true,
  use_blend: true,
  heard_last_score: 0,
  unheard_last_score: 0,
  fallbackScore: true,
  for_users: ["adii"],
};
const DEFAULT_FETCH: WeeklyLBFetch = { last_synced: 0, check_interval: 12 };

export default function ListenbrainzCF() {
  const dark = useDarkMode();
  const isMobile = useMediaQuery("(max-width: 640px)");
  const isLarge = useMediaQuery("(min-width: 1100px)");
  const t = useTokens(dark);

  const [cfg, setCfg] = useState<LBCFConfig>(DEFAULT_CONFIG);
  const [fetchCfg, setFetchCfg] = useState<WeeklyLBFetch>(DEFAULT_FETCH);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ msg: string; ok: boolean } | null>(
    null,
  );

  useEffect(() => {
    fetchLBCFConfig()
      .then((res) => {
        if (res?.status === "ok") {
          setCfg(res.cf_playlist_config ?? DEFAULT_CONFIG);
          setFetchCfg(res.weekly_LB_fetch ?? DEFAULT_FETCH);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const patch = useCallback((p: Partial<LBCFConfig>) => {
    setCfg((prev) => ({ ...prev, ...p }));
    setDirty(true);
  }, []);
  const patchFetch = useCallback((p: Partial<WeeklyLBFetch>) => {
    setFetchCfg((prev) => ({ ...prev, ...p }));
    setDirty(true);
  }, []);

  const handleSizeChange = useCallback((newSize: number) => {
    setCfg((prev) => {
      const total = prev.heard + prev.unheard;
      let newHeard: number;
      let newUnheard: number;
      if (total === 0) {
        newHeard = Math.floor(newSize / 2);
        newUnheard = newSize - newHeard;
      } else {
        newHeard = Math.round((prev.heard / total) * newSize);
        newUnheard = newSize - newHeard;
      }
      return {
        ...prev,
        size: newSize,
        heard: Math.max(0, newHeard),
        unheard: Math.max(0, newUnheard),
      };
    });
    setDirty(true);
  }, []);

  const handleHeardChange = useCallback((newHeard: number) => {
    setCfg((prev) => {
      const clamped = Math.min(prev.size, Math.max(0, newHeard));
      return {
        ...prev,
        heard: clamped,
        unheard: prev.size - clamped,
      };
    });
    setDirty(true);
  }, []);

  const handleUnheardChange = useCallback((newUnheard: number) => {
    setCfg((prev) => {
      const clamped = Math.min(prev.size, Math.max(0, newUnheard));
      return {
        ...prev,
        unheard: clamped,
        heard: prev.size - clamped,
      };
    });
    setDirty(true);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await saveLBCFConfig({
        cf_playlist_config: cfg,
        weekly_LB_fetch: fetchCfg,
      });
      if (res?.status === "ok") {
        setStatus({ msg: "Configuration saved.", ok: true });
        setDirty(false);
      } else
        setStatus({ msg: (res as any)?.reason ?? "Save failed.", ok: false });
    } catch {
      setStatus({ msg: "Network error.", ok: false });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setStatus(null);
    try {
      const res = await generateLBCFPlaylist();
      if (res?.status === "ok") {
        setStatus({
          msg: `✓ Playlist "${cfg.Name}" queued successfully.`,
          ok: true,
        });
        setCfg((prev) => ({
          ...prev,
          last_generated: Math.floor(Date.now() / 1000),
        }));
      } else
        setStatus({
          msg: (res as any)?.reason ?? "Generation failed.",
          ok: false,
        });
    } catch {
      setStatus({ msg: "Network error.", ok: false });
    } finally {
      setGenerating(false);
    }
  };

  const heardPct = cfg.size > 0 ? Math.round((cfg.heard / cfg.size) * 100) : 0;
  const unheardPct =
    cfg.size > 0 ? Math.round((cfg.unheard / cfg.size) * 100) : 0;

  if (loading)
    return (
      <div style={{ minHeight: "100vh" }}>
        <PageMeta
          title="LB Collaborative Filtering | TuneLog"
          description="Configure LB CF playlist generation"
        />
        <PageBreadcrumb pageTitle="LB Collaborative Filtering" />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 80,
          }}
        >
          <Spin color={t.accent} size={22} />
        </div>
      </div>
    );

  const LeftCol = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Stats */}
      <CardShell card={t.card} cardBorder={t.cardBorder}>
        <CardHeader
          title="Stats"
          subtitle="Last run info"
          sectionBg={t.sectionBg}
          cardBorder={t.cardBorder}
          textPrimary={t.textPrimary}
          textMuted={t.textMuted}
        />
        <div
          style={{
            padding: "16px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
          >
            <StatItem
              label="Last Generated"
              value={cfg.last_generated ? fmtUnix(cfg.last_generated) : "Never"}
              textPrimary={t.textPrimary}
              textMuted={t.textMuted}
            />
            <StatItem
              label="Last LB Sync"
              value={fmtUnix(fetchCfg.last_synced)}
              textPrimary={t.textPrimary}
              textMuted={t.textMuted}
            />
            <StatItem
              label="Playlist Size"
              value={`${cfg.size} tracks`}
              textPrimary={t.textPrimary}
              textMuted={t.textMuted}
            />
            <StatItem
              label="Users"
              value={cfg.for_users.length}
              textPrimary={t.textPrimary}
              textMuted={t.textMuted}
            />
          </div>
          <Sep border={t.cardBorder} />
          <TokenSection t={t} dark={dark} />
          <Sep border={t.cardBorder} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {cfg.unheard_genre_injection && (
              <StatusPill
                label="Unheard Genre Inject"
                color={t.green}
                bg={t.greenBg}
              />
            )}
            {cfg.heard_genre_injection && (
              <StatusPill
                label="Heard Genre Inject"
                color={t.green}
                bg={t.greenBg}
              />
            )}
            {cfg.use_blend && (
              <StatusPill
                label="Blend Fallback"
                color={t.amber}
                bg={t.amberBg}
              />
            )}
            {cfg.fallbackScore && (
              <StatusPill
                label="Score Fallback"
                color={t.amber}
                bg={t.amberBg}
              />
            )}
            {cfg.backfill_unheard_song && (
              <StatusPill label="Backfill On" color={t.green} bg={t.greenBg} />
            )}
          </div>
        </div>
      </CardShell>

      <CardShell card={t.card} cardBorder={t.cardBorder}>
        <CardHeader
          title="Automation"
          subtitle="Scheduled generation & LB fetch"
          sectionBg={t.sectionBg}
          cardBorder={t.cardBorder}
          textPrimary={t.textPrimary}
          textMuted={t.textMuted}
        />
        <div
          style={{
            padding: "16px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div
            style={{
              background: `${t.accent}10`,
              border: `1px solid ${t.accent}30`,
              borderRadius: 10,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: t.accent,
                  margin: 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                }}
              >
                Next Run In
              </p>
              <p
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: t.accent,
                  margin: "2px 0 0",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {nextRunLabel(cfg.auto_generate_time)}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p
                style={{
                  fontSize: 10,
                  color: t.textMuted,
                  margin: 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                }}
              >
                Scheduled at
              </p>
              <p
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: t.textPrimary,
                  margin: "2px 0 0",
                }}
              >
                {pad2(cfg.auto_generate_time)}:00
              </p>
            </div>
          </div>

          <SectionLabel color={t.textMuted}>Generation Schedule</SectionLabel>
          <Row
            label="Auto-generate Time"
            hint="24-hour clock, hour of day"
            textPrimary={t.textPrimary}
            textMuted={t.textMuted}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <NumInput
                value={cfg.auto_generate_time}
                onChange={(v) =>
                  patch({ auto_generate_time: Math.min(23, Math.max(0, v)) })
                }
                min={0}
                max={23}
                width={60}
                inputBg={t.inputBg}
                inputBorder={t.inputBorder}
                textPrimary={t.textPrimary}
                accent={t.accent}
              />
              <span style={{ fontSize: 12, color: t.textMuted }}>:00</span>
            </div>
          </Row>

          <Sep border={t.cardBorder} />
          <SectionLabel color={t.textMuted}>Weekly LB Fetch</SectionLabel>
          <Row
            label="Retry Interval"
            hint="Hours to wait before re-checking if LB hasn't updated yet"
            textPrimary={t.textPrimary}
            textMuted={t.textMuted}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <NumInput
                value={fetchCfg.check_interval}
                onChange={(v) => patchFetch({ check_interval: v })}
                min={1}
                max={48}
                width={60}
                inputBg={t.inputBg}
                inputBorder={t.inputBorder}
                textPrimary={t.textPrimary}
                accent={t.accent}
              />
              <span style={{ fontSize: 12, color: t.textMuted }}>hrs</span>
            </div>
          </Row>
          <div
            style={{
              background: dark ? "#1a1a1f" : "#f5f5f2",
              borderRadius: 9,
              padding: "10px 12px",
              fontSize: 11,
              color: t.textMuted,
              lineHeight: 1.6,
            }}
          >
            If ListenBrainz hasn't updated its CF recommendations on the
            expected day, TuneLog will retry every{" "}
            <strong style={{ color: t.textSecondary }}>
              {fetchCfg.check_interval}h
            </strong>{" "}
            until new data is available.
          </div>
        </div>
      </CardShell>
    </div>
  );

  const RightCol = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CardShell card={t.card} cardBorder={t.cardBorder}>
        <CardHeader
          title="Playlist Options"
          subtitle="Name, size, and bucket configuration"
          sectionBg={t.sectionBg}
          cardBorder={t.cardBorder}
          textPrimary={t.textPrimary}
          textMuted={t.textMuted}
        />
        <div style={{ padding: "16px 16px" }}>
          <SectionLabel color={t.textMuted}>Identity</SectionLabel>
          <Row
            label="Playlist Name"
            textPrimary={t.textPrimary}
            textMuted={t.textMuted}
          >
            <input
              type="text"
              value={cfg.Name}
              onChange={(e) => patch({ Name: e.target.value })}
              style={{
                width: 200,
                padding: "7px 12px",
                borderRadius: 8,
                border: `1px solid ${t.inputBorder}`,
                background: t.inputBg,
                color: t.textPrimary,
                fontSize: 13,
                outline: "none",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = t.accent)}
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = t.inputBorder)
              }
            />
          </Row>

          <Sep border={t.cardBorder} />
          <SectionLabel color={t.textMuted}>Bucket Sizes</SectionLabel>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              <div
                style={{
                  flex: cfg.heard,
                  height: 8,
                  borderRadius: 4,
                  background: t.accent,
                  transition: "flex .3s",
                }}
              />
              <div
                style={{
                  flex: cfg.unheard,
                  height: 8,
                  borderRadius: 4,
                  background: dark ? "#3a3a44" : "#d0d0ca",
                  transition: "flex .3s",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              <span style={{ fontSize: 10, color: t.accent, fontWeight: 600 }}>
                ● Heard {heardPct}%
              </span>
              <span
                style={{ fontSize: 10, color: t.textMuted, fontWeight: 600 }}
              >
                ● Unheard {unheardPct}%
              </span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Row
              label="Total Size"
              hint="Changing this scales heard & unheard proportionally"
              textPrimary={t.textPrimary}
              textMuted={t.textMuted}
            >
              <NumInput
                value={cfg.size}
                onChange={handleSizeChange}
                min={1}
                max={200}
                inputBg={t.inputBg}
                inputBorder={t.inputBorder}
                textPrimary={t.textPrimary}
                accent={t.accent}
              />
            </Row>
            <Row
              label="Heard Bucket"
              hint="Adjusting this shifts unheard to compensate"
              textPrimary={t.textPrimary}
              textMuted={t.textMuted}
            >
              <NumInput
                value={cfg.heard}
                onChange={handleHeardChange}
                min={0}
                max={cfg.size}
                inputBg={t.inputBg}
                inputBorder={t.inputBorder}
                textPrimary={t.textPrimary}
                accent={t.accent}
              />
            </Row>
            <Row
              label="Unheard Bucket"
              hint="Adjusting this shifts heard to compensate"
              textPrimary={t.textPrimary}
              textMuted={t.textMuted}
            >
              <NumInput
                value={cfg.unheard}
                onChange={handleUnheardChange}
                min={0}
                max={cfg.size}
                inputBg={t.inputBg}
                inputBorder={t.inputBorder}
                textPrimary={t.textPrimary}
                accent={t.accent}
              />
            </Row>
          </div>

          <Sep border={t.cardBorder} />
          <SectionLabel color={t.textMuted}>Genre Injection</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Row
              label="Unheard Genre Injection"
              hint="Fill unheard bucket with songs from your most-listened genres"
              textPrimary={t.textPrimary}
              textMuted={t.textMuted}
            >
              <Toggle
                value={cfg.unheard_genre_injection}
                onChange={(v) => patch({ unheard_genre_injection: v })}
                accent={t.accent}
                dark={dark}
              />
            </Row>
            <Row
              label="Heard Genre Injection"
              hint="Fill heard bucket with songs from your most-listened genres"
              textPrimary={t.textPrimary}
              textMuted={t.textMuted}
            >
              <Toggle
                value={cfg.heard_genre_injection}
                onChange={(v) => patch({ heard_genre_injection: v })}
                accent={t.accent}
                dark={dark}
              />
            </Row>
          </div>
        </div>
      </CardShell>

      <CardShell card={t.card} cardBorder={t.cardBorder}>
        <CardHeader
          title="Fallback & Fill Behaviour"
          subtitle="What to do when CF doesn't have enough tracks"
          sectionBg={t.sectionBg}
          cardBorder={t.cardBorder}
          textPrimary={t.textPrimary}
          textMuted={t.textMuted}
        />
        <div
          style={{
            padding: "16px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <Row
            label="Backfill Unheard with Heard"
            hint="If unheard bucket can't be filled, pull from heard songs instead"
            textPrimary={t.textPrimary}
            textMuted={t.textMuted}
          >
            <Toggle
              value={cfg.backfill_unheard_song}
              onChange={(v) => patch({ backfill_unheard_song: v })}
              accent={t.accent}
              dark={dark}
            />
          </Row>
          <Row
            label="Use TuneLog Blend Fallback"
            hint="If CF doesn't have enough songs, supplement from your TuneLog Blend"
            textPrimary={t.textPrimary}
            textMuted={t.textMuted}
          >
            <Toggle
              value={cfg.use_blend}
              onChange={(v) => patch({ use_blend: v })}
              accent={t.accent}
              dark={dark}
            />
          </Row>
          <Row
            label="Fallback Score"
            hint="If score reaches absolute lowest, generate from all-time top instead of failing"
            textPrimary={t.textPrimary}
            textMuted={t.textMuted}
          >
            <Toggle
              value={cfg.fallbackScore}
              onChange={(v) => patch({ fallbackScore: v })}
              accent={t.accent}
              dark={dark}
            />
          </Row>
          <Sep border={t.cardBorder} />
          <SectionLabel color={t.textMuted}>Score Thresholds</SectionLabel>
          <Row
            label="Heard Last Score"
            hint="Last minimum score used for heard bucket"
            textPrimary={t.textPrimary}
            textMuted={t.textMuted}
          >
            <NumInput
              value={cfg.heard_last_score}
              onChange={(v) => patch({ heard_last_score: v })}
              min={0}
              inputBg={t.inputBg}
              inputBorder={t.inputBorder}
              textPrimary={t.textPrimary}
              accent={t.accent}
            />
          </Row>
          <Row
            label="Unheard Last Score"
            hint="Last minimum score used for unheard bucket"
            textPrimary={t.textPrimary}
            textMuted={t.textMuted}
          >
            <NumInput
              value={cfg.unheard_last_score}
              onChange={(v) => patch({ unheard_last_score: v })}
              min={0}
              inputBg={t.inputBg}
              inputBorder={t.inputBorder}
              textPrimary={t.textPrimary}
              accent={t.accent}
            />
          </Row>
        </div>
      </CardShell>

      <CardShell card={t.card} cardBorder={t.cardBorder}>
        <CardHeader
          title="Target Users"
          subtitle="Generate playlist for these Navidrome users"
          sectionBg={t.sectionBg}
          cardBorder={t.cardBorder}
          textPrimary={t.textPrimary}
          textMuted={t.textMuted}
        />
        <div style={{ padding: "16px 16px" }}>
          <UserChips
            users={cfg.for_users}
            onChange={(u) => patch({ for_users: u })}
            accent={t.accent}
            card={t.card}
            cardBorder={t.cardBorder}
            textPrimary={t.textPrimary}
            textMuted={t.textMuted}
            inputBg={t.inputBg}
            inputBorder={t.inputBorder}
          />
        </div>
      </CardShell>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh" }}>
      <style>{`@keyframes lbcfspin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <PageMeta
        title="LB Collaborative Filtering | TuneLog"
        description="Configure LB CF playlist generation"
      />
      <PageBreadcrumb pageTitle="LB Collaborative Filtering" />

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            background: t.card,
            border: `1px solid ${t.cardBorder}`,
            borderRadius: 14,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: t.textPrimary,
                margin: 0,
              }}
            >
              Collaborative Filtering Playlist
            </p>
            <p style={{ fontSize: 11, color: t.textMuted, margin: "2px 0 0" }}>
              ListenBrainz CF recommendations → Navidrome playlist
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {dirty && (
              <StatusPill
                label="Unsaved changes"
                color={t.amber}
                bg={t.amberBg}
              />
            )}
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              style={{
                padding: "8px 18px",
                borderRadius: 9,
                border: "none",
                cursor: saving || !dirty ? "not-allowed" : "pointer",
                background:
                  saving || !dirty
                    ? dark
                      ? "#2a2a30"
                      : "#e0e0dc"
                    : t.accentGrad,
                color: saving || !dirty ? t.textMuted : "#fff",
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 7,
                transition: "all .2s",
              }}
            >
              {saving ? (
                <>
                  <Spin color={t.textMuted} size={12} /> Saving…
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
                    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  Save Config
                </>
              )}
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                padding: "8px 18px",
                borderRadius: 9,
                border: `1px solid ${t.cardBorder}`,
                cursor: generating ? "not-allowed" : "pointer",
                background: dark ? "#1a1a1f" : "#f0f0ec",
                color: generating ? t.textMuted : t.textPrimary,
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 7,
                transition: "all .2s",
              }}
            >
              {generating ? (
                <>
                  <Spin color={t.accent} size={12} /> Generating…
                </>
              ) : (
                <>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={t.accent}
                    strokeWidth="2.5"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Generate Now
                </>
              )}
            </button>
          </div>
        </div>

        {status && (
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              margin: 0,
              padding: "0 2px",
              color: status.ok ? t.green : t.red,
            }}
          >
            {status.msg}
          </p>
        )}

        {isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {LeftCol}
            {RightCol}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isLarge ? "340px 1fr" : "300px 1fr",
              gap: 20,
              alignItems: "start",
            }}
          >
            {LeftCol}
            {RightCol}
          </div>
        )}
      </div>
    </div>
  );
}
