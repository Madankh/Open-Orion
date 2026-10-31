import type { TLStoreSnapshot, TLEditorSnapshot } from 'tldraw';

type WhiteboardSnapshot = Partial<TLEditorSnapshot> | TLStoreSnapshot;

export interface WhiteboardSnapshotInfo {
  snapshot: WhiteboardSnapshot | null;
  store: Record<string, unknown> | null;
  shapeCount: number;
}

/** Parse and validate both legacy TLStoreSnapshot and current TLEditorSnapshot data. */
export function getWhiteboardSnapshotInfo(value: unknown): WhiteboardSnapshotInfo {
  let snapshot: unknown = value;

  // Canvas content is normally JSON, but tolerate a previously double-encoded value too.
  for (let attempt = 0; typeof snapshot === 'string' && attempt < 2; attempt += 1) {
    try {
      snapshot = JSON.parse(snapshot);
    } catch {
      return { snapshot: null, store: null, shapeCount: 0 };
    }
  }

  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { snapshot: null, store: null, shapeCount: 0 };
  }

  const candidate = snapshot as Record<string, unknown>;
  const document = candidate.document as { store?: Record<string, unknown> } | undefined;
  const store = document?.store ?? (candidate.store as Record<string, unknown> | undefined) ?? null;
  if (
    !store ||
    typeof store !== 'object' ||
    !store['document:document'] ||
    !Object.keys(store).some(key => key.startsWith('page:'))
  ) {
    return { snapshot: null, store: null, shapeCount: 0 };
  }

  return {
    snapshot: snapshot as WhiteboardSnapshot,
    store,
    shapeCount: Object.keys(store).filter(key => key.startsWith('shape:')).length,
  };
}
