import type { BaseGame, Card, GameModule, Player } from '../types.js';
import { baseView, dealRoundRobin, deck, nextActive, removeCards, shuffle, sortCards } from './cards.js';
import { beats, classify, findBotPlay, type Combo } from './doudizhu-common.js';

interface Ddz3State extends BaseGame {
  gameId: 'doudizhu3';
  bottom: Card[];
  landlordId: string | null;
  bids: Record<string, number>;
  bidCount: number;
  highestBid: number;
  highestBidder: string | null;
  doubles: Record<string, boolean>;
  doubleCount: number;
  multiplier: number;
  current: { playerId: string; cards: Card[]; combo: Combo } | null;
  passes: number;
  plays: Record<string, number>;
}

function finish(state: Ddz3State, players: Player[], winnerId: string) {
  const landlordWon = winnerId === state.landlordId;
  const landlordPlays = state.plays[state.landlordId!] ?? 0;
  const farmerPlays = players.filter((p) => p.id !== state.landlordId).reduce((sum, p) => sum + (state.plays[p.id] ?? 0), 0);
  if ((landlordWon && farmerPlays === 0) || (!landlordWon && landlordPlays === 1)) state.multiplier = Math.min(256, state.multiplier * 2);
  const unit = Math.min(5, Number((state.multiplier * 0.1).toFixed(1)));
  state.scores = {};
  for (const player of players) {
    const value = player.id === state.landlordId ? unit * 2 : unit;
    state.scores[player.id] = Number((value * ((player.id === state.landlordId) === landlordWon ? 1 : -1)).toFixed(1));
  }
  state.winnerIds = landlordWon ? [state.landlordId!] : players.filter((player) => player.id !== state.landlordId).map((player) => player.id);
  state.phase = 'finished';
  state.message = `${players.find((p) => p.id === winnerId)?.name ?? '玩家'} 获胜`;
}

export const doudizhu3: GameModule = {
  minPlayers: 3,
  maxPlayers: 3,
  create(players) {
    const cards = shuffle(deck());
    const ids = players.map((p) => p.id);
    return {
      gameId: 'doudizhu3', phase: 'bidding', turn: 0,
      hands: dealRoundRobin(cards.slice(0, 51), ids, 17), bottom: cards.slice(51),
      landlordId: null, bids: {}, bidCount: 0, highestBid: 0, highestBidder: null,
      doubles: {}, doubleCount: 0, multiplier: 1, current: null,
      passes: 0, plays: Object.fromEntries(ids.map((id) => [id, 0])), message: '请叫地主',
    } satisfies Ddz3State;
  },
  action(base, players, playerId, action) {
    const state = base as Ddz3State;
    if (players[state.turn]?.id !== playerId || state.phase === 'finished') throw new Error('还没轮到你');
    if (state.phase === 'bidding') {
      if (action.type !== 'bid') throw new Error('请选择叫分或不叫');
      const bid = typeof action.value === 'number' ? action.value : action.value ? 1 : 0;
      if (!Number.isInteger(bid) || bid < 0 || bid > 3) throw new Error('叫分必须为 0 至 3 分');
      if (bid > 0 && bid <= state.highestBid) throw new Error(`叫分必须高于当前 ${state.highestBid} 分`);
      state.bids[playerId] = bid;
      state.bidCount += 1;
      if (bid > state.highestBid) { state.highestBid = bid; state.highestBidder = playerId; }
      if (bid < 3 && state.bidCount < players.length) {
        state.turn = nextActive(state.turn, players.length);
        state.message = `当前最高 ${state.highestBid} 分，等待 ${players[state.turn]!.name}`;
        return;
      }
      if (!state.highestBidder) {
        const cards = shuffle(deck());
        state.hands = dealRoundRobin(cards.slice(0, 51), players.map((player) => player.id), 17);
        state.bottom = cards.slice(51);
        state.bids = {}; state.bidCount = 0; state.highestBid = 0; state.highestBidder = null;
        state.turn = 0; state.message = '无人叫牌，已重新发牌';
        return;
      }
      const bidder = players.find((player) => player.id === state.highestBidder)!;
      state.landlordId = bidder.id;
      state.hands[bidder.id] = sortCards([...state.hands[bidder.id]!, ...state.bottom]);
      state.multiplier = state.highestBid;
      state.phase = 'doubling';
      state.turn = nextActive(players.findIndex((p) => p.id === bidder.id), players.length);
      state.message = `${bidder.name} 以 ${state.highestBid} 分成为地主，农民选择是否加倍`;
      return;
    }
    if (state.phase === 'doubling') {
      if (action.type !== 'double') throw new Error('请选择加倍或不加倍');
      if (playerId === state.landlordId) throw new Error('地主无需选择加倍');
      state.doubles[playerId] = action.value;
      state.doubleCount += 1;
      if (action.value) state.multiplier = Math.min(256, state.multiplier * 2);
      if (state.doubleCount < players.length - 1) {
        state.turn = nextActive(state.turn, players.length);
        if (players[state.turn]!.id === state.landlordId) state.turn = nextActive(state.turn, players.length);
        state.message = `等待 ${players[state.turn]!.name} 选择是否加倍`;
        return;
      }
      state.turn = players.findIndex((p) => p.id === state.landlordId);
      state.phase = 'playing';
      state.message = `${players[state.turn]!.name} 是地主，请先出牌`;
      return;
    }
    if (action.type === 'pass') {
      if (!state.current || state.current.playerId === playerId) throw new Error('你需要出牌');
      state.passes += 1;
      if (state.passes >= players.length - 1) {
        state.turn = players.findIndex((p) => p.id === state.current!.playerId);
        state.current = null;
        state.passes = 0;
        state.message = '新一轮，请出任意牌型';
      } else {
        state.turn = nextActive(state.turn, players.length);
        state.message = `${players[state.turn]!.name} 出牌`;
      }
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
    state.plays[playerId] = (state.plays[playerId] ?? 0) + 1;
    if (combo.kind === 'bomb' || combo.kind === 'rocket') state.multiplier = Math.min(256, state.multiplier * 2);
    if (!remaining.length) return finish(state, players, playerId);
    state.turn = nextActive(state.turn, players.length);
    state.message = `${players[state.turn]!.name} 出牌`;
  },
  view(base, playerId) {
    const state = base as Ddz3State;
    return { ...baseView(state, playerId), bottom: state.phase === 'bidding' ? [] : state.bottom, suggestion: state.phase === 'playing' ? findBotPlay(state.hands[playerId]!, state.current?.combo ?? null).map((card) => card.id) : [] };
  },
  botAction(base, players, playerId) {
    const state = base as Ddz3State;
    if (state.phase === 'bidding') return { type: 'bid', value: state.highestBid === 0 ? 1 : 0 };
    if (state.phase === 'doubling') return { type: 'double', value: false };
    const cards = findBotPlay(state.hands[playerId]!, state.current?.combo ?? null);
    return cards.length ? { type: 'play', cardIds: cards.map((c) => c.id) } : { type: 'pass' };
  },
};
