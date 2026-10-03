import type { BaseGame, Card, GameModule, Player } from '../types.js';
import { baseView, deck, nextActive, shuffle } from './cards.js';

interface PokerState extends BaseGame {
  gameId: 'poker';
  drawPile: Card[];
  community: Card[];
  pot: number;
  stacks: Record<string, number>;
  bets: Record<string, number>;
  contributions: Record<string, number>;
  folded: string[];
  acted: string[];
  currentBet: number;
  dealer: number;
  pots: number[];
  showdownHands?: Record<string, Card[]>;
  startingStacks: Record<string, number>;
}

function scoreFive(cards: Card[]): number[] {
  const values = cards.map((c) => c.value === 14 ? 14 : Math.min(c.value, 14)).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((c) => c.suit === cards[0]!.suit);
  const unique = [...new Set(values)];
  if (unique[0] === 14) unique.push(1);
  let straight = 0;
  for (let i = 0; i <= unique.length - 5; i += 1) if (unique[i]! - unique[i + 4]! === 4) straight = Math.max(straight, unique[i]!);
  if (flush && straight) return [8, straight];
  if (groups[0]![1] === 4) return [7, groups[0]![0], groups[1]![0]];
  if (groups[0]![1] === 3 && groups[1]?.[1] === 2) return [6, groups[0]![0], groups[1]![0]];
  if (flush) return [5, ...values];
  if (straight) return [4, straight];
  if (groups[0]![1] === 3) return [3, groups[0]![0], ...groups.slice(1).map((g) => g[0])];
  if (groups[0]![1] === 2 && groups[1]?.[1] === 2) return [2, Math.max(groups[0]![0], groups[1]![0]), Math.min(groups[0]![0], groups[1]![0]), groups[2]![0]];
  if (groups[0]![1] === 2) return [1, groups[0]![0], ...groups.slice(1).map((g) => g[0])];
  return [0, ...values];
}

function bestScore(cards: Card[]): number[] {
  let best: number[] = [];
  for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++)
    for (let c = b + 1; c < cards.length - 2; c++) for (let d = c + 1; d < cards.length - 1; d++)
      for (let e = d + 1; e < cards.length; e++) {
        const score = scoreFive([cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!]);
        if (!best.length || score.some((n, i) => n !== (best[i] ?? -1) && n > (best[i] ?? -1) && score.slice(0, i).every((v, j) => v === best[j]))) best = score;
      }
  return best;
}

const HAND_NAMES = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];

function settle(state: PokerState, players: Player[], contenders: string[]) {
  const scores = Object.fromEntries(contenders.map((id) => [id, bestScore([...state.hands[id]!, ...state.community])])) as Record<string, number[]>;
  const rank = (eligible: string[]) => {
    if (eligible.length <= 1) return eligible;
    const ranked = eligible.map((id) => ({ id, score: scores[id]! }));
    ranked.sort((a, b) => {
      for (let i = 0; i < Math.max(a.score.length, b.score.length); i++) if ((a.score[i] ?? 0) !== (b.score[i] ?? 0)) return (b.score[i] ?? 0) - (a.score[i] ?? 0);
      return 0;
    });
    return ranked.filter((entry) => entry.score.every((value, index) => value === ranked[0]!.score[index])).map((entry) => entry.id);
  };
  const levels = [...new Set(Object.values(state.contributions).filter((value) => value > 0))].sort((a, b) => a - b);
  let previous = 0;
  const allWinners = new Set<string>();
  state.pots = [];
  for (const level of levels) {
    const contributors = players.filter((player) => state.contributions[player.id]! >= level);
    const amount = (level - previous) * contributors.length;
    const eligible = contenders.filter((id) => state.contributions[id]! >= level);
    const winners = rank(eligible);
    if (amount > 0 && !winners.length) {
      const refund = level - previous;
      contributors.forEach((player) => { state.stacks[player.id]! += refund; });
      state.pot -= amount;
      previous = level;
      continue;
    }
    if (amount > 0 && winners.length) {
      state.pots.push(amount);
      const share = Math.floor(amount / winners.length);
      const remainder = amount - share * winners.length;
      winners.forEach((id, index) => {
        allWinners.add(id);
        state.stacks[id] = (state.stacks[id] ?? 0) + share + (index === 0 ? remainder : 0);
      });
    }
    previous = level;
  }
  state.scores = Object.fromEntries(players.map((p) => [p.id, state.stacks[p.id]! - (state.startingStacks?.[p.id] ?? 1000)]));
  state.winnerIds = [...allWinners];
  state.showdownHands = Object.fromEntries(contenders.map((id) => [id, state.hands[id]!]));
  state.phase = 'finished';
  state.message = `${[...allWinners].map((id) => players.find((p) => p.id === id)?.name).join('、')} 赢得底池`;
}

