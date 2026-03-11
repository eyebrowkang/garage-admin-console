import { createContext, useContext } from 'react';

export interface Connection {
  id: string;
  name: string;
  endpoint: string;
  region: string | null;
  bucket: string | null;
  pathStyle: boolean;
}

export interface ConnectionContextValue {
  connectionId: string;
  connection: Connection;
}

export const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function useConnectionContext() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnectionContext must be used within ConnectionLayout');
  return ctx;
}
