export type GameId = 'doudizhu3' | 'doudizhu4' | 'fishing' | 'paodekuai' | 'zhengshangyou' | 'poker' | 'liarsbar';
export interface Card { id: string; rank: string; suit: 'S' | 'H' | 'C' | 'D' | 'J'; value: number }
export interface Player { id: string; name: string; avatar: number; connected: boolean; bot?: boolean; seat?: number }
export interface ClientGame {
  gameId: GameId;
  phase: string;
  turn: number;
  hand: Card[];
  handCounts: Record<string, number>;
  message: string;
  turnDeadline?: number;
  winnerIds?: string[];
  scores?: Record<string, number>;
  current?: { playerId: string; cards: Card[]; combo: { kind: string; value: number; length: number } } | null;
  bottom?: Card[];
  landlordId?: string | null;
  multiplier?: number;
  bids?: Record<string, boolean | number>;
  bidCount?: number;
  highestBid?: number;
  highestBidder?: string | null;
  doubles?: Record<string, boolean>;
  variant?: 'solo' | 'team';
  passes?: number;
  plays?: Record<string, number>;
  allowed?: string[];
  suggestion?: string[];
  table?: Card[];
  captured?: Record<string, Card[]>;
  catches?: Record<string, number>;
  turnCount?: number;
  rankings?: string[];
  community?: Card[];
  pot?: number;
  stacks?: Record<string, number>;
  bets?: Record<string, number>;
  currentBet?: number;
  contributions?: Record<string, number>;
  pots?: number[];
  showdownHands?: Record<string, Card[]>;
  handRank?: string;
  dealer?: number;
  acted?: string[];
  folded?: string[];
  eliminated?: string[];
  targetRank?: 'A' | 'K' | 'Q';
  roundNumber?: number;
  tableCount?: number;
  lastClaim?: { playerId: string; count: number } | null;
  lastReveal?: { cards: Card[]; liar: boolean; loserId: string; hit: boolean } | null;
  shots?: Record<string, number>;
  bulletCount?: number;
}
export interface ClientRoom {
  code: string;
  hostId: string;
  gameId: GameId;
  players: Player[];
  status: 'lobby' | 'playing' | 'finished';
  game: ClientGame | null;
  round: number;
  matchScores?: Record<string, number>;
  targetPlayers: number;
  options: Record<string, number | string | boolean>;
  createdAt: number;
  messages: ChatMessage[];
}
export interface ChatMessage { id: string; playerId: string; name: string; text: string; at: number }
export interface HistoryItem { key: string; at: number; gameId: GameId; score: number; result: string }

export const GAME_INFO: Record<GameId, { name: string; short: string; players: string; min: number; max: number; tone: string }> = {
  doudizhu3: { name: '三人斗地主', short: '经典地主对农民', players: '3 人', min: 3, max: 3, tone: 'red' },
  doudizhu4: { name: '四人斗地主', short: '双副牌，可混战或组队', players: '4 人', min: 4, max: 4, tone: 'navy' },
  poker: { name: '德州扑克', short: '1000 娱乐筹码', players: '2-6 人', min: 2, max: 6, tone: 'emerald' },
  paodekuai: { name: '跑得快', short: '有牌必出，抢先清手', players: '3-4 人', min: 3, max: 4, tone: 'jade' },
  zhengshangyou: { name: '争上游', short: '全副牌争先，逐位登榜', players: '3-4 人', min: 3, max: 4, tone: 'festival' },
  fishing: { name: '小猫钓鱼', short: '同点钓牌，坚持到最后', players: '2-4 人', min: 2, max: 4, tone: 'pastel' },
  liarsbar: { name: '骗子酒馆', short: '暗牌博弈，识破谎言', players: '2-4 人', min: 2, max: 4, tone: 'tavern' },
};
