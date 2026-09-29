import { randomInt } from 'node:crypto';
import type { BaseGame, Card, ClientGame, GameAction, GameModule, Player } from '../types.js';
import { nextActive, removeCards, shuffle } from './cards.js';

type TargetRank = 'A' | 'K' | 'Q';

interface Claim {
  playerId: string;
  cards: Card[];
  count: number;
}

interface LiarsBarState extends BaseGame {
  gameId: 'liarsbar';
  targetRank: TargetRank;
  roundNumber: number;
  tableCount: number;
  lastClaim: Claim | null;
  lastReveal: { cards: Card[]; liar: boolean; loserId: string; hit: boolean } | null;
  eliminated: string[];
  shots: Record<string, number>;
  bulletCount: number;
  bulletChambers: Record<string, number[]>;
}

const TARGETS: TargetRank[] = ['A', 'K', 'Q'];

function targetRank(): TargetRank {
  return TARGETS[randomInt(TARGETS.length)]!;
}

function liarDeck(): Card[] {
  const cards: Card[] = [];
  const suits: Card['suit'][] = ['S', 'H', 'C', 'D'];
  for (const [rankIndex, rank] of TARGETS.entries()) {
    for (let index = 0; index < 6; index += 1) {
      cards.push({ id: `liar-${rank}-${index}`, rank, suit: suits[index % suits.length]!, value: 14 - rankIndex });
    }
  }
  cards.push({ id: 'liar-joker-0', rank: '鬼牌', suit: 'J', value: 17 });
  cards.push({ id: 'liar-joker-1', rank: '鬼牌', suit: 'J', value: 17 });
  return shuffle(cards);
}

function activeIndexes(state: LiarsBarState, players: Player[]): Set<number> {
  return new Set(players.map((player, index) => state.eliminated.includes(player.id) ? index : -1).filter((index) => index >= 0));
}

function dealRound(state: LiarsBarState, players: Player[]) {
  const cards = liarDeck();
  const activePlayers = players.filter((player) => !state.eliminated.includes(player.id));
  state.hands = Object.fromEntries(players.map((player) => [player.id, [] as Card[]]));
  activePlayers.forEach((player, playerIndex) => {
    state.hands[player.id] = cards.slice(playerIndex * 5, playerIndex * 5 + 5);
  });
  state.targetRank = targetRank();
  state.tableCount = 0;
  state.lastClaim = null;
  state.roundNumber += 1;
}

function finish(state: LiarsBarState, players: Player[], winnerId: string) {
  const loss = 0.1;
  state.scores = Object.fromEntries(players.map((player) => [player.id, player.id === winnerId ? Number(((players.length - 1) * loss).toFixed(1)) : -loss]));
  state.winnerIds = [winnerId];
  state.phase = 'finished';
  state.message = `${players.find((player) => player.id === winnerId)?.name} 成为骗子之王`;
}

function resolveChallenge(state: LiarsBarState, players: Player[], challengerId: string) {
  const claim = state.lastClaim!;
  const liar = claim.cards.some((card) => card.rank !== state.targetRank && card.rank !== '鬼牌');
  const loserId = liar ? claim.playerId : challengerId;
  state.shots[loserId] = (state.shots[loserId] ?? 0) + 1;
  const hit = state.bulletChambers[loserId]?.includes(state.shots[loserId]!) ?? false;
  if (hit) state.eliminated.push(loserId);
  state.lastReveal = { cards: claim.cards, liar, loserId, hit };

  const survivors = players.filter((player) => !state.eliminated.includes(player.id));
  if (survivors.length === 1) return finish(state, players, survivors[0]!.id);

  const loserIndex = players.findIndex((player) => player.id === loserId);
  state.turn = hit ? nextActive(loserIndex, players.length, activeIndexes(state, players)) : loserIndex;
  dealRound(state, players);
  state.phase = 'playing';
  const loser = players[loserIndex]!;
  state.message = hit
    ? `${loser.name} 中弹离席，新一轮目标牌：${state.targetRank}`
    : `${loser.name} 幸运空膛，由其先出，目标牌：${state.targetRank}`;
}

