import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { createSecurityHeaders } from '../index.js';

describe('createSecurityHeaders', () => {
  it('sets the conservative headers and calls next()', () => {
    const headers: Record<string, string> = {};
    const req = {} as Request;
    const res = {
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    createSecurityHeaders()(req, res, next);

    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Strict-Transport-Security']).toContain('max-age=');
    expect(next).toHaveBeenCalledOnce();
  });

  it('does NOT set CSP or cross-origin isolation headers (they break the MF remote)', () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
    } as unknown as Response;

    createSecurityHeaders()({} as Request, res, (() => {}) as NextFunction);

    expect(headers['Content-Security-Policy']).toBeUndefined();
    expect(headers['Cross-Origin-Embedder-Policy']).toBeUndefined();
    expect(headers['Cross-Origin-Resource-Policy']).toBeUndefined();
  });
});
