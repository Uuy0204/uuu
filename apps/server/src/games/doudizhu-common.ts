import type { Card } from '../types.js';

export type ComboKind = 'single' | 'pair' | 'triple' | 'triple-one' | 'triple-pair' | 'straight' | 'pairs' | 'plane' | 'plane-single' | 'plane-pair' | 'four-two' | 'four-two-pairs' | 'bomb' | 'rocket' | 'heavenly';
export interface Combo { kind: ComboKind; value: number; length: number }

export function classify(cards: Card[]): Combo | null {
  if (!cards.length) return null;
  const sorted = [...cards].sort((a, b) => a.value - b.value);
  const groups = new Map<number, number>();
  for (const card of sorted) groups.set(card.value, (groups.get(card.value) ?? 0) + 1);
  const entries = [...groups.entries()].sort((a, b) => a[0] - b[0]);
  const counts = [...groups.values()].sort((a, b) => b - a);
  const same = groups.size === 1;
  if (cards.length === 1) return { kind: 'single', value: sorted[0]!.value, length: 1 };
  if (cards.length === 4 && cards.every((card) => card.suit === 'J')) return { kind: 'heavenly', value: 19, length: 4 };
  if (cards.length === 2 && new Set(cards.map((card) => card.rank)).size === 2 && cards.every((card) => card.suit === 'J')) {
    return { kind: 'rocket', value: 18, length: 2 };
  }
  if (cards.length === 2 && same) return { kind: 'pair', value: sorted[0]!.value, length: 2 };
  if (cards.length === 3 && same) return { kind: 'triple', value: sorted[0]!.value, length: 3 };
  if (cards.length >= 4 && cards.length <= 8 && same) return { kind: 'bomb', value: sorted[0]!.value, length: cards.length };
  if (cards.length === 4 && counts[0] === 3) return { kind: 'triple-one', value: entries.find(([, n]) => n === 3)![0], length: 4 };
  if (cards.length === 5 && counts[0] === 3 && counts[1] === 2) return { kind: 'triple-pair', value: entries.find(([, n]) => n === 3)![0], length: 5 };
  if (cards.length === 6 && counts[0] === 4) return { kind: 'four-two', value: entries.find(([, n]) => n === 4)![0], length: 6 };
  if (cards.length === 8 && counts[0] === 4 && counts.slice(1).every((n) => n === 2)) return { kind: 'four-two-pairs', value: entries.find(([, n]) => n === 4)![0], length: 8 };
  const consecutive = entries.every(([value], index) => index === 0 || value === entries[index - 1]![0] + 1);
  if (cards.length >= 5 && groups.size === cards.length && consecutive && entries.at(-1)![0] < 15) {
    return { kind: 'straight', value: entries.at(-1)![0], length: cards.length };
  }
  if (cards.length >= 6 && cards.length % 2 === 0 && counts.every((n) => n === 2) && consecutive && entries.at(-1)![0] < 15) {
    return { kind: 'pairs', value: entries.at(-1)![0], length: cards.length };
  }
  if (cards.length >= 6 && cards.length % 3 === 0 && counts.every((n) => n === 3) && consecutive && entries.at(-1)![0] < 15) {
    return { kind: 'plane', value: entries.at(-1)![0], length: cards.length };
  }
  const triples = entries.filter(([value, count]) => count === 3 && value < 15);
  for (let start = 0; start < triples.length; start += 1) {
    let end = start;
    while (end + 1 < triples.length && triples[end + 1]![0] === triples[end]![0] + 1) end += 1;
    const run = triples.slice(start, end + 1);
    for (let size = run.length; size >= 2; size -= 1) {
      const values = new Set(run.slice(0, size).map(([value]) => value));
      const wings = entries.filter(([value]) => !values.has(value));
      if (cards.length === size * 4 && wings.reduce((sum, [, count]) => sum + count, 0) === size) return { kind: 'plane-single', value: run[size - 1]![0], length: cards.length };
      if (cards.length === size * 5 && wings.length === size && wings.every(([, count]) => count === 2)) return { kind: 'plane-pair', value: run[size - 1]![0], length: cards.length };
    }
    start = end;
  }
  return null;
}

export function beats(next: Combo, previous: Combo | null): boolean {
  if (!previous) return true;
  if (next.kind === 'heavenly') return previous.kind !== 'heavenly';
  if (next.kind === 'rocket') return previous.kind !== 'rocket' && previous.kind !== 'heavenly';
  if (next.kind === 'bomb') {
    if (previous.kind !== 'bomb' && previous.kind !== 'rocket' && previous.kind !== 'heavenly') return true;
    if (previous.kind === 'bomb') return next.length > previous.length || (next.length === previous.length && next.value > previous.value);
    return false;
  }
  return next.kind === previous.kind && next.length === previous.length && next.value > previous.value;
}

export function findBotPlay(hand: Card[], previous: Combo | null, allowed?: ComboKind[]): Card[] {
  const sorted = [...hand].sort((a, b) => a.value - b.value);
  const candidates: Card[][] = sorted.map((card) => [card]);
  const byRank = new Map<number, Card[]>();
  for (const card of sorted) byRank.set(card.value, [...(byRank.get(card.value) ?? []), card]);
  for (const group of byRank.values()) {
    if (group.length >= 2) candidates.push(group.slice(0, 2));
    if (group.length >= 3) candidates.push(group.slice(0, 3));
    if (group.length >= 4) candidates.push(group.slice(0, 4));
    for (let size = 5; size <= Math.min(8, group.length); size += 1) candidates.push(group.slice(0, size));
  }
  const jokers = sorted.filter((card) => card.suit === 'J');
  if (jokers.length >= 2) candidates.push(jokers.slice(0, 2));
  if (jokers.length >= 4) candidates.push(jokers.slice(0, 4));
  const ranks = [...byRank.keys()].filter((value) => value < 15).sort((a, b) => a - b);
  const addRuns = (copies: number, minRanks: number, targetKind: ComboKind) => {
    for (let start = 0; start < ranks.length; start += 1) {
      const run: number[] = [];
      for (let i = start; i < ranks.length && (i === start || ranks[i] === ranks[i - 1]! + 1) && (byRank.get(ranks[i]!)?.length ?? 0) >= copies; i += 1) {
        run.push(ranks[i]!);
        if (run.length >= minRanks) {
          const candidate = run.flatMap((rank) => byRank.get(rank)!.slice(0, copies));
          if (classify(candidate)?.kind === targetKind) candidates.push(candidate);
        }
      }
    }
  };
  addRuns(1, 5, 'straight'); addRuns(2, 3, 'pairs'); addRuns(3, 2, 'plane');
  return candidates.find((cards) => {
    const combo = classify(cards);
    return combo && (!allowed || allowed.includes(combo.kind)) && beats(combo, previous);
  }) ?? [];
}
