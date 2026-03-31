import { useEffect, useState } from "react";
import { fetchGetUsers, fetchUserData, UserDataResponse } from "../../API/API";
interface UserWithStats extends UserDataResponse {
  username: string;
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


        const usersListResponse = await fetchGetUsers({ admin, adminPD });

        if (usersListResponse.status === "ok" && usersListResponse.users) {

          const detailedUsers = await Promise.all(
            usersListResponse.users.map(async (user) => {
              try {

                const stats = await fetchUserData(user.username, user.password);
                return { ...stats, username: user.username };
              } catch (e) {

                return {
                  username: user.username,
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

          const sorted = detailedUsers.sort(
            (a, b) => b.totalListens - a.totalListens,
          );
          setUsersData(sorted);
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
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03] animate-pulse">
        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-6"></div>
        {[1, 2].map((i) => (
          <div key={i} className="flex gap-3 mb-4">
            <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded w-full"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <h4 className="text-base font-semibold text-gray-800 dark:text-white/90 mb-1">
        Most Active Users
      </h4>
      <p className="text-xs text-gray-400 mb-5">By total listens</p>

      <div className="space-y-6">
        {usersData.map((u, i) => {
          const pct = Math.round((u.totalListens / max) * 100);
          const colors = [
            "from-blue-500 to-indigo-600",
            "from-purple-500 to-pink-600",
            "from-green-500 to-teal-600",
          ];
          const initials = u.username.slice(0, 2).toUpperCase();

          return (
            <div key={u.username} className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-lg bg-gradient-to-br ${colors[i % colors.length]} flex items-center justify-center flex-shrink-0 shadow-sm`}
              >
                <span className="text-white text-xs font-bold">{initials}</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">
                    {u.username}
                  </span>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {u.totalListens.toLocaleString()} listens
                  </span>
                </div>

                <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-1.5 rounded-full bg-brand-500 transition-all duration-700 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex gap-4 mt-2">
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400"></div>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {u.skips} skips
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {u.repeat} repeats
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {u.complete} finished
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          Global Ranking
        </span>
        <span className="text-[10px] text-gray-400">
          Last activity:{" "}
          {usersData[0]?.lastLogged !== "never"
            ? new Date(usersData[0]?.lastLogged).toLocaleDateString()
            : "N/A"}
        </span>
      </div>
    </div>
  );
}
