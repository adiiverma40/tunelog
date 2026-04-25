import { Stats } from "../../API/API";

interface Props {
  stats: Stats | null;
}

export default function MostSkippedPercentage({ stats }: Props) {
  const songs = stats?.most_played_songs ?? [];
  const total = stats?.total_listens ?? 0;
  const max = songs[0]?.play_count ?? 1;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] flex flex-col h-full w-full">
      <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
          Most Played Songs
        </h4>
        <p className="text-xs text-gray-400 mt-0.5">Top 10 by play count</p>
      </div>

      <div
        className="overflow-y-auto flex-1 px-3 py-3"
        style={{ maxHeight: "420px" }}
      >
        {songs.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-gray-400 italic">No listen data yet.</p>
          </div>
        ) : (
          <div>
            {songs.map((song, i) => {
              const pct =
                total > 0 ? ((song.play_count / total) * 100).toFixed(1) : "0";
              const barPct = Math.round((song.play_count / max) * 100);
              return (
                <div
                  key={i}
                  className="group relative flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors cursor-default"
                >
                  <span className="w-5 text-xs text-gray-300 dark:text-gray-600 text-right font-medium flex-shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  <div className="absolute left-10 right-3 bottom-2 h-0.5 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity">
                    <div
                      className="h-full rounded-full bg-brand-500/30"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-white/90 truncate leading-snug">
                      {song.title}
                    </p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {song.artist}
                    </p>
                  </div>

                  <div className="flex-shrink-0 text-right">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                      {song.play_count}
                      <span className="text-[10px] font-normal text-gray-400">
                        ×
                      </span>
                    </p>
                    <p className="text-[10px] text-gray-400 tabular-nums">
                      {pct}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
