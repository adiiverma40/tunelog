import { Stats } from "../../API/API";

interface Props {
  stats: Stats | null;
}

export default function MostSkippedPercentage({ stats }: Props) {
  const songs = stats?.most_played_songs ?? [];
  const total = stats?.total_listens ?? 0;

  return (
    <div className="rounded-2xl border border-gray-200 overflow-y-auto h-96 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <h4 className="text-base font-semibold text-gray-800 dark:text-white/90 mb-1">
        Most Played Songs
      </h4>
      <p className="text-xs text-gray-400 mb-5">Top 10 by play count</p>

      {songs.length === 0 ? (
        <p className="text-sm text-gray-400">No listen data yet.</p>
      ) : (
        <div className="space-y-3">
          {songs.map((song, i) => {
            const pct =
              total > 0 ? ((song.play_count / total) * 100).toFixed(1) : "0";
            return (
              <div
                key={i}
                className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
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
                  <span className="text-xs text-gray-400">
                    {song.play_count}×
                  </span>
                  <span className="text-xs text-gray-400 hidden sm:inline">
                    ({pct}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
