import { useState, useRef, useEffect } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";

interface JamUser {
  id: string;
  username: string;
  displayName: string;
  isHost: boolean;
  isListening: boolean;
  joinedAt: string;
  avatarUrl: string | null;
}

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  text: string;
  sentAt: string;
  avatarUrl: string | null;
}

function getStoredValue(key: string) {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key) || sessionStorage.getItem(key);
}

function getCurrentUserId() {
  return getStoredValue("tunelog_user") || "";
}

function getIsHost() {
  return getStoredValue("isHost") === "true";
}

function safeParseUsers(raw: string | null): Array<{
  username: string;
  password: string;
  isAdmin: boolean;
  name: string | null;
  avatarUrl: string | null;
}> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getDisplayName(username: string, fallbackName: string | null) {
  return (
    fallbackName ||
    getStoredValue(`tunelog_displayname_${username}`) ||
    username
  );
}

function getAvatarUrl(username: string, fallbackAvatar: string | null) {
  return fallbackAvatar || getStoredValue(`tunelog_avatar_${username}`);
}

function loadJamUsersFromStorage(): JamUser[] {
  if (typeof window === "undefined") return [];

  const cachedUsers = safeParseUsers(
    localStorage.getItem("tunelog_users_cache"),
  );
  const currentUserId = getCurrentUserId();
  const currentUserIsHost = getIsHost();

  return cachedUsers.map((u, index) => ({
    id: u.username,
    username: u.username,
    displayName: getDisplayName(u.username, u.name),
    isHost: u.username === currentUserId ? currentUserIsHost : false,
    isListening: true,
    joinedAt: new Date(Date.now() - (index + 1) * 1000 * 60 * 12).toISOString(),
    avatarUrl: getAvatarUrl(u.username, u.avatarUrl),
  }));
}

const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: "m1",
    userId: "adii",
    username: "adii",
    displayName: "Adii",
    text: "Jam started 🎵",
    sentAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    avatarUrl: null,
  },
  {
    id: "m2",
    userId: "aditi",
    username: "aditi",
    displayName: "Aditi",
    text: "yo this queue is 🔥",
    sentAt: new Date(Date.now() - 1000 * 60 * 29).toISOString(),
    avatarUrl: null,
  },
  {
    id: "m3",
    userId: "rajkrit",
    username: "rajkrit",
    displayName: "Rajkrit",
    text: "add teeth by 5sos next",
    sentAt: new Date(Date.now() - 1000 * 60 * 17).toISOString(),
    avatarUrl: null,
  },
  {
    id: "m4",
    userId: "adii",
    username: "adii",
    displayName: "Adii",
    text: "already in queue lol",
    sentAt: new Date(Date.now() - 1000 * 60 * 16).toISOString(),
    avatarUrl: null,
  },
  {
    id: "m5",
    userId: "aditi",
    username: "aditi",
    displayName: "Aditi",
    text: "adii add some arijit",
    sentAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    avatarUrl: null,
  },
  {
    id: "m6",
    userId: "rajkrit",
    username: "rajkrit",
    displayName: "Rajkrit",
    text: "rait zara si is already there 😭",
    sentAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    avatarUrl: null,
  },
];

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatRelativeTime(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function formatChatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFallbackAvatarClass(seed: string) {
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

function Avatar({
  user,
  size = "md",
  pulse = false,
}: {
  user: Pick<JamUser, "displayName" | "avatarUrl" | "isListening" | "username">;
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

      {pulse && user.isListening && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
      )}

      {pulse && !user.isListening && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-gray-300 dark:border-gray-900 dark:bg-gray-600" />
      )}
    </div>
  );
}

