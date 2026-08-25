import { normalizeDeckDesignV5, type DeckDesignV5 } from "./modelV5";

export type DesignHistoryV5 = Readonly<{ past: readonly DeckDesignV5[]; present: DeckDesignV5; future: readonly DeckDesignV5[] }>;
export type HistoryActionV5 = Readonly<{ type: "apply" | "reset"; design: DeckDesignV5 }> | Readonly<{ type: "undo" | "redo" }>;

export function createHistoryV5(design: DeckDesignV5): DesignHistoryV5 {
  return Object.freeze({ past: Object.freeze([]), present: normalizeDeckDesignV5(design), future: Object.freeze([]) });
}

function withRevision(design: DeckDesignV5, revision: number): DeckDesignV5 {
  return normalizeDeckDesignV5({ ...design, metadata: { ...design.metadata, revision } });
}

export function designHistoryReducerV5(state: DesignHistoryV5, action: HistoryActionV5): DesignHistoryV5 {
  if (action.type === "reset") return createHistoryV5(action.design);
  if (action.type === "apply") {
    const normalized = normalizeDeckDesignV5(action.design);
    const present = normalized.metadata.revision > state.present.metadata.revision ? normalized : withRevision(normalized, state.present.metadata.revision + 1);
    return Object.freeze({ past: Object.freeze([...state.past, state.present]), present, future: Object.freeze([]) });
  }
  if (action.type === "undo") {
    const target = state.past.at(-1);
    return target ? Object.freeze({ past: Object.freeze(state.past.slice(0, -1)), present: withRevision(target, state.present.metadata.revision + 1), future: Object.freeze([state.present, ...state.future]) }) : state;
  }
  const target = state.future[0];
  return target ? Object.freeze({ past: Object.freeze([...state.past, state.present]), present: withRevision(target, state.present.metadata.revision + 1), future: Object.freeze(state.future.slice(1)) }) : state;
}
