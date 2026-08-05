import { io, Socket } from "socket.io-client";

const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ?? `${window.location.protocol}//${window.location.hostname}:4000`;

export const socket: Socket = io(SERVER_URL, { autoConnect: true });
