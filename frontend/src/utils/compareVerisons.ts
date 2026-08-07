export function compareVersions(a: string, b: string): number {
  const pa = (a ?? "0.0.0").split(".").map(Number);
  const pb = (b ?? "0.0.0").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}