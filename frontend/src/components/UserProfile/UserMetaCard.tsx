import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { User, fetchUserData, UserDataResponse } from "../../API/API";

interface Props {
  user: User;
}

const SIGNAL_CONFIG = [
  {
    key: "skips",
    label: "Skips",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
  {
    key: "repeat",
    label: "Repeats",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
  },
  {
    key: "complete",
    label: "Complete",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
  },
  {
    key: "partial",
    label: "Partial",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
  },
] as const;

export default function UserMetaCard({ user }: Props) {
  const [stats, setStats] = useState<UserDataResponse | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const navigate = useNavigate();

  const formatDate = (dateString: string | undefined) => {
    if (!dateString || dateString === "never") return "No activity";

    const date = new Date(dateString.replace(" ", "T"));

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  useEffect(() => {
    let alive = true;

    setLoadingStats(true);
    setStats(null);

    fetchUserData(user.username, user.password)
      .then((data) => {
        if (!alive) return;

        if (data.status === "ok") {
          setStats(data);
        }
      })
      .catch((err) => console.error("Failed to load user stats", err))
      .finally(() => {
        if (alive) setLoadingStats(false);
      });

    return () => {
      alive = false;
    };
  }, [user.username, user.password]);

  const placeholderStats = {
    totalListens: stats?.totalListens ?? 0,
    skips: stats?.skips ?? 0,
    repeat: stats?.repeat ?? 0,
    complete: stats?.complete ?? 0,
    partial: stats?.partial ?? 0,
    lastLogged: formatDate(stats?.lastLogged),
  };

  const handleClick = () => {
    navigate(`/users/${user.username}`, {
      state: { username: user.username, password: user.password },
    });
  };

  const getAvatarContent = () => {
    if (user.avatarUrl) {
      return (
        <img
          src={user.avatarUrl}
          alt={user.name || user.username}
          className="w-full h-full object-cover rounded-xl"
        />
      );
    }

    const colors = [
      "from-blue-500 to-indigo-600",
      "from-purple-500 to-pink-600",
      "from-green-500 to-teal-600",
      "from-orange-500 to-red-600",
      "from-cyan-500 to-blue-600",
    ];

    const idx = user.username.charCodeAt(0) % colors.length;
    const initials = (user.name || user.username).slice(0, 2).toUpperCase();

    return (
      <div
        className={`w-full h-full rounded-xl bg-gradient-to-br ${colors[idx]} flex items-center justify-center`}
      >
        <span className="text-white text-sm font-bold tracking-wide">
          {initials}
        </span>
      </div>
    );
  };

  const displayName = user.name || user.username;

  return (
    <div
      onClick={handleClick}
      className="group relative flex flex-col gap-4 p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6
                 hover:border-brand-500/40 dark:hover:border-brand-500/40
                 hover:shadow-md dark:hover:shadow-brand-500/5
                 transition-all duration-200 cursor-pointer"
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
          {getAvatarContent()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-base font-semibold text-gray-800 dark:text-white/90 truncate">
              {displayName}
            </h4>

            {user.isAdmin && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-brand-500/10 text-brand-500 border border-brand-500/20 flex-shrink-0">
                Admin
              </span>
            )}
          </div>

          <p className="text-xs text-gray-400 mt-0.5">
            @{user.username} ·{" "}
            {loadingStats
              ? "Loading stats..."
              : `Last active: ${placeholderStats.lastLogged}`}
          </p>
        </div>

        <div className="hidden sm:flex flex-col items-end flex-shrink-0">
          <span className="text-xl font-bold text-gray-800 dark:text-white/90">
            {loadingStats ? "—" : placeholderStats.totalListens}
          </span>
          <span className="text-xs text-gray-400">total listens</span>
        </div>
      </div>

      <hr className="border-gray-100 dark:border-gray-800" />

      <div className="flex flex-wrap gap-2">
        {SIGNAL_CONFIG.map((s) => (
          <div
            key={s.key}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium
                        ${s.bg} ${s.border} ${s.color}`}
          >
            <span>{loadingStats ? "—" : placeholderStats[s.key]}</span>
            <span className="opacity-70">{s.label}</span>
          </div>
        ))}

        <div className="ml-auto flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <span className="text-xs text-brand-500 font-medium">
            View profile →
          </span>
        </div>
      </div>
    </div>
  );
}
