// Pure rules shared with the browser's physical-card scorekeeper. All amounts
// are entertainment points; a transfer is capped at 10, not a cash balance.
export const POINT_CAP = 10;
export const pointUnit = (multiplier = 1) => Math.min(POINT_CAP, Math.max(0.1, Math.round(Math.min(256, Math.max(1, multiplier)) * 1) / 10));
export interface ScoreOptions { landlordId?: string; variant?: 'solo' | 'team'; rankings?: string[] }
export function calculateScores(gameId: string, ids: string[], winners: string[], multiplier = 1, options: ScoreOptions = {}): Record<string, number> {
  const unit = pointUnit(multiplier);
  const round = (value: number) => Number(value.toFixed(1));
  if (!ids.length) return {};
  if (gameId === 'doudizhu3') {
    const landlord = options.landlordId ?? ids[0]!;
    const landlordWon = winners.includes(landlord);
    return Object.fromEntries(ids.map((id) => [id, round((id === landlord ? 2 : 1) * unit * ((id === landlord) === landlordWon ? 1 : -1))]));
  }
  if (gameId === 'paodekuai' || gameId === 'zhengshangyou') {
    const rankings = options.rankings ?? [...winners, ...ids.filter((id) => !winners.includes(id))];
    return Object.fromEntries(rankings.map((id, index) => {
      const raw = (ids.length - 1 - index * 2) * unit;
      return [id, round(Math.sign(raw) * Math.min(POINT_CAP, Math.abs(raw)))];
    }));
  }
  const winning = ids.filter((id) => winners.includes(id));
  if (!winning.length) return Object.fromEntries(ids.map((id) => [id, 0]));
  if (gameId === 'doudizhu4' && options.variant === 'team') {
    return Object.fromEntries(ids.map((id) => [id, winning.includes(id) ? unit : -unit]));
  }
  const loss = gameId === 'liarsbar' ? 0.1 : unit;
  const reward = round((ids.length - winning.length) * loss / winning.length);
  return Object.fromEntries(ids.map((id) => [id, winning.includes(id) ? reward : -loss]));
}
