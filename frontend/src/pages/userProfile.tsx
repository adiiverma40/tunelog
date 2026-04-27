import { useState, useEffect, useRef } from "react";
import { useLocation, useParams } from "react-router";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import { Modal } from "../components/ui/modal";
import Button from "../components/ui/button/Button";
import Input from "../components/form/input/InputField";
import Label from "../components/form/Label";
import {
  fetchUserProfile,
  fetchUpdateProfile,
  UserProfileResponse,
  getSong,
  getCoverArtUrl,
} from "../API/API";

const formatDate = (raw: string | undefined) => {
  if (!raw || raw === "never") return "No activity";
  const date = new Date(raw.replace(" ", "T"));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const SIGNAL_CONFIG: Record<
  string,
  {
    label: string;
    color: string;
    lightBg: string;
    darkBg: string;
    lightText: string;
    darkText: string;
    barColor: string;
  }
> = {
  skip: {
    label: "Skip",
    color: "#E24B4A",
    lightBg: "#FCEBEB",
    darkBg: "rgba(226,75,74,0.15)",
    lightText: "#A32D2D",
    darkText: "#F09595",
    barColor: "#E24B4A",
  },
  partial: {
    label: "Partial",
    color: "#EF9F27",
    lightBg: "#FAEEDA",
    darkBg: "rgba(239,159,39,0.15)",
    lightText: "#854F0B",
    darkText: "#FAC775",
    barColor: "#EF9F27",
  },
  positive: {
    label: "Complete",
    color: "#639922",
    lightBg: "#EAF3DE",
    darkBg: "rgba(99,153,34,0.15)",
    lightText: "#3B6D11",
    darkText: "#97C459",
    barColor: "#639922",
  },
  repeat: {
    label: "Repeat",
    color: "#7F77DD",
    lightBg: "#EEEDFE",
    darkBg: "rgba(127,119,221,0.15)",
    lightText: "#534AB7",
    darkText: "#AFA9EC",
    barColor: "#7F77DD",
  },
};

const GENRE_COLORS = [
  "#7F77DD",
  "#5DCAA5",
  "#D85A30",
  "#D4537E",
  "#378ADD",
  "#639922",
  "#BA7517",
  "#E24B4A",
];
const AVATAR_COLORS = [
  { from: "#7F77DD", to: "#534AB7" },
  { from: "#5DCAA5", to: "#0F6E56" },
  { from: "#D85A30", to: "#993C1D" },
  { from: "#D4537E", to: "#993356" },
  { from: "#378ADD", to: "#185FA5" },
];

function getAvatarColor(username: string) {
  return AVATAR_COLORS[(username?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];
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

function getLocalAvatar(username: string): string | null {
  try {
    const cache = JSON.parse(
      localStorage.getItem("tunelog_users_cache") ?? "[]",
    );
    return (
      cache.find((u: any) => u.username === username)?.avatarUrl ??
      localStorage.getItem(`tunelog_avatar_${username}`) ??
      null
    );
  } catch {
    return localStorage.getItem(`tunelog_avatar_${username}`) ?? null;
  }
}

function getLocalDisplayName(username: string): string {
  try {
    const cache = JSON.parse(
      localStorage.getItem("tunelog_users_cache") ?? "[]",
    );
    return (
      cache.find((u: any) => u.username === username)?.name ??
      localStorage.getItem(`tunelog_displayname_${username}`) ??
      username
    );
  } catch {
    return localStorage.getItem(`tunelog_displayname_${username}`) ?? username;
  }
}

function UserAvatar({
  username,
  avatarUrl,
  size = 56,
}: {
  username: string;
  avatarUrl: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const col = getAvatarColor(username);
  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={username}
        onError={() => setFailed(true)}
        className="object-cover rounded-2xl flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-2xl flex items-center justify-center flex-shrink-0 font-bold text-white"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${col.from}, ${col.to})`,
        fontSize: size * 0.3,
      }}
    >
      {username.slice(0, 2).toUpperCase()}
    </div>
  );
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
        className="object-cover rounded-lg flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-100 dark:bg-gray-800"
      style={{ width: size, height: size }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="text-gray-400"
        style={{ width: size * 0.45, height: size * 0.45 }}
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
  const s = SIGNAL_CONFIG[signal] ?? SIGNAL_CONFIG["partial"];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold"
      style={{
        backgroundColor: dark ? s.darkBg : s.lightBg,
        color: dark ? s.darkText : s.lightText,
      }}
    >
      {s.label}
    </span>
  );
}

function BarRow({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 text-xs text-gray-500 dark:text-gray-400 truncate flex-shrink-0">
        {label}
      </span>
      <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-7 text-xs text-gray-400 text-right flex-shrink-0 tabular-nums">
        {value}
      </span>
    </div>
  );
}

interface EditProfileModalProps {
  isOpen: boolean;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  onSave: (displayName: string, avatarFile: File | null) => Promise<void>;
  onClose: () => void;
}

function EditProfileModal({
  isOpen,
  username,
  displayName,
  avatarUrl,
  onSave,
  onClose,
}: EditProfileModalProps) {
  const [name, setName] = useState(displayName);
  const [previewUrl, setPreviewUrl] = useState<string | null>(avatarUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPreviewUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await onSave(name.trim(), selectedFile);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[400px] m-4">
      <div className="no-scrollbar relative w-full max-w-[400px] overflow-y-auto rounded-3xl bg-white p-6 dark:bg-gray-900">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90">
          Edit Profile
        </h3>
        <div className="mb-5 flex flex-col items-center gap-3">
          <div className="relative">
            <UserAvatar username={username} avatarUrl={previewUrl} size={80} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting}
              className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-brand-500 text-white shadow dark:border-gray-900 disabled:opacity-50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3.5 w-3.5"
              >
                <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          {previewUrl && (
            <button
              onClick={() => {
                setPreviewUrl(null);
                setSelectedFile(null);
              }}
              disabled={isSubmitting}
              className="text-xs text-gray-400 hover:text-red-400 transition-colors"
            >
              Remove photo
            </button>
          )}
        </div>
        <div className="mb-2">
          <Label>Display Name</Label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            placeholder={username}
          />
        </div>
        <p className="mb-6 text-xs text-gray-400">
          Username:{" "}
          <span className="font-medium text-gray-600 dark:text-gray-300">
            @{username}
          </span>{" "}
          (cannot be changed)
        </p>
        <div className="flex gap-3">
          <Button
            onClick={onClose}
            disabled={isSubmitting}
            variant="outline"
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || isSubmitting}
            className="flex-1"
          >
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function UserProfilePage() {
  const { username } = useParams<{ username: string }>();
  const location = useLocation();
  // const navigate = useNavigate();
  const password = (location.state as { password?: string })?.password ?? "";
  const dark = useDarkMode();

  const [data, setData] = useState<UserProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [coverArtMap, setCoverArtMap] = useState<Record<string, string>>({});

  const currentUser = localStorage.getItem("tunelog_user") ?? "";
  const isOwnProfile = currentUser === username;
  const isHost = localStorage.getItem("isHost") === "true";

  const [displayName, setDisplayName] = useState<string>(() =>
    getLocalDisplayName(username ?? ""),
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() =>
    getLocalAvatar(username ?? ""),
  );

  const isAdmin = (() => {
    try {
      const cache = JSON.parse(
        localStorage.getItem("tunelog_users_cache") ?? "[]",
      );
      return cache.find((u: any) => u.username === username)?.isAdmin ?? false;
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    if (!username) return;
    fetchUserProfile(username, password)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [username, password]);

  useEffect(() => {
    if (!data) return;

    const topIds = (data.topSongs ?? []).map((s) => s.id).filter(Boolean);
    const historyIds = (data.recentHistory ?? [])
      .map((h) => h.id)
      .filter(Boolean);
    const uniqueIds = [...new Set([...topIds, ...historyIds])];
    if (!uniqueIds.length) return;

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
  }, [data]);

  async function handleSaveProfile(newName: string, avatarFile: File | null) {
    if (!username) return;
    try {
      const response = await fetchUpdateProfile({
        username,
        displayName: newName,
        avatar: avatarFile,
      });
      if (response.status === "success" && response.user) {
        setDisplayName(response.user.displayName);
        if (response.user.avatarUrl) {
          setAvatarUrl(response.user.avatarUrl);
          localStorage.setItem(
            `tunelog_avatar_${username}`,
            response.user.avatarUrl,
          );
        }
        localStorage.setItem(
          `tunelog_displayname_${username}`,
          response.user.displayName,
        );
        setShowEditModal(false);
      }
    } catch {
      alert("Failed to update profile.");
    }
  }

  const totalSignals =
    (data?.skips ?? 0) +
    (data?.partial ?? 0) +
    (data?.complete ?? 0) +
    (data?.repeat ?? 0);
  const signalPct = (v: number) =>
    totalSignals > 0 ? Math.round((v / totalSignals) * 100) : 0;
  const maxArtist = Math.max(...(data?.topArtists?.map((a) => a.count) ?? [1]));
  const maxGenre = Math.max(...(data?.topGenres?.map((g) => g.count) ?? [1]));

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800" />
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 xl:col-span-4 space-y-4">
            {[160, 220, 180, 180].map((h, i) => (
              <div
                key={i}
                className="rounded-2xl bg-gray-100 dark:bg-gray-800"
                style={{ height: h }}
              />
            ))}
          </div>
          <div className="col-span-12 xl:col-span-8 space-y-4">
            <div className="h-64 rounded-2xl bg-gray-100 dark:bg-gray-800" />
            <div className="h-96 rounded-2xl bg-gray-100 dark:bg-gray-800" />
          </div>
        </div>
      </div>
    );
  }

  const accentColor = getAvatarColor(username ?? "");

  return (
    <>
      <PageMeta
        title={`${displayName} | TuneLog`}
        description={`Profile for ${username}`}
      />
      <PageBreadcrumb pageTitle={displayName} />

      <div className="space-y-5">
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
          <div
            className="h-1"
            style={{
              background: `linear-gradient(90deg, ${accentColor.from}, ${accentColor.to}, #5DCAA5)`,
            }}
          />
          <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="relative flex-shrink-0">
              <UserAvatar
                username={username ?? ""}
                avatarUrl={avatarUrl}
                size={72}
              />
              {isOwnProfile && (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-brand-500 text-white shadow dark:border-gray-900"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-3 w-3"
                  >
                    <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z" />
                  </svg>
                </button>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-gray-800 dark:text-white/90">
                  {displayName}
                </h1>
                {isAdmin && (
                  <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Admin
                  </span>
                )}
                {isHost && isOwnProfile && (
                  <span className="rounded-md bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-500">
                    Host
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400">@{username}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Last active · {formatDate(data?.lastLogged)}
              </p>
            </div>
            <div className="flex items-stretch gap-px rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800 flex-shrink-0">
              {[
                {
                  label: "Listens",
                  value: data?.totalListens ?? 0,
                  color: undefined,
                },
                {
                  label: "Skips",
                  value: data?.skips ?? 0,
                  color: SIGNAL_CONFIG.skip.color,
                },
                {
                  label: "Complete",
                  value: data?.complete ?? 0,
                  color: SIGNAL_CONFIG.positive.color,
                },
                {
                  label: "Repeats",
                  value: data?.repeat ?? 0,
                  color: SIGNAL_CONFIG.repeat.color,
                },
              ].map((s, i, arr) => (
                <div
                  key={s.label}
                  className={`px-4 py-3 text-center bg-gray-50 dark:bg-gray-800/60 ${i < arr.length - 1 ? "border-r border-gray-100 dark:border-gray-800" : ""}`}
                >
                  <p
                    className="text-lg font-bold tabular-nums text-gray-800 dark:text-white/90"
                    style={s.color ? { color: s.color } : undefined}
                  >
                    {s.value.toLocaleString()}
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mt-0.5">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
            {isOwnProfile && (
              <button
                onClick={() => setShowEditModal(true)}
                className="flex-shrink-0 self-start sm:self-center rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:border-brand-500 hover:text-brand-500 transition-colors"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 xl:col-span-4 space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-5">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-white/80 mb-4">
                Signal Breakdown
              </h4>
              <div className="grid grid-cols-2 gap-3 mb-5">
                {[
                  { key: "skip", val: data?.skips ?? 0 },
                  { key: "partial", val: data?.partial ?? 0 },
                  { key: "positive", val: data?.complete ?? 0 },
                  { key: "repeat", val: data?.repeat ?? 0 },
                ].map(({ key, val }) => {
                  const s = SIGNAL_CONFIG[key];
                  const pct = signalPct(val);
                  return (
                    <div
                      key={key}
                      className="rounded-xl p-4"
                      style={{ backgroundColor: dark ? s.darkBg : s.lightBg }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: dark ? s.darkText : s.lightText }}
                        >
                          {s.label}
                        </span>
                        <span
                          className="text-[10px] tabular-nums"
                          style={{
                            color: dark ? s.darkText : s.lightText,
                            opacity: 0.65,
                          }}
                        >
                          {pct}%
                        </span>
                      </div>
                      <p
                        className="text-xl font-bold tabular-nums"
                        style={{ color: dark ? s.darkText : s.lightText }}
                      >
                        {val.toLocaleString()}
                      </p>
                      <div
                        className="mt-2 h-0.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: `${s.color}28` }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: s.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                {[
                  { label: "Skip", value: data?.skips ?? 0, key: "skip" },
                  {
                    label: "Partial",
                    value: data?.partial ?? 0,
                    key: "partial",
                  },
                  {
                    label: "Complete",
                    value: data?.complete ?? 0,
                    key: "positive",
                  },
                  { label: "Repeat", value: data?.repeat ?? 0, key: "repeat" },
                ].map((r) => (
                  <BarRow
                    key={r.label}
                    label={r.label}
                    value={r.value}
                    max={totalSignals}
                    color={SIGNAL_CONFIG[r.key].barColor}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-5">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-white/80 mb-4">
                Top Artists
              </h4>
              <div className="space-y-3">
                {(data?.topArtists ?? []).slice(0, 8).map((a, i) => (
                  <BarRow
                    key={i}
                    label={a.artist}
                    value={a.count}
                    max={maxArtist}
                    color="#7F77DD"
                  />
                ))}
                {(!data?.topArtists || data.topArtists.length === 0) && (
                  <p className="text-xs text-gray-400 italic">No data yet.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 p-5">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-white/80 mb-4">
                Genre Breakdown
              </h4>
              <div className="space-y-3">
                {(data?.topGenres ?? []).slice(0, 8).map((g, i) => (
                  <BarRow
                    key={i}
                    label={g.genre}
                    value={g.count}
                    max={maxGenre}
                    color={GENRE_COLORS[i % GENRE_COLORS.length]}
                  />
                ))}
                {(!data?.topGenres || data.topGenres.length === 0) && (
                  <p className="text-xs text-gray-400 italic">No data yet.</p>
                )}
              </div>
            </div>
          </div>

          <div className="col-span-12 xl:col-span-8 space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
              <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-white/80">
                  Most Played Songs
                </h4>
                <p className="text-xs text-gray-400 mt-0.5">
                  Top by play count · click to see full breakdown
                </p>
              </div>
              <div className="p-3">
                {(data?.topSongs ?? []).slice(0, 8).map((song, i) => (
                  <button
                    key={i}
                    // onClick={() =>
                    //   navigate(`/song/${song.id}`, { state: { song } })
                    // }
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left group"
                  >
                    <span className="w-5 text-xs text-gray-300 dark:text-gray-600 text-right flex-shrink-0 tabular-nums">
                      {i + 1}
                    </span>
                    <AlbumArt
                      coverArtId={coverArtMap[song.id] ?? null}
                      title={song.title}
                      size={40}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90 truncate group-hover:text-brand-500 transition-colors">
                        {song.title}
                      </p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {song.artist}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <SignalPill signal={song.signal} dark={dark} />
                      <span className="text-sm font-semibold text-gray-600 dark:text-gray-300 tabular-nums w-10 text-right">
                        {song.count}
                        <span className="text-xs font-normal text-gray-400">
                          ×
                        </span>
                      </span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 group-hover:text-brand-500 transition-colors"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </button>
                ))}
                {(!data?.topSongs || data.topSongs.length === 0) && (
                  <p className="text-xs text-gray-400 px-3 py-4 italic">
                    No song data yet.
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-white/80">
                    Listen History
                  </h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {data?.recentHistory?.length ?? 0} recent listens
                  </p>
                </div>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-green-600 dark:text-green-500">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Live
                </span>
              </div>
              <div
                className="overflow-x-auto overflow-y-auto"
                style={{ maxHeight: "480px" }}
              >
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-50 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-800">
                      {["#", "Song", "Genre", "Signal", "Listened At"].map(
                        (h) => (
                          <th
                            key={h}
                            className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 first:pl-6 whitespace-nowrap ${
                              ["#", "Genre", "Listened At"].includes(h)
                                ? "hidden sm:table-cell"
                                : ""
                            }`}
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
                    {(data?.recentHistory ?? []).map((h, i) => (
                      <tr
                        key={i}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors cursor-pointer"
                        // onClick={() =>
                        //   navigate(`/song/${h.id}`, { state: { song: h } })
                        // }
                      >
                        <td className="hidden sm:table-cell pl-6 pr-2 py-3 text-xs text-gray-300 dark:text-gray-600 tabular-nums">
                          {i + 1}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-3">
                            <AlbumArt
                              coverArtId={coverArtMap[h.id] ?? null}
                              title={h.title}
                              size={36}
                            />
                            <div className="min-w-0">
                              <p className="font-medium text-gray-800 dark:text-white/90 truncate max-w-[180px] hover:text-brand-500 transition-colors">
                                {h.title}
                              </p>
                              <p className="text-xs text-gray-400 truncate max-w-[180px] mt-0.5">
                                {h.artist}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3 text-xs text-gray-500 dark:text-gray-400 capitalize">
                          {h.genre || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <SignalPill signal={h.signal} dark={dark} />
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3 text-xs text-gray-400 whitespace-nowrap tabular-nums">
                          {formatDate(h.listened_at)}
                        </td>
                      </tr>
                    ))}
                    {(!data?.recentHistory ||
                      data.recentHistory.length === 0) && (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-12 text-center text-sm text-gray-400 italic"
                        >
                          No listen history yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <EditProfileModal
        isOpen={showEditModal}
        username={username ?? ""}
        displayName={displayName}
        avatarUrl={avatarUrl}
        onSave={handleSaveProfile}
        onClose={() => setShowEditModal(false)}
      />
    </>
  );
}
