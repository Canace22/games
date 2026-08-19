'use strict';
/**
 * 世界观与静态配置（原创设定，塞尔达式结构）
 * 大陆：提亚兰。守望者从长眠中醒来，光之巫女塞莉恩已被蚀王卡兰索封印，
 * 三座守望塔被腐蚀之影侵蚀。玩家要集齐「风之刃」碎片，逐塔点亮，最终推开王座之门。
 */

const LORE = {
  world: '提亚兰',
  hero: '守望者',
  villain: '蚀王 · 卡兰索',
  oracle: '光之巫女 · 塞莉恩',
  intro:
    '你在苔藓覆盖的石棺里醒来。天空是铁灰色的，远处三座守望塔黯淡无光。' +
    '一个声音在耳边说：守望者，提亚兰还剩下最后一次机会。',
};

// 章节：全服共享的世界进度
const CHAPTERS = [
  { id: 0, title: '第一章 · 苔原苏醒', desc: '守望者醒来，重拾锈剑，清理营地周围的腐蚀兽。' },
  { id: 1, title: '第二章 · 风之刃', desc: '影狼首领吞下了风之刃碎片，夺回它。' },
  { id: 2, title: '第三章 · 点亮守望塔', desc: '三座守望塔重新亮起，蚀王的封印开始松动。' },
  { id: 3, title: '终章 · 王座之门', desc: '蚀王的影身降临苔原。全服守望者，联手讨伐。' },
];

// 物品
const ITEMS = {
  rusty_sword: { id: 'rusty_sword', name: '锈剑', type: 'weapon', atk: 3, desc: '躺了一百年，还能砍。' },
  wind_blade: { id: 'wind_blade', name: '风之刃', type: 'weapon', atk: 12, desc: '刃上有风在走。' },
  leather_vest: { id: 'leather_vest', name: '皮甲', type: 'armor', def: 3, desc: '硝制得不错。' },
  shadow_pelt: { id: 'shadow_pelt', name: '腐蚀兽皮', type: 'material', desc: '摸上去发凉。' },
  blade_shard: { id: 'blade_shard', name: '风之刃碎片', type: 'quest', desc: '还在微微震动。' },
  herb: { id: 'herb', name: '苔原草药', type: 'consumable', heal: 30, desc: '回复 30 点生命。' },
  tower_core: { id: 'tower_core', name: '守望塔核心', type: 'quest', desc: '冰凉的光。' },
};

// 怪物
const MOBS = {
  shadow_boar: {
    id: 'shadow_boar', name: '腐蚀野豚', hp: 40, atk: 5, def: 1, exp: 12, speed: 46,
    aggroRange: 140, attackRange: 34, attackCd: 1200, color: '#7a5c8a',
    drops: [{ item: 'shadow_pelt', rate: 0.6 }, { item: 'herb', rate: 0.3 }],
  },
  shadow_wolf: {
    id: 'shadow_wolf', name: '影狼', hp: 65, atk: 9, def: 2, exp: 22, speed: 68,
    aggroRange: 190, attackRange: 34, attackCd: 900, color: '#4a5a8a',
    drops: [{ item: 'shadow_pelt', rate: 0.8 }, { item: 'leather_vest', rate: 0.15 }],
  },
  wolf_alpha: {
    id: 'wolf_alpha', name: '影狼首领', hp: 320, atk: 16, def: 5, exp: 150, speed: 62,
    aggroRange: 240, attackRange: 44, attackCd: 800, color: '#2f3f6f', elite: true,
    drops: [{ item: 'blade_shard', rate: 1 }, { item: 'leather_vest', rate: 0.5 }],
  },
  karanthos: {
    id: 'karanthos', name: '蚀王 · 卡兰索（影身）', hp: 2000, atk: 26, def: 10, exp: 800, speed: 55,
    aggroRange: 400, attackRange: 56, attackCd: 700, color: '#1a1020', boss: true,
    drops: [{ item: 'wind_blade', rate: 1 }],
  },
};

// NPC（位置为像素坐标）
const NPCS = [
  { id: 'elder', name: '守林长老 · 奥兰', x: 520, y: 500, color: '#c8a45c' },
  { id: 'smith', name: '铁匠 · 图恩', x: 700, y: 620, color: '#a0603a' },
  { id: 'oracle_echo', name: '巫女的回声', x: 1180, y: 380, color: '#7fd8e8' },
];

