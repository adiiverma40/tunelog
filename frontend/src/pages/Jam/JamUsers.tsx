import { useState, useRef, useEffect } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { useGlobalSocket, ConnectedUser } from "../../context/SocketContext";
import { Modal } from "../../components/ui/modal";
import Button from "../../components/ui/button/Button";

function getStoredValue(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key) || sessionStorage.getItem(key);
}

function getCurrentUsername(): string {
  return getStoredValue("tunelog_user") || "";
}

function safeParseUsers(
  raw: string | null,
): Array<{ username: string; name: string | null; avatarUrl: string | null }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function resolveUserMeta(username: string): {
  displayName: string;
  avatarUrl: string | null;
} {
  const cache = safeParseUsers(localStorage.getItem("tunelog_users_cache"));
  const match = cache.find((u) => u.username === username);

  return {
    displayName: match?.name || username,
    avatarUrl:
      match?.avatarUrl || getStoredValue(`tunelog_avatar_${username}`) || null,
  };
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatChatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFallbackAvatarClass(seed: string): string {
  const colors = [
    "bg-brand-500",
    "bg-pink-500",
    "bg-amber-500",
    "bg-emerald-500",
    "bg-cyan-500",
    "bg-violet-500",
  ];
  const idx = seed ? seed.charCodeAt(0) % colors.length : 0;
  return colors[idx];
}

interface AvatarUser {
  displayName: string;
  avatarUrl: string | null;
  isActive: boolean;
  username: string;
}

function Avatar({
  user,
  size = "md",
  pulse = false,
}: {
  user: AvatarUser;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
}) {
  const sizeClass =
    size === "sm"
      ? "h-7 w-7 text-xs"
      : size === "lg"
        ? "h-11 w-11 text-base"
        : "h-9 w-9 text-sm";

  const fallbackClass = getFallbackAvatarClass(user.username);

  return (
    <div className="relative flex-shrink-0">
      <div
        className={`${sizeClass} overflow-hidden rounded-full font-semibold text-white ${
          user.avatarUrl ? "bg-gray-200" : fallbackClass
        } flex items-center justify-center`}
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.displayName}
            className="h-full w-full object-cover"
          />
        ) : (
          getInitials(user.displayName)
        )}
      </div>

      {pulse && user.isActive && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
      )}

      {pulse && !user.isActive && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-gray-300 dark:border-gray-900 dark:bg-gray-600" />
      )}
    </div>
  );
}

interface EnrichedUser extends ConnectedUser {
  displayName: string;
  avatarUrl: string | null;
}

function enrichUsers(raw: ConnectedUser[]): EnrichedUser[] {
  return raw.map((u) => {
    const meta = resolveUserMeta(u.username);
    return { ...u, ...meta };
  });
}

function TransferHostModal({
  isOpen,
  users,
  onTransfer,
  onClose,
}: {
  isOpen: boolean;
  users: EnrichedUser[];
  onTransfer: (username: string) => void;
  onClose: () => void;
}) {
  const eligible = users.filter((u) => !u.isHost && u.isActive);

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[400px] m-4">
      <div className="no-scrollbar relative w-full max-w-[400px] overflow-y-auto rounded-3xl bg-white p-6 dark:bg-gray-900">
        <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
          Transfer Host
        </h3>
        <p className="mb-4 text-xs text-gray-400">
          The new host will control playback and queue for everyone in the jam.
        </p>

        {eligible.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">
            No eligible listeners to transfer to.
          </p>
        ) : (
          <div className="space-y-1">
            {eligible.map((u) => (
              <button
                key={u.sid}
                onClick={() => onTransfer(u.username)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.05]"
              >
                <Avatar user={u} size="md" pulse />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                    {u.displayName}
                  </p>
                  <p className="text-xs text-gray-400">@{u.username}</p>
                </div>
                <span className="text-xs text-brand-500">Make host →</span>
              </button>
            ))}
          </div>
        )}

        <Button variant="outline" onClick={onClose} className="mt-5 w-full">
          Cancel
        </Button>
      </div>
    </Modal>
  );
}

const CARD_HEIGHT = "h-[700px]";

