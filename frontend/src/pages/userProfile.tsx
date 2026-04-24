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

const SIGNAL_STYLE: Record<
  string,
  { color: string; bg: string; border: string; label: string; bar: string }
> = {
  skip: {
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    label: "Skip",
    bar: "bg-red-400",
  },
  partial: {
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
    label: "Partial",
    bar: "bg-yellow-400",
  },
  positive: {
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
    label: "Complete",
    bar: "bg-green-400",
  },
  repeat: {
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    label: "Repeat",
    bar: "bg-purple-400",
  },
};

const GENRE_COLORS = [
  "bg-blue-400",
  "bg-purple-400",
  "bg-green-400",
  "bg-yellow-400",
  "bg-pink-400",
  "bg-cyan-400",
  "bg-orange-400",
  "bg-indigo-400",
  "bg-rose-400",
  "bg-teal-400",
];

const AVATAR_GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-purple-500 to-pink-600",
  "from-green-500 to-teal-600",
  "from-orange-500 to-red-600",
  "from-cyan-500 to-blue-600",
];

function getAvatarGradient(username: string) {
  return AVATAR_GRADIENTS[
    (username?.charCodeAt(0) ?? 0) % AVATAR_GRADIENTS.length
  ];
}

const SignalPill = ({ signal }: { signal: string }) => {
  const s = SIGNAL_STYLE[signal] ?? SIGNAL_STYLE["partial"];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${s.bg} ${s.border} ${s.color}`}
    >
      {s.label}
    </span>
  );
};

const BarRow = ({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) => {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 text-xs text-gray-600 dark:text-gray-400 truncate flex-shrink-0">
        {label}
      </span>
      <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-1.5 rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-xs text-gray-400 text-right flex-shrink-0">
        {value}
      </span>
    </div>
  );
};

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

  const gradient = getAvatarGradient(username);
  const initials = username.slice(0, 2).toUpperCase();

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
    } catch (error) {
      console.error("Failed to save profile:", error);
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
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="avatar"
                className="h-20 w-20 rounded-2xl object-cover"
              />
            ) : (
              <div
                className={`h-20 w-20 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center`}
              >
                <span className="text-2xl font-bold text-white">
                  {initials}
                </span>
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting}
              className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-brand-500 text-white shadow dark:border-gray-900 disabled:opacity-50"
              title="Change photo"
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
              className="text-xs text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              Remove photo
            </button>
          )}
        </div>

        <div className="mb-2 text-left">
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
  const password = (location.state as { password?: string })?.password ?? "";

  const [data, setData] = useState<UserProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);

  const currentUser = localStorage.getItem("tunelog_user") ?? "";
  const isOwnProfile = currentUser === username;
  const isHost = localStorage.getItem("isHost") === "true";

  const [displayName, setDisplayName] = useState<string>(username ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;

    const savedName = localStorage.getItem(`tunelog_displayname_${username}`);
    const savedAvatar = localStorage.getItem(`tunelog_avatar_${username}`);
    if (savedName) setDisplayName(savedName);
    if (savedAvatar) setAvatarUrl(savedAvatar);

    fetchUserProfile(username, password)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [username, password]);

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
    } catch (error) {
      console.error("Error updating profile:", error);
      alert("Failed to update profile. Please try again.");
    }
  }

  const gradient = getAvatarGradient(username ?? "");
  const initials = (username ?? "??").slice(0, 2).toUpperCase();

  const totalSignals =
    (data?.skips ?? 0) +
    (data?.partial ?? 0) +
    (data?.complete ?? 0) +
    (data?.repeat ?? 0);
  const signalPct = (val: number) =>
    totalSignals > 0 ? Math.round((val / totalSignals) * 100) : 0;
  const maxArtist = Math.max(...(data?.topArtists?.map((a) => a.count) ?? [1]));
  const maxGenre = Math.max(...(data?.topGenres?.map((g) => g.count) ?? [1]));

  if (loading) {
    return (
      <>
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 xl:col-span-4 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-36 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02] animate-pulse"
              />
            ))}
          </div>
          <div className="col-span-12 xl:col-span-8">
            <div className="h-[600px] rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02] animate-pulse" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageMeta
        title={`${username} | TuneLog`}
        description={`Profile for ${username}`}
      />
      <PageBreadcrumb pageTitle={username ?? "User Profile"} />

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 xl:col-span-4 space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-start gap-4 mb-5">
              <div className="relative flex-shrink-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="avatar"
                    className="h-14 w-14 rounded-2xl object-cover"
                  />
                ) : (
                  <div
                    className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center`}
                  >
                    <span className="text-white text-lg font-bold">
                      {initials}
                    </span>
                  </div>
                )}
                {isOwnProfile && (
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-brand-500 text-white shadow dark:border-gray-900"
                    title="Edit profile"
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

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-white/90 truncate">
                    {displayName}
                  </h2>
                  {isHost && isOwnProfile && (
                    <span className="flex-shrink-0 rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-500">
                      Host
                    </span>
                  )}
                  {(() => {
                    try {
                      const cache = JSON.parse(
                        localStorage.getItem("tunelog_users_cache") ?? "[]",
                      );
                      const user = cache.find(
                        (u: any) => u.username === username,
                      );
                      return user?.isAdmin ? (
                        <span className="flex-shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-500">
                          Admin
                        </span>
                      ) : null;
                    } catch {
                      return null;
                    }
                  })()}
                </div>
                <p className="text-xs text-gray-400">@{username}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Last active: {formatDate(data?.lastLogged)}
                </p>
              </div>

              {isOwnProfile && (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="flex-shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:border-brand-500 hover:text-brand-500 dark:border-gray-700 dark:text-gray-400"
                >
                  Edit
                </button>
              )}
            </div>

            <div className="rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-gray-800 p-4 text-center mb-3">
              <p className="text-3xl font-bold text-gray-800 dark:text-white/90">
                {data?.totalListens ?? 0}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Total Listens</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Skips", value: data?.skips, color: "text-red-400" },
                {
                  label: "Partial",
                  value: data?.partial,
                  color: "text-yellow-400",
                },
                {
                  label: "Complete",
                  value: data?.complete,
                  color: "text-green-400",
                },
                {
                  label: "Repeats",
                  value: data?.repeat,
                  color: "text-purple-400",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-gray-800 p-3 text-center"
                >
                  <p className={`text-xl font-bold ${s.color}`}>
                    {s.value ?? 0}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-white/80 mb-4">
              Signal Breakdown
            </h4>
            <div className="space-y-3">
              {[
                { label: "Skip", value: data?.skips ?? 0, signal: "skip" },
                {
                  label: "Partial",
                  value: data?.partial ?? 0,
                  signal: "partial",
                },
                {
                  label: "Complete",
                  value: data?.complete ?? 0,
                  signal: "positive",
                },
                { label: "Repeat", value: data?.repeat ?? 0, signal: "repeat" },
              ].map((r) => (
                <BarRow
                  key={r.label}
                  label={r.label}
                  value={r.value}
                  max={totalSignals}
                  color={SIGNAL_STYLE[r.signal].bar}
                />
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 text-center">
              {[
                {
                  label: "Skip",
                  pct: signalPct(data?.skips ?? 0),
                  color: "text-red-400",
                },
                {
                  label: "Partial",
                  pct: signalPct(data?.partial ?? 0),
                  color: "text-yellow-400",
                },
                {
                  label: "Complete",
                  pct: signalPct(data?.complete ?? 0),
                  color: "text-green-400",
                },
                {
                  label: "Repeat",
                  pct: signalPct(data?.repeat ?? 0),
                  color: "text-purple-400",
                },
              ].map((p) => (
                <div key={p.label}>
                  <p className={`text-sm font-bold ${p.color}`}>{p.pct}%</p>
                  <p className="text-xs text-gray-400">{p.label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-white/80 mb-4">
              Top Artists
            </h4>
            <div className="space-y-2.5">
              {(data?.topArtists ?? []).slice(0, 8).map((a, i) => (
                <BarRow
                  key={i}
                  label={a.artist}
                  value={a.count}
                  max={maxArtist}
                  color="bg-brand-500"
                />
              ))}
              {(!data?.topArtists || data.topArtists.length === 0) && (
                <p className="text-xs text-gray-400">No data yet.</p>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-white/80 mb-4">
              Genre Breakdown
            </h4>
            <div className="space-y-2.5">
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
                <p className="text-xs text-gray-400">No data yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-12 xl:col-span-8 space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-white/80 mb-4">
              Most Played Songs
            </h4>
            <div className="space-y-1">
              {(data?.topSongs ?? []).slice(0, 6).map((song, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <span className="w-5 text-xs text-gray-400 text-right flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-white/90 truncate">
                      {song.title}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {song.artist}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <SignalPill signal={song.signal} />
                    <span className="text-xs text-gray-400 w-8 text-right font-medium">
                      {song.count}×
                    </span>
                  </div>
                </div>
              ))}
              {(!data?.topSongs || data.topSongs.length === 0) && (
                <p className="text-xs text-gray-400 px-2">No song data yet.</p>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-white/80">
                  Listen History
                </h4>
                <p className="text-xs text-gray-400 mt-0.5">
                  {data?.recentHistory?.length ?? 0} recent listens
                </p>
              </div>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 w-8">
                      #
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                      Song
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                      Genre
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                      Signal
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      Listened At
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {(data?.recentHistory ?? []).map((h, i) => (
                    <tr
                      key={i}
                      className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-6 py-3 text-xs text-gray-400">
                        {i + 1}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 dark:text-white/90 truncate max-w-[220px]">
                          {h.title}
                        </p>
                        <p className="text-xs text-gray-400 truncate max-w-[220px]">
                          {h.artist}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                          {h.genre}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <SignalPill signal={h.signal} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {formatDate(h.listened_at)}
                      </td>
                    </tr>
                  ))}
                  {(!data?.recentHistory ||
                    data.recentHistory.length === 0) && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-12 text-center text-sm text-gray-400"
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
