export type History<T> = Readonly<{ past: readonly T[]; present: T; future: readonly T[] }>;

export const createHistory = <T>(present: T): History<T> => Object.freeze({ past: Object.freeze([]), present, future: Object.freeze([]) });

export const pushHistory = <T>(history: History<T>, next: T): History<T> => Object.freeze({
  past: Object.freeze([...history.past, history.present]), present: next, future: Object.freeze([]),
});

export const undo = <T>(history: History<T>): History<T> => history.past.length === 0 ? history : Object.freeze({
  past: Object.freeze(history.past.slice(0, -1)),
  present: history.past.at(-1) as T,
  future: Object.freeze([history.present, ...history.future]),
});

export const redo = <T>(history: History<T>): History<T> => history.future.length === 0 ? history : Object.freeze({
  past: Object.freeze([...history.past, history.present]),
  present: history.future[0],
  future: Object.freeze(history.future.slice(1)),
});
