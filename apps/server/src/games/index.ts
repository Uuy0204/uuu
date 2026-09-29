import type { GameId, GameModule } from '../types.js';
import { doudizhu3 } from './doudizhu3.js';
import { doudizhu4 } from './doudizhu4.js';
import { fishing } from './fishing.js';
import { paodekuai, zhengshangyou } from './climbing.js';
import { poker } from './poker.js';
import { liarsbar } from './liarsbar.js';

export const games: Record<GameId, GameModule> = {
  doudizhu3,
  doudizhu4,
  fishing,
  paodekuai,
  zhengshangyou,
  poker,
  liarsbar,
};

export const gameNames: Record<GameId, string> = {
  doudizhu3: '三人斗地主',
  doudizhu4: '四人斗地主',
  fishing: '小猫钓鱼',
  paodekuai: '跑得快',
  zhengshangyou: '争上游',
  poker: '德州扑克',
  liarsbar: '骗子酒馆',
};
