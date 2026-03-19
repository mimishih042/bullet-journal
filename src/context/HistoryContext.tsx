import { createContext, useContext } from 'react';
import type { HistoryEntry } from '../hooks/useHistory';

export interface HistoryContextValue {
  push:    (entry: HistoryEntry) => void;
  undo:    () => void;
  redo:    () => void;
  clear:   () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export const HistoryContext = createContext<HistoryContextValue | null>(null);

export function useHistoryContext(): HistoryContextValue {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error('useHistoryContext must be used inside HistoryContext.Provider');
  return ctx;
}
