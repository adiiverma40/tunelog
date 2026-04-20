import { useEffect } from "react";
import { connectNotificationStream } from "../API/API";
import type {
  SongStateEvent,
  PlaylistNotifEvent,
  StarredSongEvent,
} from "../API/API";

const STORAGE_KEY = "tunelog_notifications";
const UNREAD_KEY = "tunelog_notif_unread";
const MAX_PER_TYPE = 10;

export interface StoredSongState extends SongStateEvent {
  receivedAt: string;
}
export interface StoredPlaylist extends PlaylistNotifEvent {
  receivedAt: string;
}
export interface StoredStarredSong extends StarredSongEvent {
  receivedAt: string;
}

export interface StoredNotifications {
  songState: StoredSongState[];
  playlist: StoredPlaylist[];
  starredSong: StoredStarredSong[];
}

const EMPTY: StoredNotifications = {
  songState: [],
  playlist: [],
  starredSong: [],
};

export function readNotifications(): StoredNotifications {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeNotifications(data: StoredNotifications) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new Event("tunelog_notif_update"));
}

export function markAsRead() {
  localStorage.setItem(UNREAD_KEY, "false");
  window.dispatchEvent(new Event("tunelog_notif_update"));
}

export function hasUnread(): boolean {
  return localStorage.getItem(UNREAD_KEY) === "true";
}

function prepend<T>(arr: T[], item: T): T[] {
  return [item, ...arr].slice(0, MAX_PER_TYPE);
}

export function useNotificationStream() {
    console.log("in hook")
  useEffect(() => {
    const es = connectNotificationStream((payload) => {
      const current = readNotifications();
      const now = new Date().toISOString();
        console.log(current)
      if (payload.songState?.length) {
        for (const item of payload.songState) {
          current.songState = prepend(current.songState, {
            ...item,
            receivedAt: now,
          });
        }
      }

      if (payload.playlist?.length) {
        for (const item of payload.playlist) {
          current.playlist = prepend(current.playlist, {
            ...item,
            receivedAt: now,
          });
        }
      }

      if (payload.starredSong?.length) {
        for (const item of payload.starredSong) {
          current.starredSong = prepend(current.starredSong, {
            ...item,
            receivedAt: now,
          });
        }
      }

      writeNotifications(current);
      localStorage.setItem(UNREAD_KEY, "true");
    });

    return () => es.close();
  }, []);
}