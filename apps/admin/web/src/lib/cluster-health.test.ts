import { describe, expect, it } from 'vitest';

import { getClusterHealthAppearance, resolveClusterHealthStatus } from './cluster-health';

describe('resolveClusterHealthStatus', () => {
  it('keeps known Garage health statuses', () => {
    expect(resolveClusterHealthStatus('healthy', false, false)).toBe('healthy');
    expect(resolveClusterHealthStatus('degraded', false, false)).toBe('degraded');
    expect(resolveClusterHealthStatus('unavailable', false, false)).toBe('unavailable');
  });

  it('maps request failures to unreachable', () => {
    expect(resolveClusterHealthStatus(undefined, true, false)).toBe('unreachable');
  });

  it('falls back to checking while loading unknown health', () => {
    expect(resolveClusterHealthStatus(undefined, false, true)).toBe('unknown');
    expect(resolveClusterHealthStatus('unexpected', false, true)).toBe('unknown');
  });
});

describe('getClusterHealthAppearance', () => {
  it('returns success semantics for healthy clusters', () => {
    const appearance = getClusterHealthAppearance('healthy');

    expect(appearance.label).toBe('Healthy');
    expect(appearance.badge).toBe('success');
    expect(appearance.emphasisClass).toBe('text-success');
    expect(appearance.softBackgroundClass).toBe('bg-success-soft');
    expect(appearance.borderClass).toBe('border-success-border');
  });

  it('returns warning semantics for degraded clusters', () => {
    const appearance = getClusterHealthAppearance('degraded');

    expect(appearance.label).toBe('Degraded');
    expect(appearance.badge).toBe('warning');
    expect(appearance.emphasisClass).toBe('text-warning');
    expect(appearance.softBackgroundClass).toBe('bg-warning-soft');
    expect(appearance.borderClass).toBe('border-warning-border');
  });
});
