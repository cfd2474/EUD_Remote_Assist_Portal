import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "oidc-client-ts";
import { sendCommand } from "../../api/client";
import { queuedExpiryText } from "../../utils/queuedExpiry";
import type { ActionBanner } from "./useActionBanner";

const UNLOCK_TIMEOUT_MS = 15_000;

/**
 * The device-is-locked panel: the device reports DEVICE_LOCKED, the operator enters the PIN, and
 * the device reports COMMAND_HANDLED or COMMAND_FAILED for REMOTE_UNLOCK.
 */
export function useRemoteUnlock(user: User | null | undefined, uid: string | undefined, banner: ActionBanner) {
  const [locked, setLocked] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The banner object is new on every render; read it through a ref so these callbacks stay
  // stable (the page reacts to device events in an effect that depends on them).
  const bannerRef = useRef(banner);
  bannerRef.current = banner;

  const clearUnlockTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const markLocked = useCallback((lockReason: string) => {
    setLocked(true);
    setReason(lockReason);
  }, []);

  /** Clear the panel (stream ready, session stopped or ended). */
  const reset = useCallback(() => {
    setLocked(false);
    setReason(null);
    setPin("");
  }, []);

  const onUnlockHandled = useCallback(() => {
    clearUnlockTimeout();
    setUnlocking(false);
    reset();
    bannerRef.current.show("Unlock command processed — waiting for video stream…");
  }, [clearUnlockTimeout, reset]);

  const onUnlockFailed = useCallback(
    (error: string) => {
      clearUnlockTimeout();
      setUnlocking(false);
      setReason("Incorrect pin/password. Try again.");
      bannerRef.current.show(`Unlock failed: ${error}`);
    },
    [clearUnlockTimeout]
  );

  const submit = useCallback(async () => {
    if (!user || !uid || !pin.trim()) return;

    setUnlocking(true);
    bannerRef.current.clear();
    try {
      const result = await sendCommand(user, uid, "REMOTE_UNLOCK", { pin: pin.trim() });
      if (result.delivery === "queued") {
        bannerRef.current.show(
          `Unlock command queued — the device receives it on its next check-in. It expires after ${queuedExpiryText(result.expiresInSeconds)}.`,
          true,
          "REMOTE_UNLOCK"
        );
        setUnlocking(false);
      } else {
        bannerRef.current.show("Unlock command sent — device is entering the PIN…");
        clearUnlockTimeout();
        timeoutRef.current = setTimeout(() => {
          setUnlocking(false);
          bannerRef.current.show("Unlock attempt timed out.");
        }, UNLOCK_TIMEOUT_MS);
      }
    } catch (err) {
      bannerRef.current.show(err instanceof Error ? err.message : "Unlock failed");
      setUnlocking(false);
    }
  }, [user, uid, pin, clearUnlockTimeout]);

  useEffect(() => clearUnlockTimeout, [clearUnlockTimeout]);

  return { locked, reason, pin, setPin, unlocking, submit, markLocked, reset, onUnlockHandled, onUnlockFailed };
}
