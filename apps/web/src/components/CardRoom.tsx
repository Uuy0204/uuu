'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bot, ChevronLeft, CircleHelp, Clock3, Copy, Crosshair, DoorOpen, Eye, History, MessageCircle, Minus, Plus, RotateCcw, Settings, Sparkles, Users, Volume2, VolumeX, Wifi, Wine, X } from 'lucide-react';
import { socket } from '@/lib/socket';
import { GAME_INFO, type Card, type ClientRoom, type GameId, type HistoryItem } from '@/lib/types';
import { playCue } from '@/lib/sound';
import { RevolverStage } from './RevolverStage';

const AVATARS = ['松', '竹', '梅', '兰', '云', '月', '山', '海'];
const SUITS: Record<Card['suit'], string> = { S: '♠', H: '♥', C: '♣', D: '♦', J: '★' };
const GAME_VISUALS: Record<GameId, { cards: [string, string][]; mark: string; label: string }> = {
  doudizhu3: { cards: [['大王', '★'], ['2', '♠'], ['A', '♥']], mark: '斗', label: '经典局' },
  doudizhu4: { cards: [['A', '♥'], ['A', '♦'], ['K', '♠']], mark: '四', label: '双副牌' },
  fishing: { cards: [['7', '♥'], ['7', '♣'], ['Q', '♦']], mark: '钓', label: '欢乐局' },
  paodekuai: { cards: [['3', '♦'], ['4', '♣'], ['5', '♥']], mark: '跑', label: '竞速局' },
  zhengshangyou: { cards: [['大王', '★'], ['3', '♠'], ['A', '♦']], mark: '争', label: '登高局' },
  poker: { cards: [['A', '♠'], ['K', '♠'], ['Q', '♠']], mark: '♣', label: '筹码局' },
  liarsbar: { cards: [['A', '♠'], ['鬼牌', '★'], ['Q', '♦']], mark: '骗', label: '心理局' },
};
interface RuleSection { title: string; items: string[] }
interface RuleContent { intro: string; sections: RuleSection[] }
const RULES: Record<GameId, RuleContent> = {
  doudizhu3: { intro: '一副 54 张牌，地主独自对抗两名农民，通过竞叫、加倍和完整组合牌型决出胜负。', sections: [
    { title: '用牌与叫地主', items: ['每人 17 张，另留 3 张底牌。三人依次选择不叫、1 分、2 分或 3 分；后叫者只能提高分数，3 分立即结束竞叫，无人叫牌则重新发牌。', '最高叫分者成为地主，公开并获得底牌。两位农民随后依次选择是否加倍，地主完成加牌后首先出牌。'] },
    { title: '合法牌型', items: ['支持单张、对子、三张、三带一、三带二、五张起顺子、三对起连对、飞机、飞机带单、飞机带对、四带二、四带两对、四张炸弹和王炸。', '顺子、连对和飞机主体不得包含 2 或王。飞机按连续三张组数携带相同数量的单牌或对子。'] },
    { title: '跟牌与大小', items: ['领出时可出任意合法牌型；跟牌须同牌型、同长度且点数更大，也可选择不出。其余两人均不出后，最后出牌者重新领出。', '普通点数从大到小为大王、小王、2、A、K 至 3。王炸最大；炸弹可压普通牌，炸弹之间比较点数。'] },
    { title: '胜负与计分', items: ['地主先出完则地主胜；任一农民先出完则两名农民共同获胜。炸弹或王炸使倍率翻倍，春天或反春再翻倍，倍率最高 256。', '基础分为倍率 × 0.1，单方最多按 5 分计；地主输赢两倍，两个农民各按一倍结算。'] },
  ] },
  doudizhu4: { intro: '两副牌共 108 张，支持四人混战和对角 2 对 2 组队，两种模式均通过叫分争夺底牌。', sections: [
    { title: '发牌与夺底', items: ['每人发 25 张，余下 8 张为底牌。四人依次选择不叫、1 分、2 分或 3 分；最高叫分者获得底牌并先出，无人叫分则重新发牌。', '创建房间时可选择混战排名或对角组队。组队模式中座位 1、3 为蓝队，座位 2、4 为橙队。'] },
    { title: '牌型与跟牌', items: ['基础牌型包含单张、对子、三张、带牌、顺子、连对和飞机；四至八张同点数牌均为炸弹，四张王组成最大的天王炸弹。', '普通牌型必须同型同长度比较。炸弹先比较张数，张数相同再比较点数；天王炸弹最大。'] },
    { title: '胜负与计分', items: ['混战模式按出完先后继续排定四个名次，使用 +3、0、-1、-2 权重结算。组队模式中任一队员先出完，该队立即获胜并共同结算。', '炸弹、王炸或天王炸弹使倍率翻倍，倍率最高 256。'] },
  ] },
  poker: { intro: '每人 2 张私有底牌，结合 5 张公共牌组成最佳五张牌型，通过四轮行动争夺底池。', sections: [
    { title: '开局与行动', items: ['每位玩家以 1000 娱乐筹码开始并获得 2 张仅自己可见的底牌。庄家每局顺时针轮换；小盲 10、大盲 20，二人局中庄家同时支付小盲。', '翻牌前、翻牌、转牌、河牌共四轮行动，可弃牌、过牌、跟注、加注或全押；仍可行动的玩家都完成行动且投入相同后进入下一街。'] },
    { title: '摊牌与牌型', items: ['河牌后仍在局内的玩家摊牌，从 2 张底牌与 5 张公共牌中任选 5 张组成最大牌型；若只剩一人未弃牌，该玩家直接赢得底池。', '牌型从大到小为皇家同花顺、同花顺、四条、葫芦、同花、顺子、三条、两对、一对、高牌；完全相同则平分底池。'] },
    { title: '筹码与底池', items: ['加注最少增加 10；可随时选择全押。不同额度全押会按每位玩家累计投入自动拆分主池和边池，玩家只参与自己有资格争夺的底池。', '若所有其他玩家弃牌，最后一人直接获胜；牌力完全相同则平分对应底池，不能整除的余数给排序靠前的赢家。'] },
  ] },
  paodekuai: { intro: '三至四人的争先排名玩法，去掉大小王，有牌必出，持黑桃 3 的玩家率先行动。', sections: [
    { title: '用牌与首出', items: ['使用去掉大小王的 52 张牌。三人局每人 16 张，随机留出 4 张不用；四人局每人 13 张。', '持有黑桃 3 的玩家先出，首手牌必须包含黑桃 3。'] },
    { title: '牌型与跟牌', items: ['支持单张、对子、三张、三带一、顺子、连对、飞机、飞机带单和四张炸弹。2 不得进入顺子、连对或飞机主体。', '跟牌须同型同长度且更大；如果系统能找到可压制组合，就不能选择“要不起”。其他玩家均无法跟牌后，最后出牌者重新领出。'] },
    { title: '排名与积分', items: ['玩家出完即获得当前名次，其余玩家继续直至全部排定。三人局基础权重为 +0.2、0、-0.2；四人局为 +0.3、+0.1、-0.1、-0.3。', '每次炸弹使本局倍率翻倍，并作用于最终排名积分。'] },
  ] },
  zhengshangyou: { intro: '三至四人使用完整 54 张牌争取先出完，包含大小王，并允许策略性过牌。', sections: [
    { title: '发牌与首出', items: ['整副 54 张牌全部依次发给玩家。三人局每人 18 张；四人局前两位各 14 张，后两位各 13 张。', '持黑桃 3 的玩家先出，首手牌必须包含黑桃 3。'] },
    { title: '牌型与跟牌', items: ['支持单张、对子、三张、三带一、三带二、顺子、连对、飞机、飞机带单、飞机带对、四带二、四带两对、炸弹和王炸。2 和王不进入顺子、连对或飞机主体。', '跟牌须同型同长度且更大，炸弹可压普通牌，王炸可压炸弹。即使有牌可压，也可以选择不出；其他在场玩家都过牌后，由上一手出牌者重新领出。'] },
    { title: '名次与积分', items: ['玩家出完牌即获得名次，其余玩家继续直到名次排定。三人局基础积分依次为 +0.2、0、-0.2；四人局为 +0.3、+0.1、-0.1、-0.3。', '每次炸弹使本局倍率翻倍，最高 256 倍，作用于最终排名积分；王炸不另加倍。'] },
  ] },
  fishing: { intro: '两至四人轮流翻出牌堆顶牌，通过匹配相同点数收走中间的全部牌，适合轻松聚会。', sections: [
    { title: '发牌与回合', items: ['一副 54 张牌平均分给所有玩家，牌面朝下叠成个人牌堆，任何人都不能提前查看。', '玩家顺时针翻出自己牌堆顶部一张，正面朝上放到中央牌列末端。'] },
    { title: '钓鱼与连钓', items: ['若新牌与中央已有同点数牌，取距离新牌最近的一张作为起点，收走从该牌到新牌之间的全部牌，并放到自己的牌堆底部。', '钓到牌后由同一玩家继续翻牌；大小王作为万能牌，打出时直接收走整个中央牌列。没有钓到时才轮到下一位仍有牌的玩家。'] },
    { title: '淘汰与胜负', items: ['牌堆耗尽且本次没有钓到牌的玩家退出后续回合，最后仍持有牌的玩家获胜。', '为避免极端循环，达到 1000 回合时按当前牌堆积分结算：数字牌 1 分、J/Q/K 3 分、A 5 分、小王 10 分、大王 15 分。'] },
  ] },
  liarsbar: { intro: 'A、K、Q 各 6 张加 2 张万能鬼牌，共 20 张。暗牌声明与俄罗斯轮盘合并为一场心理博弈。', sections: [
    { title: '开局', items: ['支持 2 至 4 人，每位存活玩家每轮获得 5 张牌；系统随机指定 A、K 或 Q 为目标牌。开局可选每人装填 1–6 发子弹；每位玩家独立随机装填六格弹巢，弹位对所有人保密。'] },
    { title: '声明与质疑', items: ['轮到你时选择 1 至 3 张牌面朝下打出，并统一声称它们都是本轮目标牌；鬼牌永远视为真牌。', '除出牌者外，任意存活玩家都可抢先质疑；若无人质疑，下一位玩家可选择相信并继续出牌。质疑后翻开上一手：只要存在非目标牌且非鬼牌，出牌者撒谎；否则质疑者判断错误。'] },
    { title: '轮盘与胜负', items: ['输掉质疑者对自己的六格弹巢扣动一次扳机。每人的子弹位置在整局中固定且保密；界面只公开已经扣动的次数。空膛则输家先开始新一轮；中弹者淘汰，由其下一位存活玩家开始。', '每次质疑结算后重新发牌并随机目标牌。最后仍未淘汰的玩家获胜，获得“骗子之王”；赢家 +0.1 × 对手数，其余每人 -0.1。'] },
  ] },
};

