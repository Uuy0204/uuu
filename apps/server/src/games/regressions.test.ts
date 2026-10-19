import { describe, expect, it } from 'vitest';
import { poker } from './poker.js';
import { deck, nextActive } from './cards.js';
import { doudizhu4 } from './doudizhu4.js';
import { classify, findBotPlay } from './doudizhu-common.js';
import { calculateScores, pointUnit } from './scoring.js';
const players = (count: number) => Array.from({ length: count }, (_, index) => ({ id: String(index), name: `玩家${index}`, avatar: index, connected: true }));

describe('低筹码与积分边界', () => {
  it('所有座位跳过时能立即返回', () => expect(nextActive(0, 2, new Set([0, 1]))).toBe(-1));
  it('两名玩家只剩盲注时直接摊牌且不丢筹码', () => {
    const ps = players(2);
    const state = poker.create(ps, { startingStacks: JSON.stringify({ 0: 10, 1: 20 }) });
    expect(state.phase).toBe('finished');
    const view = poker.view(state, '0');
    expect(view.community).toHaveLength(5);
    expect(view.folded).toEqual([]);
    expect(Object.values(state.scores!).reduce((sum, value) => sum + value, 0)).toBe(0);
  });
  it('支付盲注的全押者保留摊牌资格', () => {
    const ps = players(3);
    const state = poker.create(ps, { startingStacks: JSON.stringify({ 0: 1000, 1: 10, 2: 1000 }) });
    expect(poker.view(state, '1').folded).not.toContain('1');
    poker.action(state, ps, '0', { type: 'fold' });
    expect(state.phase).toBe('finished');
    expect(Object.keys(poker.view(state, '1').showdownHands as object)).toContain('1');
    expect(Object.values(state.scores!).reduce((sum, value) => sum + value, 0)).toBe(0);
  });
  it('不足两人有筹码时拒绝开局而非卡住', () => {
    expect(() => poker.create(players(2), { startingStacks: '{"0":0,"1":20}' })).toThrow('至少两位');
  });
  it('两小王加一大王能提示有效王炸', () => {
    const cards = deck(2).filter((card) => card.suit === 'J' && (card.rank === '小王' || card.id.startsWith('0-')));
    expect(classify(findBotPlay(cards, { kind: 'bomb', value: 14, length: 4 }))?.kind).toBe('rocket');
  });
  it('四王天王炸弹使倍率翻倍', () => {
    const ps = players(4);
    const state = doudizhu4.create(ps);
    state.phase = 'playing'; state.turn = 0;
    state.hands['0'] = [...deck(2).filter((card) => card.suit === 'J'), deck()[0]!];
    doudizhu4.action(state, ps, '0', { type: 'play', cardIds: state.hands['0'].filter((card) => card.suit === 'J').map((card) => card.id) });
    expect(doudizhu4.view(state, '0').multiplier).toBe(2);
  });
  it('四人混战每位输家等额，单份积分封顶10', () => {
    expect(calculateScores('doudizhu4', ['a','b','c','d'], ['a'], 8)).toEqual({ a: 2.4, b: -0.8, c: -0.8, d: -0.8 });
    expect(pointUnit(16)).toBe(1.6);
    expect(calculateScores('doudizhu4', ['a','b','c','d'], ['a'], 256)).toEqual({ a: 30, b: -10, c: -10, d: -10 });
  });
  it('排名分在全部倍率下保持零和且每人不超过10', () => {
    for (const count of [3, 4]) for (const multiplier of [1, 2, 8, 16, 64, 128, 256]) {
      const ids = players(count).map((p) => p.id);
      const scores = Object.values(calculateScores('paodekuai', ids, [ids[0]!], multiplier, { rankings: ids }));
      expect(Math.abs(scores.reduce((sum, value) => sum + value, 0))).toBeLessThan(0.0001);
      expect(scores.every((score) => Math.abs(score) <= 10)).toBe(true);
    }
  });
});
