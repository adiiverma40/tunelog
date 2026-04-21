import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import { useState, useEffect } from "react";
import { fetchGetUsers, fetchCreateUser, User } from "../API/API";
import Button from "../components/ui/button/Button";
import { Modal } from "../components/ui/modal";
import { useModal } from "../hooks/useModal";
import Input from "../components/form/input/InputField";
import Label from "../components/form/Label";
import Switch from "../components/form/switch/Switch";
import UserMetaCard from "../components/UserProfile/UserMetaCard";

const USERS_CACHE_KEY = "tunelog_users_cache";

export default function UserProfiles() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const { isOpen, openModal, closeModal } = useModal();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [toggleisAdmin, setToggleIsAdmin] = useState(false);
  const [toggleUpdateUser, setToggleUpdateUser] = useState(false);
  const [createError, setCreateError] = useState("");

  const getAdminCredentials = () => {
    const storage = localStorage.getItem("tunelog_user")
      ? localStorage
      : sessionStorage;

    return {
      admin: storage.getItem("tunelog_user") ?? "",
      adminPD: storage.getItem("tunelog_password") ?? "",
    };
  };

  const syncUsersToStorage = (userList: User[]) => {
    try {
      localStorage.setItem(USERS_CACHE_KEY, JSON.stringify(userList));

      userList.forEach((user) => {
        const displayNameKey = `tunelog_displayname_${user.username}`;
        const avatarKey = `tunelog_avatar_${user.username}`;

        if (user.name) {
          localStorage.setItem(displayNameKey, user.name);
        } else {
          localStorage.removeItem(displayNameKey);
        }

        if (user.avatarUrl) {
          localStorage.setItem(avatarKey, user.avatarUrl);
        } else {
          localStorage.removeItem(avatarKey);
        }
      });
    } catch (err) {
      console.error("Failed to sync users to localStorage", err);
    }
  };

  const loadCachedUsers = () => {
    try {
      const cached = localStorage.getItem(USERS_CACHE_KEY);
      if (!cached) return false;

      const parsed = JSON.parse(cached) as User[];
      if (Array.isArray(parsed)) {
        setUsers(parsed);
        return true;
      }
    } catch (err) {
      console.error("Failed to read cached users", err);
    }
    return false;
  };

  const loadUsers = () => {
    setLoading(true);
    const { admin, adminPD } = getAdminCredentials();

    fetchGetUsers({ admin, adminPD })
      .then((data) => {
        if (data.status === "ok" && data.users) {
          const userList: User[] = data.users;
          setUsers(userList);
          syncUsersToStorage(userList);
        }
      })
      .catch((err) => {
        console.error("Failed to load users", err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleCreateUser = () => {
    if (!name || !username || !password) {
      setCreateError("All fields are required");
      return;
    }

    const { admin, adminPD } = getAdminCredentials();

    fetchCreateUser({
      name,
      username,
      password,
      isAdmin: toggleisAdmin,
      admin,
      adminPD,
      email: "",
      isUpdate: toggleUpdateUser,
    }).then((data) => {
      if (data.status === "success") {
        setCreateError("");
        setName("");
        setUsername("");
        setPassword("");
        setToggleIsAdmin(false);
        setToggleUpdateUser(false);
        closeModal();
        loadUsers();
      } else {
        setCreateError(data.reason ?? "Failed to create user");
      }
    });
  };

  useEffect(() => {
    const hasCached = loadCachedUsers();
    loadUsers();

    if (!hasCached) {
      setLoading(true);
    }
  }, []);

  return (
    <>
      <PageMeta title="Users | TuneLog" description="Manage TuneLog users" />
      <PageBreadcrumb pageTitle="Users" />

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              All Users
            </h4>
            <p className="text-sm text-gray-400 mt-0.5">
              {loading
                ? "Loading..."
                : `${users.length} user${users.length !== 1 ? "s" : ""} registered`}
            </p>
          </div>

          <Button variant="outline" size="sm" onClick={openModal}>
            + Add User
          </Button>
        </div>

        <hr className="border-gray-100 dark:border-gray-800 mb-6" />

        <div className="space-y-4">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02] animate-pulse"
              />
            ))
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No users found. Add one to get started.
            </div>
          ) : (
            users.map((user) => (
              <UserMetaCard key={user.username} user={user} />
            ))
          )}
        </div>
      </div>

      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-[700px] m-4">
        <div className="no-scrollbar relative w-full max-w-[700px] overflow-y-auto rounded-3xl bg-white p-4 dark:bg-gray-900 lg:p-11">
          <h4 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
            Create User/Add User
          </h4>
          <p className="text-sm text-gray-400 mb-6">
            Creates the user in both Navidrome and TuneLog.
          </p>

          <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
            <div className="col-span-2 lg:col-span-1">
              <Label>Name</Label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="col-span-2 lg:col-span-1">
              <Label>Username</Label>
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="col-span-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {createError && (
            <p className="mt-3 text-sm text-red-500">{createError}</p>
          )}

          <div className="flex items-center gap-3 px-2 mt-6 lg:justify-end">
            <Switch
              label="Is Admin"
              defaultChecked={toggleisAdmin}
              onChange={(checked) => setToggleIsAdmin(checked)}
            />
            <Switch
              label="Update user"
              defaultChecked={toggleUpdateUser}
              onChange={(checked) => setToggleUpdateUser(checked)}
            />
            <Button size="sm" variant="outline" onClick={closeModal}>
              Close
            </Button>
            <Button size="sm" onClick={handleCreateUser}>
              Create User
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
