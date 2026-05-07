export type ExplicitFilter = "strict" | "allow_cleaned" | "all";
export type SortKey = "title" | "artist" | "genre" | "signal" | "date_added";
export type SyncMode = "regenerate" | "append";
export type PlaylistType =
  | "tunelog_blend"
  | "discovery_queue"
  | "listenbrainz_sync";

export type DiscoveryDateMode = "slider" | "calendar";

export interface SlotValues {
  positive: number;
  repeat: number;
  partial: number;
  skip: number;
  [key: string]: number;
}

export interface WeightValues {
  repeat: number;
  positive: number;
  partial: number;
  skip: number;
  [key: string]: number;
}

export interface Preset {
  id: string;
  label: string;
  desc: string;
  slots: SlotValues;
  weights: WeightValues;
}

export interface PlaylistTypeConfig {
  value: PlaylistType;
  label: string;
  description: string;
  accentColor: string;
  gradient: string;
  icon: "music" | "search";
}

export const PLAYLIST_TYPE_REGISTRY: PlaylistTypeConfig[] = [
  {
    value: "tunelog_blend",
    label: "TuneLog Blend",
    description: "Signal-weighted playlist from your listening history",
    accentColor: "#7F77DD",
    gradient: "linear-gradient(135deg, #7F77DD 0%, #534AB7 100%)",
    icon: "music",
  },
  {
    value: "discovery_queue",
    label: "Discovery Queue",
    description: "Unheard songs added within a date window",
    accentColor: "#378ADD",
    gradient: "linear-gradient(135deg, #378ADD 0%, #185FA5 100%)",
    icon: "search",
  },
  {
    value: "listenbrainz_sync",
    label: "ListenBrainz",
    description: "Import and sync playlists from ListenBrainz",
    accentColor: "#EB743B",
    gradient: "linear-gradient(135deg, #EB743B 0%, #C45520 100%)",
    icon: "music",
  },
];

export const SIGNAL_CONFIG: Record<
  string,
  {
    label: string;
    color: string;
    lightBg: string;
    darkBg: string;
    lightText: string;
    darkText: string;
    dot: string;
  }
> = {
  skip: {
    label: "Skip",
    color: "#E24B4A",
    lightBg: "#FCEBEB",
    darkBg: "rgba(226,75,74,0.12)",
    lightText: "#A32D2D",
    darkText: "#F09595",
    dot: "#E24B4A",
  },
  partial: {
    label: "Partial",
    color: "#EF9F27",
    lightBg: "#FAEEDA",
    darkBg: "rgba(239,159,39,0.12)",
    lightText: "#854F0B",
    darkText: "#FAC775",
    dot: "#EF9F27",
  },
  positive: {
    label: "Complete",
    color: "#639922",
    lightBg: "#EAF3DE",
    darkBg: "rgba(99,153,34,0.12)",
    lightText: "#3B6D11",
    darkText: "#97C459",
    dot: "#639922",
  },
  repeat: {
    label: "Repeat",
    color: "#7F77DD",
    lightBg: "#EEEDFE",
    darkBg: "rgba(127,119,221,0.12)",
    lightText: "#534AB7",
    darkText: "#AFA9EC",
    dot: "#7F77DD",
  },
  unheard: {
    label: "Unheard",
    color: "#378ADD",
    lightBg: "#E6F1FB",
    darkBg: "rgba(55,138,221,0.12)",
    lightText: "#185FA5",
    darkText: "#85B7EB",
    dot: "#378ADD",
  },
  wildcard: {
    label: "Wildcard",
    color: "#D4537E",
    lightBg: "#FBEAF0",
    darkBg: "rgba(212,83,126,0.12)",
    lightText: "#993556",
    darkText: "#ED93B1",
    dot: "#D4537E",
  },
};

export const SLOT_COLORS: Record<string, string> = {
  positive: "#639922",
  repeat: "#7F77DD",
  partial: "#EF9F27",
  skip: "#E24B4A",
  unheard: "#378ADD",
  wildcard: "#D4537E",
};

export const EXPLICIT_CONFIG: Record<string, { label: string; color: string }> =
  {
    explicit: { label: "E", color: "#E24B4A" },
    cleaned: { label: "C", color: "#EF9F27" },
    notExplicit: { label: "✓", color: "#639922" },
    notInItunes: { label: "?", color: "#888780" },
  };

export const SIGNAL_ORDER: (keyof SlotValues)[] = [
  "positive",
  "repeat",
  "partial",
  "skip",
];

export const INITIAL_PRESETS: Preset[] = [
  {
    id: "default",
    label: "Default",
    desc: "Your saved global backend settings",
    slots: { positive: 0.35, repeat: 0.35, partial: 0.25, skip: 0.05 },
    weights: { repeat: 3, positive: 2, partial: 0, skip: -2 },
  },
  {
    id: "discovery",
    label: "Discovery",
    desc: "More unheard songs, fewer repeats",
    slots: { positive: 0.2, repeat: 0.15, partial: 0.6, skip: 0.05 },
    weights: { repeat: 2, positive: 2, partial: 2, skip: -1 },
  },
  {
    id: "favorites",
    label: "Favourites",
    desc: "Heavy on repeats and positives",
    slots: { positive: 0.45, repeat: 0.45, partial: 0.1, skip: 0 },
    weights: { repeat: 5, positive: 3, partial: 1, skip: 0 },
  },
  {
    id: "custom",
    label: "Custom",
    desc: "Set your own ratios and weights",
    slots: { positive: 0.35, repeat: 0.35, partial: 0.25, skip: 0.05 },
    weights: { repeat: 3, positive: 2, partial: 0, skip: -2 },
  },
];

export const BLEND_PAGE_SIZE = 10;
export const DISCOVERY_PAGE_SIZE = 15;

export const formatLastGenerated = (raw: string | null): string => {
  if (!raw) return "Never";
  const date = new Date(raw.replace(" ", "T") + "Z");
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const toISODate = (d: Date | null): string => {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const normaliseSlots = (updated: SlotValues): SlotValues => {
  const total = Object.values(updated).reduce((a, b) => a + b, 0);
  if (total === 0) return updated;
  return {
    positive: updated.positive / total,
    repeat: updated.repeat / total,
    partial: updated.partial / total,
    skip: updated.skip / total,
  };
};
