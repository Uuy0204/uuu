import { randomInt } from 'node:crypto';
import type { Card } from '../types.js';

const SUITS: Card['suit'][] = ['S', 'H', 'C', 'D'];
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

export function deck(copies = 1, jokers = true): Card[] {
  const cards: Card[] = [];
  for (let copy = 0; copy < copies; copy += 1) {
    for (const suit of SUITS) {
      RANKS.forEach((rank, index) => cards.push({ id: `${copy}-${suit}-${rank}`, rank, suit, value: index + 3 }));
    }
    if (jokers) {
      cards.push({ id: `${copy}-J-SJ`, rank: '小王', suit: 'J', value: 16 });
      cards.push({ id: `${copy}-J-BJ`, rank: '大王', suit: 'J', value: 17 });
    }
  }
  return cards;
}

export function shuffle<T>(source: T[]): T[] {
  const result = [...source];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => a.value - b.value || a.suit.localeCompare(b.suit));
}

export function dealRoundRobin(cards: Card[], playerIds: string[], count?: number): Record<string, Card[]> {
  const hands = Object.fromEntries(playerIds.map((id) => [id, [] as Card[]]));
  const limit = count ? Math.min(cards.length, count * playerIds.length) : cards.length;
  for (let i = 0; i < limit; i += 1) hands[playerIds[i % playerIds.length]!]!.push(cards[i]!);
  for (const id of playerIds) hands[id] = sortCards(hands[id]!);
  return hands;
}

export function removeCards(hand: Card[], ids: string[]): Card[] | null {
  const wanted = new Set(ids);
  if (wanted.size !== ids.length || ids.some((id) => !hand.some((card) => card.id === id))) return null;
  return hand.filter((card) => !wanted.has(card.id));
}

export function nextActive(turn: number, total: number, skipped: Set<number> = new Set()): number {
  let next = turn;
  do next = (next + 1) % total; while (skipped.has(next));
  return next;
}

export function baseView<T extends { hands: Record<string, Card[]> }>(state: T, playerId: string) {
  const { hands, ...publicState } = state;
  return {
    ...publicState,
    hand: hands[playerId] ?? [],
    handCounts: Object.fromEntries(Object.entries(hands).map(([id, cards]) => [id, cards.length])),
  };
}
