

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import PageMeta from "../../components/common/PageMeta";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import MiniPlayer from "../Jam/MiniPlayer";
import { Modal } from "../../components/ui/modal";
import {
  getSkippedSongs,
  getRecommendedDeletes,
  generateScript,
  getScriptSettings,
  saveScriptSettings,
} from "../../API/API";
import type {
  SkippedSong,
  RecommendedSong,
  ShellType,
  ScriptAction,
  SkippedSettings,
} from "../../API/API";

const PAGE_SIZE = 10;
const NAVIDROME_URL = import.meta.env.VITE_NAVIDROME_URL || "";
const WIKI_URL = "https://github.com/adiiverma40/tunelog/wiki/Skip-Page";

type SortKey = "count" | "title" | "artist" | "album" | "time" | "duration";

function getCoverArtUrl(songId: string | null): string | null {
  if (!songId) return null;
  const u = localStorage.getItem("tunelog_user") || "";
  const p = localStorage.getItem("tunelog_password") || "";
  return `${NAVIDROME_URL}/rest/getCoverArt?id=${songId}&u=${u}&p=${p}&v=1.12.0&c=tunelog`;
}

function formatTime(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function extractScript(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["script", "content", "output", "data", "result", "text"]) {
      if (typeof obj[key] === "string") return obj[key] as string;
    }
    try { return JSON.stringify(raw, null, 2); } catch { return ""; }
  }
  return String(raw);
}

function useDarkMode() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark")),
    );
    obs.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function AlbumArt({ src, alt, size = 40 }: { src?: string | null; alt: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div
        className="rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0"
        style={{ width: size, height: size }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400 dark:text-gray-600">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </div>
    );
  }
  return (
    <img src={src} alt={alt} onError={() => setErr(true)}
      className="rounded-lg object-cover flex-shrink-0" style={{ width: size, height: size }} />
  );
}
function Checkbox({ checked, indeterminate, onChange }: { checked: boolean; indeterminate?: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return (
    <input ref={ref} type="checkbox" checked={checked} onChange={onChange}
      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-indigo-500 focus:ring-indigo-400 focus:ring-offset-0 bg-white dark:bg-gray-800 cursor-pointer accent-indigo-500" />
  );
}

function PaginationToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium select-none">Pagination</span>
      <button onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors focus:outline-none ${value ? "bg-indigo-500" : "bg-gray-300 dark:bg-gray-600"}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-0"}`} />
      </button>
    </div>
  );
}