/**
 * 任务链。每个任务：目标类型 kill / collect / talk / interact
 * chapter: 完成后推进的全服章节（可选）
 */
const QUESTS = [
  {
    id: 'q1_awaken', giver: 'elder', turnIn: 'elder', name: '苔原苏醒',
    dialog: '你终于醒了，守望者。营地外全是腐蚀野豚，先替我清掉 5 只。',
    done: '你手还没抖。好，提亚兰还有救。',
    objective: { type: 'kill', target: 'shadow_boar', count: 5 },
    reward: { exp: 60, items: ['rusty_sword', 'herb', 'herb'] },
  },
  {
    id: 'q2_pelt', giver: 'smith', turnIn: 'smith', name: '铁匠的活计',
    dialog: '给我 3 张腐蚀兽皮，我给你缝件像样的甲。',
    done: '穿上吧。挨打的时候会感谢我。',
    objective: { type: 'collect', target: 'shadow_pelt', count: 3 },
    reward: { exp: 80, items: ['leather_vest'] },
    requires: 'q1_awaken',
  },
  {
    id: 'q3_shard', giver: 'elder', turnIn: 'elder', name: '风之刃碎片',
    dialog: '北边林子里的影狼首领吞了风之刃的碎片。拿回来。',
    done: '它还在震。塔认得这东西。',
    objective: { type: 'kill', target: 'wolf_alpha', count: 1 },
    reward: { exp: 200, items: ['blade_shard'] },
    requires: 'q2_pelt', chapter: 1,
  },
  {
    id: 'q4_tower', giver: 'oracle_echo', turnIn: 'oracle_echo', name: '点亮守望塔',
    dialog: '把碎片带到三座守望塔前，按 E 与塔共鸣。三座都亮起来，封印就会松动。',
    done: '塔亮了。你听见了吗？他在王座上醒了。',
    objective: { type: 'interact', target: 'tower', count: 3 },
    reward: { exp: 400, items: ['tower_core'] },
    requires: 'q3_shard', chapter: 2,
  },
  {
    id: 'q5_boss', giver: 'oracle_echo', turnIn: 'oracle_echo', name: '王座之门',
    dialog: '他的影身已经降临苔原中央。一个人打不过，去找别的守望者。',
    done: '影散了。塞莉恩的封印裂开一道缝——那是另一个故事了。',
    objective: { type: 'kill', target: 'karanthos', count: 1 },
    reward: { exp: 1000, items: ['wind_blade'] },
    requires: 'q4_tower', chapter: 3,
  },
];

// 守望塔（可交互建筑）
const TOWERS = [
  { id: 'tower_n', name: '北望塔', x: 1400, y: 260 },
  { id: 'tower_w', name: '西望塔', x: 300, y: 1100 },
  { id: 'tower_e', name: '东望塔', x: 1700, y: 1250 },
];

// 怪物刷新区
const SPAWNS = [
  { mob: 'shadow_boar', x: 900, y: 800, radius: 260, max: 8 },
  { mob: 'shadow_boar', x: 500, y: 900, radius: 200, max: 5 },
  { mob: 'shadow_wolf', x: 1450, y: 700, radius: 300, max: 6 },
  { mob: 'shadow_wolf', x: 800, y: 1400, radius: 280, max: 6 },
  { mob: 'wolf_alpha', x: 1500, y: 420, radius: 60, max: 1, respawnMs: 45000 },
];

const BOSS_SPAWN = { mob: 'karanthos', x: 1024, y: 1024 };

// 升级曲线：等级 n 所需总经验
const levelUpExp = (lv) => Math.floor(80 * Math.pow(lv, 1.6));

const PLAYER_BASE = { hp: 100, atk: 8, def: 2, speed: 130, attackRange: 46, attackCd: 500 };

module.exports = {
  LORE, CHAPTERS, ITEMS, MOBS, NPCS, QUESTS, TOWERS, SPAWNS, BOSS_SPAWN,
  levelUpExp, PLAYER_BASE,
};
