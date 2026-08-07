import { BASE_URL } from ".";
import { UserDetails } from "./api_types";

export async function fetchUserMe(): Promise<UserDetails> {
  try {
    const res = await fetch(`${BASE_URL}/user/me`, {
      method: "POST",
      credentials: "include",
    });
    const data = await res.json();
    return data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}
