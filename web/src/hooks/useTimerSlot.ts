import { useCallback, useMemo, useRef } from "react";

/** One named timer: holds the current handle and clears it (timeout or interval). */
export function useTimerSlot(kind: "timeout" | "interval" = "timeout") {
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => {
    if (ref.current) {
      if (kind === "interval") clearInterval(ref.current);
      else clearTimeout(ref.current);
      ref.current = null;
    }
  }, [kind]);
  return useMemo(() => ({ ref, clear }), [clear]);
}
