import { normalizeDesign, type DeckDesignV1 } from "./model";

export type DesignHistory = Readonly<{
  past: readonly DeckDesignV1[];
  present: DeckDesignV1;
  future: readonly DeckDesignV1[];
}>;

export type HistoryAction =
  | Readonly<{ type: "apply"; design: DeckDesignV1 }>
  | Readonly<{ type: "undo" }>
  | Readonly<{ type: "redo" }>
  | Readonly<{ type: "reset"; design: DeckDesignV1 }>;

export function createHistory(design: DeckDesignV1): DesignHistory {
  return Object.freeze({ past: Object.freeze([]), present: normalizeDesign(design), future: Object.freeze([]) });
}

function restoreSnapshot(snapshot: DeckDesignV1, current: DeckDesignV1): DeckDesignV1 {
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
