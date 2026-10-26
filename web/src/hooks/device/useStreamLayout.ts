import { useCallback, useState } from "react";
import {
  parseStreamDimensions,
  parseStreamOrientation,
  type StreamDimensions,
  type StreamOrientation,
} from "../../utils/streamDimensions";

/** Capture size and orientation the device reports during a remote session (rotation, resize). */
export function useStreamLayout() {
  const [hint, setHint] = useState<StreamDimensions | null>(null);
  const [revision, setRevision] = useState(0);
  const [orientation, setOrientation] = useState<StreamOrientation | null>(null);

  /** Apply a layout event (ORIENTATION_CHANGED etc.); every event bumps the revision. */
  const apply = useCallback((payload: unknown) => {
    setRevision((r) => r + 1);
    const nextOrientation = parseStreamOrientation(payload);
    if (nextOrientation) setOrientation(nextOrientation);
    const dimensions = parseStreamDimensions(payload);
    if (dimensions) setHint(dimensions);
  }, []);

  const reset = useCallback(() => {
    setHint(null);
    setRevision(0);
    setOrientation(null);
  }, []);

  return { hint, revision, orientation, apply, reset };
}
