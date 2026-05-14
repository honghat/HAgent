import { useState, useCallback } from 'react';

export function useUndoRedo({ initial }) {
  const [history, setHistory] = useState({
    past: [],
    present: initial,
    future: [],
  });

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const pushState = useCallback((newPresent) => {
    setHistory(prev => ({
      past: [...prev.past.slice(-49), prev.present],
      present: newPresent,
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      return {
        past: prev.past.slice(0, -1),
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory(prev => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: prev.future.slice(1),
      };
    });
  }, []);

  const reset = useCallback((newPresent) => {
    setHistory({
      past: [],
      present: newPresent,
      future: [],
    });
  }, []);

  return { state: history.present, pushState, undo, redo, reset, canUndo, canRedo };
}
