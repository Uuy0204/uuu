'use client';
import { useState } from 'react';
import { calculateScores, pointUnit } from '@/lib/scoring';
import type { GameId } from '@/lib/types';

export function OfflineScoreControls({ gameId, players, variant = 'solo', onApply }: { gameId: GameId; players: { id: string; name: string }[]; variant?: 'solo' | 'team'; onApply: (scores: Record<string, number>) => void }) {
  const [multiplier, setMultiplier] = useState('1');
  const [winner, setWinner] = useState('');
  const [landlord, setLandlord] = useState(players[0]!.id);
  const [rankings, setRankings] = useState<string[]>(players.map(() => ''));
  const ids = players.map((p) => p.id);
  const rankingGame = gameId === 'paodekuai' || gameId === 'zhengshangyou';
  const valid = /^\d+$/.test(multiplier) && Number(multiplier) >= 1 && Number(multiplier) <= 256 && (rankingGame ? rankings.every((id) => ids.includes(id)) && new Set(rankings).size === ids.length : ids.includes(winner));
  const winners = gameId === 'doudizhu4' && variant === 'team' ? ids.filter((_, index) => index % 2 === ids.indexOf(winner) % 2) : [winner];
  const scores = valid ? calculateScores(gameId, ids, winners, Number(multiplier), { landlordId: landlord, variant, rankings }) : {};
  const options = <><option value="">请选择</option>{players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</>;
  return <section className="offline-score-tool"><h3>本局自动记分</h3><p>填好结果，一次算清所有人的娱乐积分。每份积分最高 10；赢家收到多份时合计可超过 10。</p><div className="score-form">
    <label>最终倍率<input aria-label="线下最终倍率" type="number" inputMode="numeric" min="1" max="256" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} /></label>
    {gameId === 'doudizhu3' && <label>本局地主<select aria-label="本局地主" value={landlord} onChange={(e) => setLandlord(e.target.value)}>{players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    {rankingGame ? rankings.map((id, index) => <label key={index}>第 {index + 1} 名<select aria-label={`第${index + 1}名`} value={id} onChange={(e) => setRankings((current) => current.map((value, i) => i === index ? e.target.value : value))}>{options}</select></label>) : <label>{variant === 'team' ? '获胜队员（对角同队）' : '本局先出完的玩家'}<select aria-label="本局赢家" value={winner} onChange={(e) => setWinner(e.target.value)}>{options}</select></label>}
    </div>{valid && <div className="score-preview">{players.map((p) => <span key={p.id}>{p.name}<b>{(scores[p.id] ?? 0) > 0 ? '+' : ''}{scores[p.id]}</b></span>)}</div>}
    <button className="primary-button" disabled={!valid} onClick={() => onApply(scores)}>应用本局积分</button><small>当前每份 {pointUnit(Number(multiplier) || 1)} 分{rankingGame ? '；排名分每人绝对值最多 10' : ''}，应用后可撤销。</small></section>;
}
