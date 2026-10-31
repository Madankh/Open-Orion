import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card, NodeData } from '@/typings/agent';
import { restoreInlineImageSources } from '../components/CanvasHelpers';

export interface CardRefItem {
  id: string; title: string; kind: 'card' | 'document';
  source: 'mention' | 'connection' | 'manual' | 'outline'; link_id?: string;
}
export interface CardLinks { out: CardRefItem[]; in: CardRefItem[] }
export interface CardBoard { canvas_id: string; title: string; node_id: string }

export const normalizeTags = (tags: string[]) =>
  Array.from(new Set(tags.map(t => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean)));

export const normalizeCard = (c: any): Card => ({
  id: c.card_id ?? c.id,
  type: c.card_type ?? c.type ?? 'text',
  title: c.title ?? '',
  content: c.content ?? '',
  mediaUrl: c.media_url ?? c.mediaUrl,
  s3Key: c.s3_key ?? c.s3Key,
  fileName: c.file_name ?? c.fileName,
  fileType: c.file_type ?? c.fileType,
  pdfSource: c.metadata?.pdfSource ?? c.pdfSource,
  boardCount: c.board_count ?? c.boardCount,
  tags: Array.isArray(c.tags) ? c.tags : [],
  updatedAt: c.updated_at ?? c.updatedAt,
});

export function useCards({ accessToken, apiBase, nodes }: {
  accessToken?: string; apiBase: string; nodes: NodeData[];
}) {
  const [cards, setCards] = useState<Record<string, Card>>({});
  const [workspaceTags, setWorkspaceTags] = useState<{ name: string; count: number }[]>([]);
  const [linksVersion, setLinksVersion] = useState(0);
  const requested = useRef(new Set<string>());
  const pending = useRef<Record<string, Record<string, unknown>>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const headers = useMemo(() => ({
    Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json',
  }), [accessToken]);

  const upsertCards = useCallback((list: Card[]) => {
    list.forEach(c => requested.current.add(c.id));
    setCards(prev => {
      const next = { ...prev };
      list.forEach(c => { next[c.id] = { ...prev[c.id], ...c }; });
      return next;
    });
  }, []);

  const removeCard = useCallback((id: string) => {
    setCards(prev => { const n = { ...prev }; delete n[id]; return n; });
  }, []);

  // ---- save (merged, debounced) ----
  const flush = useCallback(async (cardId: string) => {
    const data = pending.current[cardId];
    if (!data || !accessToken) return;
    delete pending.current[cardId]; delete timers.current[cardId];
    try {
      const r = await fetch(`${apiBase}/cards/${cardId}`, { method: 'PATCH', headers, body: JSON.stringify(data) });
      if (!r.ok) throw new Error(String(r.status));
    } catch (e) { console.error('card save failed', e); toast.error('Could not save card'); }
  }, [apiBase, headers]);

  const patchCard = useCallback((cardId: string, patch: Partial<Card>) => {
    setCards(prev => prev[cardId] ? { ...prev, [cardId]: { ...prev[cardId], ...patch } } : prev);
    pending.current[cardId] = { ...pending.current[cardId], ...patch };
    clearTimeout(timers.current[cardId]);
    timers.current[cardId] = setTimeout(() => flush(cardId), 800);
  }, [flush]);

  useEffect(() => () => {
    Object.keys(timers.current).forEach(id => { clearTimeout(timers.current[id]); flush(id); });
  }, [flush]);

  const updateTags = useCallback((id: string, tags: string[]) =>
    patchCard(id, { tags: normalizeTags(tags) }), [patchCard]);

  // ---- load ----
  const loadCards = useCallback(async (ids: string[]): Promise<Card[]> => {
    if (!accessToken || !ids.length) return [];
    ids.forEach(id => requested.current.add(id));
    try {
      const r = await fetch(`${apiBase}/cards/batch`, { method: 'POST', headers, body: JSON.stringify({ card_ids: ids }) });
      const list: Card[] = r.ok
        ? await Promise.all((await r.json()).map(async (rawCard: any) => {
            const card = normalizeCard(rawCard);
            return { ...card, content: await restoreInlineImageSources(card.content, accessToken) };
          }))
        : [];
      if (list.length) upsertCards(list);
      return list;
    } catch (e) {
      ids.forEach(id => requested.current.delete(id)); console.error(e); return [];
    }
  }, [accessToken, apiBase, headers, upsertCards]);

  useEffect(() => {
    const missing = Array.from(new Set(nodes
      .filter(n => n.kind === 'card' && n.cardId && !cards[n.cardId] && !requested.current.has(n.cardId))
      .map(n => n.cardId as string)));
    if (missing.length) loadCards(missing);
  }, [nodes, cards, loadCards]);

  const searchTags = useCallback(async (q: string, signal?: AbortSignal): Promise<{ name: string; count: number }[]> => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    const r = await fetch(`${apiBase}/tags?${params.toString()}`, { headers, signal });
    if (!r.ok) throw new Error(`Tag search failed (${r.status})`);
    return r.json();
  }, [apiBase, headers]);

  useEffect(() => {
    if (!accessToken) return;
    searchTags('').then(setWorkspaceTags).catch(() => {});
  }, [accessToken, searchTags]);

  const suggestTags = useMemo(() => {
    const s = new Set(workspaceTags.map(t => t.name));
    Object.values(cards).forEach(c => c.tags?.forEach(t => s.add(t)));
    return Array.from(s).sort();
  }, [workspaceTags, cards]);

  // ---- search / relations ----
  const search = useCallback(async (q: string, tags: string[] = [], signal?: AbortSignal): Promise<Card[]> => {
    const p = new URLSearchParams({ q, type: 'card' });
    tags.forEach(t => p.append('tags', t));
    const r = await fetch(`${apiBase}/search?${p}`, { headers, signal });
    if (!r.ok) return [];
    return Promise.all((await r.json()).map(async (rawCard: any) => {
      const card = normalizeCard(rawCard);
      return { ...card, content: await restoreInlineImageSources(card.content, accessToken) };
    }));
  }, [accessToken, apiBase, headers]);

  const getLinks = useCallback(async (cardId: string): Promise<CardLinks> => {
    const r = await fetch(`${apiBase}/cards/${cardId}/links`, { headers });
    return r.ok ? r.json() : { out: [], in: [] };
  }, [apiBase, headers]);

  const getBoards = useCallback(async (cardId: string): Promise<CardBoard[]> => {
    const r = await fetch(`${apiBase}/cards/${cardId}/boards`, { headers });
    return r.ok ? r.json() : [];
  }, [apiBase, headers]);

  const addLink = useCallback(async (fromCardId: string, toCardId: string, label?: string) => {
    if (fromCardId === toCardId) return toast.error('Cannot link a card to itself');
    const r = await fetch(`${apiBase}/card-links`, {
      method: 'POST', headers,
      body: JSON.stringify({ from_card_id: fromCardId, to_card_id: toCardId, source: 'manual', label }),
    });
    if (r.ok) { setLinksVersion(v => v + 1); toast.success('Linked'); } else toast.error('Could not link');
  }, [apiBase, headers]);

  const removeLink = useCallback(async (linkId: string) => {
    const r = await fetch(`${apiBase}/card-links/${linkId}`, { method: 'DELETE', headers });
    if (r.ok) setLinksVersion(v => v + 1);
  }, [apiBase, headers]);

  return {
    cards, upsertCards, removeCard, patchCard, updateTags, loadCards,
    suggestTags, search, searchTags, getLinks, getBoards, addLink, removeLink, linksVersion,
  };
}
