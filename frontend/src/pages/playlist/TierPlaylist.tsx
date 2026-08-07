import React, { useState } from "react";
import { tierPlaylist } from "../../API"; 
import { useThemeTokens } from "./components/playlistShared"; 
import { PlaylistComponentProps } from "./Playlist";

export default function TierPlaylist({
  selectedUser,
  users,
  setSelectedUser,
  dark,
  isMobile,
}: PlaylistComponentProps) {
  const [size, setSize] = useState(40);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState("");

  const tokens = useThemeTokens(dark, isMobile);
  const {
    card,
    cardBorder,
    textPrimary,
    textMuted,
    inputBg,
    inputBorder,
    cardPadding,
    sectionLabel,
  } = tokens;

  const accentColor = "#7F77DD";
  const gradient = "linear-gradient(135deg, #7F77DD 0%, #534AB7 100%)";

  const handleCreate = async () => {
    if (!selectedUser) return;
    setIsCreating(true);
    setMessage("");
    try {
      const res = await tierPlaylist({ username: selectedUser, size });
      setMessage(`✓ Tier playlist created (${size} songs)`);
    } catch (e: any) {
      setMessage(`Error: ${e.message ?? "Failed to create tier playlist"}`);
    } finally {
      setIsCreating(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  return (
    <div
      style={{
        background: card,
        border: `1px solid ${cardBorder}`,
        borderRadius: 14,
        padding: cardPadding,
        display: "flex",
        flexDirection: "column",
        gap: 18,
        width: "100%",
        maxWidth: isMobile ? "100%" : 400,
        boxSizing: "border-box",
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
          Tier Playlist
        </p>
        <p style={{ fontSize: 11, color: textMuted, margin: "3px 0 0" }}>
          Generate a playlist ranked by tier.
        </p>
      </div>

    
      <div style={{ width: "100%", boxSizing: "border-box" }}>
        <label style={sectionLabel}>User</label>
        <select
          value={selectedUser}
          onChange={(e) => setSelectedUser(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "8px 12px",
            borderRadius: 8,
            border: `1px solid ${inputBorder}`,
            background: inputBg,
            color: textPrimary,
            fontSize: 13,
            outline: "none",
            appearance: "auto",
          }}
        >
          {users.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      <div style={{ width: "100%", boxSizing: "border-box" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <label style={{ ...sectionLabel, marginBottom: 0 }}>Size</label>
          <span style={{ fontSize: 13, fontWeight: 700, color: textPrimary }}>
            {size}
          </span>
        </div>
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          style={{ width: "100%", boxSizing: "border-box", accentColor }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10,
            color: textMuted,
            marginTop: 4,
          }}
        >
          <span>10</span>
          <span>100</span>
        </div>
      </div>


      <button
        onClick={handleCreate}
        disabled={isCreating || !selectedUser}
        style={{
          width: "100%",
          padding: "11px 0",
          borderRadius: 10,
          border: "none",
          cursor: isCreating ? "not-allowed" : "pointer",
          background: isCreating ? (dark ? "#2a2a30" : "#e0e0dc") : gradient,
          color: isCreating ? textMuted : "#ffffff",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.02em",
          transition: "all 0.2s",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {isCreating ? (
          <>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              style={{ animation: "spin 0.8s linear infinite" }}
            >
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            Creating…
          </>
        ) : (
          "Create Tier Playlist"
        )}
      </button>

      {message && (
        <p
          style={{
            fontSize: 12,
            color: message.startsWith("✓") ? "#639922" : "#E24B4A",
            textAlign: "center",
            margin: 0,
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}