const RULE_EXAMPLES: Record<GameId, { title: string; text: string }> = {
  doudizhu3: { title: '计分示例', text: '叫 2 分、出现 1 次炸弹且形成春天：倍率为 2 × 2 × 2 = 8。基础分 0.8；地主胜得 +1.6，两名农民各 -0.8。' },
  doudizhu4: { title: '先选对战模式', text: '混战要排出四个名次；2 对 2 模式中，座位 1 和 3 同队，座位 2 和 4 同队，任一队员出完即为本队获胜。' },
  poker: { title: '边池示例', text: '甲全押 100、乙和丙各投入 300：主池为 300，三人都可争；边池为 400，只由乙和丙争夺。' },
  paodekuai: { title: '跟牌提示', text: '若手里有可压过桌面牌型的组合，就必须出牌；只有系统找不到可压组合时，才能点“要不起”。' },
  zhengshangyou: { title: '跟牌提示', text: '即使手中有更大的同型牌，也允许“不出”；待其他在场玩家都过牌，上一手出牌者重新领出。' },
  fishing: { title: '王牌示例', text: '翻出大小王会直接收走中央整列牌；普通牌则钓走最近一张同点数牌到新牌之间的所有牌。' },
  liarsbar: { title: '质疑示例', text: '目标牌为 A 时，打出 A 与鬼牌均算真牌；只要暗牌里有一张 K 或 Q，质疑成功，出牌者承担轮盘结果。' },
};
const SCORE_NOTES: Record<GameId, string> = {
  doudizhu3: '积分按叫分、加倍、炸弹与春天形成的倍率计算；基础分最多 5 分，地主按两倍结算。',
  doudizhu4: '混战按四个名次与倍率结算；组队时胜队每人加分，负队每人扣同等分数。',
  poker: '本局积分等于最终娱乐筹码减去开局的 1000 筹码；边池只由有资格的玩家争夺。',
  paodekuai: '按照出完牌的名次结算，炸弹倍率作用于名次积分。',
  zhengshangyou: '按照出完牌的名次结算，炸弹倍率作用于名次积分。',
  fishing: '结算分为剩余牌堆的牌面分值；达到回合上限时，也按此分值比较。',
  liarsbar: '最后存活者每击败一名对手获得 0.1 分，其余玩家各扣 0.1 分。',
};

type PlayMode = 'online' | 'offline';
interface GameSetupValue { mode: PlayMode; playerCount: number; hostSeat: number; variant?: 'solo' | 'team'; bulletCount: number; matchRounds: number }
interface OfflinePlayer { id: string; name: string; avatar: number; seat: number; score: number; eliminated?: boolean }
interface OfflineSession {
  gameId: GameId;
  players: OfflinePlayer[];
  current: number;
  dealer: number;
  round: number;
  matchRounds: number;
  completed?: boolean;
  totalScores: Record<string, number>;
  targetRank: 'A' | 'K' | 'Q';
  shots: Record<string, number>;
  bulletCount: number;
  bulletChambers: Record<string, number[]>;
  message: string;
}

function getIdentity() {
  if (typeof window === 'undefined') return { playerId: '', name: '', avatar: 0 };
  let playerId = localStorage.getItem('xy-player-id');
  if (!playerId) { playerId = createPlayerId(); localStorage.setItem('xy-player-id', playerId); }
  return { playerId, name: localStorage.getItem('xy-name') ?? '', avatar: Number(localStorage.getItem('xy-avatar') ?? 0) };
}

function createPlayerId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function randomTargetRank(): 'A' | 'K' | 'Q' {
  return (['A', 'K', 'Q'] as const)[Math.floor(Math.random() * 3)]!;
}

function randomBulletChambers(count: number): number[] {
  const chambers = [1, 2, 3, 4, 5, 6];
  for (let index = chambers.length - 1; index > 0; index -= 1) {
    const next = Math.floor(Math.random() * (index + 1));
    [chambers[index], chambers[next]] = [chambers[next]!, chambers[index]!];
  }
  return chambers.slice(0, count);
}

function readHistory(): HistoryItem[] {
  try {
    const value = JSON.parse(localStorage.getItem('xy-history') ?? '[]') as Array<Omit<HistoryItem, 'gameId'> & { gameId: string }>;
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      const gameId = item.gameId === 'roulette' ? 'liarsbar' : item.gameId;
      return gameId in GAME_INFO ? [{ ...item, gameId: gameId as GameId }] : [];
    });
  } catch { return []; }
}

function readOfflineSession(): OfflineSession | null {
  try {
    const value = JSON.parse(localStorage.getItem('xy-offline-session') ?? 'null') as OfflineSession | null;
    if (!value || !GAME_INFO[value.gameId] || !Array.isArray(value.players) || value.players.length < 2) return null;
    value.matchRounds = value.matchRounds ?? 3;
    value.totalScores = value.totalScores ?? {};
    if (value.gameId === 'liarsbar' && (!value.shots || !value.bulletChambers)) return null;
    if (value.gameId === 'liarsbar') {
      value.bulletCount = value.bulletCount ?? 1;
      value.bulletChambers = Object.fromEntries(Object.entries(value.bulletChambers).map(([id, chambers]) => [id, Array.isArray(chambers) ? chambers : [chambers]]));
    }
    return value;
  } catch { return null; }
}

function PlayingCard({ card, selected, onClick, small = false, dealIndex }: { card: Card; selected?: boolean; onClick?: () => void; small?: boolean; dealIndex?: number }) {
  const red = card.suit === 'H' || card.suit === 'D' || card.rank.includes('王');
  return <button type="button" className={`playing-card ${red ? 'red-card' : ''} ${card.suit === 'J' ? 'joker-card' : ''} ${selected ? 'selected' : ''} ${small ? 'small' : ''}`} style={dealIndex === undefined ? undefined : { '--deal-index': Math.min(dealIndex, 18) } as React.CSSProperties} onClick={onClick} disabled={!onClick} aria-label={`${card.rank}${SUITS[card.suit]}`} aria-pressed={onClick ? Boolean(selected) : undefined}>
    <span className="card-rank">{card.rank}</span><span className="card-suit">{SUITS[card.suit]}</span><span className="card-center" aria-hidden="true">{SUITS[card.suit]}</span><span className="card-tail" aria-hidden="true">{card.rank}<br />{SUITS[card.suit]}</span>
  </button>;
}

function ChipStack({ amount, compact = false }: { amount: number; compact?: boolean }) {
  const layers = amount > 0 ? Math.min(5, Math.max(2, Math.ceil(amount / 250))) : 0;
  return <span className={`chip-stack ${compact ? 'compact' : ''}`} aria-label={`${amount} 娱乐筹码`}>
    <span className="chip-discs" aria-hidden="true">{Array.from({ length: layers }, (_, index) => <i key={index} style={{ '--chip-level': index } as React.CSSProperties} />)}</span>
    <b>{amount}</b>
  </span>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
    <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20} /></button></header>{children}
  </section></div>;
}

function TurnTimer({ active, deadline, duration = 30_000 }: { active: boolean; deadline?: number; duration?: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [active]);
  const seconds = Math.max(0, Math.ceil(((deadline ?? now + 30_000) - now) / 1000));
  const progress = Math.min(1, Math.max(0, seconds / (duration / 1000)));
  return <div className={`turn-timer ${seconds <= 10 ? 'urgent' : ''}`} style={{ '--timer-progress': progress } as React.CSSProperties} aria-label={`本回合剩余 ${seconds} 秒`}><span>{seconds}</span></div>;
}