function advanceStreet(state: PokerState, players: Player[]): 'none' | 'street' | 'finished' {
  const active = players.filter((p) => !state.folded.includes(p.id));
  if (active.length === 1) { settle(state, players, active.map((p) => p.id)); return 'finished'; }
  const ableToBet = active.filter((player) => state.stacks[player.id]! > 0);
  const allActed = ableToBet.every((p) => state.acted.includes(p.id) && state.bets[p.id] === state.currentBet);
  if (!allActed) return 'none';
  state.acted = [];
  state.bets = Object.fromEntries(players.map((p) => [p.id, 0]));
  state.currentBet = 0;
  if (state.phase === 'preflop') { state.community.push(...state.drawPile.splice(0, 3)); state.phase = 'flop'; }
  else if (state.phase === 'flop') { state.community.push(...state.drawPile.splice(0, 1)); state.phase = 'turn'; }
  else if (state.phase === 'turn') { state.community.push(...state.drawPile.splice(0, 1)); state.phase = 'river'; }
  else { settle(state, players, active.map((p) => p.id)); return 'finished'; }
  state.message = state.phase === 'flop' ? '翻牌圈' : state.phase === 'turn' ? '转牌圈' : '河牌圈';
  if (ableToBet.length <= 1) {
    if (state.phase === 'flop') state.community.push(...state.drawPile.splice(0, 2));
    else if (state.phase === 'turn') state.community.push(...state.drawPile.splice(0, 1));
    state.phase = 'river';
    settle(state, players, active.map((p) => p.id));
    return 'finished';
  }
  const skipped = new Set(players.map((player, index) => state.folded.includes(player.id) || state.stacks[player.id] === 0 ? index : -1).filter((index) => index >= 0));
  state.turn = nextActive(state.dealer, players.length, skipped);
  return 'street';
}

