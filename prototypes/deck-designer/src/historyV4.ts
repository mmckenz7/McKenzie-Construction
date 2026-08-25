import { normalizeDeckDesignV4, type DeckDesignV4 } from "./modelV4";

export type DesignHistoryV4 = Readonly<{ past: readonly DeckDesignV4[]; present: DeckDesignV4; future: readonly DeckDesignV4[] }>;
export type HistoryActionV4 = Readonly<{ type: "apply" | "reset"; design: DeckDesignV4 }> | Readonly<{ type: "undo" | "redo" }>;

export function createHistoryV4(design: DeckDesignV4): DesignHistoryV4 {
  return Object.freeze({ past: Object.freeze([]), present: normalizeDeckDesignV4(design), future: Object.freeze([]) });
}

function withRevision(design: DeckDesignV4, revision: number): DeckDesignV4 {
  return normalizeDeckDesignV4({ ...design, metadata: { ...design.metadata, revision } });
}

export function designHistoryReducerV4(state: DesignHistoryV4, action: HistoryActionV4): DesignHistoryV4 {
  if (action.type === "reset") return createHistoryV4(action.design);
  if (action.type === "apply") {
    const normalized = normalizeDeckDesignV4(action.design);
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
