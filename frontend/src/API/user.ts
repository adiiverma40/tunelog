import { BASE_URL } from "./client";
import type {
  UserProfileResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
  UserProfileDetailsResponse,
} from "./types";

export async function fetchUserProfile(
  username: string,

): Promise<UserProfileResponse> {
  const res = await fetch(
    `${BASE_URL}/api/user/profile?username=${encodeURIComponent(username)}`,
    {
      method: "GET",
      credentials: "include",
    },
  );
  if (!res.ok) throw new Error("Failed to fetch user profile");
  const ress = await res.json();
  console.log(ress);
  return ress;
}

export async function fetchUserProfileDetails(
  username: string,
): Promise<UserProfileDetailsResponse> {
  const res = await fetch(
    `${BASE_URL}/api/user/profile/${encodeURIComponent(username)}`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  if (!res.ok) {
    throw new Error("Failed to fetch user profile details");
  }

  return await res.json();
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
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Failed to update profile: ${response.statusText}`);
  }
  return response.json();
}