export const poker: GameModule = {
  minPlayers: 2,
  maxPlayers: 6,
  create(players, options) {
    const pile = shuffle(deck(1, false).map((card) => card.rank === '2' ? { ...card, value: 2 } : card));
    const hands = Object.fromEntries(players.map((p) => [p.id, pile.splice(0, 2)]));
    const previous = typeof options?.startingStacks === 'string' ? JSON.parse(options.startingStacks) as Record<string, number> : {};
    const stacks: Record<string, number> = Object.fromEntries(players.map((p) => {
      const value = previous[p.id];
      return [p.id, Number.isSafeInteger(value) && value !== undefined && value >= 0 ? value : 1000];
    }));
    const startingStacks = { ...stacks };
    const eligible = (index: number) => stacks[players[index]!.id]! > 0;
    let dealer = Number(options?.dealer ?? 0) % players.length;
    while (!eligible(dealer)) dealer = (dealer + 1) % players.length;
    const nextEligible = (from: number) => {
      let index = from;
      do { index = (index + 1) % players.length; } while (!eligible(index));
      return index;
    };
    const smallBlindIndex = Object.values(stacks).filter((n) => n > 0).length === 2 ? dealer : nextEligible(dealer);
    const bigBlindIndex = nextEligible(smallBlindIndex);
    const bets = Object.fromEntries(players.map((p) => [p.id, 0]));
    const contributions = Object.fromEntries(players.map((p) => [p.id, 0]));
    const postBlind = (index: number, amount: number) => {
      const id = players[index]!.id;
      const paid = Math.min(amount, stacks[id]!);
      stacks[id]! -= paid; bets[id]! += paid; contributions[id]! += paid;
      return paid;
    };
    const smallBlind = postBlind(smallBlindIndex, 10);
    const bigBlind = postBlind(bigBlindIndex, 20);
    const firstTurn = nextEligible(bigBlindIndex);
    return {
      gameId: 'poker', phase: 'preflop', turn: firstTurn, hands, drawPile: pile, community: [], pot: smallBlind + bigBlind,
      stacks, startingStacks, bets, contributions, folded: players.filter((p) => !stacks[p.id]).map((p) => p.id), acted: [], currentBet: bigBlind, dealer, pots: [],
      message: `盲注 10/20，${players[firstTurn]!.name} 行动`,
    } satisfies PokerState;
  },
  action(base, players, playerId, action) {
    const state = base as PokerState;
    if (players[state.turn]?.id !== playerId) throw new Error('还没轮到你');
    if (state.folded.includes(playerId) || state.stacks[playerId] === 0) throw new Error('当前玩家不能继续下注');
    if (action.type === 'fold') state.folded.push(playerId);
    else if (action.type === 'check') {
      if (state.bets[playerId] !== state.currentBet) throw new Error('当前有下注，不能过牌');
    } else if (action.type === 'call') {
      const amount = Math.min(Math.max(0, state.currentBet - state.bets[playerId]!), state.stacks[playerId]!);
      state.stacks[playerId]! -= amount; state.bets[playerId]! += amount; state.contributions[playerId]! += amount; state.pot += amount;
    } else if (action.type === 'raise') {
      const callAmount = Math.max(0, state.currentBet - state.bets[playerId]!);
      if (!Number.isInteger(action.amount) || action.amount < 10) throw new Error('请输入至少 10 的整数加注额');
      if (action.amount > state.stacks[playerId]! - callAmount) throw new Error('筹码不足，请减少加注额或选择全押');
      const target = state.currentBet + Math.floor(action.amount);
      const amount = Math.min(target - state.bets[playerId]!, state.stacks[playerId]!);
      const newBet = state.bets[playerId]! + amount;
      state.stacks[playerId]! -= amount; state.bets[playerId] = newBet; state.contributions[playerId]! += amount; state.pot += amount;
      if (newBet > state.currentBet) { state.currentBet = newBet; state.acted = []; }
    } else if (action.type === 'allin') {
      const amount = state.stacks[playerId]!;
      const newBet = state.bets[playerId]! + amount;
      state.stacks[playerId] = 0; state.bets[playerId] = newBet; state.contributions[playerId]! += amount; state.pot += amount;
      if (newBet > state.currentBet) { state.currentBet = newBet; state.acted = []; }
    } else throw new Error('无效操作');
    if (!state.acted.includes(playerId)) state.acted.push(playerId);
    const progress = advanceStreet(state, players);
    if (progress === 'finished') return;
    if (progress === 'street') { state.message = `${state.message}，${players[state.turn]!.name} 行动`; return; }
    const skipped = new Set(players.map((p, i) => state.folded.includes(p.id) || state.stacks[p.id] === 0 ? i : -1).filter((i) => i >= 0));
    state.turn = nextActive(state.turn, players.length, skipped);
    state.message = `${players[state.turn]!.name} 行动`;
  },
  view(base, playerId) {
    const state = base as PokerState;
    const view = baseView(state, playerId);
    const cards = [...state.hands[playerId]!, ...state.community];
    const handRank = cards.length >= 5 ? HAND_NAMES[bestScore(cards)[0] ?? 0] : undefined;
    return { ...view, drawPile: [], hands: undefined, handRank } as never;
  },
  botAction(base, _players, playerId) {
    const state = base as PokerState;
    return state.bets[playerId] === state.currentBet ? { type: 'check' } : { type: 'call' };
  },
};
