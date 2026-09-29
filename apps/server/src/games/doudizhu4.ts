import type { BaseGame, Card, GameModule, Player } from '../types.js';
import { baseView, dealRoundRobin, deck, nextActive, removeCards, shuffle, sortCards } from './cards.js';
import { beats, classify, findBotPlay, type Combo } from './doudizhu-common.js';

interface Ddz4State extends BaseGame {
  gameId: 'doudizhu4';
  bottom: Card[];
  landlordId: string;
  variant: 'solo' | 'team';
  bids: Record<string, number>;
  bidCount: number;
  highestBid: number;
  highestBidder: string | null;
  multiplier: number;
  current: { playerId: string; cards: Card[]; combo: Combo } | null;
  passes: number;
  rankings: string[];
}

function activeIndices(state: Ddz4State, players: Player[]) {
  return new Set(players.map((_, i) => i).filter((i) => state.rankings.includes(players[i]!.id)));
}

function finish(state: Ddz4State, players: Player[]) {
  const last = players.find((p) => !state.rankings.includes(p.id));
  if (last) state.rankings.push(last.id);
  const rawUnit = Number((state.multiplier * 0.1).toFixed(1));
  const unit = Math.min(rawUnit, 10 / 3);
  const weights = [3, 0, -1, -2];
  state.scores = Object.fromEntries(state.rankings.map((id, index) => [id, Number((unit * weights[index]!).toFixed(1))]));
  state.winnerIds = [state.rankings[0]!];
  state.phase = 'finished';
  state.message = `${players.find((p) => p.id === state.rankings[0])?.name} 获得第一名`;
}

function finishTeam(state: Ddz4State, players: Player[], winnerId: string) {
  const winnerIndex = players.findIndex((player) => player.id === winnerId);
  const winningParity = winnerIndex % 2;
  const unit = Math.min(5, Number((state.multiplier * 0.1).toFixed(1)));
  state.winnerIds = players.filter((_, index) => index % 2 === winningParity).map((player) => player.id);
  state.scores = Object.fromEntries(players.map((player, index) => [player.id, index % 2 === winningParity ? unit : -unit]));
  state.phase = 'finished';
  state.message = `${winningParity === 0 ? '蓝队' : '橙队'}获胜`;
}

export const doudizhu4: GameModule = {
  minPlayers: 4,
  maxPlayers: 4,
  create(players, options) {
    const cards = shuffle(deck(2));
    const ids = players.map((p) => p.id);
    const hands = dealRoundRobin(cards.slice(0, 100), ids, 25);
    const bottom = cards.slice(100);
    return {
      gameId: 'doudizhu4', phase: 'bidding', turn: 0, hands, bottom, landlordId: '', variant: options?.variant === 'team' ? 'team' : 'solo',
      bids: {}, bidCount: 0, highestBid: 0, highestBidder: null,
      multiplier: 1, current: null, passes: 0, rankings: [], message: '请叫分夺底',
    } satisfies Ddz4State;
  },
  action(base, players, playerId, action) {
    const state = base as Ddz4State;
    if (players[state.turn]?.id !== playerId || state.phase === 'finished') throw new Error('还没轮到你');
    if (state.phase === 'bidding') {
      if (action.type !== 'bid') throw new Error('请选择叫分或不叫');
      const bid = typeof action.value === 'number' ? action.value : action.value ? 1 : 0;
      if (!Number.isInteger(bid) || bid < 0 || bid > 3) throw new Error('叫分必须为 0 至 3 分');
      if (bid > 0 && bid <= state.highestBid) throw new Error(`叫分必须高于当前 ${state.highestBid} 分`);
      state.bids[playerId] = bid; state.bidCount += 1;
      if (bid > state.highestBid) { state.highestBid = bid; state.highestBidder = playerId; }
      if (bid < 3 && state.bidCount < players.length) {
        state.turn = nextActive(state.turn, players.length);
        state.message = `当前最高 ${state.highestBid} 分，等待 ${players[state.turn]!.name}`;
        return;
      }
      if (!state.highestBidder) {
        const cards = shuffle(deck(2));
        state.hands = dealRoundRobin(cards.slice(0, 100), players.map((player) => player.id), 25);
        state.bottom = cards.slice(100); state.bids = {}; state.bidCount = 0; state.highestBid = 0; state.highestBidder = null;
        state.turn = 0; state.message = '无人叫分，已重新发牌';
        return;
      }
      state.landlordId = state.highestBidder;
      state.hands[state.landlordId] = sortCards([...state.hands[state.landlordId]!, ...state.bottom]);
      state.multiplier = state.highestBid; state.turn = players.findIndex((player) => player.id === state.landlordId); state.phase = 'playing';
      state.message = `${players[state.turn]!.name} 以 ${state.highestBid} 分夺底并先出`;
      return;
    }
    const skipped = activeIndices(state, players);
    const activeCount = players.length - skipped.size;
    if (action.type === 'pass') {
      if (!state.current || state.current.playerId === playerId) throw new Error('你需要出牌');
      state.passes += 1;
      const leaderIsActive = !state.rankings.includes(state.current.playerId);
      const requiredPasses = activeCount - (leaderIsActive ? 1 : 0);
      if (state.passes >= requiredPasses) {
        const leaderIndex = players.findIndex((p) => p.id === state.current!.playerId);
        state.current = null;
        state.passes = 0;
        state.turn = skipped.has(leaderIndex) ? nextActive(leaderIndex, players.length, skipped) : leaderIndex;
      } else state.turn = nextActive(state.turn, players.length, skipped);
      state.message = `${players[state.turn]!.name} 出牌`;
      return;
    }
    if (action.type !== 'play') throw new Error('无效操作');
    const hand = state.hands[playerId]!;
    const chosen = action.cardIds.map((id) => hand.find((card) => card.id === id)).filter(Boolean) as Card[];
    const remaining = removeCards(hand, action.cardIds);
    const combo = classify(chosen);
    if (!remaining || !combo) throw new Error('这组牌不是有效牌型');
    if (!beats(combo, state.current?.combo ?? null)) throw new Error('这组牌压不过桌面上的牌');
    state.hands[playerId] = remaining;
    state.current = { playerId, cards: chosen, combo };
    state.passes = 0;
    if (combo.kind === 'bomb' || combo.kind === 'rocket') state.multiplier = Math.min(256, state.multiplier * 2);
    if (!remaining.length) {
      if (state.variant === 'team') return finishTeam(state, players, playerId);
      state.rankings.push(playerId);
      if (state.rankings.length === players.length - 1) return finish(state, players);
    }
    state.turn = nextActive(state.turn, players.length, activeIndices(state, players));
    state.message = `${players[state.turn]!.name} 出牌`;
  },
  view(base, playerId) {
    const state = base as Ddz4State;
    return { ...baseView(state, playerId), bottom: state.phase === 'bidding' ? [] : state.bottom, suggestion: state.phase === 'playing' ? findBotPlay(state.hands[playerId]!, state.current?.combo ?? null).map((card) => card.id) : [] };
  },
  botAction(base, _players, playerId) {
    const state = base as Ddz4State;
    if (state.phase === 'bidding') return { type: 'bid', value: state.highestBid === 0 ? 1 : 0 };
    const cards = findBotPlay(state.hands[playerId]!, state.current?.combo ?? null);
    return cards.length ? { type: 'play', cardIds: cards.map((c) => c.id) } : { type: 'pass' };
  },
};