export function CardRoom() {
  const [identity, setIdentity] = useState({ playerId: '', name: '', avatar: 0 });
  const [gameId, setGameId] = useState<GameId>('doudizhu3');
  const [joinCode, setJoinCode] = useState('');
  const [room, setRoom] = useState<ClientRoom | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [panel, setPanel] = useState<'rules' | 'history' | 'chat' | 'settings' | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [recentRoom, setRecentRoom] = useState('');
  const [offline, setOffline] = useState<OfflineSession | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const previousGame = useRef<{ room: string; round: number; phase: string; turn: number; hand: string; play: string; reveal: string; pot: number; community: number } | null>(null);
  const revealCueTimers = useRef<number[]>([]);

  useEffect(() => () => { revealCueTimers.current.forEach(window.clearTimeout); }, []);

  useEffect(() => {
    const current = getIdentity();
    /* Local browser data is intentionally loaded after hydration. */
    /* eslint-disable react-hooks/set-state-in-effect */
    setIdentity(current);
    setHistory(readHistory());
    setConnected(socket.connected);
    setRecentRoom(localStorage.getItem('xy-recent-room') ?? '');
    setOffline(readOfflineSession());
    setSoundEnabled(localStorage.getItem('xy-sound') !== 'off');
    setVibrationEnabled(localStorage.getItem('xy-vibration') !== 'off');
    /* eslint-enable react-hooks/set-state-in-effect */
    const update = (next: ClientRoom) => {
      setRoom(next); setSelected([]); sessionStorage.setItem('xy-room', next.code);
      if (next.status === 'playing') { localStorage.setItem('xy-recent-room', next.code); setRecentRoom(next.code); }
      if (next.status === 'finished') { localStorage.removeItem('xy-recent-room'); setRecentRoom(''); }
      if (next.status === 'finished' && next.game?.scores) {
        const key = `${next.code}-${next.createdAt}-${next.round}`;
        setHistory((items) => {
          if (items.some((item) => item.key === key)) return items;
          const score = next.game!.scores![current.playerId] ?? 0;
          const item: HistoryItem = { key, at: Date.now(), gameId: next.gameId, score, result: score > 0 ? '胜' : score < 0 ? '负' : '平' };
          const updated = [item, ...items].slice(0, 50);
          localStorage.setItem('xy-history', JSON.stringify(updated));
          return updated;
        });
      }
    };
    socket.on('room:update', update);
    const rejoin = () => {
      const code = sessionStorage.getItem('xy-room');
      const name = localStorage.getItem('xy-name') ?? current.name;
      if (code && name) socket.emit('room:join', { ...current, name, avatar: Number(localStorage.getItem('xy-avatar') ?? current.avatar), code }, (result: { ok: boolean; room?: ClientRoom }) => result.ok && result.room && update(result.room));
    };
    const onConnect = () => { setConnected(true); setNotice(''); rejoin(); };
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', () => setNotice('房间服务暂时不可用，请稍后重试'));
    socket.connect();
    if (socket.connected) rejoin();
    return () => { socket.off('room:update', update); socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('connect_error'); };
  }, []);

  const emit = async (event: string, payload: unknown = {}): Promise<{ ok: boolean; room?: ClientRoom; error?: string }> => {
    setBusy(true); setNotice('');
    try {
      if (!socket.connected) socket.connect();
      const result = await socket.timeout(6000).emitWithAck(event, payload) as { ok: boolean; room?: ClientRoom; error?: string };
      if (!result.ok) setNotice(result.error ?? '操作失败');
      return result;
    } catch {
      const result = { ok: false, error: '无法连接房间服务，请刷新后重试' };
      setNotice(result.error);
      return result;
    } finally { setBusy(false); }
  };

  const prepareIdentity = () => {
    const playerId = identity.playerId || createPlayerId();
    const name = identity.name.trim() || `牌友${playerId.slice(0, 4).toUpperCase()}`;
    const next = { ...identity, playerId, name };
    localStorage.setItem('xy-player-id', playerId); localStorage.setItem('xy-name', name); localStorage.setItem('xy-avatar', String(identity.avatar));
    setIdentity(next); return next;
  };
  const startConfiguredGame = async (setup: GameSetupValue) => {
    if (gameId === 'fishing' && setup.mode === 'online') { setNotice('小猫钓鱼现仅支持线下玩法'); return; }
    const profile = prepareIdentity();
    setSetupOpen(false);
    if (setup.mode === 'offline') {
      const players = Array.from({ length: setup.playerCount }, (_, seat) => ({
        id: seat === setup.hostSeat ? profile.playerId : `offline-${seat}`,
        name: seat === setup.hostSeat ? profile.name : `玩家${seat + 1}`,
        avatar: seat === setup.hostSeat ? profile.avatar : seat % AVATARS.length,
        seat, score: 0,
      }));
      const nextOffline = {
        gameId, players, current: setup.hostSeat, dealer: setup.hostSeat, round: 1, matchRounds: setup.matchRounds, totalScores: {},
        targetRank: randomTargetRank(),
        shots: Object.fromEntries(players.map((player) => [player.id, 0])),
        bulletCount: setup.bulletCount,
        bulletChambers: Object.fromEntries(players.map((player) => [player.id, randomBulletChambers(setup.bulletCount)])),
        message: gameId === 'liarsbar' ? '发好暗牌，开始第一轮声明' : '线下牌局已就绪',
      };
      localStorage.setItem('xy-offline-session', JSON.stringify(nextOffline));
      setOffline(nextOffline);
      return;
    }
    const result = await emit('room:create', { ...profile, gameId, targetPlayers: setup.playerCount, hostSeat: setup.hostSeat, variant: setup.variant, bulletCount: setup.bulletCount, matchRounds: setup.matchRounds });
    if (result.room) setRoom(result.room);
  };
  const joinRoom = async () => { if (!/^\d{6}$/.test(joinCode)) return setNotice('请输入 6 位数字房间号'); const profile = prepareIdentity(); const result = await emit('room:join', { ...profile, code: joinCode }); if (result.room) setRoom(result.room); };
  const resumeRoom = async () => { if (!recentRoom) return; const profile = prepareIdentity(); const result = await emit('room:join', { ...profile, code: recentRoom }); if (result.room) setRoom(result.room); else { localStorage.removeItem('xy-recent-room'); setRecentRoom(''); } };
  const leave = async () => {
    const canResume = room?.status === 'playing';
    await emit('room:leave'); sessionStorage.removeItem('xy-room'); setRoom(null); setSelected([]);
    if (!canResume) { localStorage.removeItem('xy-recent-room'); setRecentRoom(''); }
  };
  const copyCode = async () => {
    if (!room) return;
    try { await navigator.clipboard.writeText(room.code); setNotice('房间号已复制'); }
    catch { setNotice(`房间号：${room.code}`); }
  };
  const action = async (value: unknown) => {
    const result = await emit('game:action', value);
    if (result.ok && soundEnabled && typeof value === 'object' && value !== null) {
      const type = (value as { type?: string }).type;
      if (type === 'draw' || (type === 'play' && room?.gameId === 'liarsbar')) playCue('play');
      if (room?.gameId === 'poker' && (type === 'call' || type === 'raise' || type === 'allin')) playCue('chip');
      if (room?.gameId === 'poker' && type === 'fold') playCue('fold');
      if (type === 'challenge') playCue('challenge');
    }
    return result;
  };
  const isHost = room?.hostId === identity.playerId;
  const isTurn = room?.game && room.players[room.game.turn]?.id === identity.playerId;
  const game = room?.game;
  const gameTurn = game?.turn;
  const gamePhase = game?.phase;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [room?.code, room?.status, offline?.gameId]);

  useEffect(() => {
    const strip = document.querySelector<HTMLElement>('.opponents');
    const active = strip?.querySelector<HTMLElement>('.player-chip.turn');
    if (!strip || !active) return;
    // scrollIntoView also scrolls the page on mobile browsers, moving the action buttons away.
    const stripLeft = strip.getBoundingClientRect().left;
    const activeLeft = active.getBoundingClientRect().left;
    strip.scrollLeft += activeLeft - stripLeft - (strip.clientWidth - active.clientWidth) / 2;
  }, [gameTurn, gamePhase]);

  useEffect(() => {
    if (!room?.game) { previousGame.current = null; return; }
    const current = room.game;
    const snapshot = {
      room: room.code, round: room.round, phase: current.phase, turn: current.turn,
      hand: current.hand.map((card) => card.id).join(','),
      play: current.current?.cards.map((card) => card.id).join(',') ?? '',
      reveal: current.lastReveal ? `${current.roundNumber}-${current.lastReveal.loserId}-${current.lastReveal.hit}-${current.lastReveal.cards.map((card) => card.id).join(',')}` : '',
      pot: current.pot ?? 0,
      community: current.community?.length ?? 0,
    };
    const before = previousGame.current;
    previousGame.current = snapshot;
    if (!before || before.room !== snapshot.room) return;
    if (soundEnabled) {
      if (before.round !== snapshot.round || (before.hand !== snapshot.hand && current.hand.length > before.hand.split(',').filter(Boolean).length)) playCue('deal');
      else if (before.reveal !== snapshot.reveal && snapshot.reveal) {
        revealCueTimers.current.forEach(window.clearTimeout);
        playCue('trigger');
        revealCueTimers.current = [
          window.setTimeout(() => playCue('spin'), 95),
          window.setTimeout(() => playCue(current.lastReveal?.hit ? 'shot' : 'dry'), 880),
          ...(current.lastReveal?.hit ? [window.setTimeout(() => playCue('impact'), 975)] : []),
        ];
      }
      else if (room.gameId === 'poker' && before.community < snapshot.community) playCue('deal');
      else if (room.gameId === 'poker' && before.pot < snapshot.pot && room.players[before.turn]?.id !== identity.playerId) playCue('chip');
      else if (before.play !== snapshot.play && snapshot.play) playCue('play');
      else if (before.turn !== snapshot.turn && room.players[current.turn]?.id === identity.playerId) playCue('turn');
      if (before.phase !== 'finished' && current.phase === 'finished') playCue(current.winnerIds?.includes(identity.playerId) ? 'win' : 'lose');
    }
    if (vibrationEnabled && before.turn !== snapshot.turn && room.players[current.turn]?.id === identity.playerId && 'vibrate' in navigator) navigator.vibrate(70);
  }, [room, identity.playerId, soundEnabled, vibrationEnabled]);

  const totalScore = useMemo(() => history.reduce((sum, item) => sum + item.score, 0), [history]);
  const recordOffline = (playedGame: GameId, score: number) => setHistory((items) => {
    const item: HistoryItem = { key: `offline-${Date.now()}`, at: Date.now(), gameId: playedGame, score, result: score > 0 ? '胜' : score < 0 ? '负' : '平' };
    const updated = [item, ...items].slice(0, 50);
    localStorage.setItem('xy-history', JSON.stringify(updated));
    return updated;
  });

  if (offline) return <OfflineTable session={offline} localPlayerId={identity.playerId} soundEnabled={soundEnabled} onSound={(value) => { setSoundEnabled(value); localStorage.setItem('xy-sound', value ? 'on' : 'off'); }} onRecord={recordOffline} onExit={() => { localStorage.removeItem('xy-offline-session'); setOffline(null); }} />;

  if (!room) return <main className="home-shell">
    <header className="brand-bar"><div className="brand-lockup"><div className="brand-mark"><span>小</span></div><div><h1>小赌怡情</h1><p>FAMILY CARD ROOM</p></div></div><div className="brand-rule"><span><span className="connection-dot online" />牌友在线</span><i /><span>七种玩法</span></div><nav><button className="icon-label" onClick={() => setPanel('history')} title="查看我的战绩"><History size={18} />我的战绩</button><button className="icon-label" onClick={() => setPanel('rules')} title="查看完整规则"><CircleHelp size={18} />规则大全</button></nav></header>
    <section className="clubhouse">
      <aside className="entry-panel">
        <div className="profile-heading"><span className="profile-avatar">{AVATARS[identity.avatar] ?? '友'}</span><div><small>牌桌名片</small><strong>{identity.name.trim() || '未命名牌友'}</strong></div></div>
        <label className="field-label" htmlFor="nickname">昵称</label>
        <input id="nickname" className="text-input" value={identity.name} maxLength={12} placeholder="你的称呼" onChange={(e) => setIdentity({ ...identity, name: e.target.value })} />
        <span className="field-label avatar-label">头像</span>
        <div className="avatars" aria-label="选择头像">{AVATARS.map((text, index) => <button key={text} aria-label={`头像 ${text}`} aria-pressed={identity.avatar === index} className={identity.avatar === index ? 'active' : ''} onClick={() => setIdentity({ ...identity, avatar: index })}>{text}</button>)}</div>
        {recentRoom && <button className="resume-button" onClick={() => void resumeRoom()}><RotateCcw size={17} /><span><small>未结束的牌局</small><strong>继续房间 {recentRoom}</strong></span><ArrowRight size={16} /></button>}
        <div className="rail-divider"><span>加入牌局</span></div>
        <div className="join-box"><input className="text-input room-input" inputMode="numeric" maxLength={6} placeholder="000000" aria-label="六位房间号" value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && void joinRoom()} /><button className="secondary-button" disabled={busy} onClick={() => void joinRoom()}><DoorOpen size={18} />加入</button></div>
        {notice && <p className="notice">{notice}</p>}
        <div className="rail-foot"><span><span className={`connection-dot ${connected ? 'online' : ''}`} />{connected ? '房间服务在线' : '正在连接'}</span><span>仅供娱乐</span></div>
      </aside>
      <section className="game-browser">
        <div className="browser-heading"><div><span className="eyebrow">今晚开一桌</span><h2>选择玩法</h2></div><div className="game-count"><b>07</b><span>种玩法</span></div></div>
        {recentRoom && <button className="mobile-resume" onClick={() => void resumeRoom()}><RotateCcw size={16} /><span>继续未结束的房间 <b>{recentRoom}</b></span><ArrowRight size={16} /></button>}
        <div className="mobile-join"><span>已有房间？</span><input inputMode="numeric" maxLength={6} placeholder="输入六位房间号" aria-label="手机端六位房间号" value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && void joinRoom()} /><button disabled={busy} onClick={() => void joinRoom()}>加入房间 <ArrowRight size={15} /></button></div>
        <div className={`featured-game featured-${GAME_INFO[gameId].tone}`}>
          <div className="featured-copy"><span className="mode-tag">{GAME_VISUALS[gameId].label}</span><h3>{GAME_INFO[gameId].name}</h3><p>{GAME_INFO[gameId].short}</p><div className="feature-meta"><span><Users size={16} />{GAME_INFO[gameId].players}</span><span>{gameId === 'fishing' ? '仅线下' : '线上 / 线下'}</span></div><button className="primary-button create-button" disabled={busy} onClick={() => setSetupOpen(true)}><ArrowRight size={20} />开始游戏</button>{notice && <p className="create-notice">{notice}</p>}</div>
          <div className="featured-art" aria-hidden="true"><span className="game-seal">{GAME_VISUALS[gameId].mark}</span><div className="preview-cards">{GAME_VISUALS[gameId].cards.map(([rank, suit], index) => <i className={(suit === '♥' || suit === '♦' || rank.includes('王')) ? 'warm' : ''} key={`${rank}-${suit}-${index}`}><b>{rank}</b><em>{suit}</em></i>)}</div><span className="table-stitch" /></div>
        </div>
        <div className="game-shelf">{(Object.entries(GAME_INFO) as [GameId, (typeof GAME_INFO)[GameId]][]).map(([id, info], index) => <button key={id} aria-pressed={gameId === id} className={`game-choice ${gameId === id ? 'active' : ''}`} onClick={() => setGameId(id)}>
          <i className={info.tone}>{GAME_VISUALS[id].mark}</i><span><small>0{index + 1}</small><strong>{info.name}</strong></span><em>{info.players}</em>
        </button>)}</div>
      </section>
    </section>
    <footer><span>小赌怡情 · 亲友牌室</span><span>不设充值 · 不兑换现金 · 仅记录娱乐积分</span></footer>
    {panel === 'rules' && <RulesPanel selected={gameId} setSelected={setGameId} onClose={() => setPanel(null)} />}
    {panel === 'history' && <HistoryPanel items={history} total={totalScore} onClose={() => setPanel(null)} />}
    {setupOpen && <GameSetup gameId={gameId} onClose={() => setSetupOpen(false)} onStart={(value) => void startConfiguredGame(value)} />}
  </main>;

  return <main className={`room-shell theme-${room.gameId}`}>
    <header className="room-header"><button className="icon-button light" onClick={leave} aria-label="返回首页" title="返回首页"><ChevronLeft /></button><div><strong>{GAME_INFO[room.gameId].name}</strong><span className={`status-dot state-${room.status}`} />{room.status === 'lobby' ? '等待中' : room.status === 'playing' ? '进行中' : '已结束'}</div>{game?.gameId === 'poker' && <div className="header-stat"><small>底池</small><b>{game.pot ?? 0}</b></div>}{game?.gameId === 'liarsbar' && <div className="header-stat"><small>目标牌</small><b>{game.targetRank ?? '-'}</b></div>}<button className="room-code" onClick={() => void copyCode()} title="复制房间号"><span>房间</span>{room.code}<Copy size={15} /></button><button className="icon-button light header-tool" onClick={() => setPanel('chat')} aria-label="牌桌聊天" title="牌桌聊天"><MessageCircle size={19} />{(room.messages?.length ?? 0) > 0 && <i />}</button><button className="icon-button light header-tool" onClick={() => setPanel('settings')} aria-label="牌桌设置" title="牌桌设置"><Settings size={19} /></button><button className="icon-button light" onClick={() => setPanel('rules')} aria-label="查看规则" title="查看规则"><CircleHelp /></button></header>
    {!connected && <div className="connection-banner" role="status"><Wifi size={16} />连接中断，正在尝试恢复牌局…</div>}
    {room.status === 'lobby' ? <Lobby room={room} isHost={isHost} busy={busy} notice={notice} onAddBot={() => void emit('room:addBot')} onStart={() => void emit('room:start')} /> : game && <GameTable room={room} playerId={identity.playerId} selected={selected} setSelected={setSelected} isTurn={Boolean(isTurn)} soundEnabled={soundEnabled} action={action} busy={busy} notice={notice} onRestart={() => void emit('room:start')} />}
    {notice && room.status !== 'lobby' && <div className="toast">{notice}</div>}
    {panel === 'rules' && <RulesPanel selected={room.gameId} onClose={() => setPanel(null)} />}
    {panel === 'chat' && <ChatPanel room={room} playerId={identity.playerId} onSend={(text) => emit('chat:send', { text })} onClose={() => setPanel(null)} />}
    {panel === 'settings' && <SettingsPanel sound={soundEnabled} vibration={vibrationEnabled} onSound={(value) => { setSoundEnabled(value); localStorage.setItem('xy-sound', value ? 'on' : 'off'); }} onVibration={(value) => { setVibrationEnabled(value); localStorage.setItem('xy-vibration', value ? 'on' : 'off'); }} onClose={() => setPanel(null)} />}
  </main>;
}

