'use strict';
/** 联机冒烟测试：启动真实服务器，接入两个客户端。node test/net.test.js */
const { spawn } = require('child_process');
const WebSocket = require('ws');
const assert = require('assert');

const PORT = 3999;
const srv = spawn('node', [__dirname + '/../server/index.js'], {
  env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'inherit'],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(name) {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const c = { ws, name, init: null, state: null, self: null, chats: [], logs: [] };
  ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name })));
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'init') c.init = m;
    if (m.t === 'state') c.state = m;
    if (m.t === 'self') c.self = m;
    if (m.t === 'chat') c.chats.push(m);
    if (m.t === 'log') c.logs.push(...m.lines);
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  return c;
}

(async () => {
  await sleep(600);
  const a = client('阿岚');
  const b = client('小狐');
  await sleep(800);

  let pass = 0;
  const t = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.error('  ✗', n, '\n   ', e.message); process.exitCode = 1; } };

  t('两个客户端都收到 init（地图 / NPC / 塔）', () => {
    assert.ok(a.init && b.init);
    assert.strictEqual(a.init.map.length, a.init.mw * a.init.mh);
    assert.ok(a.init.npcs.length >= 3 && a.init.towers.length === 3);
  });

  t('互相能在快照里看到对方', () => {
    const names = a.state.players.map((p) => p.n);
    assert.ok(names.includes('小狐'), '阿岚应看到小狐，实际 ' + names);
  });

  t('快照里有怪物', () => assert.ok(a.state.mobs.length > 0));

  // 移动
  a.send({ t: 'input', right: 1 });
  const x0 = a.state.players.find((p) => p.n === '阿岚').x;
  await sleep(600);
  a.send({ t: 'input' });
  await sleep(200);
  t('按住方向键后角色位置改变', () => {
    const x1 = a.state.players.find((p) => p.n === '阿岚').x;
    assert.ok(x1 > x0, `应向右移动 ${x0} -> ${x1}`);
  });

  // 对话与接任务
  a.send({ t: 'interact' });
  await sleep(200);
  a.send({ t: 'quest', id: 'q1_awaken', action: 'accept' });
  await sleep(300);
  t('可以接取第一个任务并出现在任务列表', () => {
    assert.ok(a.self.quests.some((q) => q.id === 'q1_awaken'), '任务列表：' + JSON.stringify(a.self.quests));
  });

  // 聊天广播
  a.send({ t: 'chat', text: '塔亮了吗' });
  await sleep(300);
  t('聊天广播给所有人', () => {
    assert.ok(b.chats.some((c) => c.text === '塔亮了吗' && c.name === '阿岚'));
  });

  // 断线清理
  b.ws.close();
  await sleep(400);
  t('玩家断线后从世界里移除', () => {
    assert.ok(!a.state.players.some((p) => p.n === '小狐'));
  });

  console.log(`\n联机测试通过 ${pass} 项\n`);
  a.ws.close();
  srv.kill();
  process.exit(process.exitCode || 0);
})();
