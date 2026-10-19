'use client';
import { useState } from 'react';
import { Modal } from './Modal';
import { GAME_INFO, type ClientRoom } from '@/lib/types';

export function RoomTools({ room, playerId, busy, command }: { room: ClientRoom; playerId: string; busy: boolean; command: (event: string, payload?: unknown) => Promise<{ ok: boolean; error?: string }> }) {
  const [panel, setPanel] = useState<'invite' | 'manage' | null>(null);
  const [message, setMessage] = useState('');
  const [count, setCount] = useState(room.targetPlayers);
  const [rounds, setRounds] = useState(Number(room.options.matchRounds ?? 3));
  const [bullets, setBullets] = useState(Number(room.options.bulletCount ?? 1));
  const [variant, setVariant] = useState(String(room.options.variant ?? 'solo'));
  const open = () => { setCount(room.targetPlayers); setRounds(Number(room.options.matchRounds ?? 3)); setVariant(String(room.options.variant ?? 'solo')); setBullets(Number(room.options.bulletCount ?? 1)); setMessage(''); setPanel('manage'); };
  const invite = typeof window === 'undefined' ? '' : `${window.location.origin}/?room=${room.code}`;
  const copy = async () => { try { await navigator.clipboard.writeText(invite); setMessage('邀请链接已复制，发给朋友即可'); } catch { setMessage('可长按下方链接复制'); } };
  const apply = async () => { const result = await command('room:configure', { targetPlayers: count, matchRounds: rounds, bulletCount: bullets, variant }); if (result.ok) setPanel(null); else setMessage(result.error ?? '设置未保存'); };
  return <><div className="room-tools"><button className="text-button" onClick={() => { setPanel('invite'); setMessage(''); }}>邀请好友</button>{room.hostId === playerId && room.status === 'lobby' && <button className="text-button" onClick={open}>房间管理</button>}</div>
    {panel && <Modal title={panel === 'invite' ? '邀请好友入座' : '房间管理'} onClose={() => setPanel(null)}>{panel === 'invite' ? <div className="invite-panel"><p>朋友打开链接后，点击“加入”即可入座。房间号 <strong>{room.code}</strong></p><input aria-label="房间邀请链接" readOnly value={invite} onFocus={(e) => e.target.select()} /><button className="primary-button" onClick={() => void copy()}>复制邀请链接</button></div> : <div className="room-manage"><div className="score-form"><label>参与人数<select aria-label="修改房间人数" value={count} onChange={(e) => setCount(Number(e.target.value))}>{Array.from({ length: GAME_INFO[room.gameId].max - GAME_INFO[room.gameId].min + 1 }, (_, index) => GAME_INFO[room.gameId].min + index).map((n) => <option key={n} value={n}>{n} 人</option>)}</select></label><label>本轮局数<input aria-label="修改房间局数" type="number" min="1" max="20" value={rounds} onChange={(e) => setRounds(Number(e.target.value))} /></label>{room.gameId === 'doudizhu4' && <label>对战模式<select aria-label="修改对战模式" value={variant} onChange={(e) => setVariant(e.target.value)}><option value="solo">四人混战</option><option value="team">对角 2v2</option></select></label>}{room.gameId === 'liarsbar' && <label>每人装填<input aria-label="修改子弹数" type="number" min="1" max="6" value={bullets} onChange={(e) => setBullets(Number(e.target.value))} /></label>}</div><button className="primary-button" disabled={busy} onClick={() => void apply()}>保存房间设置</button><h3>已入座玩家</h3>{room.players.map((p) => <div className="manage-player" key={p.id}><span>{p.name}{p.bot ? ' · 机器人' : p.connected ? '' : ' · 已离线'}</span>{p.id !== room.hostId && <button className="text-button danger" disabled={busy} onClick={async () => { if (!window.confirm(`移除${p.name}？真人被移除后将不能再进入本房间。`)) return; const result = await command('room:removePlayer', { playerId: p.id }); if (!result.ok) setMessage(result.error ?? '移除失败'); }}>移除</button>}</div>)}</div>}{message && <p className="notice" role="status">{message}</p>}</Modal>}
  </>;
}
