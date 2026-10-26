import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "oidc-client-ts";
import { fetchDevice } from "../../api/client";
import type { Device } from "../../types";

const POLL_MS = 10_000;

/**
 * The device record, polled every 10 s. `onLoaded` receives each successful load and whether it
 * was the first, so the page can seed its remote-session state from the server once.
 */
export function useDeviceRecord(
  user: User | null | undefined,
  uid: string | undefined,
  onLoaded: (device: Device, isFirstLoad: boolean) => void
) {
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const firstLoadDoneRef = useRef(false);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  const load = useCallback(async () => {
    if (!user || !uid) return;
    try {
      const data = await fetchDevice(user, uid);
      setDevice(data);
      onLoadedRef.current(data, !firstLoadDoneRef.current);
      firstLoadDoneRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load device");
    } finally {
      setLoading(false);
    }
  }, [user, uid]);

  /** Refresh the card after an action; a failed background refresh keeps the current data. */
  const refresh = useCallback(async () => {
    if (!user || !uid) return;
    try {
      setDevice(await fetchDevice(user, uid));
    } catch {
      // Keep existing device card data if a background refresh fails.
    }
  }, [user, uid]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  return { device, loading, error, refresh };
}
