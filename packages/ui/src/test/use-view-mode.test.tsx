import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useViewMode } from '../hooks/use-view-mode';

const KEY = 'test-view-mode';

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('useViewMode', () => {
  it('defaults to the card grid when nothing is stored', () => {
    const { result } = renderHook(() => useViewMode(KEY));
    expect(result.current[0]).toBe('card');
  });

  it('honours a valid stored preference', () => {
    window.localStorage.setItem(KEY, 'card');
    const { result } = renderHook(() => useViewMode(KEY));
    expect(result.current[0]).toBe('card');
  });

  it('ignores an invalid stored value', () => {
    window.localStorage.setItem(KEY, 'bogus');
    const { result } = renderHook(() => useViewMode(KEY));
    expect(result.current[0]).toBe('card');
  });

  it('update() flips the mode and persists it to localStorage', () => {
    const { result } = renderHook(() => useViewMode(KEY));
    act(() => result.current[1]('card'));
    expect(result.current[0]).toBe('card');
    expect(window.localStorage.getItem(KEY)).toBe('card');
  });
});
