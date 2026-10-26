import { useCallback, useEffect, useRef, useState } from "react";

const IDLE_BEFORE_PROMPT_MS = 300_000;
const COUNTDOWN_SECONDS = 120;

/**
 * While a remote session is active: after 5 minutes without operator activity, ask "Stay
 * connected?" and end the session if nobody answers within 2 minutes.
 */
export function useInactivityTimeout(active: boolean, onExpire: () => void) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const lastActivityRef = useRef<number>(Date.now());
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  // A new or ended session starts with a fresh activity clock and no prompt.
  useEffect(() => {
    if (active) lastActivityRef.current = Date.now();
    setPromptOpen(false);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const checkInterval = setInterval(() => {
      if (!promptOpen && Date.now() - lastActivityRef.current >= IDLE_BEFORE_PROMPT_MS) {
        setPromptOpen(true);
        setCountdown(COUNTDOWN_SECONDS);
      }
    }, 1000);
    return () => clearInterval(checkInterval);
  }, [active, promptOpen]);

  useEffect(() => {
    const stopCountdown = () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
    if (!promptOpen) {
      stopCountdown();
      return;
    }
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          stopCountdown();
          setPromptOpen(false);
          onExpireRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return stopCountdown;
  }, [promptOpen]);

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const keepActive = useCallback(() => {
    setPromptOpen(false);
    lastActivityRef.current = Date.now();
  }, []);

  const endNow = useCallback(() => {
    setPromptOpen(false);
    onExpireRef.current();
  }, []);

  return { promptOpen, countdown, recordActivity, keepActive, endNow };
}
