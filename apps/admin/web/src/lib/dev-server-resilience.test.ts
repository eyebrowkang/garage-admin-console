import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  attachDevSocketErrorGuard,
  installDevServerSocketResilience,
} from './dev-server-resilience';

function createSocket() {
  return new EventEmitter() as EventEmitter & {
    on(event: 'error', listener: (error: unknown) => void): EventEmitter;
  };
}

describe('attachDevSocketErrorGuard', () => {
  it('swallows benign disconnect errors', () => {
    const logger = { error: vi.fn() };
    const socket = createSocket();

    attachDevSocketErrorGuard(socket, logger, 'test');

    expect(() => {
      socket.emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));
    }).not.toThrow();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs unexpected socket errors', () => {
    const logger = { error: vi.fn() };
    const socket = createSocket();

    attachDevSocketErrorGuard(socket, logger, 'test');

    socket.emit('error', new Error('boom'));

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('dev socket error (test)'),
      expect.objectContaining({ timestamp: true }),
    );
  });
});

describe('installDevServerSocketResilience', () => {
  it('guards sockets attached through the Vite dev server connection hook', () => {
    const logger = { error: vi.fn() };
    const httpServer = new EventEmitter() as EventEmitter & {
      on(event: 'connection', listener: (socket: EventEmitter) => void): EventEmitter;
    };

    installDevServerSocketResilience({
      config: { logger },
      httpServer,
    });

    const socket = createSocket();

    httpServer.emit('connection', socket);

    expect(() => {
      socket.emit('error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));
    }).not.toThrow();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
