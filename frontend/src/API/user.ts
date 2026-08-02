import { BASE_URL } from "./client";
import type {
  UserProfileResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
} from "./types";

export async function fetchUserProfile(
  username: string,
  password: string,
): Promise<UserProfileResponse> {
  const res = await fetch(
    `${BASE_URL}/api/user/profile?username=${encodeURIComponent(username)}`,
  );
  if (!res.ok) throw new Error("Failed to fetch user profile");
  return res.json();
}

export async function fetchUpdateProfile(
  data: UpdateProfileRequest,
): Promise<UpdateProfileResponse> {
  const formData = new FormData();
  formData.append("username", data.username);
  formData.append("displayName", data.displayName);
  if (data.avatar) {
    formData.append("avatar", data.avatar);
  }
  const response = await fetch(`${BASE_URL}/api/user/profile/update`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`Failed to update profile: ${response.statusText}`);
  }
  return response.json();
}