function GameSetup({ gameId, onClose, onStart }: { gameId: GameId; onClose: () => void; onStart: (value: GameSetupValue) => void }) {
  const info = GAME_INFO[gameId];
  const [step, setStep] = useState<'mode' | 'options'>('mode');
  const [mode, setMode] = useState<PlayMode>('online');
  const [playerCount, setPlayerCount] = useState(info.min);
  const [hostSeat, setHostSeat] = useState(0);
  const [variant, setVariant] = useState<'solo' | 'team'>('solo');
  const [bulletCount, setBulletCount] = useState(1);
  const [matchRounds, setMatchRounds] = useState(3);
  const counts = Array.from({ length: info.max - info.min + 1 }, (_, index) => info.min + index);
  const chooseMode = (next: PlayMode) => { setMode(next); setStep('options'); };
  const chooseCount = (count: number) => { setPlayerCount(count); if (hostSeat >= count) setHostSeat(0); };

  return <Modal title={`${info.name} · 开始游戏`} onClose={onClose}>
    {step === 'mode' ? <div className={`mode-picker ${gameId === 'fishing' ? 'single-mode' : ''}`}>
      {gameId !== 'fishing' && <button onClick={() => chooseMode('online')}><span className="mode-icon online"><Wifi size={26} /></span><strong>线上模式</strong><small>创建房间，亲友各自在设备上加入</small><ArrowRight size={18} /></button>}
      <button onClick={() => chooseMode('offline')}><span className="mode-icon offline"><Users size={26} /></span><strong>{gameId === 'fishing' ? '线下玩法' : '实体牌记分'}</strong><small>{gameId === 'fishing' ? '使用实体纸牌聚会，手机记录座位、轮次与积分' : '使用实体纸牌，手机负责座位、轮次与积分'}</small><ArrowRight size={18} /></button>
    </div> : <div className="setup-options">
      <button className="setup-back" onClick={() => setStep('mode')}><ChevronLeft size={17} />{mode === 'online' ? '线上模式' : '实体牌记分器'}</button>
      <div className="setup-group"><div className="setup-label"><span>参与人数</span><b>{playerCount} 人</b></div><div className="segment-row">{counts.map((count) => <button key={count} className={playerCount === count ? 'active' : ''} onClick={() => chooseCount(count)}>{count}</button>)}</div></div>
      <div className="setup-group"><div className="setup-label"><span>本轮局数</span><b>{matchRounds} 局</b></div><div className="segment-row match-rounds">{[1, 3, 5, 10].map((count) => <button key={count} className={matchRounds === count ? 'active' : ''} onClick={() => setMatchRounds(count)}>{count} 局</button>)}</div><label className="match-round-custom">自定局数 <input type="number" min="1" max="20" step="1" inputMode="numeric" aria-label="自定义本轮局数" value={matchRounds} onChange={(event) => { const count = Number(event.target.value); if (Number.isInteger(count) && count >= 1 && count <= 20) setMatchRounds(count); }} /> <small>1–20 局，完成后显示总成绩</small></label></div>
      <div className="setup-group"><div className="setup-label"><span>我的位置</span><b>座位 {hostSeat + 1}</b></div><div className="seat-picker">{Array.from({ length: playerCount }, (_, seat) => <button key={seat} className={hostSeat === seat ? 'active' : ''} onClick={() => setHostSeat(seat)}><span>{seat + 1}</span><small>{hostSeat === seat ? '我' : '座位'}</small></button>)}</div></div>
      {gameId === 'doudizhu4' && <div className="setup-group"><div className="setup-label"><span>对战模式</span><b>{variant === 'solo' ? '四人混战' : '对角组队'}</b></div><div className="variant-picker"><button className={variant === 'solo' ? 'active' : ''} onClick={() => setVariant('solo')}>混战排名</button><button className={variant === 'team' ? 'active' : ''} onClick={() => setVariant('team')}>2 对 2</button></div></div>}
      {gameId === 'liarsbar' && <div className="setup-group"><div className="setup-label"><span>每人装填子弹</span><b>{bulletCount} / 6 发</b></div><div className="segment-row bullet-picker">{[1, 2, 3, 4, 5, 6].map((count) => <button key={count} className={bulletCount === count ? 'active' : ''} onClick={() => setBulletCount(count)} aria-label={`每人装填 ${count} 发子弹`}>{count}</button>)}</div><div className="liar-setup-note"><Crosshair size={18} /><span>每位玩家独立随机装填 {bulletCount} 发，弹位保密；子弹越多，中弹概率越高。</span></div></div>}
      <button className="primary-button setup-submit" onClick={() => onStart({ mode, playerCount, hostSeat, variant, bulletCount, matchRounds })}>{mode === 'online' ? '创建线上房间' : '进入实体牌记分器'}<ArrowRight size={18} /></button>
    </div>}
  </Modal>;
}

