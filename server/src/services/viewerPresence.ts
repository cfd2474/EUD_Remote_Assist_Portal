/**
 * D8: a remote session ends when its LAST admin viewer leaves, not when any one of them does.
 *
 * When the viewer count for a remote-active device drops to zero, wait a grace period (long
 * enough for a page reload or a WebSocket reconnect), then stop the session if nobody came
 * back. An explicit Disconnect from any viewer still stops the session for everyone.
 */

export const VIEWER_GONE_GRACE_MS = 15_000;

export interface ViewerPresenceDeps {
  onViewerCountChange(listener: (uid: string, viewers: number) => void): void;
  viewerCount(uid: string): number;
  isRemoteActive(uid: string): boolean;
  stopSession(uid: string): Promise<unknown>;
  graceMs?: number;
}

export function startViewerPresencePolicy(deps: ViewerPresenceDeps): { pending(): string[] } {
  const graceMs = deps.graceMs ?? VIEWER_GONE_GRACE_MS;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const cancel = (uid: string) => {
    const timer = timers.get(uid);
    if (timer) {
      clearTimeout(timer);
      timers.delete(uid);
    }
  };

  deps.onViewerCountChange((uid, viewers) => {
    if (viewers > 0) {
      cancel(uid);
      return;
    }
    if (!deps.isRemoteActive(uid) || timers.has(uid)) return;

    timers.set(
      uid,
      setTimeout(() => {
        timers.delete(uid);
        if (deps.viewerCount(uid) > 0 || !deps.isRemoteActive(uid)) return;
        console.log(`Last viewer left uid=${uid}; stopping remote session after ${graceMs} ms grace`);
        deps.stopSession(uid).catch((err) => {
          console.error(`Failed to stop remote session for uid=${uid}:`, err);
        });
      }, graceMs)
    );
  });

  return { pending: () => [...timers.keys()] };
}
