import { useState, useEffect, useRef } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import {
  fetchManualMarkingSongs,
  updateExplicitTag,
  ManualMarkingSong,
  ExplicitTag,
} from "../API/API";

const TAG_STYLE: Record<string, string> = {
  explicit: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  cleaned:
    "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
  notExplicit:
    "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  manual: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const TAG_LABEL: Record<string, string> = {
  explicit: "Explicit",
  cleaned: "Cleaned",
  notExplicit: "Clean",
  manual: "Manual",
};

const TAG_BADGE: Record<string, string> = {
  explicit: "E",
  cleaned: "C",
  notExplicit: "✓",
  manual: "?",
};

const DROPDOWN_OPTIONS: { value: ExplicitTag; label: string; badge: string }[] =
  [
    { value: "explicit", label: "Explicit", badge: "E" },
    { value: "cleaned", label: "Cleaned", badge: "C" },
    { value: "notExplicit", label: "Clean", badge: "✓" },
  ];

function ExplicitDropdown({
  songId,
  current,
  onUpdate,
}: {
  songId: string;
  current: string | null;
  onUpdate: (songId: string, tag: ExplicitTag) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = async (tag: ExplicitTag) => {
    setOpen(false);
    setSaving(true);
    await onUpdate(songId, tag);
    setSaving(false);
  };

  const tag = current ?? "manual";

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all
          ${saving ? "opacity-50 cursor-wait" : "cursor-pointer hover:opacity-80"}
          ${TAG_STYLE[tag] ?? TAG_STYLE.manual}
          border-transparent`}
      >
        <span>{TAG_BADGE[tag] ?? "?"}</span>
        <span>{TAG_LABEL[tag] ?? tag}</span>
        {saving ? (
          <span className="ml-0.5 animate-spin">↻</span>
        ) : (
          <span className="ml-0.5 opacity-60">▾</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-[130px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden">
          {DROPDOWN_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors
                hover:bg-gray-50 dark:hover:bg-white/[0.04]
                ${tag === opt.value ? "bg-brand-500/10" : ""}`}
            >
              <span
                className={`inline-flex items-center justify-center w-5 h-5 rounded text-xs font-semibold ${TAG_STYLE[opt.value]}`}
              >
                {opt.badge}
              </span>
              <span className="text-gray-700 dark:text-gray-300 font-medium">
                {opt.label}
              </span>
              {tag === opt.value && (
                <span className="ml-auto text-brand-500 text-[10px]">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type SortKey = "title" | "artist" | "album" | "genre";

export default function ManualMarking() {
  const [songs, setSongs] = useState<ManualMarkingSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("artist");
  const [sortAsc, setSortAsc] = useState(true);
  const [toastMsg, setToastMsg] = useState("");

  useEffect(() => {
    setLoading(true);
    fetchManualMarkingSongs()
      .then((res) => {
        if (res.status === "ok") setSongs(res.songs);
      })
      .finally(() => setLoading(false));
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2500);
  };

  const handleUpdate = async (songId: string, tag: ExplicitTag) => {
    try {
      const res = await updateExplicitTag(songId, tag);
      if (res.status === "ok") {
        setSongs((prev) =>
          prev.map((s) => (s.song_id === songId ? { ...s, explicit: tag } : s)),
        );
        showToast(`Updated to "${TAG_LABEL[tag]}"`);
      }
    } catch {
      showToast("Failed to update");
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const filtered = songs.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.title?.toLowerCase().includes(q) ||
      s.artist?.toLowerCase().includes(q) ||
      s.album?.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = (a[sortKey] ?? "").toLowerCase();
    const bv = (b[sortKey] ?? "").toLowerCase();
    return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => handleSort(k)}
      className={`flex items-center gap-1 text-xs font-medium transition-colors ${
        sortKey === k
          ? "text-brand-500"
          : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      }`}
    >
      {label}
      <span className="text-[10px]">
        {sortKey === k ? (sortAsc ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );

  const total = songs.length;
  const stillManual = songs.filter(
    (s) => !s.explicit || s.explicit === "manual",
  ).length;
  const resolved = total - stillManual;

  return (
    <div>
      <PageMeta
        title="Manual Marking | TuneLog"
        description="Manually tag songs with explicit status"
      />
      <PageBreadcrumb pageTitle="Manual Marking" />

      {/* toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-medium px-4 py-2.5 shadow-lg transition-all">
          {toastMsg}
        </div>
      )}

      <div className="flex flex-col gap-4 md:gap-6">
        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: "Pending Review",
              value: stillManual,
              accent: "text-yellow-500",
            },
            { label: "Resolved", value: resolved, accent: "text-green-500" },
            { label: "Total", value: total, accent: "text-brand-500" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                {s.label}
              </p>
              <p className={`text-2xl font-semibold ${s.accent}`}>{s.value}</p>
            </div>
          ))}
        </div>

     
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden">

          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 gap-4">
            <div>
              <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Songs Pending Manual Marking
              </h4>
              <p className="text-xs text-gray-400 mt-0.5">
                {sorted.length} song{sorted.length !== 1 ? "s" : ""} shown
              </p>
            </div>
            <input
              type="text"
              placeholder="Search title, artist, album…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700
                dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300
                focus:outline-none focus:ring-2 focus:ring-brand-500 w-64"
            />
          </div>


          <div className="overflow-x-auto">
            {loading ? (
              <p className="text-sm text-gray-400 px-6 py-10">Loading…</p>
            ) : sorted.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-gray-400">
                  {search
                    ? "No songs match your search."
                    : "No songs pending manual marking. "}
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-xs text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-6 py-3 font-medium">#</th>
                    <th className="text-left px-4 py-3 font-medium">
                      <SortBtn k="title" label="Title" />
                    </th>
                    <th className="text-left px-4 py-3 font-medium">
                      <SortBtn k="artist" label="Artist" />
                    </th>
                    <th className="text-left px-4 py-3 font-medium">
                      <SortBtn k="album" label="Album" />
                    </th>
                    <th className="text-left px-4 py-3 font-medium">
                      <SortBtn k="genre" label="Genre" />
                    </th>
                    <th className="text-left px-4 py-3 font-medium">
                      Explicit Tag
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {sorted.map((song, idx) => (
                    <tr
                      key={song.song_id}
                      className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-6 py-3 text-gray-400 text-xs">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 dark:text-white/90 truncate max-w-[200px]">
                          {song.title ?? "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs truncate max-w-[140px]">
                        {song.artist ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs truncate max-w-[140px]">
                        {song.album ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                        {song.genre ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <ExplicitDropdown
                          songId={song.song_id}
                          current={song.explicit}
                          onUpdate={handleUpdate}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
