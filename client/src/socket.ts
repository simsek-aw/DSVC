import { io, Socket } from "socket.io-client";

// In production the server ships the built client itself, so client and
// server share an origin — default to that (socket.io-client's own default).
// In local dev, client (5173) and server (4000) run as separate processes,
// so fall back to the conventional dev server port unless overridden.
// VITE_SERVER_URL always wins, e.g. for a split deployment.
const explicitUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
const SERVER_URL = explicitUrl ?? (import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:4000` : undefined);

export const socket: Socket = SERVER_URL ? io(SERVER_URL, { autoConnect: true }) : io({ autoConnect: true });