function PaginationControls({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const items = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (page <= 4) return [1, 2, 3, 4, 5, "...", totalPages];
    if (page >= totalPages - 3) return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [1, "...", page - 1, page, page + 1, "...", totalPages];
  })();
  return (
    <div className="flex items-center justify-center gap-1 pt-2 flex-wrap">
      <button onClick={() => onPage(page - 1)} disabled={page === 1}
        className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">← Prev</button>
      {items.map((p, idx) =>
        p === "..." ? (
          <span key={`e-${idx}`} className="px-2 text-gray-400 dark:text-gray-600 select-none">…</span>
        ) : (
          <button key={p} onClick={() => onPage(p as number)}
            className={`w-8 h-7 rounded-lg text-xs font-semibold transition-colors ${p === page ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
            {p}
          </button>
        ),
      )}
      <button onClick={() => onPage(page + 1)} disabled={page === totalPages}
        className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Next →</button>
    </div>
  );
}

function SortButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${active ? "text-white border-indigo-500 bg-indigo-500 dark:border-indigo-400 dark:bg-indigo-400" : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 bg-transparent"}`}>
      {active ? `${label} ↑` : label}
    </button>
  );
}

const SHELL_META: Record<ShellType, { label: string; tooltip: string }> = {
  bash: {
    label: "Bash",
    tooltip: "Bash (Bourne Again Shell) is the default shell on most Linux distros. It's the most widely compatible choice — if you're unsure, pick Bash.",
  },
  fish: {
    label: "Fish",
    tooltip: "Fish is a modern, user-friendly Linux shell with better defaults, autosuggestions, and cleaner syntax. Pick this if you've configured Fish as your default shell.",
  },
  mac: {
    label: "Zsh",
    tooltip: "Zsh is the default shell on macOS (since Catalina). The generated script will use zsh-compatible syntax.",
  },
  powershell: {
    label: "PowerShell",
    tooltip: "PowerShell is the scripting environment on Windows. The generated script will use .ps1-compatible syntax.",
  },
};

type OsGroup = "linux" | "mac" | "windows";

function ShellNode({
  type,
  selected,
  onSelect,
}: {
  type: ShellType;
  selected: boolean;
  onSelect: () => void;
}) {
  const [tip, setTip] = useState(false);
  const meta = SHELL_META[type];

  return (
    <div className="relative">
      <button
        onClick={onSelect}
        onMouseEnter={() => setTip(true)}
        onMouseLeave={() => setTip(false)}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all group ${
          selected
            ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-400/10 dark:border-indigo-500"
            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-900"
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={selected ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300"}>
          <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        <span className={`text-xs font-semibold flex-1 ${selected ? "text-indigo-700 dark:text-indigo-400" : "text-gray-700 dark:text-gray-300"}`}>
          {meta.label}
        </span>
        {selected && (
          <span className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        )}
      </button>

      {tip && (
        <div className="absolute z-50 bottom-full left-0 mb-2 w-60 p-3 rounded-xl bg-gray-900 dark:bg-gray-950 text-white shadow-xl pointer-events-none">
          <p className="text-[11px] font-semibold mb-1 text-white/90">{meta.label}</p>
          <p className="text-[11px] text-gray-400 leading-relaxed">{meta.tooltip}</p>
          <div className="absolute top-full left-4 border-4 border-transparent border-t-gray-900 dark:border-t-gray-950" />
        </div>
      )}
    </div>
  );
}

function ShellTreeSelector({
  value,
  onChange,
}: {
  value: ShellType;
  onChange: (v: ShellType) => void;
}) {
  const [osGroup, setOsGroup] = useState<OsGroup>(() => {
    if (value === "mac") return "mac";
    if (value === "powershell") return "windows";
    return "linux";
  });

  const handleOsSelect = (g: OsGroup) => {
    setOsGroup(g);
    if (g === "linux") onChange("bash");
    if (g === "mac")   onChange("mac");
    if (g === "windows") onChange("powershell");
  };

  const osOptions: { id: OsGroup; label: string; icon: React.ReactNode }[] = [
    {
      id: "linux",
      label: "Linux / WSL",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
    },
    {
      id: "mac",
      label: "macOS",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" /><path d="M12 6v6l4 2" />
        </svg>
      ),
    },
    {
      id: "windows",
      label: "Windows",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="8" height="8" /><rect x="13" y="3" width="8" height="8" /><rect x="3" y="13" width="8" height="8" /><rect x="13" y="13" width="8" height="8" />
        </svg>
      ),
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {osOptions.map((os) => (
          <button
            key={os.id}
            onClick={() => handleOsSelect(os.id)}
            className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-center transition-all ${
              osGroup === os.id
                ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-400/10 dark:border-indigo-500"
                : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
            }`}
          >
            <span className={osGroup === os.id ? "text-indigo-600 dark:text-indigo-400" : "text-gray-500 dark:text-gray-400"}>
              {os.icon}
            </span>
            <span className={`text-[11px] font-semibold ${osGroup === os.id ? "text-indigo-700 dark:text-indigo-400" : "text-gray-600 dark:text-gray-400"}`}>
              {os.label}
            </span>
          </button>
        ))}
      </div>

      {osGroup === "linux" && (
        <div className="relative ml-4 pl-4">
          <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
          <div className="space-y-2">
            {(["bash", "fish"] as ShellType[]).map((sh) => (
              <div key={sh} className="relative">
                <div className="absolute -left-4 top-1/2 w-4 h-px bg-gray-200 dark:bg-gray-700" />
                <ShellNode type={sh} selected={value === sh} onSelect={() => onChange(sh)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  settings: SkippedSettings;
  onSaved: (s: SkippedSettings) => void;
}) {
  const [draft, setDraft] = useState<SkippedSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setDraft(settings); }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveScriptSettings(draft);
      onSaved(draft);
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 900);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-lg mx-4 sm:mx-auto">
      <div className="p-6 sm:p-7">
        <div className="mb-6 pr-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-400/10 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600 dark:text-indigo-400">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.07 4.93l-1.41 1.41M5.34 5.34L6.75 6.75M4 12H2M22 12h-2M6.75 17.25l-1.41 1.41M18.66 18.66l-1.41-1.41M12 22v-2M12 4V2" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Script Settings</h3>

                <a
                  href={WIKI_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Learn more on the TuneLog wiki"
                  className="flex items-center justify-center w-5 h-5 rounded-full text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </a>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Configure your shell and file preferences</p>
            </div>
          </div>
        </div>

        <div className="space-y-5">

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Shell / OS
              </label>
              <a
                href={WIKI_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-indigo-500 dark:text-indigo-400 hover:underline"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                What's the difference?
              </a>
            </div>
            <ShellTreeSelector
              value={draft.shell}
              onChange={(shell) => setDraft({ ...draft, shell })}
            />
          </div>


          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
              Base Music Path
            </label>
            <input
              type="text"
              value={draft.basePath}
              onChange={(e) => setDraft({ ...draft, basePath: e.target.value })}
              placeholder={draft.shell === "powershell" ? "C:\\Users\\you\\Music" : "/home/user/Music"}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400 dark:focus:border-indigo-500 font-mono transition-all"
            />
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 leading-relaxed">
              Root directory where your music files are stored. Paths in the script will be relative to this.
            </p>
          </div>


          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
              Action
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([
                {
                  value: "delete" as ScriptAction,
                  label: "Delete files",
                  desc: "Permanently remove the files from disk",
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                    </svg>
                  ),
                  activeBorder: "border-red-400 dark:border-red-500",
                  activeBg: "bg-red-50 dark:bg-red-400/10",
                  activeText: "text-red-700 dark:text-red-400",
                  activeIcon: "text-red-500 dark:text-red-400",
                },
                {
                  value: "move" as ScriptAction,
                  label: "Move to folder",
                  desc: "Move into a skipped/ subfolder",
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  ),
                  activeBorder: "border-amber-400 dark:border-amber-500",
                  activeBg: "bg-amber-50 dark:bg-amber-400/10",
                  activeText: "text-amber-700 dark:text-amber-400",
                  activeIcon: "text-amber-500 dark:text-amber-400",
                },
              ] as const).map((opt) => {
                const isActive = draft.action === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setDraft({ ...draft, action: opt.value })}
                    className={`flex flex-col items-center gap-2 px-3 py-4 rounded-xl border text-center transition-all ${
                      isActive
                        ? `${opt.activeBorder} ${opt.activeBg}`
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    <span className={isActive ? opt.activeIcon : "text-gray-400 dark:text-gray-500"}>
                      {opt.icon}
                    </span>
                    <div>
                      <p className={`text-xs font-semibold ${isActive ? opt.activeText : "text-gray-700 dark:text-gray-300"}`}>
                        {opt.label}
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>


        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !draft.basePath.trim()}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold transition-all ${
              saved
                ? "bg-emerald-500 text-white"
                : "bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            {saved ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                Saved!
              </>
            ) : saving ? (
              <>
                <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Saving…
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}


function ScriptModal({
  isOpen,
  onClose,
  script,
  shell,
}: {
  isOpen: boolean;
  onClose: () => void;
  script: string;
  shell: ShellType;
}) {
  const [copied, setCopied] = useState(false);
  const langLabel = shell === "bash" ? "bash" : shell === "fish" ? "fish" : shell === "mac" ? "zsh" : "powershell";


  const safeScript = typeof script === "string" ? script : extractScript(script);

  const handleCopy = () => {
    navigator.clipboard.writeText(safeScript).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const highlighted = safeScript.split("\n").map((line, i) => {
    const isComment = /^\s*(#|REM|<#)/.test(line);
    const isEcho    = /^\s*(echo|Write-Host|Write-Output)/i.test(line);
    const isShebang = line.startsWith("#!");
    return (
      <div key={i} className={
        isShebang ? "text-indigo-400 font-semibold" :
        isComment ? "text-gray-500 dark:text-gray-600 italic" :
        isEcho    ? "text-sky-400" :
                    "text-emerald-400"
      }>
        {line || " "}
      </div>
    );
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-2xl mx-4 sm:mx-auto">
      <div className="p-6 sm:p-7">
        <div className="mb-5 pr-10">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-400/10 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 dark:text-emerald-400">
                <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Generated {langLabel} Script</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500">Review carefully before running on your system</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 mb-4">
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-400" />
              <span className="w-3 h-3 rounded-full bg-yellow-400" />
              <span className="w-3 h-3 rounded-full bg-green-400" />
            </div>
            <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{langLabel}</span>
            <button onClick={handleCopy}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600">
              {copied ? (
                <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><polyline points="20 6 9 17 4 12" /></svg>Copied!</>
              ) : (
                <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>Copy</>
              )}
            </button>
          </div>
          {safeScript.trim() === "" ? (
            <div className="bg-gray-900 dark:bg-gray-950 p-4 flex items-center justify-center min-h-[80px]">
              <p className="text-xs text-gray-500 font-mono">No script content returned from server.</p>
            </div>
          ) : (
            <div className="bg-gray-900 dark:bg-gray-950 overflow-auto max-h-72 p-4">
              <pre className="font-mono text-xs leading-relaxed whitespace-pre">{highlighted}</pre>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/20 mb-5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
            This script will permanently affect files on your system. Always review carefully before running.
          </p>
        </div>


        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Close
          </button>
          <button onClick={handleCopy} disabled={safeScript.trim() === ""}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy to Clipboard
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RecommendPanel({
  entries, loading, selectedIds, onToggle, onToggleAll,
}: {
  entries: RecommendedSong[]; loading: boolean;
  selectedIds: Set<string>; onToggle: (id: string) => void;
  onToggleAll: (ids: string[], checked: boolean) => void;
}) {
  const allIds      = entries.map((e) => e.song_id).filter(Boolean) as string[];
  const allChecked  = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someChecked = allIds.some((id) => selectedIds.has(id));

  const reasonColor = (reason: string) => {
    const r = (reason ?? "").toLowerCase();
    if (r.includes("skip")) return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/10";
    if (r.includes("low") || r.includes("never")) return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-400/10";
    return "text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800";
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 flex flex-col">
      <div className="px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">Recommended to Delete</h4>
            {!loading && entries.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 dark:bg-red-400/15 text-red-700 dark:text-red-400">
                {entries.length}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">System recommendations</p>
        </div>
        {!loading && allIds.length > 0 && (
          <button onClick={() => onToggleAll(allIds, !allChecked)}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors whitespace-nowrap">
            {allChecked ? "Deselect all" : "Select all"}
          </button>
        )}
      </div>

      <div className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2">
            <svg className="animate-spin text-gray-400 dark:text-gray-600" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <span className="text-xs text-gray-400 dark:text-gray-600">Loading…</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-400/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 dark:text-emerald-400">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center leading-relaxed">
              No songs recommended<br />for deletion right now
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-3 px-2 pb-1 border-b border-gray-100 dark:border-gray-800 mb-1">
              <Checkbox checked={allChecked} indeterminate={someChecked && !allChecked} onChange={() => onToggleAll(allIds, !allChecked)} />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex-1">Song</span>
              <span className="hidden sm:block text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 w-14 text-right">Count</span>
            </div>
            {entries.map((entry) => {
              const id = entry.song_id ?? "";
              const isSelected = selectedIds.has(id);
              return (
                <div key={entry.song_id} onClick={() => onToggle(id)}
                  className={`flex items-center gap-3 px-2 py-2 rounded-xl cursor-pointer transition-colors ${isSelected ? "bg-red-50/80 dark:bg-red-400/5" : "hover:bg-gray-50 dark:hover:bg-gray-800/60"}`}>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={isSelected} onChange={() => onToggle(id)} />
                  </div>
                  <div className="relative flex-shrink-0">
                    <AlbumArt src={getCoverArtUrl(entry.song_id)} alt={entry.title ?? "Song"} size={34} />
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border border-white dark:border-gray-900 flex items-center justify-center">
                      <svg width="5" height="5" viewBox="0 0 24 24" fill="white"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" /></svg>
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-800 dark:text-white/90 truncate">{entry.title ?? "Unknown"}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{entry.artist ?? "—"}</p>
                      <span className={`flex-shrink-0 inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold ${reasonColor(entry.reason ?? "")}`}>
                        {entry.reason ?? "Low engagement"}
                      </span>
                    </div>
                  </div>
                  <span className="hidden sm:block text-xs font-semibold tabular-nums text-red-500 dark:text-red-400 w-14 text-right flex-shrink-0">
                    {entry.skip_count != null ? `${entry.skip_count}×` : "—"}
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

function SkippedPanel({
  entries, loading, selectedIds, onToggle, onToggleAll,
}: {
  entries: SkippedSong[]; loading: boolean;
  selectedIds: Set<string>; onToggle: (id: string) => void;
  onToggleAll: (ids: string[], checked: boolean) => void;
}) {
  const [search, setSearch]         = useState("");
  const [sort, setSort]             = useState<SortKey>("count");
  const [paginated, setPaginated]   = useState(true);
  const [page, setPage]             = useState(1);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loaderRef = useRef<HTMLDivElement>(null);

  const filtered = entries.filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (e.title ?? "").toLowerCase().includes(q) ||
      (e.artist ?? "").toLowerCase().includes(q) ||
      (e.album ?? "").toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "title")    return (a.title ?? "").localeCompare(b.title ?? "");
    if (sort === "artist")   return (a.artist ?? "").localeCompare(b.artist ?? "");
    if (sort === "album")    return (a.album ?? "").localeCompare(b.album ?? "");
    if (sort === "duration") return (b.duration ?? 0) - (a.duration ?? 0);
    if (sort === "count")    return (b.skip_count ?? 0) - (a.skip_count ?? 0);
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const totalPages  = Math.ceil(sorted.length / PAGE_SIZE);
  const displayed   = paginated
    ? sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : sorted.slice(0, visibleCount);

  const allIds      = sorted.map((e) => e.song_id).filter(Boolean) as string[];
  const allChecked  = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someChecked = allIds.some((id) => selectedIds.has(id));

  useEffect(() => {
    if (paginated || !loaderRef.current) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisibleCount((c) => c + PAGE_SIZE); },
      { threshold: 0.1 },
    );
    obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [paginated]);

  useEffect(() => { setPage(1); setVisibleCount(PAGE_SIZE); }, [search, sort]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 flex flex-col">

      <div className="px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">All Skipped Tracks</h4>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {loading ? "Loading…" : `${sorted.length} unique songs`}
              {someChecked && (
                <span className="ml-1.5 text-indigo-600 dark:text-indigo-400 font-semibold">
                  · {allIds.filter((id) => selectedIds.has(id)).length} selected
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[140px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400 transition-all" />
          </div>
          <PaginationToggle value={paginated} onChange={(v) => { setPaginated(v); setPage(1); setVisibleCount(PAGE_SIZE); }} />
        </div>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Sort</span>
          {(["count", "time", "title", "artist", "duration"] as SortKey[]).map((k) => (
            <SortButton key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} active={sort === k} onClick={() => setSort(k)} />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <svg className="animate-spin text-gray-400 dark:text-gray-600" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <p className="text-xs text-gray-400 dark:text-gray-600">Loading…</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/50">
                <th className="px-4 py-3 w-10">
                  <Checkbox checked={allChecked} indeterminate={someChecked && !allChecked} onChange={() => onToggleAll(allIds, !allChecked)} />
                </th>
                <th className="hidden sm:table-cell text-left px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 w-8">#</th>
                <th className="text-left px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Song</th>
                <th className="hidden lg:table-cell text-left px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Last Skipped</th>
                <th className="hidden md:table-cell text-left px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Dur</th>
                <th className="text-left px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
              {displayed.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-gray-400 dark:text-gray-600">{search ? "No matches." : "No skipped songs."}</td></tr>
              ) : (
                displayed.map((entry, i) => {
                  const id = entry.song_id ?? "";
                  const isSelected = selectedIds.has(id);
                  return (
                    <tr key={entry.id} onClick={() => onToggle(id)}
                      className={`transition-colors cursor-pointer ${isSelected ? "bg-indigo-50/60 dark:bg-indigo-400/5" : "hover:bg-gray-50/80 dark:hover:bg-gray-800/40"}`}>
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={isSelected} onChange={() => onToggle(id)} />
                      </td>
                      <td className="hidden sm:table-cell px-3 py-2.5 text-xs text-gray-400 dark:text-gray-600 tabular-nums">
                        {paginated ? (page - 1) * PAGE_SIZE + i + 1 : i + 1}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="relative flex-shrink-0">
                            <AlbumArt src={getCoverArtUrl(entry.song_id)} alt={entry.title ?? "Song"} size={34} />
                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border border-white dark:border-gray-900 flex items-center justify-center">
                              <svg width="5" height="5" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1"><polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-800 dark:text-white/90 truncate max-w-[120px] sm:max-w-none" title={entry.title ?? undefined}>
                              {entry.title ?? "Unknown Title"}
                            </p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">{entry.artist ?? "—"}</p>
                            <p className="text-[10px] font-bold text-red-500 dark:text-red-400 sm:hidden mt-0.5">
                              {entry.skip_count != null ? `${entry.skip_count}×` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap">
                        {formatTime(entry.timestamp)}
                      </td>
                      <td className="hidden md:table-cell px-3 py-2.5 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap">
                        {formatDuration(entry.duration)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold tabular-nums bg-red-50 dark:bg-red-400/10 text-red-600 dark:text-red-400">
                          {entry.skip_count != null ? `${entry.skip_count}×` : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {!loading && (
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          {paginated ? (
            <PaginationControls page={page} totalPages={totalPages} onPage={setPage} />
          ) : (
            visibleCount < sorted.length && (
              <div ref={loaderRef} className="flex justify-center">
                <span className="text-xs text-gray-400 dark:text-gray-600 animate-pulse">Loading more…</span>
              </div>
            )
          )}
          <p className="text-center text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">
            {sorted.length} songs
            {paginated ? ` · page ${page}/${Math.max(totalPages, 1)}` : ` · showing ${Math.min(visibleCount, sorted.length)}`}
          </p>
        </div>
      )}
    </div>
  );
}

function GenerateScriptBar({
  selectedCount, loading, onClick, settings, onOpenSettings,
}: {
  selectedCount: number; loading: boolean; onClick: () => void;
  settings: SkippedSettings; onOpenSettings: () => void;
}) {
  const missingPath = !settings.basePath.trim();
  const disabled    = selectedCount === 0 || loading || missingPath;

  const shellLabel  = settings.shell === "powershell" ? "PS"
    : settings.shell === "mac"   ? "Zsh"
    : settings.shell === "fish"  ? "Fish"
    : "Bash";

  return (
    <div className="sticky bottom-4 z-40 flex justify-center pointer-events-none px-4">
      <div className={`pointer-events-auto flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 rounded-2xl shadow-xl border transition-all duration-300 w-full max-w-xl ${
        disabled
          ? "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
          : "bg-gray-900 dark:bg-white border-transparent shadow-gray-900/25 dark:shadow-gray-900/40"
      }`}>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium truncate ${disabled ? "text-gray-400 dark:text-gray-500" : "text-gray-300 dark:text-gray-600"}`}>
            {missingPath ? (
              <button onClick={onOpenSettings} className="text-indigo-500 dark:text-indigo-400 hover:underline">
                Set base path in settings →
              </button>
            ) : selectedCount === 0 ? (
              "Select songs to generate a script"
            ) : (
              <span className={disabled ? "" : "text-white dark:text-gray-900 font-semibold"}>
                {selectedCount} song{selectedCount !== 1 ? "s" : ""} selected
              </span>
            )}
          </p>
          {!missingPath && settings.basePath && (
            <p className={`text-[10px] font-mono truncate mt-0.5 ${disabled ? "text-gray-300 dark:text-gray-600" : "text-gray-500 dark:text-gray-400"}`}>
              {settings.basePath}
            </p>
          )}
        </div>

        <button onClick={onOpenSettings} title="Script Settings"
          className={`flex-shrink-0 p-2 rounded-xl transition-colors ${
            disabled
              ? "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              : "text-gray-400 dark:text-gray-500 hover:text-white dark:hover:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200"
          }`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.07 4.93l-1.41 1.41M5.34 5.34L6.75 6.75M4 12H2M22 12h-2M6.75 17.25l-1.41 1.41M18.66 18.66l-1.41-1.41M12 22v-2M12 4V2" />
          </svg>
        </button>

        <button onClick={onClick} disabled={disabled}
          className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            disabled
              ? "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed"
              : "bg-white dark:bg-gray-900 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 shadow-sm"
          }`}>
          {loading ? (
            <><svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>Generating…</>
          ) : (
            <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
            Generate {shellLabel} Script</>
          )}
        </button>
      </div>
    </div>
  );
}
const DEFAULT_SETTINGS: SkippedSettings = { shell: "bash", basePath: "", action: "delete" };

export default function SkippedSongs() {
  const navigate = useNavigate();

  const [skipped, setSkipped]             = useState<SkippedSong[]>([]);
  const [recommended, setRecommended]     = useState<RecommendedSong[]>([]);
  const [loadingSkipped, setLoadingSkipped] = useState(true);
  const [loadingRec, setLoadingRec]         = useState(true);

  const [settings, setSettings]               = useState<SkippedSettings>(DEFAULT_SETTINGS);
  const [settingsConfigured, setSettingsConfigured] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen]   = useState(false);

  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [generatedScript, setGeneratedScript] = useState("");
  const [generatingScript, setGeneratingScript] = useState(false);
  const [scriptError, setScriptError]         = useState<string | null>(null);

  const [selectedSkippedIds, setSelectedSkippedIds] = useState<Set<string>>(new Set());
  const [selectedRecIds, setSelectedRecIds]         = useState<Set<string>>(new Set());

  useEffect(() => {
    const token =
      localStorage.getItem("tunelog_token") ||
      sessionStorage.getItem("tunelog_token");
    if (!token) { navigate("/signin"); return; }

    getScriptSettings()
      .then((saved) => {
        if (saved && saved.basePath) {
          setSettings(saved);
          setSettingsConfigured(true);
        } else {
          setSettingsModalOpen(true);
        }
      })
      .catch(() => setSettingsModalOpen(true));

    getSkippedSongs()
      .then((data) => { setSkipped(data); setLoadingSkipped(false); })
      .catch(() => setLoadingSkipped(false));

    getRecommendedDeletes()
      .then((data) => { setRecommended(data); setLoadingRec(false); })
      .catch(() => setLoadingRec(false));
  }, [navigate]);

  const toggleSkipped    = useCallback((id: string) => { setSelectedSkippedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); }, []);
  const toggleAllSkipped = useCallback((ids: string[], checked: boolean) => { setSelectedSkippedIds((p) => { const n = new Set(p); ids.forEach((id) => checked ? n.add(id) : n.delete(id)); return n; }); }, []);
  const toggleRec        = useCallback((id: string) => { setSelectedRecIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); }, []);
  const toggleAllRec     = useCallback((ids: string[], checked: boolean) => { setSelectedRecIds((p) => { const n = new Set(p); ids.forEach((id) => checked ? n.add(id) : n.delete(id)); return n; }); }, []);

  const totalSelected = selectedSkippedIds.size + selectedRecIds.size;

  const handleGenerateScript = async () => {
    setGeneratingScript(true);
    setScriptError(null);
    try {
      const songIds = [...Array.from(selectedSkippedIds), ...Array.from(selectedRecIds)];
      const raw = await generateScript({
        song_ids: songIds,
        shell: settings.shell,
        base_path: settings.basePath,
        action: settings.action,
      });
      const scriptStr = extractScript(raw);
      if (!scriptStr.trim()) {
        setScriptError("The server returned an empty script. Check your settings and try again.");
      }
      setGeneratedScript(scriptStr);
      setScriptModalOpen(true);
    } catch (err: unknown) {
      console.error(err);
      setScriptError(err instanceof Error ? err.message : "Failed to generate script. Please try again.");
      setGeneratedScript("");
      setScriptModalOpen(true);
    } finally {
      setGeneratingScript(false);
    }
  };

  const totalSkipEvents = skipped.reduce((s, e) => s + (e.skip_count ?? 1), 0);
  const uniqueArtists   = new Set(skipped.map((e) => e.artist).filter(Boolean)).size;
  const mostSkipped = (() => {
    const counts: Record<string, number> = {};
    skipped.forEach((e) => { if (e.artist) counts[e.artist] = (counts[e.artist] ?? 0) + (e.skip_count ?? 1); });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : "—";
  })();

  const shellLabel = settings.shell === "powershell" ? "PowerShell"
    : settings.shell === "mac"  ? "Zsh (macOS)"
    : settings.shell === "fish" ? "Fish (Linux)"
    : "Bash (Linux)";

  return (
    <>
      <PageMeta title="Skipped Songs — TuneLog" description="Browse skipped songs and manage your library" />
      <PageBreadcrumb pageTitle="Skipped Songs" />

      <div className="space-y-5 pb-28">

        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-red-500 via-orange-400 to-rose-500" />
          <div className="px-5 sm:px-7 py-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-400/10 flex items-center justify-center flex-shrink-0 border border-red-100 dark:border-red-400/20">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-red-500 dark:text-red-400">
                  <polygon points="5 4 15 12 5 20 5 4" /><rect x="17" y="4" width="3" height="16" rx="1" />
                </svg>
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Skipped Songs</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Library management · skip signal</p>
              </div>
            </div>
            <div className="flex items-center gap-5 sm:gap-7 flex-shrink-0 flex-wrap">
              <div className="text-center">
                <p className="text-lg font-semibold tabular-nums" style={{ color: "#E24B4A" }}>
                  {loadingSkipped ? "—" : totalSkipEvents}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-0.5">Skips</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold tabular-nums text-gray-800 dark:text-white/90">
                  {loadingSkipped ? "—" : uniqueArtists}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-0.5">Artists</p>
              </div>
              <div className="text-center max-w-[110px]">
                <p className="text-sm font-semibold truncate" style={{ color: "#EF9F27" }}>
                  {loadingSkipped ? "—" : mostSkipped}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-0.5">Most Skipped</p>
              </div>

              <button
                onClick={() => setSettingsModalOpen(true)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.07 4.93l-1.41 1.41M5.34 5.34L6.75 6.75M4 12H2M22 12h-2M6.75 17.25l-1.41 1.41M18.66 18.66l-1.41-1.41M12 22v-2M12 4V2" />
                </svg>
                <span className="hidden sm:inline">Script Settings</span>
                {settingsConfigured && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-400/15 text-emerald-700 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {shellLabel}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <RecommendPanel
            entries={recommended} loading={loadingRec}
            selectedIds={selectedRecIds} onToggle={toggleRec} onToggleAll={toggleAllRec}
          />
          <SkippedPanel
            entries={skipped} loading={loadingSkipped}
            selectedIds={selectedSkippedIds} onToggle={toggleSkipped} onToggleAll={toggleAllSkipped}
          />
        </div>
      </div>

      <GenerateScriptBar
        selectedCount={totalSelected} loading={generatingScript}
        onClick={handleGenerateScript} settings={settings}
        onOpenSettings={() => setSettingsModalOpen(true)}
      />

      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        settings={settings}
        onSaved={(s) => { setSettings(s); setSettingsConfigured(true); setSettingsModalOpen(false); }}
      />

      <ScriptModal
        isOpen={scriptModalOpen}
        onClose={() => { setScriptModalOpen(false); setScriptError(null); }}
        script={scriptError ? `# ERROR\n# ${scriptError}` : generatedScript}
        shell={settings.shell}
      />

      <MiniPlayer />
    </>
  );
}
