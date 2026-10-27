/** "2 minutes", "1 hour", "24 hours" — from the server's expiresInSeconds for a queued command. */
export function queuedExpiryText(expiresInSeconds: number | undefined): string {
  if (!expiresInSeconds || expiresInSeconds <= 0) return "its expiry time";
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (expiresInSeconds % 3600 === 0) return plural(expiresInSeconds / 3600, "hour");
  if (expiresInSeconds % 60 === 0) return plural(expiresInSeconds / 60, "minute");
  return plural(expiresInSeconds, "second");
}
