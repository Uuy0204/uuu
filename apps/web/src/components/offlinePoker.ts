export type PokerStreet = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'settled';
export interface PokerSeat { id: string; name: string; stack: number; contributed: number; bet: number; folded: boolean; acted: boolean }
export interface PokerPot { amount: number; eligible: string[] }
export interface OfflinePokerState {
  seats: PokerSeat[];
  dealer: number;
  current: number;
  street: PokerStreet;
  currentBet: number;
  winners: string[];
}

const order = ['preflop', 'flop', 'turn', 'river'] as const;
const nextSeat = (seats: PokerSeat[], from: number, eligible: (seat: PokerSeat) => boolean) => {
  for (let offset = 1; offset <= seats.length; offset += 1) {
    const index = (from + offset) % seats.length;
    if (eligible(seats[index]!)) return index;
  }
  return -1;
};
const live = (seat: PokerSeat) => !seat.folded && seat.stack > 0;
export const pokerPot = (state: OfflinePokerState) => state.seats.reduce((sum, seat) => sum + seat.contributed, 0);

export function pokerPots(state: OfflinePokerState): PokerPot[] {
  const levels = [...new Set(state.seats.map((seat) => seat.contributed).filter((amount) => amount > 0))].sort((a, b) => a - b);
  let previous = 0;
  return levels.map((level) => {
    const participants = state.seats.filter((seat) => seat.contributed >= level);
    const pot = { amount: (level - previous) * participants.length, eligible: participants.filter((seat) => !seat.folded).map((seat) => seat.id) };
    previous = level;
    return pot;
  }).filter((pot) => pot.amount > 0);
}

export function startPokerHand(seats: PokerSeat[], dealer: number): OfflinePokerState {
  const ready = seats.map((seat) => ({ ...seat, contributed: 0, bet: 0, folded: seat.stack === 0, acted: false }));
  if (ready.filter(live).length < 2) return { seats: ready, dealer, current: -1, street: 'settled', currentBet: 0, winners: [] };
  const small = ready.filter(live).length === 2 ? dealer : nextSeat(ready, dealer, live);
  const big = nextSeat(ready, small, live);
  const placeBlind = (index: number, amount: number) => {
    const seat = ready[index]!;
    const paid = Math.min(seat.stack, amount);
    ready[index] = { ...seat, stack: seat.stack - paid, bet: paid, contributed: paid };
  };
  placeBlind(small, 10);
  placeBlind(big, 20);
  const state: OfflinePokerState = { seats: ready, dealer, current: nextSeat(ready, big, live), street: 'preflop', currentBet: ready[big]!.bet, winners: [] };
  return state;
}

export function createOfflinePoker(players: { id: string; name: string }[], dealer: number): OfflinePokerState {
  return startPokerHand(players.map((player) => ({ ...player, stack: 1000, contributed: 0, bet: 0, folded: false, acted: false })), dealer);
}

export function pokerAction(state: OfflinePokerState, type: 'fold' | 'check' | 'call' | 'raise' | 'allin', raise = 0): OfflinePokerState {
  if (!order.includes(state.street as typeof order[number]) || state.current < 0) return state;
  const seats = state.seats.map((seat) => ({ ...seat }));
  const player = seats[state.current]!;
  if (!live(player)) return state;
  const call = Math.max(0, state.currentBet - player.bet);
  if (type === 'check' && call > 0) return state;
  if (type === 'raise' && (!Number.isSafeInteger(raise) || raise < 10 || call + raise > player.stack)) return state;
  const paid = type === 'allin' ? player.stack : type === 'raise' ? call + raise : type === 'call' ? Math.min(call, player.stack) : 0;
  if (type === 'fold') player.folded = true;
  player.stack -= paid;
  player.bet += paid;
  player.contributed += paid;
  player.acted = true;
  const currentBet = Math.max(state.currentBet, player.bet);
  if (currentBet > state.currentBet) seats.forEach((seat, index) => { if (index !== state.current && live(seat)) seat.acted = false; });
  const remaining = seats.filter((seat) => !seat.folded);
  if (remaining.length === 1) {
    remaining[0]!.stack += seats.reduce((sum, seat) => sum + seat.contributed, 0);
    return { ...state, seats, street: 'settled', current: -1, currentBet, winners: [remaining[0]!.id] };
  }
  const active = seats.filter(live);
  const closed = active.every((seat) => seat.acted && seat.bet === currentBet);
  if (closed) {
    const nextStreet = order.indexOf(state.street as typeof order[number]) + 1;
    if (nextStreet >= order.length) return { ...state, seats, street: 'showdown', current: -1, currentBet, winners: [] };
    seats.forEach((seat) => { seat.bet = 0; seat.acted = false; });
    return { ...state, seats, street: order[nextStreet]!, currentBet: 0, current: active.length <= 1 ? -1 : nextSeat(seats, state.dealer, live), winners: [] };
  }
  return { ...state, seats, street: state.street, currentBet, current: nextSeat(seats, state.current, live), winners: [] };
}

export function advancePokerStreet(state: OfflinePokerState): OfflinePokerState {
  if (state.current !== -1 || !order.includes(state.street as typeof order[number]) || state.seats.filter((seat) => !seat.folded).length < 2) return state;
  const next = order.indexOf(state.street as typeof order[number]) + 1;
  return { ...state, street: next >= order.length ? 'showdown' : order[next]!, currentBet: 0, seats: state.seats.map((seat) => ({ ...seat, bet: 0 })) };
}

export function settlePoker(state: OfflinePokerState, choices: string[][]): OfflinePokerState {
  if (state.street !== 'showdown') return state;
  const pots = pokerPots(state);
  if (pots.some((pot, index) => !choices[index]?.length || choices[index]!.some((id) => !pot.eligible.includes(id)))) return state;
  const seats = state.seats.map((seat) => ({ ...seat }));
  const winners = new Set<string>();
  pots.forEach((pot, index) => {
    const selected = choices[index]!;
    selected.forEach((id, winnerIndex) => {
      const seat = seats.find((candidate) => candidate.id === id)!;
      seat.stack += Math.floor(pot.amount / selected.length) + (winnerIndex < pot.amount % selected.length ? 1 : 0);
      winners.add(id);
    });
  });
  return { ...state, seats, street: 'settled', winners: [...winners] };
}

export function nextPokerHand(state: OfflinePokerState): OfflinePokerState {
  if (state.street !== 'settled') return state;
  const dealer = nextSeat(state.seats, state.dealer, (seat) => seat.stack > 0);
  return startPokerHand(state.seats, dealer);
}
