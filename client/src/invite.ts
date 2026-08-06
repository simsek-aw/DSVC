// Builds and shares a "join this room" link. The link carries the room code in
// a `?room=` query param; opening it pre-fills the join form in the lobby.

export function inviteUrl(roomId: string): string {
  return `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
}

/** Room code from the current URL, if the page was opened from an invite link. */
export function roomFromUrl(): string {
  try {
    return (new URLSearchParams(window.location.search).get("room") ?? "").toUpperCase();
  } catch {
    return "";
  }
}

export type ShareResult = { kind: "shared" } | { kind: "copied" } | { kind: "manual"; url: string };

/**
 * Offers the invite link via the native share sheet where available, otherwise
 * copies it to the clipboard, otherwise hands the URL back so the caller can
 * show it for manual copying.
 */
export async function shareInvite(roomId: string): Promise<ShareResult> {
  const url = inviteUrl(roomId);
  const data = { title: "Canos Incognita", text: `Tritt meinem Spiel bei — Raum ${roomId}`, url };
  if (typeof navigator !== "undefined" && (navigator as any).share) {
    try {
      await (navigator as any).share(data);
      return { kind: "shared" };
    } catch {
      // Share dialog dismissed or unavailable — fall through to copying.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return { kind: "copied" };
  } catch {
    return { kind: "manual", url };
  }
}
