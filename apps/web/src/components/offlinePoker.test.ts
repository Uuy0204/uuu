import { describe, expect, it } from 'vitest';
import { createOfflinePoker, nextPokerHand, pokerAction, pokerPot, pokerPots, settlePoker, type OfflinePokerState } from './offlinePoker';

const players = [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }];

describe('线下德州虚拟筹码', () => {
  it('自动扣盲注，并在一轮下注完成后进入下一街', () => {
    let game = createOfflinePoker(players, 0);
    expect(game.seats.map((seat) => seat.stack)).toEqual([990, 980]);
    expect(pokerPot(game)).toBe(30);
    expect(game.current).toBe(0);
    game = pokerAction(game, 'call');
    game = pokerAction(game, 'check');
    expect(game.street).toBe('flop');
    expect(game.seats.map((seat) => seat.bet)).toEqual([0, 0]);
    expect(pokerPot(game)).toBe(40);
    expect(game.seats.reduce((sum, seat) => sum + seat.stack, 0) + pokerPot(game)).toBe(2000);
  });

  it('全押时分出主池与边池，各自只给有资格的赢家', () => {
    const state: OfflinePokerState = {
      seats: [
        { id: 'a', name: '甲', stack: 0, contributed: 100, bet: 0, folded: false, acted: true },
        { id: 'b', name: '乙', stack: 0, contributed: 300, bet: 0, folded: false, acted: true },
        { id: 'c', name: '丙', stack: 0, contributed: 300, bet: 0, folded: false, acted: true },
      ], dealer: 0, current: -1, street: 'showdown', currentBet: 0, winners: [],
    };
    expect(pokerPots(state)).toEqual([{ amount: 300, eligible: ['a', 'b', 'c'] }, { amount: 400, eligible: ['b', 'c'] }]);
    const settled = settlePoker(state, [['a'], ['b']]);
    expect(settled.seats.map((seat) => seat.stack)).toEqual([300, 400, 0]);
    expect(settled.street).toBe('settled');
  });

  it('平分含零头、继续下一局并轮换庄家时筹码总量不变', () => {
    let game = createOfflinePoker([{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }, { id: 'c', name: '丙' }], 0);
    expect(game.seats.map((seat) => seat.stack)).toEqual([1000, 990, 980]);
    game = { ...game, street: 'showdown', current: -1, seats: game.seats.map((seat) => ({ ...seat, stack: 989, contributed: 11, bet: 0 })) };
    game = settlePoker(game, [['a', 'b']]);
    expect(game.seats.reduce((sum, seat) => sum + seat.stack, 0)).toBe(3000);
    expect(game.seats.map((seat) => seat.stack)).toEqual([1006, 1005, 989]);
    game = nextPokerHand(game);
    expect(game.dealer).toBe(1);
    expect(game.seats.reduce((sum, seat) => sum + seat.stack, 0) + pokerPot(game)).toBe(3000);
  });

  it('一人全押后其余玩家仍须补齐当前下注，不能提前进入下一街', () => {
    let game = createOfflinePoker([{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }, { id: 'c', name: '丙' }], 0);
    game = pokerAction(game, 'allin');
    expect(game.street).toBe('preflop');
    expect(game.current).toBe(1);
    expect(game.seats.reduce((sum, seat) => sum + seat.stack, 0) + pokerPot(game)).toBe(3000);
  });
});
