import { describe, expect, it } from 'vitest';

import { clusterMinVersion } from './cluster-version';
import type { NodeResp } from '@/types/garage';

function node(garageVersion?: string): NodeResp {
  return {
    id: 'abc',
    role: null,
    addr: '127.0.0.1:3901',
    hostname: 'test',
    isUp: true,
    lastSeenSecsAgo: 0,
    draining: false,
    garageVersion,
    garageFeatures: null,
  } as NodeResp;
}

describe('clusterMinVersion', () => {
  it('returns false for empty node list', () => {
    expect(clusterMinVersion([], '2.3.0')).toBe(false);
  });

  it('returns false when no node has a version', () => {
    expect(clusterMinVersion([node(undefined), node(undefined)], '2.3.0')).toBe(false);
  });

  it('matches exact version', () => {
    expect(clusterMinVersion([node('2.3.0')], '2.3.0')).toBe(true);
  });

  it('returns true for higher patch', () => {
    expect(clusterMinVersion([node('2.3.1')], '2.3.0')).toBe(true);
  });

  it('returns true for higher minor', () => {
    expect(clusterMinVersion([node('2.4.0')], '2.3.0')).toBe(true);
  });

  it('returns true for higher major', () => {
    expect(clusterMinVersion([node('3.0.0')], '2.3.0')).toBe(true);
  });

  it('returns false when version is below target', () => {
    expect(clusterMinVersion([node('2.2.9')], '2.3.0')).toBe(false);
  });

  it('strips leading v prefix', () => {
    expect(clusterMinVersion([node('v2.3.0')], '2.3.0')).toBe(true);
  });

  it('handles pre-release suffixes like -rc1', () => {
    expect(clusterMinVersion([node('2.3.0-rc1')], '2.3.0')).toBe(true);
  });

  it('handles build metadata suffixes like +build123', () => {
    expect(clusterMinVersion([node('2.3.0+build123')], '2.3.0')).toBe(true);
  });

  it('handles pre-release on a lower version', () => {
    expect(clusterMinVersion([node('2.2.9-beta1')], '2.3.0')).toBe(false);
  });

  it('returns true if at least one node meets the target (some semantics)', () => {
    expect(clusterMinVersion([node('2.2.0'), node('2.3.0')], '2.3.0')).toBe(true);
  });

  it('returns false when all nodes are below target', () => {
    expect(clusterMinVersion([node('2.2.0'), node('2.1.5')], '2.3.0')).toBe(false);
  });

  it('major-only bump comparison', () => {
    expect(clusterMinVersion([node('1.9.9')], '2.0.0')).toBe(false);
    expect(clusterMinVersion([node('2.0.0')], '2.0.0')).toBe(true);
  });
});
