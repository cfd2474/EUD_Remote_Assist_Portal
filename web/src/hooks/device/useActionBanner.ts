import { useCallback, useEffect, useRef, useState } from "react";

const VISIBLE_MS = 3000;
const FADE_MS = 500;

/**
 * The status line under the device header. Normal messages fade after 3 s. A queued-command
 * message stays until the device comes back online, then turns into a "sent" message.
 */
export function useActionBanner(deviceOnline: boolean) {
  const [message, setMessage] = useState<string | null>(null);
  const [fadeClass, setFadeClass] = useState("");
  const [queuedCommand, setQueuedCommand] = useState<string | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = null;
    }
    if (removeTimeoutRef.current) {
      clearTimeout(removeTimeoutRef.current);
      removeTimeoutRef.current = null;
    }
  }, []);

  const show = useCallback(
    (text: string, isQueued: boolean = false, command: string | null = null) => {
      clearTimers();
      setFadeClass("");
      setMessage(text);

      if (isQueued) {
        setQueuedCommand(command);
      } else {
        setQueuedCommand(null);
        fadeTimeoutRef.current = setTimeout(() => {
          setFadeClass("fade-out");
          removeTimeoutRef.current = setTimeout(() => {
            setMessage(null);
            setFadeClass("");
          }, FADE_MS);
        }, VISIBLE_MS);
      }
    },
    [clearTimers]
  );

  const clear = useCallback(() => {
    clearTimers();
    setFadeClass("");
    setQueuedCommand(null);
    setMessage(null);
  }, [clearTimers]);

  // A queued command is delivered as soon as the device reconnects.
  useEffect(() => {
    if (deviceOnline && queuedCommand) {
      let transitionMessage = `Command sent: ${queuedCommand}`;
      if (queuedCommand === "REMOTE_UNLOCK") {
        transitionMessage = "Unlock command sent — device is entering the PIN…";
      } else if (queuedCommand === "LOCK_DEVICE") {
        transitionMessage = "Lock command sent. Remote assist has been stopped.";
      }
      show(transitionMessage, false, null);
    }
  }, [deviceOnline, queuedCommand, show]);

  useEffect(() => clearTimers, [clearTimers]);

  return { message, fadeClass, show, clear };
}

export type ActionBanner = ReturnType<typeof useActionBanner>;
