import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardRoom } from './CardRoom';

const { socketMock } = vi.hoisted(() => ({
  socketMock: {
    connected: true,
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    timeout: vi.fn(),
    emitWithAck: vi.fn(),
  },
}));

vi.mock('@/lib/socket', () => ({ socket: socketMock }));

function buttonWith(container: HTMLElement, text: string) {
  return [...container.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.includes(text));
}

async function createOnlineRoom(container: HTMLElement) {
  await act(async () => buttonWith(container, '开始游戏')!.click());
  await act(async () => buttonWith(container, '线上模式')!.click());
  await act(async () => buttonWith(container, '创建线上房间')!.click());
}

function mockPlayingRoom(gameId: 'doudizhu3' | 'liarsbar' | 'poker', game: Record<string, unknown>) {
  localStorage.setItem('xy-player-id', 'player-1');
  localStorage.setItem('xy-name', '测试牌友');
  socketMock.emitWithAck.mockImplementation(async (event) => {
    if (event !== 'room:create') return { ok: true };
    return {
      ok: true,
      room: {
        code: '123456', hostId: 'player-1', gameId,
        players: [
          { id: 'player-1', name: '测试牌友', avatar: 0, connected: true, seat: 0 },
          { id: 'player-2', name: '牌友二', avatar: 1, connected: true, seat: 1 },
          { id: 'player-3', name: '牌友三', avatar: 2, connected: true, seat: 2 },
        ],
        status: 'playing', round: 1, targetPlayers: 3, options: {}, createdAt: 1, messages: [],
        game: {
          gameId, phase: 'playing', turn: 0, hand: [],
          handCounts: { 'player-1': 5, 'player-2': 5, 'player-3': 5 },
          message: '轮到测试牌友', ...game,
        },
      },
    };
  });
}

