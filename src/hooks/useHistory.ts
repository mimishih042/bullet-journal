import { useRef, useState, useCallback } from 'react';

export interface HistoryEntry {
  undo: () => void;
  redo: () => void;
}

const MAX_HISTORY = 30;

export function useHistory() {
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const [, rerender] = useState(0);
  const tick = useCallback(() => rerender(n => n + 1), []);

  const push = useCallback((entry: HistoryEntry) => {
    if (undoStack.current.length >= MAX_HISTORY) undoStack.current.shift();
    undoStack.current.push(entry);
    redoStack.current = [];
    tick();
  }, [tick]);

  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    entry.undo();
    redoStack.current.push(entry);
    tick();
  }, [tick]);

  const redo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    entry.redo();
    undoStack.current.push(entry);
    tick();
  }, [tick]);

  const clear = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    tick();
  }, [tick]);

  return {
    push,
    undo,
    redo,
    clear,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  };
}
