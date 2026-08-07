import { io, Socket } from "socket.io-client";
import { BASE_URL } from "./client";

export const socket: Socket = io(BASE_URL, {
  auth: {
    username: localStorage.getItem("tunelog_user"),
  },
  autoConnect: true,
  transports: ["websocket"],
});

export function connectSocket(token: string) {
  socket.auth = { token };
  if (!socket.connected) socket.connect();
}

export function disconnectSocket() {
  if (socket.connected) socket.disconnect();
}
