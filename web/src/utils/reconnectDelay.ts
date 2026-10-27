/** Backoff for the admin WebSocket: 1 s, 2 s, 4 s, 8 s, then every 10 s. */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(10_000, 1_000 * 2 ** Math.max(0, attempt));
}

/** Close codes after which retrying with the same token can't succeed (server rejected auth). */
export function isAuthRejection(closeCode: number): boolean {
  return closeCode === 4003;
}
