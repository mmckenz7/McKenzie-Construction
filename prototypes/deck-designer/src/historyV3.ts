import { normalizeDeckDesignV3, type DeckDesignV3 } from "./modelV3";

export type DesignHistoryV3 = Readonly<{
  past: readonly DeckDesignV3[];
  present: DeckDesignV3;
  future: readonly DeckDesignV3[];
}>;

export type HistoryActionV3 =
  | Readonly<{ type: "apply"; design: DeckDesignV3 }>
  | Readonly<{ type: "undo" }>
  | Readonly<{ type: "redo" }>
  | Readonly<{ type: "reset"; design: DeckDesignV3 }>;

export function createHistoryV3(design: DeckDesignV3): DesignHistoryV3 {
  return Object.freeze({
    past: Object.freeze([]),
    present: normalizeDeckDesignV3(design),
    future: Object.freeze([]),
  });
}

function withRevision(design: DeckDesignV3, revision: number): DeckDesignV3 {
  return normalizeDeckDesignV3({ ...design, metadata: { ...design.metadata, revision } });
}

export function designHistoryReducerV3(state: DesignHistoryV3, action: HistoryActionV3): DesignHistoryV3 {
  if (action.type === "reset") return createHistoryV3(action.design);
  if (action.type === "apply") {
    const normalized = normalizeDeckDesignV3(action.design);
    const present = normalized.metadata.revision > state.present.metadata.revision
      ? normalized
      : withRevision(normalized, state.present.metadata.revision + 1);
    return Object.freeze({
      past: Object.freeze([...state.past, state.present]),
      present,
      future: Object.freeze([]),
    });
  }
  if (action.type === "undo") {
    const target = state.past.at(-1);
    if (!target) return state;
    return Object.freeze({
      past: Object.freeze(state.past.slice(0, -1)),
      present: withRevision(target, state.present.metadata.revision + 1),
      future: Object.freeze([state.present, ...state.future]),
    });
  }
  const target = state.future[0];
  if (!target) return state;
  return Object.freeze({
    past: Object.freeze([...state.past, state.present]),
    present: withRevision(target, state.present.metadata.revision + 1),
    future: Object.freeze(state.future.slice(1)),
  });
}
