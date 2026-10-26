export type SemverTriple = [number, number, number];

/** "3.2.1", "v3.2.1" or "3.2.1-beta" → [3, 2, 1]; anything else → null. */
export function parseSemver(value: string | null | undefined): SemverTriple | null {
  const match = value?.trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareSemver(a: SemverTriple, b: SemverTriple): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}
