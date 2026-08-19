import { normalizeDesign, type DeckDesign } from "./model";

export type DesignHistory = Readonly<{
  past: readonly DeckDesign[];
  present: DeckDesign;
  future: readonly DeckDesign[];
}>;

export type HistoryAction =
  | Readonly<{ type: "apply"; design: DeckDesign }>
  | Readonly<{ type: "undo" }>
  | Readonly<{ type: "redo" }>
  | Readonly<{ type: "reset"; design: DeckDesign }>;

export function createHistory(design: DeckDesign): DesignHistory {
  return Object.freeze({ past: Object.freeze([]), present: normalizeDesign(design), future: Object.freeze([]) });
}

function restoreSnapshot(snapshot: DeckDesign, current: DeckDesign): DeckDesign {
  return normalizeDesign({
    ...snapshot,
    metadata: { ...snapshot.metadata, revision: current.metadata.revision + 1 },
  });
}

export function designHistoryReducer(state: DesignHistory, action: HistoryAction): DesignHistory {
  if (action.type === "reset") return createHistory(action.design);
  if (action.type === "apply") {
    return Object.freeze({
      past: Object.freeze([...state.past, state.present]),
      present: normalizeDesign(action.design),
      future: Object.freeze([]),
    });
  }
  if (action.type === "undo") {
    const target = state.past.at(-1);
    if (!target) return state;
    return Object.freeze({
      past: Object.freeze(state.past.slice(0, -1)),
      present: restoreSnapshot(target, state.present),
      future: Object.freeze([state.present, ...state.future]),
    });
  }
  const target = state.future[0];
  if (!target) return state;
  return Object.freeze({
    past: Object.freeze([...state.past, state.present]),
    present: restoreSnapshot(target, state.present),
    future: Object.freeze(state.future.slice(1)),
  });
}