function TransferHostModal({
  users,
  onTransfer,
  onClose,
}: {
  users: JamUser[];
  onTransfer: (userId: string) => void;
  onClose: () => void;
}) {
  const eligible = users.filter((u) => !u.isHost && u.isListening);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <h3 className="mb-1 text-base font-semibold text-gray-800 dark:text-white/90">
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
                key={u.id}
                onClick={() => onTransfer(u.id)}
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

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-xl border border-gray-200 py-2 text-sm text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const CARD_HEIGHT = "h-[700px]";

export default function JamUsers() {
  const [users, setUsers] = useState<JamUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES);
  const [inputText, setInputText] = useState("");
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncFromStorage = () => {
      setCurrentUserId(getCurrentUserId());
      setUsers(loadJamUsersFromStorage());
    };

    syncFromStorage();

    const handleStorage = () => syncFromStorage();
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const host = users.find((u) => u.isHost);
  const activeListeners = users.filter((u) => u.isListening);
  const isCurrentUserHost =
    users.find((u) => u.id === currentUserId)?.isHost ?? false;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSendMessage() {
    const text = inputText.trim();
    if (!text) return;

    const me = users.find((u) => u.id === currentUserId);
    if (!me) return;

    const newMsg: ChatMessage = {
      id: `m${Date.now()}`,
      userId: me.id,
      username: me.username,
      displayName: me.displayName,
      text,
      sentAt: new Date().toISOString(),
      avatarUrl: me.avatarUrl,
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputText("");
  }

  function handleTransferHost(toUserId: string) {
    setUsers((prev) => prev.map((u) => ({ ...u, isHost: u.id === toUserId })));
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

      <div className="flex-shrink-0 border-b border-gray-100 bg-brand-500/5 px-5 py-3 dark:border-gray-800 dark:bg-brand-500/[0.07]">
        <p className="mb-0.5 text-xs font-medium text-brand-500">Now Playing</p>
        <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
          Aakhri Ishq
        </p>
        <p className="truncate text-xs text-gray-400">
          Shashwat Sachdev, Jubin Nautiyal &amp; Irshad Kamil
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {users.map((user) => (
          <div
            key={user.id}
            className={`flex items-center gap-3 rounded-xl px-3 py-3 transition-colors ${
              user.isListening
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
                {user.id === currentUserId && (
                  <span className="flex-shrink-0 text-[10px] text-gray-400">
                    (you)
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400">
                @{user.username} · joined {formatRelativeTime(user.joinedAt)}
              </p>
            </div>

            <div className="flex flex-shrink-0 flex-col items-end gap-1">
              {user.isListening ? (
                <span className="flex items-center gap-1 text-xs text-emerald-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  listening
                </span>
              ) : (
                <span className="text-xs text-gray-400">idle</span>
              )}

              {isCurrentUserHost &&
                !user.isHost &&
                user.id !== currentUserId &&
                user.isListening && (
                  <button
                    onClick={() => handleTransferHost(user.id)}
                    className="text-[10px] text-gray-400 transition-colors hover:text-brand-500"
                  >
                    make host
                  </button>
                )}
            </div>
          </div>
        ))}
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
          <p className="text-xs text-gray-400">{messages.length} messages</p>
        </div>

        <div className="flex -space-x-2">
          {activeListeners.slice(0, 4).map((u) => (
            <div
              key={u.id}
              title={u.displayName}
              className="h-6 w-6 rounded-full border-2 border-white text-[9px] font-bold text-white dark:border-gray-900"
            >
              <Avatar user={u} size="sm" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => {
          const isMine = msg.userId === currentUserId;
          const prevMsg = messages[i - 1];
          const showAvatar = !prevMsg || prevMsg.userId !== msg.userId;

          return (
            <div
              key={msg.id}
              className={`flex items-end gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}
            >
              <div className="w-7 flex-shrink-0">
                {showAvatar && !isMine && (
                  <Avatar
                    user={{
                      displayName: msg.displayName,
                      avatarUrl: msg.avatarUrl,
                      isListening: true,
                      username: msg.username,
                    }}
                    size="sm"
                  />
                )}
              </div>

              <div
                className={`flex max-w-[72%] flex-col gap-0.5 ${
                  isMine ? "items-end" : "items-start"
                }`}
              >
                {showAvatar && !isMine && (
                  <span className="ml-1 text-[10px] text-gray-400">
                    {msg.displayName}
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
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white transition-opacity disabled:opacity-40 hover:opacity-90"
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

      {showTransferModal && (
        <TransferHostModal
          users={users}
          onTransfer={handleTransferHost}
          onClose={() => setShowTransferModal(false)}
        />
      )}
    </div>
  );
}
