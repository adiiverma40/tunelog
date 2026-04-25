import { useEffect, useState } from "react";
import { fetchGetUsers, fetchUserData, UserDataResponse } from "../../API/API";

interface CachedUser {
  username: string;
  password: string;
  isAdmin: boolean;
  name: string;
  avatarUrl: string;
}

interface UserWithStats extends UserDataResponse {
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

const AVATAR_COLORS = [
  { bg: "#EEEDFE", text: "#534AB7" },
  { bg: "#E1F5EE", text: "#0F6E56" },
  { bg: "#FAECE7", text: "#993C1D" },
  { bg: "#FBEAF0", text: "#993356" },
];

function UserAvatar({
  avatarUrl,
  displayName,
  colorIdx,
  size = 36,
}: {
  avatarUrl: string | null;
  displayName: string;
  username: string;
  colorIdx: number;
  size?: number;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const color = AVATAR_COLORS[colorIdx % AVATAR_COLORS.length];
  const initials = displayName.slice(0, 2).toUpperCase();

  if (avatarUrl && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt={displayName}
        onError={() => setImgFailed(true)}
        className="rounded-xl object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-semibold"
      style={{
        width: size,
        height: size,
        backgroundColor: color.bg,
        color: color.text,
      }}
    >
      {initials}
    </div>
  );
}

export default function MostPlaysbyUser() {
  const [usersData, setUsersData] = useState<UserWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const admin = localStorage.getItem("tunelog_user") || "";
        const adminPD = localStorage.getItem("tunelog_password") || "";
        if (!admin || !adminPD) return;

        const cachedRaw = localStorage.getItem("tunelog_users_cache");
        const cachedUsers: CachedUser[] = cachedRaw
          ? JSON.parse(cachedRaw)
          : [];

        const usersListResponse = await fetchGetUsers({ admin, adminPD });

        if (usersListResponse.status === "ok" && usersListResponse.users) {
          const detailedUsers = await Promise.all(
            usersListResponse.users.map(async (user) => {
              const cached = cachedUsers.find(
                (c) => c.username === user.username,
              );
              const displayName =
                cached?.name ||
                localStorage.getItem(`tunelog_displayname_${user.username}`) ||
                user.username;
              const avatarUrl =
                cached?.avatarUrl ||
                localStorage.getItem(`tunelog_avatar_${user.username}`) ||
                null;

              try {
                const stats = await fetchUserData(user.username, user.password);
                return {
                  ...stats,
                  username: user.username,
                  displayName,
                  avatarUrl,
                };
              } catch {
                return {
                  username: user.username,
                  displayName,
                  avatarUrl,
                  totalListens: 0,
                  skips: 0,
                  repeat: 0,
                  complete: 0,
                  partial: 0,
                  status: "failed" as const,
                  lastLogged: "never",
                };
              }
            }),
          );

          setUsersData(
            detailedUsers.sort((a, b) => b.totalListens - a.totalListens),
          );
        }
      } catch (error) {
        console.error("Failed to load user stats:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const max = usersData[0]?.totalListens ?? 1;

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] animate-pulse">
        <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
        <div className="h-3 w-24 bg-gray-100 dark:bg-gray-800 rounded mb-5" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 mb-5">
            <div className="w-9 h-9 bg-gray-200 dark:bg-gray-700 rounded-xl" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
              <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded w-full" />
              <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] flex flex-col h-full">
      <div className="p-5 pb-3 border-b border-gray-100 dark:border-gray-800">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
          Most Active Users
        </h4>
        <p className="text-xs text-gray-400 mt-0.5">By total listens</p>
      </div>

      <div className="p-5 space-y-5 flex-1">
        {usersData.map((u, i) => {
          const pct = Math.round((u.totalListens / max) * 100);
          const color = AVATAR_COLORS[i % AVATAR_COLORS.length];

          return (
            <div key={u.username} className="flex items-start gap-3">
              <UserAvatar
                avatarUrl={u.avatarUrl}
                displayName={u.displayName}
                username={u.username}
                colorIdx={i}
                size={36}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate block leading-tight">
                      {u.displayName}
                    </span>
                    {u.displayName !== u.username && (
                      <span className="text-[10px] text-gray-400">
                        @{u.username}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums ml-2 flex-shrink-0">
                    {u.totalListens.toLocaleString()}
                  </span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-white/[0.06] rounded-full h-1 overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${pct}%`, backgroundColor: color.text }}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                    <span className="text-[10px] text-gray-400 tabular-nums">
                      {u.skips} skips
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                    <span className="text-[10px] text-gray-400 tabular-nums">
                      {u.repeat} repeats
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                    <span className="text-[10px] text-gray-400 tabular-nums">
                      {u.complete} finished
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-5 pb-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
          Global Ranking
        </span>
        <span className="text-[10px] text-gray-400">
          Last:{" "}
          {usersData[0]?.lastLogged && usersData[0].lastLogged !== "never"
            ? new Date(usersData[0].lastLogged).toLocaleDateString()
            : "N/A"}
        </span>
      </div>
    </div>
  );
}