function OfflineTable({ session: initial, localPlayerId, soundEnabled, onSound, onRecord, onExit }: { session: OfflineSession; localPlayerId: string; soundEnabled: boolean; onSound: (enabled: boolean) => void; onRecord: (gameId: GameId, score: number) => void; onExit: () => void }) {
  const [session, setSession] = useState(initial);
  const [showRules, setShowRules] = useState(false);
  const [shotAnimation, setShotAnimation] = useState<'spinning' | 'hit' | 'empty' | null>(null);
  const [shotOutcome, setShotOutcome] = useState<{ name: string; attempt: number } | null>(null);
  const shotTimers = useRef<number[]>([]);
  const shotBusy = useRef(false);
  const currentPlayer = session.players[session.current];
  useEffect(() => { localStorage.setItem('xy-offline-session', JSON.stringify(session)); }, [session]);
  useEffect(() => () => { shotTimers.current.forEach(window.clearTimeout); }, []);
  const changeName = (id: string, name: string) => setSession((value) => ({ ...value, players: value.players.map((player) => player.id === id ? { ...player, name: name.slice(0, 10) } : player) }));
  const score = (id: string, amount: number) => setSession((value) => ({ ...value, players: value.players.map((player) => player.id === id ? { ...player, score: Number((player.score + amount).toFixed(1)) } : player) }));
  const nextPlayer = () => setSession((value) => {
    let next = value.current;
    do next = (next + 1) % value.players.length; while (value.players[next]?.eliminated);
    return { ...value, current: next, message: `轮到 ${value.players[next]!.name}` };
  });
  const chooseShooter = (id: string) => setSession((value) => {
    const current = value.players.findIndex((player) => player.id === id && !player.eliminated);
    return current < 0 ? value : { ...value, current, message: `${value.players[current]!.name} 输掉质疑，准备扣动扳机` };
  });
  const nextRound = () => setSession((value) => {
    onRecord(value.gameId, value.players.find((player) => player.id === localPlayerId)?.score ?? 0);
    const totalScores = Object.fromEntries(value.players.map((player) => [player.id, Number(((value.totalScores[player.id] ?? 0) + player.score).toFixed(2))]));
    if (value.round >= value.matchRounds) return { ...value, totalScores, completed: true, message: `本轮 ${value.matchRounds} 局已完成` };
    const dealer = (value.dealer + 1) % value.players.length;
    return { ...value, totalScores, players: value.players.map((player) => ({ ...player, score: 0 })), dealer, current: dealer, round: value.round + 1, message: `第 ${value.round + 1} 局已就绪` };
  });
  const resolveRevolver = () => setSession((value) => {
    const shooter = value.players[value.current]!;
    const shots = { ...value.shots, [shooter.id]: (value.shots[shooter.id] ?? 0) + 1 };
    const hit = value.bulletChambers[shooter.id]?.includes(shots[shooter.id]!) ?? false;
    const players = value.players.map((player) => player.id === shooter.id && hit ? { ...player, eliminated: true } : player);
    const survivors = players.filter((player) => !player.eliminated);
    if (survivors.length === 1) {
      const scored = players.map((player) => ({ ...player, score: player.id === survivors[0]!.id ? Number(((players.length - 1) * 0.1).toFixed(1)) : -0.1 }));
      return { ...value, players: scored, shots, message: `${survivors[0]!.name} 成为骗子之王` };
    }
    let current = value.current;
    if (hit) do current = (current + 1) % players.length; while (players[current]?.eliminated);
    const targetRank = randomTargetRank();
    return { ...value, players, current, shots, targetRank, message: hit ? `${shooter.name} 中弹离席，${players[current]!.name} 先出` : `${shooter.name} 幸运空膛，由其先出` };
  });
  const fireRevolver = () => {
    if (shotBusy.current || !currentPlayer) return;
    shotBusy.current = true;
    const attempt = (session.shots[currentPlayer.id] ?? 0) + 1;
    const hit = session.bulletChambers[currentPlayer.id]?.includes(attempt) ?? false;
    setShotOutcome({ name: currentPlayer.name, attempt });
    setShotAnimation('spinning');
    if (soundEnabled) {
      playCue('trigger');
      shotTimers.current.push(window.setTimeout(() => playCue('spin'), 110));
    }
    shotTimers.current.push(window.setTimeout(() => {
      resolveRevolver();
      setShotAnimation(hit ? 'hit' : 'empty');
      if (soundEnabled) { playCue(hit ? 'shot' : 'dry'); if (hit) shotTimers.current.push(window.setTimeout(() => playCue('impact'), 95)); }
      shotTimers.current.push(window.setTimeout(() => { setShotAnimation(null); setShotOutcome(null); shotBusy.current = false; }, 1250));
    }, 880));
  };
  const liarsFinished = session.gameId === 'liarsbar' && session.players.filter((player) => !player.eliminated).length === 1;
  const restartLiarsBar = () => setSession((value) => {
    onRecord(value.gameId, value.players.find((player) => player.id === localPlayerId)?.score ?? 0);
    const totalScores = Object.fromEntries(value.players.map((player) => [player.id, Number(((value.totalScores[player.id] ?? 0) + player.score).toFixed(2))]));
    if (value.round >= value.matchRounds) return { ...value, totalScores, completed: true, message: `本轮 ${value.matchRounds} 局已完成` };
    const dealer = (value.dealer + 1) % value.players.length;
    return {
      ...value,
      totalScores,
      players: value.players.map((player) => ({ ...player, score: 0, eliminated: false })),
      dealer, current: dealer, round: value.round + 1, targetRank: randomTargetRank(),
      shots: Object.fromEntries(value.players.map((player) => [player.id, 0])),
      bulletChambers: Object.fromEntries(value.players.map((player) => [player.id, randomBulletChambers(value.bulletCount)])),
      message: '酒馆重新开局，左轮已装填',
    };
  });
  const displayedShooter = shotOutcome?.name ?? currentPlayer?.name;
  const displayedShots = shotOutcome?.attempt ?? (session.shots[currentPlayer?.id ?? ''] ?? 0);

  return <main className={`offline-shell theme-${session.gameId}`}>
    <header className="room-header"><button className="icon-button light" onClick={onExit} aria-label="退出线下牌桌"><ChevronLeft /></button><div><strong>{GAME_INFO[session.gameId].name}</strong><span className="offline-badge">线下</span></div><div className="offline-round">第 {session.round} / {session.matchRounds} 局</div><button className="icon-button light" onClick={() => onSound(!soundEnabled)} aria-label={soundEnabled ? '关闭音效' : '开启音效'}>{soundEnabled ? <Volume2 size={19} /> : <VolumeX size={19} />}</button><button className="icon-button light" onClick={() => setShowRules(true)} aria-label="规则"><CircleHelp /></button></header>
    <section className="offline-table">
      <div className="offline-players">{session.players.map((player, index) => <div className={`offline-player ${index === session.current ? 'turn' : ''} ${player.eliminated ? 'eliminated' : ''}`} key={player.id}><span>{AVATARS[player.avatar] ?? '友'}</span><input value={player.name} onChange={(event) => changeName(player.id, event.target.value)} aria-label={`座位${player.seat + 1}昵称`} /><small>{index === session.dealer ? '庄家' : `座位 ${player.seat + 1}`}</small><div className="score-stepper"><button onClick={() => score(player.id, -0.1)} aria-label={`${player.name}减分`}><Minus size={14} /></button><b>{player.score > 0 ? '+' : ''}{player.score.toFixed(1)}</b><button onClick={() => score(player.id, 0.1)} aria-label={`${player.name}加分`}><Plus size={14} /></button></div></div>)}</div>
      <div className={`offline-center ${shotAnimation ? `shot-${shotAnimation}` : ''}`}><span className="game-seal">{GAME_VISUALS[session.gameId].mark}</span><small>{GAME_INFO[session.gameId].name}</small><h2 aria-live="polite">{shotAnimation === 'spinning' ? '扳机扣下，弹巢旋转…' : shotAnimation === 'hit' ? `${displayedShooter} 中弹淘汰` : shotAnimation === 'empty' ? '咔哒，空膛' : session.message}</h2>{session.gameId === 'liarsbar' ? <><div className="offline-target"><span>目标牌</span><b>{session.targetRank}</b></div><RevolverStage shots={displayedShots} phase={shotAnimation} /><p>{displayedShooter} · 已扣动 {displayedShots} / 6 次 · 装填 {session.bulletCount} 发</p>{session.completed ? <div className="match-summary"><strong>本轮总成绩</strong>{[...session.players].sort((a, b) => (session.totalScores[b.id] ?? 0) - (session.totalScores[a.id] ?? 0)).map((player) => <span key={player.id}>{player.name} <b>{session.totalScores[player.id] ?? 0}</b></span>)}</div> : liarsFinished ? <button className="primary-button" disabled={Boolean(shotAnimation)} onClick={restartLiarsBar}><RotateCcw size={18} />{session.round >= session.matchRounds ? '完成本轮并查看总成绩' : '记录并再来一局'}</button> : <div className="offline-actions"><label className="shooter-picker">输掉质疑的玩家 <select aria-label="选择开枪者" value={currentPlayer?.id ?? ''} disabled={Boolean(shotAnimation)} onChange={(event) => chooseShooter(event.target.value)}>{session.players.filter((player) => !player.eliminated).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label><button className="secondary-button" disabled={Boolean(shotAnimation)} onClick={nextPlayer}>下一位玩家</button><button className="trigger-button" disabled={Boolean(shotAnimation)} onClick={fireRevolver}><Crosshair />{shotAnimation === 'spinning' ? '转动弹巢…' : '输家开枪'}</button></div>}</> : <><p>庄家：{session.players[session.dealer]?.name} · 当前：{currentPlayer?.name}</p>{session.completed ? <div className="match-summary"><strong>本轮总成绩</strong>{[...session.players].sort((a, b) => (session.totalScores[b.id] ?? 0) - (session.totalScores[a.id] ?? 0)).map((player) => <span key={player.id}>{player.name} <b>{session.totalScores[player.id] ?? 0}</b></span>)}</div> : <div className="offline-actions"><button className="secondary-button" onClick={nextPlayer}>下一位</button><button className="primary-button" onClick={nextRound}>{session.round >= session.matchRounds ? '完成本轮并查看总成绩' : '记录并下一局'}</button></div>}</>}</div>
    </section>
    {showRules && <RulesPanel selected={session.gameId} onClose={() => setShowRules(false)} />}
  </main>;
}

function Lobby({ room, isHost, busy, notice, onAddBot, onStart }: { room: ClientRoom; isHost: boolean; busy: boolean; notice: string; onAddBot: () => void; onStart: () => void }) {
  const info = GAME_INFO[room.gameId];
  const seats = Array.from({ length: room.targetPlayers }, (_, seat) => room.players.find((player) => (player.seat ?? 0) === seat));
  return <section className="lobby"><div className="lobby-copy"><span className="eyebrow">ROOM {room.code}</span><h2>{info.name}</h2><div className="lobby-meta"><span>{room.players.length}/{room.targetPlayers} 已入座</span><i /><span>共 {Number(room.options.matchRounds ?? 3)} 局</span><i /><span>{info.short}</span></div></div>
    <div className="lobby-table"><div className="table-center"><span>{GAME_VISUALS[room.gameId].mark}</span><strong>小赌怡情</strong><small>{room.players.length === room.targetPlayers ? '人员已齐，可以开局' : `等待 ${room.targetPlayers - room.players.length} 人加入`}</small></div><div className={`seats seat-layout-${room.targetPlayers}`}>{seats.map((player, seat) => player ? <div className={`seat occupied seat-pos-${seat} ${player.connected ? '' : 'disconnected'}`} key={player.id}><span className="avatar">{AVATARS[player.avatar] ?? '友'}</span><div><strong>{player.name}</strong><small>{player.id === room.hostId ? `房主 · 座位 ${seat + 1}` : player.bot ? `电脑牌友 · 座位 ${seat + 1}` : player.connected ? `座位 ${seat + 1}` : '暂时离线'}</small></div>{player.bot && <Bot size={17} />}</div> : <div className={`seat empty seat-pos-${seat}`} key={`empty-${seat}`}><span className="empty-seat">{seat + 1}</span><div><strong>等待加入</strong><small>座位 {seat + 1}</small></div></div>)}</div></div>
    {isHost ? <div className="lobby-actions"><button className="secondary-button" disabled={busy || room.players.length >= room.targetPlayers} onClick={onAddBot}><Bot size={18} />添加牌友</button><button className="primary-button" disabled={busy || room.players.length < room.targetPlayers} onClick={onStart}><Sparkles size={18} />开始牌局</button></div> : <div className="waiting"><Clock3 />等待房主开始牌局</div>}
    {notice && <p className="notice centered">{notice}</p>}
  </section>;
}

function GameTable({ room, playerId, selected, setSelected, isTurn, soundEnabled, action, busy, notice, onRestart }: { room: ClientRoom; playerId: string; selected: string[]; setSelected: (ids: string[]) => void; isTurn: boolean; soundEnabled: boolean; action: (value: unknown) => Promise<unknown>; busy: boolean; notice: string; onRestart: () => void }) {
  const game = room.game!;
  const toggle = (id: string) => { setSelected(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]); if (soundEnabled) playCue('select'); };
  return <section className={`table-area combo-${game.current?.combo.kind ?? 'none'} phase-${game.phase} ${isTurn ? 'my-turn' : ''}`}>
    <div className={`opponents player-count-${room.players.length}`}>{room.players.map((player, index) => <div className={`player-chip ${game.gameId === 'poker' ? 'poker-player' : ''} ${index === game.turn ? 'turn' : ''} ${player.id === playerId ? 'self' : ''} ${game.folded?.includes(player.id) || game.eliminated?.includes(player.id) ? 'folded' : ''} ${game.gameId === 'doudizhu4' && game.variant === 'team' ? index % 2 === 0 ? 'team-blue' : 'team-orange' : ''}`} key={player.id}><span>{AVATARS[player.avatar] ?? '友'}</span><div><strong>{player.name}{player.id === playerId ? ' · 我' : ''}</strong><small><PlayerStatus room={room} playerId={player.id} index={index} /></small>{game.gameId === 'liarsbar' && !game.eliminated?.includes(player.id) && <div className="shot-meter" aria-label={`${game.shots?.[player.id] ?? 0} 次空膛`}>{Array.from({ length: 6 }, (_, chamber) => <i className={chamber < (game.shots?.[player.id] ?? 0) ? 'spent' : ''} key={chamber} />)}</div>}</div>{game.gameId === 'poker' && <ChipStack amount={game.stacks?.[player.id] ?? 0} compact />}{index === game.turn && game.phase !== 'finished' && <TurnTimer key={`${game.turn}-${game.phase}-${game.turnDeadline}`} active deadline={game.turnDeadline} duration={game.turnDuration} />}</div>)}</div>
    <div className="felt-center">
      <div className="felt-emblem" aria-hidden="true"><span>小赌怡情</span><i>FAMILY CARD ROOM</i></div>
      <div className="round-meta" aria-live="polite"><span>{game.message}</span>{game.multiplier && <b>{game.multiplier} 倍</b>}{game.pot !== undefined && <b>底池 {game.pot}</b>}{game.gameId === 'liarsbar' && <b>第 {game.roundNumber} 轮</b>}</div>
      <GameCenter room={room} />
    </div>
    {game.phase === 'finished' ? <Settlement room={room} playerId={playerId} onRestart={onRestart} /> : <div className="player-zone">
      <GameActions game={game} playerId={playerId} selected={selected} isTurn={isTurn} busy={busy} action={action} onHint={() => setSelected(game.suggestion ?? [])} />
      {notice && <p className="inline-notice">{notice}</p>}
      <div className={`hand hand-${game.gameId}`}>{game.gameId === 'fishing' ? <div className="draw-pile"><i /><i /><i /><strong>{game.hand.length}</strong><span>点击“翻一张牌”</span></div> : game.hand.map((card, index) => <PlayingCard key={card.id} card={card} dealIndex={index} selected={selected.includes(card.id)} onClick={game.gameId === 'poker' ? undefined : () => toggle(card.id)} />)}</div>
    </div>}
  </section>;
}

