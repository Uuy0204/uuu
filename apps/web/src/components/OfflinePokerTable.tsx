'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, CircleHelp, Minus, Plus, RotateCcw } from 'lucide-react';
import { advancePokerStreet, createOfflinePoker, nextPokerHand, pokerAction, pokerPot, pokerPots, settlePoker, type OfflinePokerState } from './offlinePoker';

interface Player { id: string; name: string; avatar: number; seat: number }
export interface OfflinePokerSession {
  gameId: 'poker'; players: Player[]; round: number; matchRounds: number; completed?: boolean;
  dealer: number; poker?: OfflinePokerState;
  undo?: { poker: OfflinePokerState; round: number; dealer: number; choices: string[][] };
  createdAt?: number; recordedRound?: number; startingStacks?: Record<string, number>;
}
const labels = { preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌', showdown: '摊牌结算', settled: '本局结束' };

export function OfflinePokerTable({ initial, localPlayerId, onExit, onRecord }: { initial: OfflinePokerSession; localPlayerId: string; onExit: () => void; onRecord: (score: number, key: string) => void }) {
  const [session, setSession] = useState(() => ({ ...initial, poker: initial.poker ?? createOfflinePoker(initial.players, initial.dealer) }));
  const [raise, setRaise] = useState('20');
  const [choices, setChoices] = useState<string[][]>([]);
  const [showRules, setShowRules] = useState(false);
  const game = session.poker;
  const player = game.seats[game.current];
  const call = player ? Math.max(0, game.currentBet - player.bet) : 0;
  const raiseAmount = Number(raise);
  const canRaise = player && /^\d+$/.test(raise) && Number.isSafeInteger(raiseAmount) && raiseAmount >= 10 && call + raiseAmount <= player.stack;
  const pots = pokerPots(game);
  useEffect(() => { localStorage.setItem('xy-offline-session', JSON.stringify(session)); }, [session]);

  const changeGame = (next: (value: typeof session) => typeof session) => setSession((value) => {
    const updated = next(value);
    if (updated.poker === value.poker && updated.round === value.round) return value;
    return { ...updated, undo: { poker: value.poker, round: value.round, dealer: value.dealer, choices } };
  });
  const undo = () => {
    if (!session.undo) return;
    setChoices(session.undo.choices);
    setSession((value) => ({ ...value, poker: value.undo!.poker, round: value.undo!.round, dealer: value.undo!.dealer, undo: undefined, completed: false }));
  };

  const act = (type: 'fold' | 'check' | 'call' | 'raise' | 'allin') => {
    if ((type === 'fold' || type === 'allin') && !window.confirm(`确认${type === 'fold' ? '弃牌' : `全押 ${player?.stack ?? 0} 筹码`}？可用“撤销上一步”恢复。`)) return;
    changeGame((value) => ({ ...value, poker: pokerAction(value.poker, type, raiseAmount) }));
    setChoices([]);
  };
  const toggleWinner = (potIndex: number, id: string) => setChoices((current) => {
    const next = current.map((ids) => [...ids]);
    const ids = next[potIndex] ?? [];
    next[potIndex] = ids.includes(id) ? ids.filter((candidate) => candidate !== id) : [...ids, id];
    return next;
  });
  const settle = () => {
    const selected = pots.map((pot, index) => pot.eligible.length === 1 ? pot.eligible : choices[index] ?? []);
    if (!window.confirm(`确认按所选赢家分配 ${pots.reduce((sum, pot) => sum + pot.amount, 0)} 筹码？`)) return;
    changeGame((value) => ({ ...value, poker: settlePoker(value.poker, selected) }));
  };
  const recordHand = () => {
    if (session.recordedRound === session.round) return;
    const beginning = session.startingStacks?.[localPlayerId] ?? 1000;
    const ending = game.seats.find((seat) => seat.id === localPlayerId)?.stack ?? beginning;
    onRecord(ending - beginning, `offline-poker-${session.createdAt ?? 0}-${session.round}`);
  };
  const nextHand = () => {
    recordHand();
    if (session.round >= session.matchRounds || game.seats.filter((seat) => seat.stack > 0).length < 2) {
      setSession((value) => ({ ...value, completed: true, recordedRound: value.round })); return;
    }
    setSession((value) => {
      const poker = nextPokerHand(value.poker);
      return { ...value, round: value.round + 1, dealer: poker.dealer, poker, recordedRound: value.round,
        startingStacks: Object.fromEntries(value.poker.seats.map((seat) => [seat.id, seat.stack])), undo: undefined };
    });
    setChoices([]);
  };
  const rename = (id: string, name: string) => setSession((value) => ({ ...value,
    players: value.players.map((seat) => seat.id === id ? { ...seat, name: name.slice(0, 10) } : seat),
    poker: { ...value.poker, seats: value.poker.seats.map((seat) => seat.id === id ? { ...seat, name: name.slice(0, 10) } : seat) },
  }));

  return <main className="offline-shell theme-poker">
    <header className="room-header"><button className="icon-button light" onClick={() => { localStorage.setItem('xy-offline-session', JSON.stringify(session)); onExit(); }} aria-label="返回首页并保存牌局"><ChevronLeft /></button><div><strong>德州扑克</strong><span className="offline-badge">实体牌 · 手机记筹码</span></div><div className="offline-round">第 {session.round} / {session.matchRounds} 局</div><button className="icon-button light offline-undo" disabled={!session.undo || session.completed} onClick={undo} aria-label="撤销上一步">撤销上一步</button><button className="icon-button light" onClick={() => setShowRules(true)} aria-label="线下德州说明"><CircleHelp /></button></header>
    <section className="offline-poker">
      <div className="offline-poker-summary"><span>当前阶段 <b>{labels[game.street]}</b></span><span>底池 <b>{pokerPot(game)}</b></span><span>当前注 <b>{game.currentBet}</b></span></div>
      <p className="offline-poker-help">用实体纸牌发每人 2 张底牌，依次翻开 3 张、1 张、1 张公共牌。这里只管理虚拟筹码；每步自动保存，刷新可恢复。返回首页后可继续。</p>
      <div className="offline-poker-seats">{game.seats.map((seat, index) => <div className={`offline-poker-seat ${index === game.current ? 'turn' : ''} ${seat.folded ? 'folded' : ''}`} key={seat.id}>
        <div><input aria-label={`座位${index + 1}昵称`} value={seat.name} onChange={(event) => rename(seat.id, event.target.value)} /><small>{index === game.dealer ? '庄家' : `座位 ${index + 1}`}{seat.folded ? ' · 已弃牌/离桌' : seat.stack === 0 && game.street !== 'settled' ? ' · 全押' : ''}</small></div>
        <strong>{seat.stack} <small>筹码</small></strong><span>本街 {seat.bet} · 本局 {seat.contributed}</span>
      </div>)}</div>
      {!session.completed && game.street !== 'showdown' && game.street !== 'settled' && player && <div className="offline-poker-controls"><h2>轮到 {player.name}</h2><p>{labels[game.street]} · 需跟注 {Math.min(call, player.stack)} · 当前筹码 {player.stack}</p><div className="offline-poker-buttons"><button className="text-button danger" onClick={() => act('fold')}>弃牌</button><button className="secondary-button" onClick={() => act(call ? 'call' : 'check')}>{call ? `跟注 ${Math.min(call, player.stack)}` : '过牌'}</button><label className="raise-control"><button type="button" onClick={() => setRaise(String(Math.max(10, (Number(raise) || 10) - 10)))} aria-label="减少加注"><Minus size={15} /></button><input type="number" min="10" inputMode="numeric" aria-label="线下加注额" value={raise} onChange={(event) => setRaise(event.target.value)} /><button type="button" onClick={() => setRaise(String((Number(raise) || 0) + 10))} aria-label="增加加注"><Plus size={15} /></button></label><button className="primary-button" disabled={!canRaise} onClick={() => act('raise')}>加注 {canRaise ? raise : ''}</button><button className="allin-button" onClick={() => act('allin')}>全押 {player.stack}</button></div><small>加注金额是在跟注之外增加的筹码，至少 10。</small></div>}
      {!session.completed && game.street !== 'showdown' && game.street !== 'settled' && !player && <div className="offline-poker-controls"><h2>等待实体牌发完</h2><p>玩家已经全押，请发完公共牌后继续，直到河牌摊牌。</p><button className="primary-button" onClick={() => changeGame((value) => ({ ...value, poker: advancePokerStreet(value.poker) }))}>{game.street === 'river' ? '进入摊牌' : '下一阶段'}</button></div>}
      {!session.completed && game.street === 'showdown' && <div className="offline-poker-controls"><h2>实体牌摊牌</h2><p>比较牌型，为每个底池选择获胜者；平手可选多人平分。</p>{pots.map((pot, index) => <fieldset className="offline-pot-choice" key={index}><legend>{index ? `边池 ${index}` : '主池'} · {pot.amount} 筹码</legend>{pot.eligible.map((id) => <label key={id}><input type="checkbox" checked={pot.eligible.length === 1 || Boolean(choices[index]?.includes(id))} disabled={pot.eligible.length === 1} onChange={() => toggleWinner(index, id)} />{game.seats.find((seat) => seat.id === id)?.name}</label>)}</fieldset>)}<button className="primary-button" disabled={pots.some((pot, index) => pot.eligible.length > 1 && !choices[index]?.length)} onClick={settle}>确认分配底池</button></div>}
      {game.street === 'settled' && <div className="offline-poker-controls"><h2>{session.completed ? '本轮完成' : '本局结算'}</h2><p>{game.winners.length ? `获胜：${game.winners.map((id) => game.seats.find((seat) => seat.id === id)?.name).join('、')}` : '筹码不足两人，牌局结束'}。筹码已计入各玩家余额。</p><div className="offline-poker-results">{game.seats.map((seat) => <span key={seat.id}>{seat.name} <b>{seat.stack}（{seat.stack - 1000 >= 0 ? '+' : ''}{seat.stack - 1000}）</b></span>)}</div>{!session.completed && <button className="primary-button" onClick={nextHand}><RotateCcw size={17} />{session.round >= session.matchRounds || game.seats.filter((seat) => seat.stack > 0).length < 2 ? '查看本轮总成绩' : '下一局 · 庄家轮换'}</button>}</div>}
    </section>
    {showRules && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowRules(false)}><section className="modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><header><h2>线下德州怎么用</h2><button className="icon-button" onClick={() => setShowRules(false)} aria-label="关闭">×</button></header><p>每人初始 1000 娱乐筹码；庄家轮换，小盲 10、大盲 20 自动扣除。请用实体牌发牌，依屏幕阶段操作下注。摊牌时在每个底池勾选赢家，平手勾选多人；手机自动分配筹码。这里不生成或记录纸牌。</p></section></div>}
  </main>;
}
