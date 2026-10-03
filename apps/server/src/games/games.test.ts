import { describe, expect, it } from 'vitest';
import type { Card, Player } from '../types.js';
import { games } from './index.js';
import { beats, classify, findBotPlay } from './doudizhu-common.js';

const players = (count: number): Player[] => Array.from({ length: count }, (_, i) => ({
  id: `p${i}`, name: `玩家${i + 1}`, avatar: i, connected: true,
}));
const cards = (values: number[]): Card[] => values.map((value, i) => ({ id: `${value}-${i}`, value, rank: String(value), suit: 'S' }));

describe('斗地主牌型', () => {
  it('识别基础牌型和连续牌型', () => {
    expect(classify(cards([8]))?.kind).toBe('single');
    expect(classify(cards([8, 8]))?.kind).toBe('pair');
    expect(classify(cards([7, 7, 7, 9]))?.kind).toBe('triple-one');
    expect(classify(cards([3, 4, 5, 6, 7]))?.kind).toBe('straight');
    expect(classify(cards([3, 3, 4, 4, 5, 5]))?.kind).toBe('pairs');
    expect(classify(cards([7, 7, 7, 8, 8, 8]))?.kind).toBe('plane');
  });

  it('禁止 2 进入顺子，炸弹可以压普通牌', () => {
    expect(classify(cards([11, 12, 13, 14, 15]))).toBeNull();
    expect(beats(classify(cards([9, 9, 9, 9]))!, classify(cards([14]))!)).toBe(true);
  });

  it('双副牌中的两张同名王不是王炸', () => {
    const smallJokers: Card[] = [
      { id: '0-J-SJ', rank: '小王', suit: 'J', value: 16 },
      { id: '1-J-SJ', rank: '小王', suit: 'J', value: 16 },
    ];
    expect(classify(smallJokers)?.kind).toBe('pair');
    expect(beats(classify(smallJokers)!, classify(cards([8, 8, 8, 8]))!)).toBe(false);
    expect(classify([smallJokers[0]!, { id: '0-J-BJ', rank: '大王', suit: 'J', value: 17 }])?.kind).toBe('rocket');
  });

  it('识别飞机带翅膀、多张炸弹和天王炸弹', () => {
    expect(classify(cards([3, 3, 3, 4, 4, 4, 8, 9]))?.kind).toBe('plane-single');
    expect(classify(cards([6, 6, 6, 6, 6]))?.kind).toBe('bomb');
    expect(beats(classify(cards([6, 6, 6, 6, 6]))!, classify(cards([14, 14, 14, 14]))!)).toBe(true);
    const kings: Card[] = [
      { id: 'sj0', rank: '小王', suit: 'J', value: 16 }, { id: 'sj1', rank: '小王', suit: 'J', value: 16 },
      { id: 'bj0', rank: '大王', suit: 'J', value: 17 }, { id: 'bj1', rank: '大王', suit: 'J', value: 17 },
    ];
    expect(classify(kings)?.kind).toBe('heavenly');
  });
});

