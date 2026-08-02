import { BASE_URL } from "./client";
import type { NotificationPayload } from "./types";

export function connectNotificationStream(
  onMessage: (payload: NotificationPayload) => void,
  onError?: (err: Event) => void,
): EventSource {
  const es = new EventSource(`${BASE_URL}/notifications/stream`);
  console.log("api called notification/stream");
  es.onmessage = (event) => {
    try {
      const payload: NotificationPayload = JSON.parse(event.data);
      onMessage(payload);
    } catch (e) {
      console.error("[SSE] Failed to parse notification:", e);
    }
  };
  if (onError) es.onerror = onError;
  return es;
}