const COMBO_LABELS: Record<string, string> = { single: '单张', pair: '对子', triple: '三张', 'triple-one': '三带一', 'triple-pair': '三带二', straight: '顺子', pairs: '连对', plane: '飞机', 'plane-single': '飞机带单', 'plane-pair': '飞机带对', 'four-two': '四带二', 'four-two-pairs': '四带两对', bomb: '炸弹', rocket: '王炸', heavenly: '天王炸弹' };
const PHASE_LABELS: Record<string, string> = { preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌', challenge: '等待判断', playing: '出牌阶段', bidding: '叫地主' };

function PlayerStatus({ room, playerId, index }: { room: ClientRoom; playerId: string; index: number }) {
  const game = room.game!;
  if (game.eliminated?.includes(playerId)) return <>已淘汰</>;
  if (game.folded?.includes(playerId)) return <>已弃牌</>;
  const rank = game.rankings?.indexOf(playerId) ?? -1;
  if (game.gameId === 'poker') {
    const dealer = game.dealer ?? 0;
    const sb = room.players.length === 2 ? dealer : (dealer + 1) % room.players.length;
    const bb = (sb + 1) % room.players.length;
    const marker = index === dealer ? 'D' : index === sb ? 'SB' : index === bb ? 'BB' : '';
    return <>{marker && `${marker} · `}本街下注 {game.bets?.[playerId] ?? 0}</>;
  }
  if (game.gameId === 'fishing') return <>牌堆 {game.handCounts[playerId] ?? 0} · 累计钓到 {game.catches?.[playerId] ?? 0}</>;
  if (game.gameId === 'liarsbar') return <>{game.handCounts[playerId] ?? 0} 张 · 扣动 {game.shots?.[playerId] ?? 0}/6</>;
  if (game.gameId === 'doudizhu4' && game.variant === 'team') return <>{index % 2 === 0 ? '蓝队' : '橙队'} · {game.landlordId === playerId ? '夺底 · ' : ''}{game.handCounts[playerId] ?? 0} 张</>;
  if (rank >= 0) return <>第 {rank + 1} 名 · 已出完</>;
  if (game.gameId === 'doudizhu3' && game.phase === 'bidding') return <>{game.bids?.[playerId] === undefined ? '等待叫分' : Number(game.bids[playerId]) > 0 ? `叫 ${game.bids[playerId]} 分` : '不叫'}</>;
  if (game.gameId === 'doudizhu3' && game.phase === 'doubling' && playerId !== game.landlordId) return <>{game.doubles?.[playerId] === undefined ? '等待加倍' : game.doubles[playerId] ? '已加倍' : '不加倍'}</>;
  return <>{game.landlordId === playerId ? '地主 · ' : game.gameId === 'doudizhu3' ? '农民 · ' : ''}{game.handCounts[playerId] ?? 0} 张</>;
}

function GameActions({ game, playerId, selected, isTurn, busy, action, onHint }: { game: NonNullable<ClientRoom['game']>; playerId: string; selected: string[]; isTurn: boolean; busy: boolean; action: (value: unknown) => Promise<unknown>; onHint: () => void }) {
  if (game.phase === 'bidding') return <div className="action-stack"><span>当前最高 {game.highestBid ?? 0} 分，只能提高叫分</span><div className="action-bar"><button className="secondary-button" disabled={!isTurn || busy} onClick={() => void action({ type: 'bid', value: 0 })}>不叫</button>{[1, 2, 3].map((bid) => <button key={bid} className="primary-button" disabled={!isTurn || busy || bid <= (game.highestBid ?? 0)} onClick={() => void action({ type: 'bid', value: bid })}>{bid} 分</button>)}</div></div>;
  if (game.phase === 'doubling') return <div className="action-stack"><span>农民依次选择，本局倍率 {game.multiplier ?? 1}×</span><div className="action-bar"><button className="secondary-button" disabled={!isTurn || busy} onClick={() => void action({ type: 'double', value: false })}>不加倍</button><button className="primary-button" disabled={!isTurn || busy} onClick={() => void action({ type: 'double', value: true })}>加倍</button></div></div>;
  if (game.gameId === 'liarsbar') {
    const mustChallenge = game.phase === 'challenge' && (game.handCounts[game.lastClaim?.playerId ?? ''] ?? 1) === 0;
    const canChallenge = game.phase === 'challenge' && !game.eliminated?.includes(playerId) && game.lastClaim?.playerId !== playerId;
    return <div className="action-stack"><span>{mustChallenge ? '对方已打出最后一手，必须质疑' : game.phase === 'challenge' ? `上一手声称 ${game.lastClaim?.count ?? 0} 张 ${game.targetRank}，任意存活玩家可质疑` : `选择 1–3 张暗牌 · 已选 ${selected.length}/3`}</span><div className="action-bar">{game.phase === 'challenge' ? <>{!mustChallenge && <button className="secondary-button trust-button" disabled={!isTurn || busy} onClick={() => void action({ type: 'accept' })}>相信并继续</button>}<button className="challenge-button" disabled={!canChallenge || busy} onClick={() => void action({ type: 'challenge' })}><Eye size={18} />质疑上一手</button></> : <button className="primary-button" disabled={!isTurn || busy || selected.length < 1 || selected.length > 3} onClick={() => void action({ type: 'play', cardIds: selected })}>暗牌声明 · {selected.length} 张 {game.targetRank}</button>}</div></div>;
  }
  if (game.gameId === 'fishing') return <div className="action-stack"><span>同点数收回牌堆底部，钓中后继续；大小王可收走全桌</span><div className="action-bar"><button className="primary-button" disabled={!isTurn || busy} onClick={() => void action({ type: 'draw' })}>翻一张牌</button></div></div>;
  if (game.gameId === 'poker') return <PokerActions game={game} playerId={playerId} isTurn={isTurn} busy={busy} action={action} />;
  return <div className="action-stack"><span>{game.current ? `需压过 ${COMBO_LABELS[game.current.combo.kind] ?? game.current.combo.kind} · 已选 ${selected.length} 张` : `新一轮可出任意支持牌型 · 已选 ${selected.length} 张`}</span><div className="action-bar"><button className="text-button" disabled={!isTurn || busy || !game.suggestion?.length} onClick={onHint}>提示</button><button className="secondary-button" disabled={!isTurn || busy || !game.current} onClick={() => void action({ type: 'pass' })}>{game.gameId === 'paodekuai' ? '要不起' : '不出'}</button><button className="primary-button" disabled={!isTurn || busy || selected.length === 0} onClick={() => void action({ type: 'play', cardIds: selected })}>出牌 · {selected.length}</button></div></div>;
}

function PokerActions({ game, playerId, isTurn, busy, action }: { game: NonNullable<ClientRoom['game']>; playerId: string; isTurn: boolean; busy: boolean; action: (value: unknown) => Promise<unknown> }) {
  const [raiseInput, setRaiseInput] = useState('20');
  const call = Math.max(0, (game.currentBet ?? 0) - (game.bets?.[playerId] ?? 0));
  const stack = game.stacks?.[playerId] ?? 0;
  const maxRaise = stack - call;
  const amount = Number(raiseInput);
  const validRaise = /^\d+$/.test(raiseInput) && Number.isSafeInteger(amount) && amount >= 10 && amount <= maxRaise;
  const adjust = (delta: number) => setRaiseInput(String(Math.min(Math.max(10, Number(raiseInput) || 10) + delta, Math.max(10, maxRaise))));
  return <div className="action-stack poker-actions"><span>{PHASE_LABELS[game.phase] ?? game.phase} · 当前注 {game.currentBet ?? 0} · 你的筹码 {stack}{game.handRank ? ` · ${game.handRank}` : ''}</span><div className="action-bar"><button className="text-button danger" disabled={!isTurn || busy} onClick={() => void action({ type: 'fold' })}>弃牌</button><button className="secondary-button" disabled={!isTurn || busy} onClick={() => void action(call === 0 ? { type: 'check' } : { type: 'call' })}>{call === 0 ? '过牌' : `跟注 ${Math.min(call, stack)}`}</button><label className="raise-control"><button type="button" onClick={() => adjust(-10)} aria-label="减少加注"><Minus size={15} /></button><input type="number" min="10" max={Math.max(0, maxRaise)} step="1" inputMode="numeric" aria-label="加注金额" value={raiseInput} onChange={(event) => setRaiseInput(event.target.value)} /><button type="button" onClick={() => adjust(10)} aria-label="增加加注"><Plus size={15} /></button></label><button className="primary-button" disabled={!isTurn || busy || !validRaise} onClick={() => void action({ type: 'raise', amount })}>加注 {validRaise ? amount : ''}</button><button className="allin-button" disabled={!isTurn || busy || stack === 0} onClick={() => void action({ type: 'allin' })}>全押 {stack}</button></div><small className="raise-hint">{maxRaise < 10 ? '剩余筹码不足以加注，可跟注或全押' : validRaise ? `自填加注额 10–${maxRaise}；本次需投入 ${call + amount}` : `请输入 10–${maxRaise} 之间的整数加注额`}</small></div>;
}

function GameCenter({ room }: { room: ClientRoom }) {
  const game = room.game!;
  if (game.gameId === 'liarsbar') return <LiarsBarCenter game={game} players={room.players} />;
  if (game.gameId === 'poker') return <PokerCenter game={game} players={room.players} />;
  if (game.gameId === 'fishing') return <FishingCenter game={game} />;
  if (game.gameId === 'doudizhu3') return <DoudizhuCenter game={game} fourPlayer={false} />;
  if (game.gameId === 'doudizhu4') return <DoudizhuCenter game={game} fourPlayer />;
  return <PaodekuaiCenter game={game} />;
}

function PokerCenter({ game, players }: { game: NonNullable<ClientRoom['game']>; players: ClientRoom['players'] }) {
  const phases = ['preflop', 'flop', 'turn', 'river'];
  return <div className="poker-center"><div className="poker-table-title"><span>POKER NIGHT</span><strong>德州扑克</strong><span>NO LIMIT · 娱乐筹码</span></div><div className="street-track">{phases.map((phase) => <span className={phase === game.phase ? 'active' : phases.indexOf(phase) < phases.indexOf(game.phase) ? 'done' : ''} key={phase}>{PHASE_LABELS[phase]}</span>)}</div><div className="poker-pot-ceremony" key={game.pot}><span className="pot-label">总底池 <b>{game.pot ?? 0}</b><i>当前注 {game.currentBet ?? 0}</i></span><div className="pot-chip-pile" aria-hidden="true"><i /><i /><i /><i /><i /></div></div><div className="community-cards">{Array.from({ length: 5 }, (_, index) => game.community?.[index] ? <PlayingCard key={game.community[index]!.id} card={game.community[index]!} small /> : <i key={index}><span>{index < 3 ? '翻牌' : index === 3 ? '转牌' : '河牌'}</span></i>)}</div>{(game.pots?.length ?? 0) > 1 && <div className="poker-side-pots">{game.pots!.map((pot, index) => <span key={`${index}-${pot}`}>{index ? `边池 ${index}` : '主池'} <b>{pot}</b></span>)}</div>}<div className="poker-bank">{players.map((player) => <div className="poker-bank-seat" key={player.id}><ChipStack amount={game.stacks?.[player.id] ?? 0} /><span><strong>{player.name}</strong><small>{game.folded?.includes(player.id) ? '已弃牌' : `本街下注 ${game.bets?.[player.id] ?? 0}`}</small></span></div>)}</div></div>;
}

function FishingCenter({ game }: { game: NonNullable<ClientRoom['game']> }) {
  const top = game.table?.[game.table.length - 1];
  const totalCaught = Object.values(game.catches ?? {}).reduce((sum, count) => sum + count, 0);
  return <div className="fishing-center"><div className="fishing-stats"><span>第 <b>{game.turnCount ?? 0}</b> 回合</span><span>中央牌列 <b>{game.table?.length ?? 0}</b></span><span>累计钓牌 <b>{totalCaught}</b></span></div><div className="table-pile">{top ? <PlayingCard card={top} small /> : <i />}<span>{top ? `最新：${top.rank}${SUITS[top.suit]}` : '等待第一张牌'}</span></div></div>;
}

function DoudizhuCenter({ game, fourPlayer }: { game: NonNullable<ClientRoom['game']>; fourPlayer: boolean }) {
  const cards = game.current?.cards;
  const totalBidders = fourPlayer ? 4 : 3;
  return <div className="climbing-center ddz-center"><div className="center-status"><b>{game.phase === 'bidding' ? '竞叫夺底' : game.phase === 'doubling' ? '农民加倍' : game.current ? COMBO_LABELS[game.current.combo.kind] ?? game.current.combo.kind : '自由领出'}</b><span>{fourPlayer ? game.variant === 'team' ? '2 对 2 组队' : `排名进度 ${game.rankings?.length ?? 0}/4` : `倍率 ${game.multiplier ?? 1}×`}</span><span>{game.current ? `已过 ${game.passes ?? 0} 人` : game.phase === 'bidding' ? `最高 ${game.highestBid ?? 0} 分` : '新一轮'}</span></div><div className="center-cards">{cards?.length ? cards.map((card) => <PlayingCard key={card.id} card={card} small />) : <span className="empty-table">{game.phase === 'bidding' ? `已有 ${game.bidCount ?? 0}/${totalBidders} 人选择` : game.phase === 'doubling' ? '等待两位农民选择' : '等待领出'}</span>}</div>{game.bottom?.length ? <div className="bottom-cards"><span>{fourPlayer ? '8 张底牌' : '3 张底牌'}</span>{game.bottom.map((card) => <PlayingCard key={card.id} card={card} small />)}</div> : null}</div>;
}

function PaodekuaiCenter({ game }: { game: NonNullable<ClientRoom['game']> }) {
  const cards = game.current?.cards;
  return <div className="climbing-center paodekuai-center"><div className="center-status"><b>{game.current ? COMBO_LABELS[game.current.combo.kind] ?? game.current.combo.kind : '自由领出'}</b><span>已过 {game.passes ?? 0} 人</span><span>已出完 {game.rankings?.length ?? 0} 人</span></div><div className="center-cards">{cards?.length ? cards.map((card) => <PlayingCard key={card.id} card={card} small />) : <span className="empty-table">新一轮，任意支持牌型</span>}</div></div>;
}

function LiarsBarCenter({ game, players }: { game: ClientRoom['game'] & {}; players: ClientRoom['players'] }) {
  if (!game) return null;
  const claimant = players.find((player) => player.id === game.lastClaim?.playerId)?.name;
  const activePlayer = players[game.turn];
  return <div className="liars-center">
    <div className="bar-lamp left"><Wine size={17} /></div><div className="bar-lamp right"><Wine size={17} /></div>
    <div className="target-card"><span>目标牌</span><b>{game.targetRank}</b></div>
    <div className="face-down-stack" aria-label={`桌面共有 ${game.tableCount ?? 0} 张暗牌`}><i /><i /><i /><span>{game.tableCount ?? 0} 张暗牌</span>{game.lastClaim && <small>{claimant} 声称 {game.lastClaim.count} 张</small>}</div>
    {!game.lastReveal && <div className="online-revolver-idle"><RevolverStage shots={game.shots?.[activePlayer?.id ?? ''] ?? 0} phase={null} /><small>{activePlayer?.name ?? '当前玩家'}的左轮 · 装填 {game.bulletCount ?? 1} 发</small></div>}
    {game.lastReveal && <RevolverReveal key={`${game.roundNumber}-${game.lastReveal.loserId}-${game.lastReveal.cards.map((card) => card.id).join('-')}`} game={game} />}
  </div>;
}

function RevolverReveal({ game }: { game: NonNullable<ClientRoom['game']> }) {
  const reveal = game.lastReveal!;
  const [phase, setPhase] = useState<'spinning' | 'hit' | 'empty'>('spinning');
  useEffect(() => {
    const timer = window.setTimeout(() => setPhase(reveal.hit ? 'hit' : 'empty'), 880);
    return () => window.clearTimeout(timer);
  }, [reveal.hit]);
  return <div className={`liar-reveal ${phase === 'hit' ? 'hit' : ''}`} aria-live="polite">
    <strong>{phase === 'spinning' ? '扣动扳机 · 弹巢旋转' : reveal.liar ? '谎言揭穿' : '质疑失败'}</strong>
    <RevolverStage shots={game.shots?.[reveal.loserId] ?? 0} phase={phase} />
    <div className="reveal-cards">{reveal.cards.map((card) => <PlayingCard key={card.id} card={card} small />)}</div>
    <span>{phase === 'spinning' ? '等待击发结果…' : reveal.hit ? '子弹击发 · 玩家淘汰' : '空膛 · 侥幸过关'}</span>
  </div>;
}

function Settlement({ room, playerId, onRestart }: { room: ClientRoom; playerId: string; onRestart: () => void }) {
  const game = room.game!;
  const sorted = [...room.players].sort((a, b) => (game.scores?.[b.id] ?? 0) - (game.scores?.[a.id] ?? 0));
  return <div className={`settlement ${game.winnerIds?.includes(playerId) ? 'won' : ''}`}><div className="settlement-mark">{game.winnerIds?.includes(playerId) ? '胜' : '终'}</div><span className="eyebrow">本局结算 · 第 {room.round} / {Number(room.options.matchRounds ?? 3)} 局</span><h2>{game.winnerIds?.includes(playerId) ? (game.gameId === 'liarsbar' ? '骗子之王' : '本局获胜') : '牌局结束'}</h2><p>{game.message}</p><div className="settlement-stats">{game.multiplier && <span>最终倍率 <b>{game.multiplier}×</b></span>}{game.pot !== undefined && <span>本局底池 <b>{game.pot}</b></span>}{game.roundNumber && <span>对局轮数 <b>{game.roundNumber}</b></span>}{game.gameId === 'poker' && (game.pots?.length ?? 0) > 1 && game.pots!.map((pot, index) => <span key={`${index}-${pot}`}>{index === 0 ? '主池' : `边池 ${index}`} <b>{pot}</b></span>)}</div>{game.gameId === 'poker' && game.showdownHands && <div className="showdown-hands">{Object.entries(game.showdownHands).map(([id, cards]) => <div key={id}><span>{room.players.find((player) => player.id === id)?.name}</span>{cards.map((card) => <PlayingCard card={card} key={card.id} small />)}</div>)}</div>}{sorted.map((player, i) => <div className={`score-row ${player.id === playerId ? 'mine' : ''}`} key={player.id}><b>{i + 1}</b><span>{player.name}{player.id === playerId ? ' · 我' : ''}</span><strong className={(game.scores?.[player.id] ?? 0) >= 0 ? 'positive' : 'negative'}>{(game.scores?.[player.id] ?? 0) > 0 ? '+' : ''}{game.scores?.[player.id] ?? 0}</strong></div>)}<p className="settlement-note">{SCORE_NOTES[room.gameId]}</p>{room.round >= Number(room.options.matchRounds ?? 3) && <div className="match-summary"><strong>本轮总成绩</strong>{[...room.players].sort((a, b) => (room.matchScores?.[b.id] ?? 0) - (room.matchScores?.[a.id] ?? 0)).map((player) => <span key={player.id}>{player.name} <b>{room.matchScores?.[player.id] ?? 0}</b></span>)}</div>}{room.hostId === playerId && room.round < Number(room.options.matchRounds ?? 3) && <button className="primary-button" onClick={onRestart}><RotateCcw size={17} />再来一局</button>}</div>;
}

function RulesPanel({ selected, setSelected, onClose }: { selected: GameId; setSelected?: (id: GameId) => void; onClose: () => void }) {
  const [active, setActive] = useState(selected);
  const choose = (id: GameId) => { setActive(id); setSelected?.(id); };
  const rules = RULES[active];
  return <Modal title="规则大全" onClose={onClose}><div className="rule-tabs">{(Object.keys(GAME_INFO) as GameId[]).map((id) => <button key={id} className={active === id ? 'active' : ''} onClick={() => choose(id)}>{GAME_INFO[id].name}</button>)}</div><div className="rules-body"><span className="rule-kicker">{GAME_VISUALS[active].label}</span><h3>{GAME_INFO[active].name}</h3><div className="rule-facts"><span>{GAME_INFO[active].players}</span><span>{GAME_INFO[active].short}</span></div><p className="rule-intro">{rules.intro}</p><aside className="rule-example"><strong>{RULE_EXAMPLES[active].title}</strong><p>{RULE_EXAMPLES[active].text}</p></aside>{rules.sections.map((section) => <section className="rule-section" key={section.title}><h4>{section.title}</h4><ol>{section.items.map((rule) => <li key={rule}>{rule}</li>)}</ol></section>)}</div></Modal>;
}

function ChatPanel({ room, playerId, onSend, onClose }: { room: ClientRoom; playerId: string; onSend: (text: string) => Promise<{ ok: boolean }>; onClose: () => void }) {
  const [text, setText] = useState('');
  const send = async () => {
    const message = text.trim();
    if (!message) return;
    const result = await onSend(message);
    if (result.ok) setText('');
  };
  return <Modal title="牌桌聊天" onClose={onClose}><div className="chat-list">{room.messages?.length ? room.messages.map((message) => <div className={message.playerId === playerId ? 'mine' : ''} key={message.id}><b>{message.name}</b><p>{message.text}</p><small>{new Date(message.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small></div>) : <span>还没有消息</span>}</div><div className="chat-compose"><input value={text} maxLength={120} placeholder="说点什么…" aria-label="聊天消息" onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void send()} /><button className="primary-button" disabled={!text.trim()} onClick={() => void send()}>发送</button></div></Modal>;
}

function SettingsPanel({ sound, vibration, onSound, onVibration, onClose }: { sound: boolean; vibration: boolean; onSound: (value: boolean) => void; onVibration: (value: boolean) => void; onClose: () => void }) {
  return <Modal title="牌桌设置" onClose={onClose}><div className="settings-list"><label><span>{sound ? <Volume2 size={20} /> : <VolumeX size={20} />}<b>游戏音效</b><small>发牌、出牌、回合、结算与左轮反馈</small></span><input type="checkbox" checked={sound} onChange={(event) => onSound(event.target.checked)} /></label><label><span><Crosshair size={20} /><b>震动反馈</b><small>轮到自己时轻震提醒</small></span><input type="checkbox" checked={vibration} onChange={(event) => onVibration(event.target.checked)} /></label></div></Modal>;
}

function HistoryPanel({ items, total, onClose }: { items: HistoryItem[]; total: number; onClose: () => void }) {
  const [filter, setFilter] = useState<GameId | 'all'>('all');
  const visible = filter === 'all' ? items : items.filter((item) => item.gameId === filter);
  const score = filter === 'all' ? total : visible.reduce((sum, item) => sum + item.score, 0);
  const wins = visible.filter((item) => item.result === '胜').length;
  return <Modal title="我的战绩" onClose={onClose}><div className="history-total"><span>{filter === 'all' ? '累计积分' : `${GAME_INFO[filter].name}积分`}</span><strong className={score >= 0 ? 'positive' : 'negative'}>{score > 0 ? '+' : ''}{score.toFixed(1)}</strong></div><div className="history-toolbar"><span>{visible.length} 局 · {wins} 胜</span><select aria-label="按玩法筛选战绩" value={filter} onChange={(event) => setFilter(event.target.value as GameId | 'all')}><option value="all">全部玩法</option>{(Object.keys(GAME_INFO) as GameId[]).map((id) => <option key={id} value={id}>{GAME_INFO[id].name}</option>)}</select></div><div className="history-list">{visible.length ? visible.map((item) => <div key={item.key}><span className={`result ${item.result === '胜' ? 'win' : ''}`}>{item.result}</span><div><strong>{GAME_INFO[item.gameId].name}</strong><small>{new Date(item.at).toLocaleString('zh-CN')}</small></div><b className={item.score >= 0 ? 'positive' : 'negative'}>{item.score > 0 ? '+' : ''}{item.score}</b></div>) : <p className="empty-history">{items.length ? '这一玩法还没有战绩。' : '还没有战绩，创建一桌开始吧。'}</p>}</div></Modal>;
}
