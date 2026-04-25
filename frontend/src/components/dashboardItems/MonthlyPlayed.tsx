import { useEffect, useState } from "react";
import { fetchMonthlyListens, MonthlyListen } from "../../API/API";

interface MonthlyListenDisplay extends MonthlyListen {
  displayMonth: string;
}

export default function MonthlyPlayed() {
  const [data, setData] = useState<MonthlyListenDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    fetchMonthlyListens()
      .then((res) => {
        setData(
          res.map((item) => ({
            ...item,
            displayMonth: new Date(item.month + "-01").toLocaleString(
              "default",
              { month: "short" },
            ),
          })),
        );
      })
      .catch((err) => console.error("Error fetching monthly listens:", err))
      .finally(() => setLoading(false));
  }, []);

  const maxListens =
    data.length > 0 ? Math.max(...data.map((m) => m.count)) : 100;
  const lastIdx = data.length - 1;
  const prevIdx = data.length - 2;
  const currentCount = data[lastIdx]?.count ?? 0;
  const prevCount = data[prevIdx]?.count ?? 0;
  const delta =
    prevCount > 0
      ? Math.round(((currentCount - prevCount) / prevCount) * 100)
      : null;
  const activeIdx = hoveredIdx !== null ? hoveredIdx : lastIdx;

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03] animate-pulse">
        <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
        <div className="h-3 w-36 bg-gray-100 dark:bg-gray-800 rounded mb-8" />
        <div className="flex items-end gap-3 h-32">
          {[45, 65, 50, 80, 70, 100].map((h, i) => (
            <div
              key={i}
              className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-t-lg"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] flex flex-col h-full w-full">
      <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Monthly Listens
          </h4>
          <p className="text-xs text-gray-400 mt-0.5">Last 6 months</p>
        </div>
        {delta !== null && (
          <span
            className={`text-xs font-semibold tabular-nums px-2.5 py-1 rounded-lg ${
              delta >= 0
                ? "text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-500/10"
                : "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10"
            }`}
          >
            {delta >= 0 ? "+" : ""}
            {delta}%
          </span>
        )}
      </div>

      <div className="px-6 pt-5 pb-6 flex-1 flex flex-col">
        {data.length > 0 && (
          <div className="mb-6">
            <p className="text-3xl font-semibold text-gray-800 dark:text-white/90 tabular-nums">
              {data[activeIdx]?.count.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              listens in {data[activeIdx]?.displayMonth}
            </p>
          </div>
        )}

        <div className="flex items-end gap-3" style={{ height: "120px" }}>
          {data.length > 0 ? (
            data.map((m, i) => {
              const pct = Math.round((m.count / maxListens) * 100);
              const isActive = i === activeIdx;
              const isLast = i === lastIdx;
              return (
                <div
                  key={m.month}
                  className="flex-1 flex flex-col items-center gap-2 h-full cursor-default"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <div className="w-full flex items-end flex-1">
                    <div
                      className="w-full rounded-t-lg transition-all duration-300"
                      style={{
                        height: `${Math.max(pct, 6)}%`,
                        backgroundColor: isActive
                          ? "#7F77DD"
                          : isLast
                            ? "#AFA9EC"
                            : "#e5e7eb",
                        opacity: hoveredIdx !== null && !isActive ? 0.4 : 1,
                      }}
                    />
                  </div>
                  <span
                    className="text-[11px] font-medium transition-colors"
                    style={{ color: isActive ? "#7F77DD" : "#9ca3af" }}
                  >
                    {m.displayMonth}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="w-full flex items-center justify-center text-gray-400 text-xs italic">
              No listen history found
            </div>
          )}
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
            Live Data
          </p>
          <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
