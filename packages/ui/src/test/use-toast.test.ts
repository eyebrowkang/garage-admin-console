import { afterEach, describe, expect, it, vi } from 'vitest';

import { reducer as rawReducer } from '../hooks/use-toast';

// The reducer is typed against the full ToasterToast shape; for state-machine
// tests we only care about id/open/title, so narrow it through a loose alias.
interface TestToast {
  id: string;
  open?: boolean;
  title?: string;
}
interface State {
  toasts: TestToast[];
}
type Action =
  | { type: 'ADD_TOAST'; toast: TestToast }
  | { type: 'UPDATE_TOAST'; toast: Partial<TestToast> }
  | { type: 'DISMISS_TOAST'; toastId?: string }
  | { type: 'REMOVE_TOAST'; toastId?: string };
const reducer = rawReducer as unknown as (state: State, action: Action) => State;

const mk = (id: string, extra: Partial<TestToast> = {}): TestToast => ({
  id,
  open: true,
  ...extra,
});

afterEach(() => {
  // DISMISS_TOAST schedules a real removal timer; drain it so tests don't leak.
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('toast reducer', () => {
  it('ADD_TOAST prepends the new toast (newest first)', () => {
    const next = reducer({ toasts: [mk('1')] }, { type: 'ADD_TOAST', toast: mk('2') });
    expect(next.toasts.map((t) => t.id)).toEqual(['2', '1']);
  });

  it('ADD_TOAST caps the queue at the toast limit (3), dropping the oldest', () => {
    let state: State = { toasts: [] };
    for (const id of ['1', '2', '3', '4']) {
      state = reducer(state, { type: 'ADD_TOAST', toast: mk(id) });
    }
    expect(state.toasts.map((t) => t.id)).toEqual(['4', '3', '2']);
  });

  it('UPDATE_TOAST merges fields into the matching toast only', () => {
    const next = reducer(
      { toasts: [mk('1', { title: 'old' }), mk('2')] },
      { type: 'UPDATE_TOAST', toast: { id: '1', title: 'new' } },
    );
    expect(next.toasts.find((t) => t.id === '1')?.title).toBe('new');
    expect(next.toasts.find((t) => t.id === '2')?.title).toBeUndefined();
  });

  it('DISMISS_TOAST marks the targeted toast closed', () => {
    vi.useFakeTimers();
    const next = reducer({ toasts: [mk('1'), mk('2')] }, { type: 'DISMISS_TOAST', toastId: '1' });
    expect(next.toasts.find((t) => t.id === '1')?.open).toBe(false);
    expect(next.toasts.find((t) => t.id === '2')?.open).toBe(true);
  });

  it('DISMISS_TOAST without an id closes every toast', () => {
    vi.useFakeTimers();
    const next = reducer({ toasts: [mk('1'), mk('2')] }, { type: 'DISMISS_TOAST' });
    expect(next.toasts.every((t) => t.open === false)).toBe(true);
  });

  it('REMOVE_TOAST drops the targeted toast', () => {
    const next = reducer({ toasts: [mk('1'), mk('2')] }, { type: 'REMOVE_TOAST', toastId: '1' });
    expect(next.toasts.map((t) => t.id)).toEqual(['2']);
  });

  it('REMOVE_TOAST without an id clears all toasts', () => {
    const next = reducer({ toasts: [mk('1'), mk('2')] }, { type: 'REMOVE_TOAST' });
    expect(next.toasts).toEqual([]);
  });
});
