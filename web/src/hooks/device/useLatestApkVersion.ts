import { useEffect, useState } from "react";
import type { User } from "oidc-client-ts";
import { fetchLatestApk } from "../../api/client";

/** Newest APK version on the release page, or null if it can't be looked up. */
export function useLatestApkVersion(user: User | null | undefined): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchLatestApk(user)
      .then((latest) => {
        if (!cancelled) setVersion(latest.version);
      })
      .catch(() => {
        if (!cancelled) setVersion(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return version;
}
