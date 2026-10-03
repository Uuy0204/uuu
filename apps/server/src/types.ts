export type GameId = 'doudizhu3' | 'doudizhu4' | 'fishing' | 'paodekuai' | 'zhengshangyou' | 'poker' | 'liarsbar';

export interface Player {
  id: string;
  name: string;
  avatar: number;
  connected: boolean;
  bot?: boolean;
  seat?: number;
}

export interface Card {
  id: string;
  rank: string;
  suit: 'S' | 'H' | 'C' | 'D' | 'J';
  value: number;
}

export interface BaseGame {
  gameId: GameId;
  phase: string;
  turn: number;
  hands: Record<string, Card[]>;
  message: string;
  turnDeadline?: number;
  turnDuration?: number;
  winnerIds?: string[];
  scores?: Record<string, number>;
}

export interface Room {
  code: string;
  hostId: string;
  gameId: GameId;
  players: Player[];
  status: 'lobby' | 'playing' | 'finished';
  game: BaseGame | null;
  round: number;
  matchScores: Record<string, number>;
  scoredRound: number;
  targetPlayers: number;
  options: Record<string, number | string | boolean>;
  createdAt: number;
  messages: ChatMessage[];
}

export interface ChatMessage { id: string; playerId: string; name: string; text: string; at: number }

export type GameAction =
  | { type: 'bid'; value: boolean | number }
  | { type: 'double'; value: boolean }
  | { type: 'play'; cardIds: string[] }
  | { type: 'pass' }
  | { type: 'draw' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; amount: number }
  | { type: 'allin' }
  | { type: 'fold' }
  | { type: 'challenge' }
  | { type: 'accept' };

export interface ClientGame extends Omit<BaseGame, 'hands'> {
  hand: Card[];
  handCounts: Record<string, number>;
  [key: string]: unknown;
}

export interface ClientRoom extends Omit<Room, 'game'> {
  game: ClientGame | null;
}

export interface GameModule {
  minPlayers: number;
  maxPlayers: number;
  create(players: Player[], options?: Record<string, number | string | boolean>): BaseGame;
  action(state: BaseGame, players: Player[], playerId: string, action: GameAction): void;
  view(state: BaseGame, playerId: string): ClientGame;
  botAction(state: BaseGame, players: Player[], playerId: string): GameAction | null;
}
