import { useEffect, useState } from "react";
import { fetchMonthlyListens, MonthlyListen } from "../../API/API";

export default function MonthlyPlayed() {
  const [data, setData] = useState<MonthlyListen[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMonthlyListens()
      .then((res) => {
        const formatted = res.map((item) => {
          const date = new Date(item.month + "-01");
          return {
            ...item,
            displayMonth: date.toLocaleString("default", { month: "short" }),
          };
        });
        setData(formatted);
      })
      .catch((err) => console.error("Error fetching monthly listens:", err))
      .finally(() => setLoading(false));
  }, []);

  const maxListens =
    data.length > 0 ? Math.max(...data.map((m) => m.count)) : 100;

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03] animate-pulse">
        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
        <div className="h-28 w-full bg-gray-100 dark:bg-gray-800 rounded"></div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <h4 className="text-base font-semibold text-gray-800 dark:text-white/90 mb-1">
        Monthly Listens
      </h4>
      <p className="text-xs text-gray-400 mb-5">
        Listens per month — last 6 months
      </p>

      <div className="flex items-end gap-2 h-32">
        {data.length > 0 ? (
          data.map((m, i) => {
            const pct = Math.round((m.count / maxListens) * 100);
            const isLast = i === data.length - 1;

            return (
              <div
                key={m.month}
                className="flex-1 flex flex-col items-center gap-1 group"
              >


                <span className="text-[10px] font-medium text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  {m.count}
                </span>

                <div
                  className="w-full flex items-end"
                  style={{ height: "80px" }}
                >
                  <div
                    className={`w-full rounded-t-lg transition-all duration-700 ease-out ${
                      isLast
                        ? "bg-brand-500 shadow-lg shadow-brand-500/20"
                        : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                    style={{ height: `${Math.max(pct, 5)}%` }} 
                  />
                </div>
                <span className="text-xs font-medium text-gray-400 mt-1">
                  {(m as any).displayMonth}
                </span>
              </div>
            );
          })
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs italic">
            No listen history found for the last 6 months
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
          Live Data
        </p>
        <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></div>
      </div>
    </div>
  );
}