describe('游戏初始化', () => {
  it('三人斗地主正确发 17 张和 3 张底牌', () => {
    const state = games.doudizhu3.create(players(3)) as typeof games.doudizhu3.create extends (...args: never[]) => infer R ? R & { bottom: Card[] } : never;
    expect(Object.values(state.hands).map((hand) => hand.length)).toEqual([17, 17, 17]);
    expect(state.bottom).toHaveLength(3);
  });

  it('四人斗地主竞叫后夺底者 33 张，其他玩家各 25 张', () => {
    const participants = players(4);
    const state = games.doudizhu4.create(participants) as ReturnType<typeof games.doudizhu4.create> & { landlordId: string; bottom: Card[] };
    expect(state.bottom).toHaveLength(8);
    games.doudizhu4.action(state, participants, 'p0', { type: 'bid', value: 2 });
    games.doudizhu4.action(state, participants, 'p1', { type: 'bid', value: 0 });
    games.doudizhu4.action(state, participants, 'p2', { type: 'bid', value: 0 });
    games.doudizhu4.action(state, participants, 'p3', { type: 'bid', value: 0 });
    expect(state.landlordId).toBe('p0');
    expect(state.hands[state.landlordId]).toHaveLength(33);
    expect(Object.entries(state.hands).filter(([id]) => id !== state.landlordId).every(([, hand]) => hand.length === 25)).toBe(true);
  });

  it('七种玩法都能创建，并符合人数边界', () => {
    for (const gameModule of Object.values(games)) {
      const state = gameModule.create(players(gameModule.minPlayers));
      expect(state.phase).toBeTruthy();
      expect(Object.keys(state.hands)).toHaveLength(gameModule.minPlayers);
    }
  });

  it('七种玩法在全部支持人数下均可完整进行到结算', () => {
    for (const [id, gameModule] of Object.entries(games)) {
      for (let count = gameModule.minPlayers; count <= gameModule.maxPlayers; count += 1) {
        for (let run = 0; run < 5; run += 1) {
          const participants = players(count).map((player) => ({ ...player, bot: true }));
          const state = gameModule.create(participants);
          let steps = 0;
          while (state.phase !== 'finished' && steps < 5000) {
            const current = participants[state.turn]!;
            const action = gameModule.botAction(state, participants, current.id);
            expect(action, `${id}/${count}人 第 ${steps} 步没有可执行操作`).not.toBeNull();
            gameModule.action(state, participants, current.id, action!);
            steps += 1;
          }
          expect(state.phase, `${id}/${count}人 第${run + 1}次未结束`).toBe('finished');
          expect(state.winnerIds?.length).toBeGreaterThan(0);
          expect(state.scores).toBeTruthy();
          if (id === 'poker') expect(Object.values(state.scores!).reduce((sum, score) => sum + score, 0)).toBe(0);
        }
      }
    }
  });

  it('农民获胜时两位农民都记为胜方且积分零和', () => {
    const participants = players(3);
    const state = games.doudizhu3.create(participants) as ReturnType<typeof games.doudizhu3.create> & {
      landlordId: string; plays: Record<string, number>; current: null; multiplier: number;
    };
    state.phase = 'playing'; state.landlordId = 'p0'; state.turn = 1; state.current = null;
    state.hands.p1 = [{ id: 'last', rank: '3', suit: 'S', value: 3 }];
    state.plays = { p0: 2, p1: 0, p2: 0 }; state.multiplier = 1;
    games.doudizhu3.action(state, participants, 'p1', { type: 'play', cardIds: ['last'] });
    expect(state.winnerIds).toEqual(['p1', 'p2']);
    expect(Object.values(state.scores!).reduce((sum, score) => sum + score, 0)).toBe(0);
  });

  it('三人斗地主叫地主前不向客户端公开底牌', () => {
    const participants = players(3);
    const state = games.doudizhu3.create(participants);
    expect((games.doudizhu3.view(state, 'p0') as unknown as { bottom: Card[] }).bottom).toHaveLength(0);
  });

  it('三人斗地主支持竞叫与农民加倍', () => {
    const participants = players(3);
    const state = games.doudizhu3.create(participants) as ReturnType<typeof games.doudizhu3.create> & { multiplier: number; landlordId: string; phase: string };
    games.doudizhu3.action(state, participants, 'p0', { type: 'bid', value: 1 });
    games.doudizhu3.action(state, participants, 'p1', { type: 'bid', value: 3 });
    expect(state.phase).toBe('doubling');
    games.doudizhu3.action(state, participants, 'p2', { type: 'double', value: true });
    games.doudizhu3.action(state, participants, 'p0', { type: 'double', value: false });
    expect(state.phase).toBe('playing');
    expect(state.landlordId).toBe('p1');
    expect(state.multiplier).toBe(6);
  });

  it('跑得快去掉大小王、黑桃 3 首出且有牌必出', () => {
    const participants = players(3);
    const state = games.paodekuai.create(participants) as ReturnType<typeof games.paodekuai.create> & { current: { combo: ReturnType<typeof classify> } | null };
    expect(Object.values(state.hands).every((hand) => hand.length === 16 && hand.every((card) => card.suit !== 'J'))).toBe(true);
    const starter = participants[state.turn]!;
    const spadeThree = state.hands[starter.id]!.find((card) => card.rank === '3' && card.suit === 'S')!;
    games.paodekuai.action(state, participants, starter.id, { type: 'play', cardIds: [spadeThree.id] });
    const follower = participants[state.turn]!;
    expect(() => games.paodekuai.action(state, participants, follower.id, { type: 'pass' })).toThrow('有牌能压');
  });

  it('三带一可压牌时提示、机器人和有牌必出使用同一搜索', () => {
    const participants = players(3);
    const state = games.paodekuai.create(participants) as ReturnType<typeof games.paodekuai.create> & {
      current: { playerId: string; cards: Card[]; combo: NonNullable<ReturnType<typeof classify>> } | null;
      firstMove: boolean;
    };
    const previous = cards([4, 4, 4, 8]);
    state.current = { playerId: 'p0', cards: previous, combo: classify(previous)! };
    state.firstMove = false; state.turn = 1;
    state.hands.p1 = cards([5, 5, 5, 9, 3]);
    const suggestion = games.paodekuai.view(state, 'p1').suggestion as string[];
    expect(suggestion).toHaveLength(4);
    expect(classify(state.hands.p1.filter((c) => suggestion.includes(c.id)))?.kind).toBe('triple-one');
    expect(games.paodekuai.botAction(state, participants, 'p1')).toEqual({ type: 'play', cardIds: suggestion });
    expect(() => games.paodekuai.action(state, participants, 'p1', { type: 'pass' })).toThrow('有牌能压');
  });

  it('飞机带单即使翅膀同点数也能找到，纯单牌不能误拦要不起', () => {
    const previous = classify(cards([3, 3, 3, 4, 4, 4, 8, 9]))!;
    const hand = cards([5, 5, 5, 6, 6, 6, 10, 10, 14]);
    const found = findBotPlay(hand, previous, ['single', 'plane-single']);
    expect(classify(found)).toEqual({ kind: 'plane-single', value: 6, length: 8 });
    expect(findBotPlay(cards([3, 7, 9]), previous, ['plane-single'])).toEqual([]);
  });

  it('争上游发完整 54 张牌，并允许有牌时策略性过牌', () => {
    const participants = players(4);
    const state = games.zhengshangyou.create(participants) as ReturnType<typeof games.zhengshangyou.create> & {
      current: { combo: ReturnType<typeof classify> } | null;
    };
    expect(Object.values(state.hands).map((hand) => hand.length)).toEqual([14, 14, 13, 13]);
    expect(Object.values(state.hands).flat().filter((card) => card.suit === 'J')).toHaveLength(2);
    const starter = participants[state.turn]!;
    const spadeThree = state.hands[starter.id]!.find((card) => card.rank === '3' && card.suit === 'S')!;
    games.zhengshangyou.action(state, participants, starter.id, { type: 'play', cardIds: [spadeThree.id] });
    const follower = participants[state.turn]!;
    expect(() => games.zhengshangyou.action(state, participants, follower.id, { type: 'pass' })).not.toThrow();
  });

  it('四人斗地主的领先者出完后，要等其余三人都过牌才重开一轮', () => {
    const participants = players(4);
    const state = games.doudizhu4.create(participants) as ReturnType<typeof games.doudizhu4.create> & {
      current: { playerId: string; cards: Card[]; combo: ReturnType<typeof classify> }; passes: number; rankings: string[];
    };
    state.phase = 'playing'; state.rankings = ['p0']; state.turn = 1; state.passes = 0;
    const lead = cards([8]);
    state.current = { playerId: 'p0', cards: lead, combo: classify(lead)! };
    games.doudizhu4.action(state, participants, 'p1', { type: 'pass' });
    games.doudizhu4.action(state, participants, 'p2', { type: 'pass' });
    expect(state.current).not.toBeNull();
    games.doudizhu4.action(state, participants, 'p3', { type: 'pass' });
    expect(state.current).toBeNull();
    expect(state.turn).toBe(1);
  });

  it('德州扑克开局有大小盲注，弃牌后筹码结算保持零和', () => {
    const participants = players(2);
    const state = games.poker.create(participants) as ReturnType<typeof games.poker.create> & {
      pot: number; currentBet: number; stacks: Record<string, number>;
    };
    expect(state.pot).toBe(30);
    expect(state.currentBet).toBe(20);
    expect(Object.values(state.stacks).reduce((sum, stack) => sum + stack, 0) + state.pot).toBe(2000);
    games.poker.action(state, participants, 'p0', { type: 'fold' });
    expect(state.phase).toBe('finished');
    expect(Object.values(state.scores!).reduce((sum, score) => sum + score, 0)).toBe(0);
  });

  it('线上德州第二局继承筹码，本局积分按本局开局余额计算', () => {
    const participants = players(2);
    const first = games.poker.create(participants);
    games.poker.action(first, participants, participants[first.turn]!.id, { type: 'fold' });
    const finalStacks = (first as typeof first & { stacks: Record<string, number> }).stacks;
    const second = games.poker.create(participants, { dealer: 1, startingStacks: JSON.stringify(finalStacks) }) as typeof first & {
      stacks: Record<string, number>; pot: number; dealer: number;
    };
    expect(second.dealer).toBe(1);
    expect(Object.values(second.stacks).reduce((sum, n) => sum + n, 0) + second.pot).toBe(2000);
    games.poker.action(second, participants, participants[second.turn]!.id, { type: 'fold' });
    expect(Object.values(second.scores!).reduce((sum, n) => sum + n, 0)).toBe(0);
    expect(second.scores![participants[second.turn]!.id]).not.toBe(undefined);
  });

  it('德州扑克按投入拆分主池和边池', () => {
    const participants = players(3);
    const state = games.poker.create(participants) as ReturnType<typeof games.poker.create> & {
      drawPile: Card[]; pots: number[]; stacks: Record<string, number>; bets: Record<string, number>; contributions: Record<string, number>; pot: number; currentBet: number; acted: string[];
    };
    const card = (id: string, rank: string, suit: Card['suit'], value: number): Card => ({ id, rank, suit, value });
    state.hands = {
      p0: [card('a1', 'A', 'S', 14), card('a2', 'A', 'H', 14)],
      p1: [card('k1', 'K', 'S', 13), card('k2', 'K', 'H', 13)],
      p2: [card('q1', 'Q', 'S', 12), card('q2', 'Q', 'H', 12)],
    };
    state.drawPile = [card('c2', '2', 'C', 2), card('c3', '3', 'D', 3), card('c5', '5', 'S', 5), card('c8', '8', 'H', 8), card('c9', '9', 'C', 9)];
    state.stacks = { p0: 100, p1: 200, p2: 1000 }; state.bets = { p0: 0, p1: 0, p2: 0 }; state.contributions = { p0: 0, p1: 0, p2: 0 };
    state.pot = 0; state.currentBet = 0; state.acted = []; state.turn = 0;
    games.poker.action(state, participants, 'p0', { type: 'allin' });
    games.poker.action(state, participants, 'p1', { type: 'allin' });
    games.poker.action(state, participants, 'p2', { type: 'call' });
    expect(state.phase).toBe('finished');
    expect(state.pots).toEqual([300, 200]);
    expect(state.stacks).toEqual({ p0: 300, p1: 200, p2: 800 });
  });

  it('德州扑克接受具体加注额并拒绝超出剩余筹码的金额', () => {
    const participants = players(3);
    const state = games.poker.create(participants) as ReturnType<typeof games.poker.create> & {
      currentBet: number; bets: Record<string, number>; stacks: Record<string, number>;
    };
    const actor = participants[state.turn]!.id;
    const call = state.currentBet - state.bets[actor]!;
    const available = state.stacks[actor]! - call;
    expect(() => games.poker.action(state, participants, actor, { type: 'raise', amount: available + 1 })).toThrow('筹码不足');
    expect(() => games.poker.action(state, participants, actor, { type: 'raise', amount: 10.5 })).toThrow('整数加注额');
    const previousBet = state.currentBet;
    games.poker.action(state, participants, actor, { type: 'raise', amount: 37 });
    expect(state.currentBet).toBe(previousBet + 37);
  });

  it('骗子酒馆隐藏暗牌，并在质疑谎言后触发输家左轮', () => {
    const participants = players(2);
    const state = games.liarsbar.create(participants) as ReturnType<typeof games.liarsbar.create> & {
      hands: Record<string, Card[]>;
      targetRank: 'A' | 'K' | 'Q';
      bulletChambers: Record<string, number[]>;
      eliminated: string[];
    };
    state.targetRank = 'A';
    state.bulletChambers.p0 = [1];
    state.hands.p0 = [{ id: 'lie', rank: 'Q', suit: 'S', value: 12 }];
    expect(() => games.liarsbar.action(state, participants, 'p1', { type: 'play', cardIds: ['lie'] })).toThrow('还没轮到你');
    games.liarsbar.action(state, participants, 'p0', { type: 'play', cardIds: ['lie'] });
    const opponentView = games.liarsbar.view(state, 'p1') as unknown as { lastClaim: Record<string, unknown> };
    expect(opponentView.lastClaim).toEqual({ playerId: 'p0', count: 1 });
    expect(opponentView.lastClaim).not.toHaveProperty('cards');
    games.liarsbar.action(state, participants, 'p1', { type: 'challenge' });
    expect(state.phase).toBe('finished');
    expect(state.winnerIds).toEqual(['p1']);
    expect(state.eliminated).toEqual(['p0']);
    expect(Object.values(state.scores!).reduce((sum: number, score: number) => sum + score, 0)).toBe(0);
  });

  it('骗子酒馆按开局选择为每人独立装入指定数量的子弹，位置不发送给客户端', () => {
    const participants = players(3);
    const state = games.liarsbar.create(participants, { bulletCount: 3 }) as ReturnType<typeof games.liarsbar.create> & {
      bulletCount: number;
      bulletChambers: Record<string, number[]>;
    };
    expect(state.bulletCount).toBe(3);
    for (const player of participants) {
      expect(state.bulletChambers[player.id]).toHaveLength(3);
      expect(new Set(state.bulletChambers[player.id]).size).toBe(3);
    }
    expect(games.liarsbar.view(state, 'p0')).not.toHaveProperty('bulletChambers');
  });

  it('骗子酒馆最后一手必须质疑，不能相信后进入空手死局', () => {
    const participants = players(2);
    const state = games.liarsbar.create(participants);
    state.hands.p0 = [{ id: 'last', rank: 'A', suit: 'S', value: 14 }];
    games.liarsbar.action(state, participants, 'p0', { type: 'play', cardIds: ['last'] });
    expect(() => games.liarsbar.action(state, participants, 'p1', { type: 'accept' })).toThrow('必须质疑');
  });

  it('骗子酒馆允许非下一位的其他存活玩家抢先质疑', () => {
    const participants = players(3);
    const state = games.liarsbar.create(participants);
    state.hands.p0 = [{ id: 'lie-any', rank: 'Q', suit: 'S', value: 12 }];
    (state as typeof state & { targetRank: string }).targetRank = 'A';
    games.liarsbar.action(state, participants, 'p0', { type: 'play', cardIds: ['lie-any'] });
    expect(state.turn).toBe(1);
    expect(() => games.liarsbar.action(state, participants, 'p2', { type: 'challenge' })).not.toThrow();
  });

  it('骗子酒馆下一轮首次出牌后收起旧翻牌结果，桌面显示新的暗牌', () => {
    const participants = players(2);
    const state = games.liarsbar.create(participants) as ReturnType<typeof games.liarsbar.create> & {
      targetRank: string; lastReveal: { liar: boolean } | null; tableCount: number;
      bulletChambers: Record<string, number[]>;
    };
    state.targetRank = 'A';
    state.bulletChambers.p1 = [6];
    state.hands.p0 = [{ id: 'truth', rank: 'A', suit: 'S', value: 14 }];
    games.liarsbar.action(state, participants, 'p0', { type: 'play', cardIds: ['truth'] });
    games.liarsbar.action(state, participants, 'p1', { type: 'challenge' });
    expect(state.lastReveal?.liar).toBe(false);
    expect(state.turn).toBe(1);
    const nextCard = state.hands.p1![0]!;
    games.liarsbar.action(state, participants, 'p1', { type: 'play', cardIds: [nextCard.id] });
    expect(state.lastReveal).toBeNull();
    expect(state.tableCount).toBe(1);
    expect(games.liarsbar.view(state, 'p0').lastClaim).toEqual({ playerId: 'p1', count: 1 });
  });

  it('骗子酒馆拒绝未入座身份抢先质疑', () => {
    const participants = players(3);
    const state = games.liarsbar.create(participants);
    games.liarsbar.action(state, participants, 'p0', { type: 'play', cardIds: [state.hands.p0![0]!.id] });
    expect(() => games.liarsbar.action(state, participants, 'unknown', { type: 'challenge' })).toThrow('不在当前牌局');
  });
});
