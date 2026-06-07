import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';

import { createAuthenticateToken } from '../index.js';

const SECRET = 'unit-secret';

function harness(authorization?: string) {
  const req = { headers: authorization ? { authorization } : {} } as Request;
  const res = { sendStatus: vi.fn() } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next, sendStatus: res.sendStatus as unknown as ReturnType<typeof vi.fn> };
}

describe('createAuthenticateToken', () => {
  it('calls next() and attaches the decoded user for a valid access Bearer token', () => {
    const token = jwt.sign({ role: 'admin', type: 'access' }, SECRET);
    const { req, res, next, sendStatus } = harness(`Bearer ${token}`);

    createAuthenticateToken(SECRET)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(sendStatus).not.toHaveBeenCalled();
    expect((req as Request & { user?: { role?: string } }).user?.role).toBe('admin');
  });

  it('401s when the Authorization header is absent', () => {
    const { req, res, next, sendStatus } = harness();
    createAuthenticateToken(SECRET)(req, res, next);
    expect(sendStatus).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('401s when the header carries no token after the scheme', () => {
    const { req, res, next, sendStatus } = harness('Bearer');
    createAuthenticateToken(SECRET)(req, res, next);
    expect(sendStatus).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('401s when the token is signed with a different secret', () => {
    const token = jwt.sign({ role: 'admin' }, 'wrong-secret');
    const { req, res, next, sendStatus } = harness(`Bearer ${token}`);
    createAuthenticateToken(SECRET)(req, res, next);
    expect(sendStatus).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('401s when the token is not a valid JWT', () => {
    const { req, res, next, sendStatus } = harness('Bearer not-a-jwt');
    createAuthenticateToken(SECRET)(req, res, next);
    expect(sendStatus).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('401s when the token is a refresh token (type !== access)', () => {
    const token = jwt.sign({ role: 'admin', type: 'refresh' }, SECRET);
    const { req, res, next, sendStatus } = harness(`Bearer ${token}`);
    createAuthenticateToken(SECRET)(req, res, next);
    expect(sendStatus).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('401s when the token carries no type claim (legacy token after the upgrade)', () => {
    const token = jwt.sign({ role: 'admin' }, SECRET);
    const { req, res, next, sendStatus } = harness(`Bearer ${token}`);
    createAuthenticateToken(SECRET)(req, res, next);
    expect(sendStatus).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
