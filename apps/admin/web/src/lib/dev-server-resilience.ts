import type { Plugin } from 'vite';

const guardedSocketSymbol = Symbol('garage-admin.dev-socket-guard');

type SocketLike = {
  on(event: 'error', listener: (error: unknown) => void): unknown;
  [guardedSocketSymbol]?: boolean;
};

type DevLogger = {
  error(message: string, options?: unknown): void;
};

type DevServerLike = {
  httpServer?: {
    on(event: 'connection', listener: (socket: SocketLike) => void): unknown;
  } | null;
  config: {
    logger: DevLogger;
  };
};

export function isBenignDisconnectError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

  return (
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'ECONNABORTED' ||
    code === 'ERR_STREAM_PREMATURE_CLOSE'
  );
}

export function attachDevSocketErrorGuard(
  socket: SocketLike,
  logger: DevLogger,
  context: string,
): void {
  if (socket[guardedSocketSymbol]) {
    return;
  }

  socket[guardedSocketSymbol] = true;
  socket.on('error', (error) => {
    if (isBenignDisconnectError(error)) {
      return;
    }

    const message =
      error instanceof Error ? error.stack ?? error.message : `Unknown socket error: ${String(error)}`;

    logger.error(`dev socket error (${context})\n${message}`, {
      error: error instanceof Error ? error : undefined,
      timestamp: true,
    });
  });
}

export function createDevServerSocketResiliencePlugin(): Plugin {
  return {
    name: 'garage-admin-dev-socket-resilience',
    apply: 'serve',
    configureServer(server) {
      installDevServerSocketResilience(server as DevServerLike);
    },
  };
}

export function installDevServerSocketResilience(server: DevServerLike): void {
  server.httpServer?.on('connection', (socket) => {
    attachDevSocketErrorGuard(socket, server.config.logger, 'incoming connection');
  });
}
