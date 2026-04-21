import { useState, useMemo } from "react";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { useNavigate } from "react-router";

interface CachedUser {
  username: string;
  password: string;
  isAdmin: boolean;
  name: string | null;
  avatarUrl: string | null;
}

export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const storage = localStorage.getItem("tunelog_user")
    ? localStorage
    : sessionStorage;

  const username = storage.getItem("tunelog_user") ?? "User";

  const userData = useMemo(() => {
    try {
      const raw = localStorage.getItem("tunelog_users_cache");
      if (!raw) return null;

      const users: CachedUser[] = JSON.parse(raw);
      return users.find((u) => u.username === username) || null;
    } catch {
      return null;
    }
  }, [username]);

  const displayName =
    userData?.name ||
    localStorage.getItem(`tunelog_displayname_${username}`) ||
    username;

  const avatarUrl =
    userData?.avatarUrl || localStorage.getItem(`tunelog_avatar_${username}`);

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  function handleSignOut() {
    localStorage.removeItem("tunelog_token");
    localStorage.removeItem("tunelog_user");
    localStorage.removeItem("tunelog_password");
    sessionStorage.removeItem("tunelog_token");
    sessionStorage.removeItem("tunelog_user");
    sessionStorage.removeItem("tunelog_password");
    navigate("/signin");
  }

  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="flex items-center text-gray-700 dropdown-toggle dark:text-gray-400"
      >
        <span className="mr-3 overflow-hidden rounded-full h-11 w-11 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-sm font-bold text-white">{initials}</span>
          )}
        </span>

        <span className="block mr-1 font-medium text-theme-sm">
          {displayName}
        </span>

        <svg
          className={`stroke-gray-500 dark:stroke-gray-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          width="18"
          height="20"
          viewBox="0 0 18 20"
          fill="none"
        >
          <path
            d="M4.3125 8.65625L9 13.3437L13.6875 8.65625"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute right-0 mt-[17px] flex w-[260px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
      >
        <div>
          <span className="block font-medium text-gray-700 text-theme-sm dark:text-gray-400">
            {displayName}
          </span>
          <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">
            @{username}
          </span>
        </div>

        <ul className="flex flex-col gap-1 pt-4 pb-3 border-b border-gray-200 dark:border-gray-800">
          <li>
            <DropdownItem
              onItemClick={closeDropdown}
              tag="a"
              to="/user"
              className="flex items-center gap-3 px-3 py-2 font-medium text-gray-700 rounded-lg group text-theme-sm hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            >
              Users
            </DropdownItem>
          </li>

          <li>
            <DropdownItem
              onItemClick={closeDropdown}
              tag="a"
              to="/librarySync"
              className="flex items-center gap-3 px-3 py-2 font-medium text-gray-700 rounded-lg group text-theme-sm hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            >
              Library sync
            </DropdownItem>
          </li>
        </ul>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 mt-3 font-medium text-gray-700 rounded-lg group text-theme-sm hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 w-full text-left"
        >
          Sign out
        </button>
      </Dropdown>
    </div>
  );
}
