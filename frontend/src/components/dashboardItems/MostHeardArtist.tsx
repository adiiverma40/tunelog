import { Stats } from "../../API/API";

interface Props {
  stats: Stats | null;
}

const ACCENT_COLORS = [
  "#7F77DD",
  "#5DCAA5",
  "#D85A30",
  "#D4537E",
  "#378ADD",
  "#639922",
  "#BA7517",
  "#E24B4A",
  "#0F6E56",
  "#993C1D",
];

export default function MostHeardArtist({ stats }: Props) {
  const artists = stats?.most_played_artists ?? {};
  const entries = Object.entries(artists)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const max = entries[0]?.[1] ?? 1;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] flex flex-col h-full w-full">
      <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
          Most Heard Artists
        </h4>
        <p className="text-xs text-gray-400 mt-0.5">Top 10 by total listens</p>
      </div>

      <div className="px-6 py-5 flex-1">
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-gray-400 italic">No listen data yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map(([artist, count], i) => {
              const pct = Math.round((count / max) * 100);
              const color = ACCENT_COLORS[i % ACCENT_COLORS.length];
              return (
                <div key={artist} className="flex items-center gap-4">
                  <span
                    className="text-xs font-semibold tabular-nums flex-shrink-0"
                    style={{
                      width: "20px",
                      textAlign: "right",
                      color: i === 0 ? color : "#d1d5db",
                    }}
                  >
                    {i + 1}
                  </span>

                  <span
                    className="text-sm font-medium dark:text-gray-300 truncate flex-shrink-0"
                    style={{
                      width: "130px",
                      color: i === 0 ? "#111827" : undefined,
                    }}
                  >
                    {artist || "Unknown"}
                  </span>

                  <div className="flex-1 h-2 bg-gray-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>

                  <span
                    className="text-xs tabular-nums font-semibold flex-shrink-0"
                    style={{
                      width: "40px",
                      textAlign: "right",
                      color: i === 0 ? color : "#9ca3af",
                    }}
                  >
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
