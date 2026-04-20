
import { useState, useEffect, useRef } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import {
  fetchGenresFromDb,
  fetchGenres,
  writeGenre,
  autoMatchGenres,
} from "../API/API";

interface GenreListResponse {
  status: string;
  genres: string[];
}

interface GenreResponse {
  status: string;
  Genre: Record<string, string[]>;
}

interface MatchedPair {
  noisy: string;
  category: string;
  saving: boolean;
  fading: boolean;
}

export default function GenreMatch() {
  const [allNoisy, setAllNoisy] = useState<string[]>([]);
  const [visible, setVisible] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [matchedPairs, setMatchedPairs] = useState<MatchedPair[]>([]);
  const [existingMap, setExistingMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [autoMatching, setAutoMatching] = useState(false);
  const [autoMsg, setAutoMsg] = useState("");
  const fadeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    async function load() {
      try {
        const [dbRes, jsonRes]: [GenreListResponse, GenreResponse] =
          await Promise.all([fetchGenresFromDb(), fetchGenres()]);

        const mapped = jsonRes.Genre ?? {};
        setExistingMap(mapped);

        const alreadyMapped = new Set(
          Object.values(mapped)
            .flat()
            .map((g) => g.toLowerCase()),
        );
        const filtered = (dbRes.genres ?? []).filter(
          (g) => !alreadyMapped.has(g.toLowerCase()),
        );
        setAllNoisy(filtered);
        setVisible(filtered.slice(0, 10));
        setCategories(Object.keys(mapped));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

async function handleAutoMatch() {
  setAutoMatching(true);
  setAutoMsg("");
  try {
    const res = await autoMatchGenres();
    const updated = res["genre_updated"] ?? 0;

    const dbRes: GenreListResponse = await fetchGenresFromDb();
    const alreadyMapped = new Set(
      Object.values(existingMap)
        .flat()
        .map((g) => g.toLowerCase()),
    );
    const filtered = (dbRes.genres ?? []).filter(
      (g) => !alreadyMapped.has(g.toLowerCase()),
    );
    setAllNoisy(filtered);
    setVisible(filtered.slice(0, 10));

    setAutoMsg(`✓ Auto-matched ${updated} genre${updated !== 1 ? "s" : ""}`);
    setTimeout(() => setAutoMsg(""), 3000);
  } catch {
    setAutoMsg("Auto match failed");
    setTimeout(() => setAutoMsg(""), 3000);
  } finally {
    setAutoMatching(false);
  }
}

  function selectNoisy(genre: string) {
    if (selectedCat) {
      handleMatch(genre, selectedCat);
      return;
    }
    setSelected((prev) => (prev === genre ? null : genre));
  }

  function selectCategory(cat: string) {
    if (selected) {
      handleMatch(selected, cat);
      return;
    }
    setSelectedCat((prev) => (prev === cat ? null : cat));
  }

  async function handleMatch(noisy: string, category: string) {
    setSelected(null);
    setSelectedCat(null);

    setAllNoisy((prev) => {
      const next = prev.filter((g) => g !== noisy);
      setVisible((v) => {
        const current = v.filter((g) => g !== noisy);
        const toAdd = next
          .filter((g) => !current.includes(g))
          .slice(0, 10 - current.length);
        return [...current, ...toAdd];
      });
      return next;
    });

    setMatchedPairs((prev) => [
      ...prev,
      { noisy, category, saving: true, fading: false },
    ]);

    try {
      await writeGenre(category, noisy);
      setMatchedPairs((prev) =>
        prev.map((p) => (p.noisy === noisy ? { ...p, saving: false } : p)),
      );
      fadeTimers.current[noisy] = setTimeout(() => {
        setMatchedPairs((prev) =>
          prev.map((p) => (p.noisy === noisy ? { ...p, fading: true } : p)),
        );
        setTimeout(() => {
          setMatchedPairs((prev) => prev.filter((p) => p.noisy !== noisy));
        }, 400);
      }, 2000);
    } catch {
      setMatchedPairs((prev) => prev.filter((p) => p.noisy !== noisy));
      setAllNoisy((prev) => [noisy, ...prev]);
      setVisible((prev) => (prev.length < 10 ? [noisy, ...prev] : prev));
    }
  }

  function addCategory() {
    const trimmed = newCategory.trim();
    if (!trimmed || categories.includes(trimmed)) return;
    setCategories((prev) => [...prev, trimmed]);
    setNewCategory("");
  }

  useEffect(() => {
    return () => {
      Object.values(fadeTimers.current).forEach(clearTimeout);
    };
  }, []);

  return (
    <div>
      <PageMeta
        title="Genre Match | TuneLog"
        description="Map noisy genre tags to clean categories"
      />
      <PageBreadcrumb pageTitle="Genre Match" />

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        {/* ── Stats row ── */}
        <div className="col-span-12 grid grid-cols-3 gap-4">
          {[
            {
              label: "Unmatched",
              value: allNoisy.length,
              valueStyle: "text-yellow-500",
            },
            {
              label: "Showing Now",
              value: visible.length,
              valueStyle: "text-gray-800 dark:text-white/90",
            },
            {
              label: "Categories",
              value: categories.length,
              valueStyle: "text-brand-500",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                {item.label}
              </p>
              <p className={`text-2xl font-semibold ${item.valueStyle}`}>
                {loading ? "—" : item.value}
              </p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="col-span-12 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-12 text-center">
            <p className="text-sm text-gray-400 animate-pulse">
              Loading genres...
            </p>
          </div>
        ) : (
          <>
            <div className="col-span-12 xl:col-span-5 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                  Noisy Genres
                </h4>
                <div className="flex items-center gap-3">
                  {allNoisy.length > 10 && (
                    <span className="text-xs text-gray-400">
                      +{allNoisy.length - visible.length} in queue
                    </span>
                  )}
                  <button
                    onClick={handleAutoMatch}
                    disabled={autoMatching || allNoisy.length === 0}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 hover:border-brand-500 hover:text-brand-500 disabled:opacity-40 transition-colors"
                  >
                    {autoMatching ? (
                      <span className="flex items-center gap-1.5">
                        <span className="animate-spin inline-block">↻</span>{" "}
                        Matching...
                      </span>
                    ) : (
                      "⚡ Auto Match"
                    )}
                  </button>
                </div>
              </div>

              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                Select one, then pick a category to map it.
              </p>

              {autoMsg && (
                <p className="text-xs text-brand-500 mb-3">{autoMsg}</p>
              )}

              {visible.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl mt-4">
                  <p className="text-sm text-gray-400">All genres matched 🎉</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 mt-4">
                  {visible.map((genre) => (
                    <button
                      key={genre}
                      onClick={() => selectNoisy(genre)}
                      className={`text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-150 ${
                        selected === genre
                          ? "border-brand-500 bg-brand-500/10 text-brand-500"
                          : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                      }`}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              )}
            </div>


            <div className="col-span-12 xl:col-span-7 flex flex-col gap-4">


              <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-1">
                  Categories
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Clean genre labels. Add new ones and select to map.
                </p>

                <div className="flex gap-2 mb-5">
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCategory()}
                    placeholder="e.g. Bollywood, Hip Hop..."
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700
                      dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300
                      focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    onClick={addCategory}
                    disabled={!newCategory.trim()}
                    className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-sm font-medium transition-colors"
                  >
                    Add
                  </button>
                </div>

                {categories.length === 0 ? (
                  <div className="py-6 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                    <p className="text-sm text-gray-400">
                      Add a category to start matching
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => selectCategory(cat)}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-150 ${
                          selectedCat === cat
                            ? "border-brand-500 bg-brand-500/10 text-brand-500"
                            : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                        }`}
                      >
                        {cat}
                        {(existingMap[cat]?.length ?? 0) > 0 && (
                          <span className="text-xs text-gray-400">
                            ({existingMap[cat].length})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>


              {(selected || selectedCat) && (
                <div className="rounded-2xl border border-brand-500/30 bg-brand-500/5 p-4 text-center">
                  <p className="text-sm text-brand-500 font-medium">
                    {selected
                      ? `"${selected}" selected — now pick a category`
                      : `"${selectedCat}" selected — now pick a noisy genre`}
                  </p>
                </div>
              )}



              {matchedPairs.length > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-white/80 mb-3">
                    Recently Matched
                  </h4>
                  <div className="flex flex-col gap-2">
                    {matchedPairs.map((pair) => (
                      <div
                        key={pair.noisy}
                        className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-xs font-medium transition-all duration-400 ${
                          pair.fading
                            ? "opacity-0 scale-95"
                            : "opacity-100 scale-100"
                        } ${
                          pair.saving
                            ? "border-yellow-300/40 bg-yellow-400/5 dark:border-yellow-800/30 dark:bg-yellow-900/10"
                            : "border-green-300/40 bg-green-400/5 dark:border-green-800/30 dark:bg-green-900/10"
                        }`}
                      >
                        <span className="text-gray-600 dark:text-gray-300 truncate max-w-[130px]">
                          {pair.noisy}
                        </span>
                        <span className="text-gray-400">→</span>
                        <span
                          className={`font-semibold truncate max-w-[130px] ${
                            pair.saving
                              ? "text-yellow-600 dark:text-yellow-400"
                              : "text-green-600 dark:text-green-400"
                          }`}
                        >
                          {pair.category}
                        </span>
                        <span className="ml-auto flex-shrink-0">
                          {pair.saving ? (
                            <span className="animate-spin inline-block text-yellow-500">
                              ↻
                            </span>
                          ) : (
                            <span className="text-green-500">✓</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}



              {!selected &&
                !selectedCat &&
                visible.length > 0 &&
                matchedPairs.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-5 text-center">
                    <p className="text-sm text-gray-400">
                      Pick a noisy genre on the left, then a category above to
                      map them
                    </p>
                  </div>
                )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}