export const liarsbar: GameModule = {
  minPlayers: 2,
  maxPlayers: 4,
  create(players, options) {
    const bulletCount = Math.max(1, Math.min(6, Number(options?.bulletCount) || 1));
    const state: LiarsBarState = {
      gameId: 'liarsbar', phase: 'playing', turn: 0, hands: {}, message: '',
      targetRank: targetRank(), roundNumber: 0, tableCount: 0, lastClaim: null, lastReveal: null,
      eliminated: [], shots: {}, bulletCount, bulletChambers: {},
    };
    for (const player of players) {
      state.shots[player.id] = 0;
      state.bulletChambers[player.id] = shuffle([1, 2, 3, 4, 5, 6]).slice(0, bulletCount);
    }
    dealRound(state, players);
    state.message = `${players[0]!.name} 先出牌，本轮目标牌：${state.targetRank}`;
    return state;
  },
  action(base, players, playerId, action: GameAction) {
    const state = base as LiarsBarState;

    if (state.phase === 'challenge') {
      if (action.type === 'challenge') {
        if (state.eliminated.includes(playerId) || state.lastClaim?.playerId === playerId) throw new Error('你不能质疑这一手');
        return resolveChallenge(state, players, playerId);
      }
      if (players[state.turn]?.id !== playerId) throw new Error('只有下一位玩家可以选择相信');
      if (action.type !== 'accept') throw new Error('请选择相信或质疑');
      if ((state.hands[state.lastClaim!.playerId]?.length ?? 0) === 0) throw new Error('这是最后一手，必须质疑');
      state.phase = 'playing';
      state.message = `${players[state.turn]!.name} 选择相信，请继续出牌`;
      return;
    }

    if (players[state.turn]?.id !== playerId) throw new Error('还没轮到你');
    if (state.phase !== 'playing' || action.type !== 'play') throw new Error('请选择 1 至 3 张牌');
    if (action.cardIds.length < 1 || action.cardIds.length > 3) throw new Error('每次只能打出 1 至 3 张牌');
    const hand = state.hands[playerId] ?? [];
    const cards = action.cardIds.map((id) => hand.find((card) => card.id === id)).filter(Boolean) as Card[];
    const remaining = removeCards(hand, action.cardIds);
    if (!remaining || cards.length !== action.cardIds.length) throw new Error('请选择自己手中的牌');
    state.hands[playerId] = remaining;
    state.lastClaim = { playerId, cards, count: cards.length };
    state.tableCount += cards.length;
    state.phase = 'challenge';
    state.turn = nextActive(state.turn, players.length, activeIndexes(state, players));
    state.message = `${players.find((player) => player.id === playerId)?.name} 声称打出 ${cards.length} 张 ${state.targetRank}`;
  },
  view(base, playerId) {
    const state = base as LiarsBarState;
    const { hands, bulletChambers: _bulletChambers, lastClaim, ...publicState } = state;
    return {
      ...publicState,
      lastClaim: lastClaim ? { playerId: lastClaim.playerId, count: lastClaim.count } : null,
      hand: hands[playerId] ?? [],
      handCounts: Object.fromEntries(Object.entries(hands).map(([id, cards]) => [id, cards.length])),
    } as ClientGame;
  },
  botAction(base, _players, playerId) {
    const state = base as LiarsBarState;
    if (state.phase === 'challenge') return { type: 'challenge' };
    const hand = state.hands[playerId] ?? [];
    const honest = hand.find((card) => card.rank === state.targetRank || card.rank === '鬼牌');
    const card = honest ?? hand[0];
    return card ? { type: 'play', cardIds: [card.id] } : null;
  },
};
