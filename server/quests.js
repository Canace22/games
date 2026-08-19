'use strict';
/** 任务系统：接取、进度、交付。纯函数为主，状态都挂在 player 上。 */

const { QUESTS, ITEMS, levelUpExp } = require('./data');

const questById = (id) => QUESTS.find((q) => q.id === id);

function addItem(player, itemId, n = 1) {
  player.inv[itemId] = (player.inv[itemId] || 0) + n;
}

function removeItem(player, itemId, n = 1) {
  if ((player.inv[itemId] || 0) < n) return false;
  player.inv[itemId] -= n;
  if (player.inv[itemId] <= 0) delete player.inv[itemId];
  return true;
}

/** 该任务当前进度数值 */
function progressOf(player, quest) {
  const o = quest.objective;
  if (o.type === 'kill') return player.kills[o.target] || 0;
  if (o.type === 'collect') return player.inv[o.target] || 0;
  if (o.type === 'interact') return (player.interacted || []).length;
  return 0;
}

function canAccept(player, quest) {
  if (player.quests[quest.id]) return false;
  if (quest.requires && player.quests[quest.requires] !== 'done') return false;
  return true;
}

function accept(player, quest) {
  if (!canAccept(player, quest)) return false;
  player.quests[quest.id] = 'active';
  // kill 类任务从接取时刻重新计数，避免历史击杀直接完成
  if (quest.objective.type === 'kill') player.kills[quest.objective.target] = 0;
  if (quest.objective.type === 'interact') player.interacted = [];
  return true;
}

function isComplete(player, quest) {
  return progressOf(player, quest) >= quest.objective.count;
}

/** 交付任务，返回日志文本数组；失败返回 null */
function turnIn(player, quest, grantExp) {
  if (player.quests[quest.id] !== 'active' || !isComplete(player, quest)) return null;
  const o = quest.objective;
  if (o.type === 'collect') removeItem(player, o.target, o.count);
  player.quests[quest.id] = 'done';

  const logs = [`【任务完成】${quest.name}`];
  const r = quest.reward || {};
  if (r.exp) logs.push(...grantExp(player, r.exp));
  (r.items || []).forEach((it) => {
    addItem(player, it);
    logs.push(`获得 ${ITEMS[it].name}`);
  });
  return logs;
}

/** 击杀事件：给所有 active 的 kill 任务计数 */
function onKill(player, mobId) {
  player.kills[mobId] = (player.kills[mobId] || 0) + 1;
}

/** NPC 身上当前可交互的任务（给出 / 可交付） */
function questsForNpc(player, npcId) {
  const out = [];
  for (const q of QUESTS) {
    const st = player.quests[q.id];
    if (q.turnIn === npcId && st === 'active' && isComplete(player, q)) {
      out.push({ id: q.id, name: q.name, text: q.done, action: 'turnin' });
    } else if (q.giver === npcId && canAccept(player, q)) {
      out.push({ id: q.id, name: q.name, text: q.dialog, action: 'accept' });
    } else if (q.turnIn === npcId && st === 'active') {
      const o = q.objective;
      out.push({
        id: q.id, name: q.name, action: 'none',
        text: `还没完成呢。（${progressOf(player, q)}/${o.count}）`,
      });
    }
  }
  return out;
}

/** 客户端要展示的任务列表 */
function questView(player) {
  return QUESTS.filter((q) => player.quests[q.id] === 'active').map((q) => ({
    id: q.id, name: q.name,
    text: describeObjective(q),
    cur: Math.min(progressOf(player, q), q.objective.count),
    max: q.objective.count,
  }));
}

function describeObjective(q) {
  const { MOBS } = require('./data');
  const o = q.objective;
  if (o.type === 'kill') return `击杀 ${MOBS[o.target].name}`;
  if (o.type === 'collect') return `收集 ${ITEMS[o.target].name}`;
  if (o.type === 'interact') return '与守望塔共鸣';
  return '';
}

module.exports = {
  questById, addItem, removeItem, progressOf, canAccept, accept,
  isComplete, turnIn, onKill, questsForNpc, questView, levelUpExp,
};