export default function JamUsers() {
  const {
    connectedUsers,
    chatMessages,
    sendChatMessage,
    socket,
    nowPlaying,
    isHost: isCurrentUserHost,
  } = useGlobalSocket();

  const currentUsername = getCurrentUsername();
  const [inputText, setInputText] = useState("");
  const [showTransferModal, setShowTransferModal] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const users: EnrichedUser[] = enrichUsers(connectedUsers);
  const activeListeners = users.filter((u) => u.isActive);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  function handleSendMessage() {
    const text = inputText.trim();
    if (!text) return;
    sendChatMessage(text);
    setInputText("");
  }

  function handleTransferHost(toUsername: string) {
    socket.emit("transfer_host", { toUsername });
    setShowTransferModal(false);
  }

  const ListenersPanel = (
    <div
      className={`flex flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${CARD_HEIGHT}`}
    >
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <div>
          <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
            In the Jam
          </h4>
          <p className="text-xs text-gray-400">
            {activeListeners.length} listening · {users.length} total
          </p>
        </div>

        {isCurrentUserHost && (
          <button
            onClick={() => setShowTransferModal(true)}
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:border-brand-500 hover:text-brand-500 dark:border-gray-700 dark:text-gray-400"
          >
            Transfer host
          </button>
        )}
      </div>

      {nowPlaying && (
        <div className="flex-shrink-0 border-b border-gray-100 bg-brand-500/5 px-5 py-3 dark:border-gray-800 dark:bg-brand-500/[0.07]">
          <p className="mb-0.5 text-xs font-medium text-brand-500">
            Now Playing
          </p>
          <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
            {nowPlaying.song.title}
          </p>
          <p className="truncate text-xs text-gray-400">
            {nowPlaying.song.artist}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-1 p-3">
        {users.map((user) => (
          <div
            key={user.sid}
            className={`flex items-center gap-3 rounded-xl px-3 py-3 transition-colors ${
              user.isActive
                ? "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                : "opacity-50"
            }`}
          >
            <Avatar user={user} size="md" pulse />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                  {user.displayName}
                </p>
                {user.isHost && (
                  <span className="flex-shrink-0 rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-500">
                    Host
                  </span>
                )}
                {user.username === currentUsername && (
                  <span className="flex-shrink-0 text-[10px] text-gray-400">
                    (you)
                  </span>
                )}
                {!user.isActive && (
                  <span className="flex-shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-400 dark:bg-white/[0.05]">
                    left
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400">@{user.username}</p>
            </div>

            <div className="flex flex-shrink-0 flex-col items-end gap-1">
              {user.isActive ? (
                <span className="flex items-center gap-1 text-xs text-emerald-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  listening
                </span>
              ) : (
                <span className="text-xs text-gray-400">idle</span>
              )}

              {isCurrentUserHost &&
                !user.isHost &&
                user.username !== currentUsername &&
                user.isActive && (
                  <button
                    onClick={() => handleTransferHost(user.username)}
                    className="text-[10px] text-gray-400 transition-colors hover:text-brand-500"
                  >
                    make host
                  </button>
                )}
            </div>
          </div>
        ))}

        {users.length === 0 && (
          <p className="py-8 text-center text-xs text-gray-400">
            No one in the jam yet.
          </p>
        )}
      </div>
    </div>
  );

  const ChatPanel = (
    <div
      className={`flex flex-col rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${CARD_HEIGHT}`}
    >
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <div>
          <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Chat
          </h4>
          <p className="text-xs text-gray-400">
            {chatMessages.length} messages
          </p>
        </div>

        <div className="flex -space-x-2">
          {activeListeners.slice(0, 4).map((u) => (
            <div
              key={u.sid}
              title={u.displayName}
              className="h-6 w-6 rounded-full border-2 border-white dark:border-gray-900"
            >
              <Avatar user={u} size="sm" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 px-4 py-3">
        {chatMessages.map((msg, i) => {
          const isMine = msg.username === currentUsername;
          const prevMsg = chatMessages[i - 1];
          const showAvatar = !prevMsg || prevMsg.username !== msg.username;

          const senderMeta = resolveUserMeta(msg.username);
          const avatarUser: AvatarUser = {
            displayName: senderMeta.displayName,
            avatarUrl: senderMeta.avatarUrl,
            isActive: true,
            username: msg.username,
          };

          return (
            <div
              key={msg.id}
              className={`flex items-end gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}
            >
              <div className="w-7 flex-shrink-0">
                {showAvatar && !isMine && (
                  <Avatar user={avatarUser} size="sm" />
                )}
              </div>

              <div
                className={`flex max-w-[72%] flex-col gap-0.5 ${
                  isMine ? "items-end" : "items-start"
                }`}
              >
                {showAvatar && !isMine && (
                  <span className="ml-1 text-[10px] text-gray-400">
                    {senderMeta.displayName}
                  </span>
                )}
                <div
                  className={`rounded-2xl px-3 py-2 text-sm ${
                    isMine
                      ? "rounded-br-sm bg-brand-500 text-white"
                      : "rounded-bl-sm bg-gray-100 text-gray-800 dark:bg-white/[0.06] dark:text-white/90"
                  }`}
                >
                  {msg.text}
                </div>
                <span className="mx-1 text-[9px] text-gray-300 dark:text-gray-600">
                  {formatChatTime(msg.sentAt)}
                </span>
              </div>
            </div>
          );
        })}

        {chatMessages.length === 0 && (
          <p className="py-8 text-center text-xs text-gray-400">
            No messages yet. Say something!
          </p>
        )}

        <div ref={chatEndRef} />
      </div>

      <div className="flex-shrink-0 border-t border-gray-100 px-3 py-3 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            placeholder="Send a message..."
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:bg-white/[0.04] dark:text-gray-300 dark:placeholder-gray-600"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputText.trim()}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.908 6.444H10.5a.75.75 0 0 1 0 1.5H4.187l-1.908 6.444a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.208-8.531.75.75 0 0 0 0-1.052A28.897 28.897 0 0 0 3.105 2.288Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <PageMeta
        title="Jam Users | TuneLog"
        description="People listening in the jam"
      />
      <PageBreadcrumb pageTitle="Jam" />

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="order-1 col-span-12 lg:order-2 lg:col-span-8">
          {ChatPanel}
        </div>
        <div className="order-2 col-span-12 lg:order-1 lg:col-span-4">
          {ListenersPanel}
        </div>
      </div>

      <TransferHostModal
        isOpen={showTransferModal}
        users={users}
        onTransfer={handleTransferHost}
        onClose={() => setShowTransferModal(false)}
      />
    </div>
  );
}
