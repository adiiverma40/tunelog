import { useEffect, useState } from "react";
import { changelog, CURRENT_VERSION, ChangelogEntry } from "../data/changelog";
import { compareVersions } from "../utils/compareVerisons";

const STORAGE_KEY = "whatsnew_last_seen_version";

export const useWhatsNew = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);

  useEffect(() => {
    const lastSeen = localStorage.getItem(STORAGE_KEY);

    if (!lastSeen) {
      setEntries(changelog);
      setIsOpen(true);
      return;
    }

    if (compareVersions(CURRENT_VERSION, lastSeen) > 0) {
      setEntries(
        changelog.filter((e) => compareVersions(e.version, lastSeen) > 0),
      );
      setIsOpen(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
    setIsOpen(false);
  };

  return { isOpen, entries, dismiss };
};
