import type { BaseGame, Card, GameModule } from '../types.js';
import { baseView, dealRoundRobin, deck, nextActive, shuffle } from './cards.js';

interface FishingState extends BaseGame {
  gameId: 'fishing';
  table: Card[];
  captured: Record<string, Card[]>;
  catches: Record<string, number>;
  turnCount: number;
}

function cardPoints(card: Card): number {
  if (card.rank === '大王') return 15;
  if (card.rank === '小王') return 10;
  if (card.rank === 'A') return 5;
  if (['J', 'Q', 'K'].includes(card.rank)) return 3;
  return 1;
}

export const fishing: GameModule = {
  minPlayers: 2,
  maxPlayers: 4,
  create(players) {
    const ids = players.map((p) => p.id);
    return {
      gameId: 'fishing', phase: 'playing', turn: 0, hands: dealRoundRobin(shuffle(deck()), ids),
      table: [], captured: Object.fromEntries(ids.map((id) => [id, []])), catches: Object.fromEntries(ids.map((id) => [id, 0])), turnCount: 0,
      message: `${players[0]!.name} 翻牌`,
    } satisfies FishingState;
  },
  action(base, players, playerId, action) {
    const state = base as FishingState;
    if (players[state.turn]?.id !== playerId) throw new Error('还没轮到你');
    if (action.type !== 'draw') throw new Error('请翻一张牌');
    const card = state.hands[playerId]!.shift();
    if (!card) throw new Error('已经没有牌了');
    state.turnCount += 1;
    let match = card.suit === 'J' && state.table.length ? 0 : -1;
    if (match < 0) for (let i = state.table.length - 1; i >= 0; i -= 1) {
      if (state.table[i]!.rank === card.rank) { match = i; break; }
    }
    state.table.push(card);
    if (match >= 0) {
      const caught = state.table.splice(match);
      state.captured[playerId] = caught;
      state.catches[playerId] = (state.catches[playerId] ?? 0) + caught.length;
      state.hands[playerId]!.push(...caught);
      state.message = card.suit === 'J' ? `${players[state.turn]!.name} 用王收走全桌 ${caught.length} 张牌，继续翻牌` : `${players[state.turn]!.name} 钓到 ${caught.length} 张牌，继续翻牌`;
    }
    const active = players.filter((player) => state.hands[player.id]!.length > 0);
    if (active.length <= 1 || state.turnCount >= 1000) {
      state.scores = Object.fromEntries(players.map((p) => [p.id, state.hands[p.id]!.reduce((sum, c) => sum + cardPoints(c), 0)]));
      const high = Math.max(...Object.values(state.scores));
      state.winnerIds = players.filter((p) => state.scores![p.id] === high).map((p) => p.id);
      state.phase = 'finished';
      state.message = state.turnCount >= 1000 ? '达到回合上限，按当前牌堆积分结算' : `${active[0]?.name ?? '无人'} 留到最后`;
      return;
    }
    if (match >= 0) return;
    const emptyHands = new Set(players.map((player, index) => state.hands[player.id]!.length ? -1 : index).filter((index) => index >= 0));
    state.turn = nextActive(state.turn, players.length, emptyHands);
    state.message = `${players[state.turn]!.name} 翻牌`;
  },
  view(state, playerId) { return baseView(state as FishingState, playerId); },
  botAction() { return { type: 'draw' }; },
};
