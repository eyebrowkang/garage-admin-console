import type { NodeResp } from '@/types/garage';

// Uses `some` (not `every`) — in a mixed cluster, showing v2.3.0 features is
// preferable to hiding them: v2.2.x silently ignores unknown fields on save.
export function clusterMinVersion(nodes: NodeResp[], target: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((s) => Number(s.split(/[-+]/)[0]));
  const [t0, t1, t2] = parse(target);
  return nodes.some((n) => {
    if (!n.garageVersion) return false;
    const [a, b, c] = parse(n.garageVersion);
    return a > t0 || (a === t0 && (b > t1 || (b === t1 && c >= t2)));
  });
}
