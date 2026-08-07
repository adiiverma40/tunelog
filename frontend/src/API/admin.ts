import { BASE_URL } from "./client";
import type {
  CreateUserRequest,
  CreateUserResponse,
  GetUsersResponse,
  User,
  UserDataResponse,
} from "./types";

export async function fetchCreateUser(
  data: CreateUserRequest,
): Promise<CreateUserResponse> {
  const res = await fetch(`${BASE_URL}/admin/create-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create user");
  return res.json();
}

const USERS_CACHE_KEY = "tunelog_users_cache";

export async function fetchGetUsers(): Promise<GetUsersResponse> {
  const cached = localStorage.getItem(USERS_CACHE_KEY);
  const cachedUsers: User[] = cached ? JSON.parse(cached) : [];

  const fetchPromise = fetch(`${BASE_URL}/admin/get-users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  })
    .then((res) => {
      if (!res.ok) throw new Error("Failed to get users");
      return res.json() as Promise<GetUsersResponse>;
    })
    .then((fresh) => {
      if (fresh.status === "ok" && fresh.users) {
        const freshStr = JSON.stringify(fresh.users);
        if (freshStr !== JSON.stringify(cachedUsers)) {
          localStorage.setItem(USERS_CACHE_KEY, freshStr);
        }
      }
      return fresh;
    });

  if (cachedUsers.length > 0) {
    return { status: "ok", users: cachedUsers };
  }

  return fetchPromise;
}

export async function fetchUserData(
  username: string,
  password: string,
): Promise<UserDataResponse> {
  const res = await fetch(
    `${BASE_URL}/admin/getUserData?username=${encodeURIComponent(username)}`,
    {
      method: "GET",
    },
  );
  if (!res.ok) throw new Error("Failed to fetch user data");
  return res.json();
}
