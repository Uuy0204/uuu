import type { BaseGame, Card, GameAction, GameModule, Player } from '../types.js';
import { baseView, dealRoundRobin, deck, nextActive, removeCards, shuffle } from './cards.js';
import { beats, classify, findBotPlay, type Combo, type ComboKind } from './doudizhu-common.js';

interface ClimbingState extends BaseGame {
  gameId: 'paodekuai' | 'zhengshangyou';
  current: { playerId: string; cards: Card[]; combo: Combo } | null;
  passes: number;
  rankings: string[];
  allowed: ComboKind[];
  firstMove: boolean;
  multiplier: number;
}

function active(state: ClimbingState, players: Player[]) {
  return new Set(players.map((_, i) => i).filter((i) => state.rankings.includes(players[i]!.id)));
}

function finish(state: ClimbingState, players: Player[]) {
  const last = players.find((p) => !state.rankings.includes(p.id));
  if (last) state.rankings.push(last.id);
  const middle = (players.length - 1) / 2;
  state.scores = Object.fromEntries(state.rankings.map((id, i) => [id, Number(((middle - i) * 0.2 * state.multiplier).toFixed(1))]));
  state.winnerIds = [state.rankings[0]!];
  state.phase = 'finished';
  state.message = `${players.find((p) => p.id === state.rankings[0])?.name} 最先出完`;
}

interface ClimbingRules {
  gameId: ClimbingState['gameId'];
  minPlayers: number;
  allowed: ComboKind[];
  jokers: boolean;
  mustFollow: boolean;
}

export function climbingGame({ gameId, minPlayers, allowed, jokers, mustFollow }: ClimbingRules): GameModule {
  return {
    minPlayers,
    maxPlayers: 4,
    create(players) {
      const pile = shuffle(deck(1, jokers));
      const count = jokers ? undefined : players.length === 3 ? 16 : 13;
      const dealtCount = count ? count * players.length : pile.length;
      const spadeThreeIndex = pile.findIndex((card) => card.rank === '3' && card.suit === 'S');
      if (spadeThreeIndex >= dealtCount) [pile[0], pile[spadeThreeIndex]] = [pile[spadeThreeIndex]!, pile[0]!];
      const hands = dealRoundRobin(pile, players.map((p) => p.id), count);
      const starter = players.findIndex((player) => hands[player.id]!.some((card) => card.rank === '3' && card.suit === 'S'));
      return {
        gameId, phase: 'playing', turn: starter, hands,
        current: null, passes: 0, rankings: [], allowed, firstMove: true, multiplier: 1, message: `${players[starter]!.name} 持黑桃 3 先出牌`,
      } satisfies ClimbingState;
    },
    action(base, players, playerId, action: GameAction) {
      const state = base as ClimbingState;
      if (players[state.turn]?.id !== playerId) throw new Error('还没轮到你');
      const skipped = active(state, players);
      const activeCount = players.length - skipped.size;
      if (action.type === 'pass') {
        if (!state.current || state.current.playerId === playerId) throw new Error('你需要出牌');
        if (mustFollow && findBotPlay(state.hands[playerId]!, state.current.combo, state.allowed).length) throw new Error('有牌能压，不能要不起');
        state.passes += 1;
        const leaderIsActive = !state.rankings.includes(state.current.playerId);
        const requiredPasses = activeCount - (leaderIsActive ? 1 : 0);
        if (state.passes >= requiredPasses) {
          const leader = players.findIndex((p) => p.id === state.current!.playerId);
          state.current = null;
          state.passes = 0;
          state.turn = skipped.has(leader) ? nextActive(leader, players.length, skipped) : leader;
        } else state.turn = nextActive(state.turn, players.length, skipped);
        return;
      }
      if (action.type !== 'play') throw new Error('无效操作');
      const hand = state.hands[playerId]!;
      const cards = action.cardIds.map((id) => hand.find((card) => card.id === id)).filter(Boolean) as Card[];
      const combo = classify(cards);
      const remaining = removeCards(hand, action.cardIds);
      if (!remaining || !combo || !state.allowed.includes(combo.kind)) throw new Error('当前玩法不支持这组牌型');
      if (state.firstMove && !cards.some((card) => card.rank === '3' && card.suit === 'S')) throw new Error('首手必须包含黑桃 3');
      if (!beats(combo, state.current?.combo ?? null)) throw new Error('这组牌压不过桌面上的牌');
      state.hands[playerId] = remaining;
      state.current = { playerId, cards, combo };
      state.firstMove = false;
      state.passes = 0;
      if (combo.kind === 'bomb') state.multiplier = Math.min(256, state.multiplier * 2);
      if (!remaining.length) {
        state.rankings.push(playerId);
        if (state.rankings.length === players.length - 1) return finish(state, players);
      }
      state.turn = nextActive(state.turn, players.length, active(state, players));
    },
    view(base, playerId) {
      const state = base as ClimbingState;
      let suggestion = findBotPlay(state.hands[playerId]!, state.current?.combo ?? null, state.allowed);
      if (state.firstMove) {
        const spadeThree = state.hands[playerId]!.find((card) => card.rank === '3' && card.suit === 'S');
        if (spadeThree) suggestion = [spadeThree];
      }
      return { ...baseView(state, playerId), suggestion: suggestion.map((card) => card.id) };
    },
    botAction(base, _players, playerId) {
      const state = base as ClimbingState;
      let cards = findBotPlay(state.hands[playerId]!, state.current?.combo ?? null, state.allowed);
      if (state.firstMove) {
        const spadeThree = state.hands[playerId]!.find((card) => card.rank === '3' && card.suit === 'S');
        if (spadeThree) cards = [spadeThree];
      }
      const combo = classify(cards);
      return cards.length && combo && state.allowed.includes(combo.kind)
        ? { type: 'play', cardIds: cards.map((c) => c.id) }
        : { type: 'pass' };
    },
  };
}

export const paodekuai = climbingGame({
  gameId: 'paodekuai', minPlayers: 3, jokers: false, mustFollow: true,
  allowed: ['single', 'pair', 'triple', 'triple-one', 'straight', 'pairs', 'plane', 'plane-single', 'bomb'],
});

export const zhengshangyou = climbingGame({
  gameId: 'zhengshangyou', minPlayers: 3, jokers: true, mustFollow: false,
  allowed: ['single', 'pair', 'triple', 'triple-one', 'triple-pair', 'straight', 'pairs', 'plane', 'plane-single', 'plane-pair', 'four-two', 'four-two-pairs', 'bomb', 'rocket'],
});