describe('创建房间', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    socketMock.timeout.mockReturnValue(socketMock);
    socketMock.emitWithAck.mockImplementation(async (event, payload) => event === 'room:create' ? ({
      ok: true, room: {
        code: '123456',
        hostId: payload.playerId,
        gameId: payload.gameId,
        players: [{ id: payload.playerId, name: payload.name, avatar: 0, connected: true, seat: payload.hostSeat }],
        status: 'lobby',
        game: null,
        round: 0,
        targetPlayers: payload.targetPlayers,
        options: {},
        createdAt: 1,
        messages: [],
      },
    }) : ({ ok: true }));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('空昵称也会生成游客昵称并进入等待大厅', async () => {
    await act(async () => root.render(<CardRoom />));
    await createOnlineRoom(container);
    expect(socketMock.emitWithAck).toHaveBeenCalledWith('room:create', expect.objectContaining({ gameId: 'doudizhu3', targetPlayers: 3, hostSeat: 0 }));
    expect(container.textContent).toContain('ROOM 123456');
    expect(container.textContent).toContain('等待 2 人');
  });

  it('退出房间会通知服务器并回到首页', async () => {
    await act(async () => root.render(<CardRoom />));
    await createOnlineRoom(container);
    const back = container.querySelector<HTMLButtonElement>('button[aria-label="返回首页"]')!;
    await act(async () => back.click());
    expect(socketMock.emitWithAck).toHaveBeenLastCalledWith('room:leave', {});
    expect(container.textContent).toContain('今晚开一桌');
  });

  it('房间中的规则面板可以切换到其他玩法', async () => {
    await act(async () => root.render(<CardRoom />));
    await createOnlineRoom(container);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="查看规则"]')!.click());
    const modal = container.querySelector('.modal')!;
    const poker = [...modal.querySelectorAll('button')].find((item) => item.textContent === '德州扑克')!;
    await act(async () => poker.click());
    expect(modal.textContent).toContain('1000 娱乐筹码');
  });

  it('房间服务超时会恢复按钮并显示错误', async () => {
    socketMock.emitWithAck.mockRejectedValueOnce(new Error('timeout'));
    await act(async () => root.render(<CardRoom />));
    await act(async () => buttonWith(container, '开始游戏')!.click());
    await act(async () => buttonWith(container, '线上模式')!.click());
    const create = buttonWith(container, '创建线上房间')!;
    await act(async () => create.click());
    expect(container.textContent).toContain('无法连接房间服务');
    expect(create.disabled).toBe(false);
  });

  it('骗子酒馆线下模式可选择人数和座位，并创建独立弹巢', async () => {
    await act(async () => root.render(<CardRoom />));
    await act(async () => buttonWith(container, '骗子酒馆')!.click());
    await act(async () => buttonWith(container, '开始游戏')!.click());
    await act(async () => buttonWith(container, '实体牌记分')!.click());
    await act(async () => buttonWith(container, '1 局')!.click());
    const counts = container.querySelectorAll<HTMLButtonElement>('.segment-row button');
    await act(async () => counts[1]!.click());
    const seats = container.querySelectorAll<HTMLButtonElement>('.seat-picker button');
    await act(async () => seats[2]!.click());
    await act(async () => buttonWith(container, '进入实体牌记分器')!.click());
    expect(container.textContent).toContain('骗子酒馆');
    expect(container.textContent).toContain('目标牌');
    expect(container.querySelectorAll('.offline-player')).toHaveLength(3);
    expect(container.querySelector('.revolver-stage svg')).not.toBeNull();
    const shooter = container.querySelector<HTMLSelectElement>('select[aria-label="选择开枪者"]')!;
    expect(shooter.options).toHaveLength(3);
    await act(async () => { shooter.value = 'offline-1'; shooter.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(JSON.parse(localStorage.getItem('xy-offline-session')!).current).toBe(1);
    expect(localStorage.getItem('xy-offline-session')).toContain('"bulletChambers"');
    expect(localStorage.getItem('xy-offline-session')).toContain('"matchRounds":1');
  });

  it('骗子酒馆线下和线上都可以指定每人装填的子弹数', async () => {
    await act(async () => root.render(<CardRoom />));
    await act(async () => buttonWith(container, '骗子酒馆')!.click());
    await act(async () => buttonWith(container, '开始游戏')!.click());
    await act(async () => buttonWith(container, '线上模式')!.click());
    await act(async () => buttonWith(container, '5 局')!.click());
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="每人装填 3 发子弹"]')!.click());
    await act(async () => buttonWith(container, '创建线上房间')!.click());
    expect(socketMock.emitWithAck).toHaveBeenCalledWith('room:create', expect.objectContaining({ gameId: 'liarsbar', bulletCount: 3, matchRounds: 5 }));
  });

  it('小猫钓鱼只显示线下开局入口', async () => {
    await act(async () => root.render(<CardRoom />));
    await act(async () => buttonWith(container, '小猫钓鱼')!.click());
    expect(container.querySelector('.feature-meta')?.textContent).toContain('仅线下');
    await act(async () => buttonWith(container, '开始游戏')!.click());
    expect(buttonWith(container, '线上模式')).toBeUndefined();
    await act(async () => buttonWith(container, '线下玩法')!.click());
    expect(buttonWith(container, '进入实体牌记分器')).toBeDefined();
  });

  it('线下达到设定局数后显示总成绩', async () => {
    await act(async () => root.render(<CardRoom />));
    await act(async () => buttonWith(container, '开始游戏')!.click());
    await act(async () => buttonWith(container, '实体牌记分')!.click());
    await act(async () => buttonWith(container, '1 局')!.click());
    await act(async () => buttonWith(container, '进入实体牌记分器')!.click());
    await act(async () => buttonWith(container, '完成本轮并查看总成绩')!.click());
    expect(container.textContent).toContain('本轮总成绩');
    expect(buttonWith(container, '记录并下一局')).toBeUndefined();
  });

  it('三人斗地主叫分只能提高并发送数字叫分', async () => {
    mockPlayingRoom('doudizhu3', { phase: 'bidding', highestBid: 1, bids: {} });
    await act(async () => root.render(<CardRoom />));
    await createOnlineRoom(container);
    expect(buttonWith(container, '1 分')!.disabled).toBe(true);
    expect(buttonWith(container, '2 分')!.disabled).toBe(false);
    await act(async () => buttonWith(container, '2 分')!.click());
    expect(socketMock.emitWithAck).toHaveBeenLastCalledWith('game:action', { type: 'bid', value: 2 });
  });

  it('骗子酒馆最后一手后隐藏相信按钮并强制质疑', async () => {
    mockPlayingRoom('liarsbar', {
      phase: 'challenge', targetRank: 'A', lastClaim: { playerId: 'player-2', count: 1 },
      handCounts: { 'player-1': 5, 'player-2': 0, 'player-3': 5 }, shots: {}, roundNumber: 1,
    });
    await act(async () => root.render(<CardRoom />));
    await act(async () => buttonWith(container, '骗子酒馆')!.click());
    await createOnlineRoom(container);
    expect(container.textContent).toContain('对方已打出最后一手，必须质疑');
    expect(container.querySelector('.online-revolver-idle .revolver-stage svg')).not.toBeNull();
    expect(buttonWith(container, '相信并继续')).toBeUndefined();
    await act(async () => buttonWith(container, '质疑上一手')!.click());
    expect(socketMock.emitWithAck).toHaveBeenLastCalledWith('game:action', { type: 'challenge' });
  });

  it('骗子酒馆相信或质疑后的回合变化不会滚动整页', async () => {
    mockPlayingRoom('liarsbar', {
      phase: 'challenge', turn: 0, targetRank: 'A',
      lastClaim: { playerId: 'player-2', count: 1 }, roundNumber: 1,
    });
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    try {
      await act(async () => root.render(<CardRoom />));
      await act(async () => buttonWith(container, '骗子酒馆')!.click());
      await createOnlineRoom(container);
      scrollIntoView.mockClear();
      const update = socketMock.on.mock.calls.find(([event]) => event === 'room:update')?.[1] as (room: Record<string, unknown>) => void;
      const response = await socketMock.emitWithAck('room:create');
      const room = response.room;

      await act(async () => buttonWith(container, '相信并继续')!.click());
      await act(async () => update({ ...room, game: { ...room.game, phase: 'playing' } }));
      await act(async () => update({ ...room, game: { ...room.game, phase: 'challenge', turn: 1 } }));
      await act(async () => buttonWith(container, '质疑上一手')!.click());
      await act(async () => update({ ...room, game: { ...room.game, phase: 'playing', turn: 2, roundNumber: 2 } }));

      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(container.querySelector('.opponents')).not.toBeNull();
    } finally { scrollIntoView.mockRestore(); }
  });

  it('线上质疑使用与线下相同的左轮，并先转轮再显示结果', async () => {
    vi.useFakeTimers();
    try {
      mockPlayingRoom('liarsbar', {
        phase: 'playing', targetRank: 'A', roundNumber: 2, tableCount: 0,
        shots: { 'player-2': 1 },
        lastReveal: { cards: [], liar: true, loserId: 'player-2', hit: true },
      });
      await act(async () => root.render(<CardRoom />));
      await act(async () => buttonWith(container, '骗子酒馆')!.click());
      await createOnlineRoom(container);
      expect(container.querySelector('.liar-reveal .revolver-stage svg')).not.toBeNull();
      expect(container.querySelector('.liar-reveal .revolver-spinning')).not.toBeNull();
      await act(async () => vi.advanceTimersByTime(880));
      expect(container.querySelector('.liar-reveal .revolver-hit')).not.toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('德州新一街下注清零后仍显示所有玩家的筹码', async () => {
    mockPlayingRoom('poker', {
      phase: 'flop', pot: 60, currentBet: 0, community: [],
      stacks: { 'player-1': 980, 'player-2': 970, 'player-3': 990 },
      bets: { 'player-1': 0, 'player-2': 0, 'player-3': 0 },
    });
    await act(async () => root.render(<CardRoom />));
    await act(async () => buttonWith(container, '德州扑克')!.click());
    await createOnlineRoom(container);
    expect(container.querySelectorAll('.poker-bank-seat')).toHaveLength(3);
    expect(container.querySelector('.poker-bank')?.textContent).toContain('980');
    expect(container.querySelector('.poker-bank')?.textContent).toContain('本街下注 0');
  });

  it('德州加注允许输入具体筹码额并拦截超额输入', async () => {
    mockPlayingRoom('poker', {
      phase: 'flop', pot: 60, currentBet: 20, community: [],
      stacks: { 'player-1': 100, 'player-2': 970, 'player-3': 990 },
      bets: { 'player-1': 0, 'player-2': 20, 'player-3': 20 },
    });
    await act(async () => root.render(<CardRoom />));
    await act(async () => buttonWith(container, '德州扑克')!.click());
    await createOnlineRoom(container);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="加注金额"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(input, '37'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => buttonWith(container, '加注 37')!.click());
    expect(socketMock.emitWithAck).toHaveBeenLastCalledWith('game:action', { type: 'raise', amount: 37 });
    await act(async () => { setter.call(input, '81'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(buttonWith(container, '加注')!.disabled).toBe(true);
  });

  it('牌桌聊天会发送去除首尾空格后的消息', async () => {
    await act(async () => root.render(<CardRoom />));
    await createOnlineRoom(container);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="牌桌聊天"]')!.click());
    const input = container.querySelector<HTMLInputElement>('input[aria-label="聊天消息"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '  今晚再来一局  ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => buttonWith(container, '发送')!.click());
    expect(socketMock.emitWithAck).toHaveBeenLastCalledWith('chat:send', { text: '今晚再来一局' });
  });

  it('牌桌设置会持久化提示音和震动开关', async () => {
    await act(async () => root.render(<CardRoom />));
    await createOnlineRoom(container);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="牌桌设置"]')!.click());
    const toggles = container.querySelectorAll<HTMLInputElement>('.settings-list input[type="checkbox"]');
    await act(async () => toggles[0]!.click());
    await act(async () => toggles[1]!.click());
    expect(localStorage.getItem('xy-sound')).toBe('off');
    expect(localStorage.getItem('xy-vibration')).toBe('off');
  });
});
