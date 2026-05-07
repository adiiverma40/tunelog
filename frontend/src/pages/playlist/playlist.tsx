import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { fetchLogin, fetchGetUsers } from "../../API/API";

import {
  PLAYLIST_TYPE_REGISTRY,
  PlaylistType,
  PlaylistTypeConfig,
} from "./shared/PlaylistTypes";
import { useDarkMode, useMediaQuery } from "./components/playlistShared";

import ListenbrainzPlaylist from "./ListenbrainzPlaylist";

import BlendPlaylist from "./BlendPlaylist";
import DiscoveryPlaylist from "./DisocveryPlaylist";

const PLAYLIST_COMPONENTS: Record<
  PlaylistType,
  React.ComponentType<PlaylistComponentProps>
> = {
  tunelog_blend: BlendPlaylist,
  discovery_queue: DiscoveryPlaylist,
  listenbrainz_sync: ListenbrainzPlaylist,
};

export interface PlaylistComponentProps {
  selectedUser: string;
  users: string[];
  setSelectedUser: (u: string) => void;
  dark: boolean;
  isMobile: boolean;
  isLargeScreen: boolean;
}

function TypeIcon({
  icon,
  size = 13,
}: {
  icon: PlaylistTypeConfig["icon"];
  size?: number;
}) {
  if (icon === "search")
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    );
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

export default function Playlist() {
  const dark = useDarkMode();
  const navigate = useNavigate();
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  const isMobile = useMediaQuery("(max-width: 640px)");

  const [users, setUsers] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [playlistType, setPlaylistType] = useState<PlaylistType>(
    PLAYLIST_TYPE_REGISTRY[0].value,
  );

  const card = dark ? "#131316" : "#ffffff";
  const cardBorder = dark ? "#222228" : "#e8e8e4";
  const textPrimary = dark ? "#f0f0ee" : "#18181a";
  const textMuted = dark ? "#555552" : "#a0a09c";

  useEffect(() => {
    const token =
      localStorage.getItem("tunelog_token") ||
      sessionStorage.getItem("tunelog_token");
    if (!token) {
      navigate("/signin");
      return;
    }
    const admin =
      localStorage.getItem("tunelog_user") ??
      sessionStorage.getItem("tunelog_user") ??
      "";
    const adminPD =
      localStorage.getItem("tunelog_password") ??
      sessionStorage.getItem("tunelog_password") ??
      "";
    fetchLogin({ username: admin, password: adminPD })
      .catch(() => {})
      .finally(() => {
        fetchGetUsers({ admin, adminPD }).then((res) => {
          if (res.status === "ok" && res.users) {
            const usernames = res.users.map((u: any) => u.username);
            setUsers(usernames);
            if (usernames.length > 0) setSelectedUser(usernames[0]);
          }
        });
      });
  }, []);

  const ActiveComponent = PLAYLIST_COMPONENTS[playlistType];
  const activeConfig = PLAYLIST_TYPE_REGISTRY.find(
    (t) => t.value === playlistType,
  )!;

  return (
    <div style={{ minHeight: "100vh" }}>
      <PageMeta
        title="Playlist | TuneLog"
        description="Generate and manage TuneLog playlists"
      />
      <PageBreadcrumb pageTitle="Playlist" />

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            background: card,
            border: `1px solid ${cardBorder}`,
            borderRadius: 14,
            padding: isMobile ? "10px 12px" : "12px 16px",
            display: "flex",
            alignItems: isMobile ? "flex-start" : "center",
            justifyContent: "space-between",
            flexDirection: isMobile ? "column" : "row",
            gap: 12,
          }}
        >
          <div>
            <p
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: textPrimary,
                margin: 0,
              }}
            >
              Playlist Type
            </p>
            <p style={{ fontSize: 11, color: textMuted, margin: "2px 0 0" }}>
              {activeConfig.description}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              background: dark ? "#1a1a1f" : "#f0f0ec",
              borderRadius: 10,
              padding: 3,
              gap: 3,
              alignSelf: isMobile ? "stretch" : "auto",
            }}
          >
            {PLAYLIST_TYPE_REGISTRY.map((cfg) => (
              <button
                key={cfg.value}
                onClick={() => setPlaylistType(cfg.value)}
                style={{
                  flex: 1,
                  padding: isMobile ? "8px 10px" : "7px 16px",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  background:
                    playlistType === cfg.value
                      ? dark
                        ? "#252530"
                        : "#ffffff"
                      : "transparent",
                  color:
                    playlistType === cfg.value ? cfg.accentColor : textMuted,
                  transition: "all 0.15s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  boxShadow:
                    playlistType === cfg.value
                      ? "0 1px 4px rgba(0,0,0,0.12)"
                      : "none",
                  whiteSpace: "nowrap",
                }}
              >
                <TypeIcon icon={cfg.icon} />
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        <ActiveComponent
          selectedUser={selectedUser}
          users={users}
          setSelectedUser={setSelectedUser}
          dark={dark}
          isMobile={isMobile}
          isLargeScreen={isLargeScreen}
        />
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
