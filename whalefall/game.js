"use strict";
  const CONFIG = {
    moveSpeed: 300,             // 左右移动的最高速度
    acceleration: 2400,        // 按住方向键时的加速度；越大越快达到最高速度
    deceleration: 3000,        // 松开方向键时的减速度；越大越快停下
    airControl: 0.8,           // 空中加减速相对地面的倍率；越小空中越难转向

    gravity: 1750,             // 上升时的重力；越大越快结束上升
    fallGravityMultiplier: 1.35, // 下落重力倍率；大于 1 让落地更干脆
    jumpSpeed: 630,            // 起跳时向上的初速度；越大跳得越高
    doubleJumpMultiplier: 1,   // 解锁后的二段跳力度，相对普通起跳的倍率
    jumpReleaseMultiplier: 0.45, // 提前松开空格时保留的上升速度比例（0～1）
    maxFallSpeed: 900,         // 最大下落速度，避免坠落越来越快
    coyoteTime: 0.1,           // 土狼时间：走出平台后仍能起跳的秒数
    jumpBufferTime: 0.1,       // 跳跃缓冲：提前按跳可等待落地的秒数

    dashSpeed: 880,            // 冲刺时的水平速度
    dashDuration: 0.15,        // 一次冲刺持续的秒数；期间暂停重力
    dashCooldown: 0.65,        // 从冲刺开始到下一次可冲刺的秒数
    dashExitSpeed: 300,        // 冲刺结束时保留的水平速度，随后正常加减速

    cameraFollow: 8,           // 摄像机追随强度；越大越紧，越小越柔和
    cameraLookAhead: 90,       // 摄像机沿朝向提前看的距离；设为 0 则居中跟随

    // 战斗：J 每按一次挥砍一次，移动与空中均可攻击。
    playerHealth: 5,           // 玩家生命格数；存档、复活时回满
    contactDamage: 1,          // 敌人碰撞和 Boss 招式每次造成的伤害
    attackDamage: 1,           // 每次挥砍的伤害
    attackRange: 64,           // 从玩家前方延伸的攻击距离
    attackHeight: 44,          // 近战判定的高度
    attackDuration: 0.14,      // 挥砍判定和线条效果持续时间
    attackCooldown: 0.3,       // 两次攻击之间的最短间隔
    hitStop: 0.05,             // 命中后双方暂停的时间
    hitFlash: 0.12,            // 敌人受击闪白时间
    shakeDuration: 0.15,       // 命中震屏持续时间
    shakeStrength: 3,          // 命中震屏最大幅度；设为 0 可关闭
    hurtInvulnerability: 1,    // 玩家受伤后的无敌时间
    hurtStun: 0.2,             // 玩家被弹开时暂时失去控制的时间
    hurtKnockbackX: 350,       // 玩家受伤时的水平弹开速度
    hurtKnockbackY: 210,       // 玩家受伤时向上弹起的速度
    enemyHealth: 3,            // 普通敌人血量；默认需要命中 3 次
    enemySpeed: 65,            // 普通敌人巡逻速度
    enemyKnockback: 250,       // 普通敌人被击退的水平速度
    enemyKnockbackFriction: 1200, // 击退后的减速；越小退得越远
    enemyKnockbackY: 130,      // 普通敌人被击退时向上的速度
    enemyStun: 0.24,           // 普通敌人受击后暂停巡逻的时间

  };



  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const dashStatus = document.getElementById("dash-status");
  const VIEW = { width: canvas.width, height: canvas.height };
  const BODY = { width: 20, height: 38 };
  const STEP = 1 / 120; // 固定物理步长，让不同刷新率的移动手感一致。

  // 每个房间使用独立的局部坐标：左上原点，x 向右，y 向下。
  // doors 给出相邻房间和门口地面的高度；走到边缘就会切换，支持原路返回。
  const ROOMS = {
    entry: {
      name: "壳灯浅滩", subtitle: "THE SHELLLIGHT SHORE", width: 1600, height: 720,
      hint: "沿壳灯向右探索。J 鸣击可以击退尸蟹；断口另一侧的微光，等你取得能力后再去。",
      doors: { right: { to: "court", floor: 600 } },
      platforms: [{ x: 0, y: 600, w: 360, h: 120 }, { x: 800, y: 600, w: 800, h: 120 }],
      signs: [{ x: 840, y: 504, text: "← 断口彼岸", sub: "浮升 + 贴流冲" }],
      items: [],
      decor: [{ id: "r1-baleen-curtain", x: 1270, y: 205, size: 430, alpha: .38 }, { id: "baleen-shrimp-swarm", x: 550, y: 385, size: 120, alpha: .55 }],
    },
    court: {
      name: "须林回廊", subtitle: "THE BALEEN GALLERY", width: 1600, height: 720,
      hint: "沿须林向右，触碰发光的浮升囊获得浮升。高处藏着一枚潮汐记忆。",
      doors: { left: { to: "entry", floor: 600 }, right: { to: "wind", floor: 450 } },
      platforms: [
        { x: 0, y: 600, w: 1060, h: 120 }, { x: 1060, y: 450, w: 540, h: 270 },
        { x: 320, y: 510, w: 180, h: 24 }, { x: 550, y: 420, w: 180, h: 24 },
        { x: 350, y: 330, w: 180, h: 24 },
      ],
      signs: [{ x: 910, y: 360, text: "浮升而上 →", sub: "按住空格 · 松开再跳" }],
      items: [
        { id: "doubleJump", kind: "ability", x: 810, y: 560, w: 30, h: 36 },
        { id: "high-corner", kind: "collectible", x: 400, y: 299, w: 22, h: 26 },
      ],
      decor: [{ id: "r1-baleen-curtain", x: 450, y: 165, size: 700, alpha: .52 }, { id: "r1-baleen-curtain", x: 1310, y: 105, size: 480, alpha: .48 }],
    },
    wind: {
      name: "潮息育窝", subtitle: "THE TIDEBREATH NEST", width: 1400, height: 760,
      hint: "登上中央骨台，寻找潮息茧。下方凹谷有另一枚记忆，也有台阶可以回来。",
      doors: { left: { to: "court", floor: 450 } },
      platforms: [
        { x: 0, y: 450, w: 400, h: 310 }, { x: 1000, y: 450, w: 400, h: 310 },
        { x: 400, y: 650, w: 600, h: 110 }, { x: 300, y: 360, w: 170, h: 24 },
        { x: 560, y: 270, w: 300, h: 24 }, { x: 900, y: 360, w: 180, h: 24 },
        { x: 520, y: 550, w: 150, h: 24 }, { x: 720, y: 460, w: 150, h: 24 },
      ],
      signs: [{ x: 690, y: 165, text: "潮息茧", sub: "新的力量，在微光里" }],
      items: [
        { id: "dash", kind: "ability", x: 750, y: 226, w: 34, h: 40 },
        { id: "deep-corner", kind: "collectible", x: 956, y: 616, w: 22, h: 28 },
      ],
      decor: [{ id: "r1-baleen-curtain", x: 340, y: 55, size: 460, alpha: .35 }, { id: "r1-baleen-curtain", x: 1200, y: 165, size: 330, alpha: .38 }],
    },
  };
  const CHECKPOINTS = {
    start: { room: "entry", x: 1060, floor: 600, name: "浅滩壳灯" },
    court: { room: "court", x: 170, floor: 600, name: "须林壳灯" },
    nest: { room: "wind", x: 135, floor: 450, name: "育窝壳灯" },
    beacon: { room: "entry", x: 145, floor: 600, name: "彼岸壳灯" },
  };
  const ENEMY_SPAWNS = {
    entry: [{ x: 1370, floor: 600, min: 1300, max: 1460 }],
    court: [{ x: 620, floor: 600, min: 550, max: 710 }, { x: 1290, floor: 450, min: 1220, max: 1410 }],
    wind: [{ x: 740, floor: 270, min: 710, max: 790 }],
  };
  const SAVE_KEY = "whalefall-shelllight-slice-v1";
  const COLLECTIBLE_IDS = ["high-corner", "deep-corner"];
  const progress = {
    abilities: { doubleJump: false, dash: false },
    checkpoint: "start", collected: new Set(), visited: new Set(["entry"]), completed: false,
  };


  const keys = new Set();
  const camera = { x: 0, y: 0 };
  const player = {};
  let jumpBuffer = 0;
  let dashRequested = false;
  let animationTime = 0;
  let accumulator = 0;
  let lastFrame = 0;
  let manualTime = false;
  let paused = false;
  let roomId = "entry";
  let deaths = 0;
  let notice = "";
  let noticeTime = 0;
  let attackRequested = false;
  let hitStopTime = 0;
  let shakeTime = 0;
  let effectClock = 0;
  let attackSerial = 0;
  let enemiesByRoom = {};
  
  
  let checkpointTouch = "";
  const currentRoom = () => ROOMS[roomId];

  function notify(message) {
    notice = message;
    noticeTime = 4;
  }

  function roomHint() {
    if (progress.completed) return "壳灯已点亮 · 这一小段旅程完成了，仍可自由探索。";
    if (progress.abilities.dash) return "回到壳灯浅滩，向左跨过断口：长按跳跃 → 再跳 → Shift 冲刺。";
    if (progress.abilities.doubleJump) return "向右穿过须林高台，在潮息育窝寻找贴流冲。";
    return currentRoom().hint;
  }

  function storageUnavailable() {
    document.getElementById("save-status").textContent = "浏览器未允许本地存储；本次游玩的存档和能力仍有效，关闭页面后不保留。";
  }

  function saveProgress() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        checkpoint: progress.checkpoint, abilities: progress.abilities,
        collected: [...progress.collected], visited: [...progress.visited],
        completed: progress.completed,
      }));
    } catch { storageUnavailable(); }
  }

  function loadProgress() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!data || typeof data !== "object") return;
      progress.completed = data.completed === true;
      if (Object.hasOwn(CHECKPOINTS, data.checkpoint)) progress.checkpoint = data.checkpoint;
      for (const ability of ["doubleJump", "dash"]) {
        progress.abilities[ability] = data.abilities?.[ability] === true;
      }
      if (Array.isArray(data.collected)) progress.collected = new Set(data.collected.filter(id => COLLECTIBLE_IDS.includes(id)));
      if (Array.isArray(data.visited)) progress.visited = new Set(data.visited.filter(id => Object.hasOwn(ROOMS, id)));
    } catch { storageUnavailable(); }
  }

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const approach = (value, target, amount) => value < target
    ? Math.min(value + amount, target) : Math.max(value - amount, target);
  const horizontalInput = () => Number(keys.has("ArrowRight") || keys.has("KeyD"))
    - Number(keys.has("ArrowLeft") || keys.has("KeyA"));

  function cameraTarget() {
    const room = currentRoom();
    return {
      x: clamp(player.x + BODY.width / 2 + player.facing * CONFIG.cameraLookAhead
        - VIEW.width / 2, 0, room.width - VIEW.width),
      y: clamp(player.y + BODY.height / 2 - VIEW.height * 0.6,
        0, room.height - VIEW.height),
    };
  }

  function reset() {
    const checkpoint = CHECKPOINTS[progress.checkpoint];
    roomId = checkpoint.room;
    progress.visited.add(roomId);
    Object.assign(player, {
      x: checkpoint.x, y: checkpoint.floor - BODY.height, vx: 0, vy: 0, facing: 1,
      grounded: true, coyote: CONFIG.coyoteTime, jumpCut: false,
      dashTime: 0, cooldown: 0, dashDirection: 1, extraJumpUsed: false,
      health: CONFIG.playerHealth, invulnerable: CONFIG.hurtInvulnerability, hurtTime: 0,
      attackTime: 0, attackCooldown: 0, attackFacing: 1,
    });
    keys.clear();
    jumpBuffer = 0;
    dashRequested = false;
    attackRequested = false;
    checkpointTouch = progress.checkpoint;
    resetCombat();
    animationTime = 0;
    accumulator = 0;
    Object.assign(camera, cameraTarget());
    draw();
  }

  function newGame() {
    progress.abilities.doubleJump = false;
    progress.abilities.dash = false;
    progress.checkpoint = "start";
    progress.completed = false;
    progress.collected.clear();
    progress.visited = new Set(["entry"]);
    deaths = 0;
    paused = false;
    saveProgress();
    reset();
    notify(roomHint());
  }

  function doorIsOpen(side) {
    const door = currentRoom().doors[side];
    return door && player.y + BODY.height > door.floor - 100
      && player.y + BODY.height <= door.floor + 8;
  }

  function changeRoom(side) {
    const source = currentRoom().doors[side];
    const relativeFeet = player.y + BODY.height - source.floor;
    roomId = source.to;
    const destination = currentRoom();
    const arrivalSide = side === "left" ? "right" : "left";
    const arrival = destination.doors[arrivalSide];
    player.x = arrivalSide === "left" ? 12 : destination.width - BODY.width - 12;
    player.y = arrival.floor - BODY.height + relativeFeet;
    player.attackTime = 0;
    attackRequested = false;
    hitStopTime = 0;
    shakeTime = 0;
    progress.visited.add(roomId);
    Object.assign(camera, cameraTarget());
    saveProgress();
    notify(roomHint());
  }

  function updateObjects() {
    const touched = Object.entries(CHECKPOINTS).find(([id, cp]) =>
      cp.room === roomId && (id !== "beacon" || progress.completed) && player.grounded
      && Math.abs(player.x + BODY.width / 2 - cp.x) < 34
      && Math.abs(player.y + BODY.height - cp.floor) < 8);
    if (touched && checkpointTouch !== touched[0]) {
      progress.checkpoint = touched[0];
      player.health = CONFIG.playerHealth;
      saveProgress();
      notify(`已存档并回满生命 · ${touched[1].name}`);
    }
    checkpointTouch = touched ? touched[0] : "";
    if (roomId === "entry" && player.x < 190 && player.grounded && progress.abilities.dash && !progress.completed) {
      progress.completed = true;
      progress.checkpoint = "beacon";
      player.health = CONFIG.playerHealth;
      saveProgress();
      notify("你点亮了断口另一侧的壳灯 · 旅程完成");
    }
    for (const item of currentRoom().items) {
      if (!overlaps(item)) continue;
      if (item.kind === "ability" && !progress.abilities[item.id]) {
        progress.abilities[item.id] = true;
        notify(item.id === "doubleJump"
          ? "获得浮升 · 空中松开空格再按一次；沿高台继续向右"
          : "获得贴流冲 · 按 Shift 冲刺；回到壳灯浅滩，跨过左侧断口");
        saveProgress();
      } else if (item.kind === "collectible" && !progress.collected.has(item.id)) {
        progress.collected.add(item.id);
        notify(`找到隐藏收集物 · ${progress.collected.size} / ${COLLECTIBLE_IDS.length}`);
        saveProgress();
      }
    }
  }

  function overlaps(platform) {
    return player.x < platform.x + platform.w && player.x + BODY.width > platform.x
      && player.y < platform.y + platform.h && player.y + BODY.height > platform.y;
  }

  function moveHorizontal(dt) {
    const distance = player.vx * dt;
    player.x += distance;
    for (const platform of currentRoom().platforms) {
      if (!overlaps(platform)) continue;
      if (distance > 0) player.x = platform.x - BODY.width;
      if (distance < 0) player.x = platform.x + platform.w;
      player.vx = 0;
      player.dashTime = 0;
    }
    const room = currentRoom();
    const bounded = clamp(player.x, doorIsOpen("left") ? -BODY.width : 0,
      doorIsOpen("right") ? room.width : room.width - BODY.width);
    if (bounded !== player.x) {
      player.vx = 0;
      player.dashTime = 0;
    }
    player.x = bounded;
  }

  function moveVertical(dt) {
    const distance = player.vy * dt;
    player.y += distance;
    player.grounded = false;
    for (const platform of currentRoom().platforms) {
      if (!overlaps(platform)) continue;
      if (distance > 0) {
        player.y = platform.y - BODY.height;
        player.grounded = true;
        player.extraJumpUsed = false;
      } else if (distance < 0) {
        player.y = platform.y + platform.h;
      }
      player.vy = 0;
    }
  }

  function tryJump() {
    if (jumpBuffer <= 0 || player.dashTime > 0 || player.hurtTime > 0) return;
    const groundJump = player.grounded || player.coyote > 0;
    if (!groundJump && (!progress.abilities.doubleJump || player.extraJumpUsed)) return;
    player.extraJumpUsed = !groundJump;
    player.vy = -CONFIG.jumpSpeed * (groundJump ? 1 : CONFIG.doubleJumpMultiplier);
    player.grounded = false;
    player.coyote = 0;
    player.jumpCut = false;
    jumpBuffer = 0;
  }



  function resetCombat() {
    enemiesByRoom = Object.fromEntries(Object.entries(ENEMY_SPAWNS).map(([id, spawns]) => [id,
      spawns.map((spawn, index) => ({ ...spawn, id: `${id}-${index}`, y: spawn.floor - 34,
        w: 44, h: 34, hp: CONFIG.enemyHealth, dir: -1, vx: 0, vy: 0,
        flash: 0, stun: 0, lastSwing: -1 })),
    ]));
    hitStopTime = 0;
    shakeTime = 0;
    attackSerial = 0;
  }

  function touches(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function playerBox() {
    return { x: player.x, y: player.y, w: BODY.width, h: BODY.height };
  }

  function attackBox() {
    return { x: player.attackFacing > 0 ? player.x + BODY.width - 2 : player.x - CONFIG.attackRange + 2,
      y: player.y + BODY.height / 2 - CONFIG.attackHeight / 2,
      w: CONFIG.attackRange, h: CONFIG.attackHeight };
  }

  function hitFeedback() {
    hitStopTime = CONFIG.hitStop;
    shakeTime = CONFIG.shakeDuration;
  }

  function die(reason) {
    deaths++;
    reset();
    notify(`${reason} · 已回到${CHECKPOINTS[progress.checkpoint].name}，能力和收集物保留`);
  }

  function hurtPlayer(sourceX) {
    if (player.invulnerable > 0) return;
    player.health = Math.max(0, player.health - CONFIG.contactDamage);
    if (player.health <= 0) { die("生命耗尽"); return; }
    player.invulnerable = CONFIG.hurtInvulnerability;
    player.hurtTime = CONFIG.hurtStun;
    player.vx = (player.x + BODY.width / 2 >= sourceX ? 1 : -1) * CONFIG.hurtKnockbackX;
    player.vy = -CONFIG.hurtKnockbackY;
    player.grounded = false;
    player.coyote = 0;
    player.dashTime = 0;
    player.attackTime = 0;
    attackRequested = false;
    hitFeedback();
  }

  function updatePlayerCombat(dt) {
    for (const timer of ["invulnerable", "hurtTime", "attackTime", "attackCooldown"]) {
      player[timer] = Math.max(0, player[timer] - dt);
    }
    if (attackRequested && player.attackCooldown <= 0 && player.hurtTime <= 0) {
      attackSerial++;
      player.attackTime = CONFIG.attackDuration;
      player.attackCooldown = CONFIG.attackCooldown;
      player.attackFacing = player.facing;
    }
    attackRequested = false;
  }

  function updateEnemies(dt) {
    for (const enemy of enemiesByRoom[roomId]) {
      if (enemy.hp <= 0) continue;
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.stun = Math.max(0, enemy.stun - dt);
      enemy.vx = enemy.stun > 0 ? approach(enemy.vx, 0, CONFIG.enemyKnockbackFriction * dt) : enemy.dir * CONFIG.enemySpeed;
      enemy.x += enemy.vx * dt;
      if (enemy.x <= enemy.min || enemy.x >= enemy.max) {
        enemy.x = clamp(enemy.x, enemy.min, enemy.max);
        enemy.dir *= -1;
        enemy.vx = 0;
      }
      enemy.vy += CONFIG.gravity * dt;
      enemy.y = Math.min(enemy.floor - enemy.h, enemy.y + enemy.vy * dt);
      if (enemy.y === enemy.floor - enemy.h) enemy.vy = 0;
    }
  }



  function resolvePlayerAttack() {
    if (player.attackTime <= 0) return;
    const box = attackBox();
    for (const enemy of enemiesByRoom[roomId]) {
      if (enemy.hp <= 0 || enemy.lastSwing === attackSerial || !touches(box, enemy)) continue;
      enemy.hp = Math.max(0, enemy.hp - CONFIG.attackDamage);
      enemy.lastSwing = attackSerial;
      enemy.flash = CONFIG.hitFlash;
      enemy.stun = CONFIG.enemyStun;
      enemy.vx = player.attackFacing * CONFIG.enemyKnockback;
      enemy.vy = -CONFIG.enemyKnockbackY;
      hitFeedback();
    }
  }

  function updateCombat(dt) {
    updateEnemies(dt);
    resolvePlayerAttack();
    for (const enemy of enemiesByRoom[roomId]) {
      if (enemy.hp > 0 && enemy.stun <= 0 && touches(playerBox(), enemy)) hurtPlayer(enemy.x + enemy.w / 2);
    }
  }

  function update(dt) {
    effectClock += dt;
    shakeTime = Math.max(0, shakeTime - dt);
    if (hitStopTime > 0) { hitStopTime = Math.max(0, hitStopTime - dt); return; }
    animationTime += dt;
    noticeTime = Math.max(0, noticeTime - dt);
    player.cooldown = Math.max(0, player.cooldown - dt);
    player.coyote = player.grounded ? CONFIG.coyoteTime : Math.max(0, player.coyote - dt);
    const direction = horizontalInput();
    if (direction && player.dashTime <= 0) player.facing = direction;
    updatePlayerCombat(dt);

    tryJump();
    if (dashRequested && !progress.abilities.dash) notify("贴流冲尚未取得 · 前往潮息育窝寻找发光的潮息茧");
    if (dashRequested && progress.abilities.dash && player.cooldown <= 0 && player.dashTime <= 0 && player.hurtTime <= 0) {
      player.dashDirection = direction || player.facing;
      player.facing = player.dashDirection;
      player.dashTime = CONFIG.dashDuration;
      player.cooldown = CONFIG.dashCooldown;
      player.vy = 0;
    }
    dashRequested = false;

    if (player.dashTime > 0) {
      player.vx = player.dashDirection * CONFIG.dashSpeed;
      player.dashTime = Math.max(0, player.dashTime - dt);
      moveHorizontal(dt);
      // 水平冲刺不做垂直位移，但要更新脚下支撑，避免离台后还算站在地面。
      player.grounded = currentRoom().platforms.some(p => player.x < p.x + p.w
        && player.x + BODY.width > p.x && Math.abs(player.y + BODY.height - p.y) < 0.01);
      if (player.grounded) player.extraJumpUsed = false;
      if (player.dashTime <= 0 && player.vx !== 0) {
        player.vx = player.dashDirection * CONFIG.dashExitSpeed;
      }
    } else {
      const control = player.grounded ? 1 : CONFIG.airControl;
      const acceleration = direction ? CONFIG.acceleration : CONFIG.deceleration;
      if (player.hurtTime <= 0) player.vx = approach(player.vx, direction * CONFIG.moveSpeed, acceleration * control * dt);
      // 松开空格只削减一次上升速度；长按则保留完整的上升过程。
      if (!keys.has("Space") && player.vy < 0 && !player.jumpCut && player.hurtTime <= 0) {
        player.vy *= CONFIG.jumpReleaseMultiplier;
        player.jumpCut = true;
      }
      const gravity = CONFIG.gravity * (player.vy > 0 ? CONFIG.fallGravityMultiplier : 1);
      player.vy = Math.min(player.vy + gravity * dt, CONFIG.maxFallSpeed);
      moveHorizontal(dt);
      moveVertical(dt);
      // 落地当帧消费缓冲，短按后已松开也能触发。
      if (player.grounded) tryJump();
    }

    jumpBuffer = Math.max(0, jumpBuffer - dt);
    if (player.y > currentRoom().height + 60) {
      die("坠落");
      return;
    }
    if (player.x < 0 && doorIsOpen("left")) changeRoom("left");
    else if (player.x + BODY.width > currentRoom().width && doorIsOpen("right")) changeRoom("right");
    updateObjects();
    updateCombat(dt);
    const target = cameraTarget();
    const blend = 1 - Math.exp(-CONFIG.cameraFollow * dt);
    camera.x += (target.x - camera.x) * blend;
    camera.y += (target.y - camera.y) * blend;
  }

  const images = new Map();
  let assetsReady = false;

  async function loadArt() {
    let loaded = 0;
    await Promise.all(Object.entries(ART).map(async ([id, art]) => {
      const img = new Image();
      img.src = art.file;
      await img.decode();
      images.set(id, img);
      document.getElementById("load-detail").textContent = `正在点亮壳灯 · ${++loaded} / ${Object.keys(ART).length}`;
    }));
    assetsReady = true;
    document.getElementById("loading").hidden = true;
  }

  function showLoadError(error) {
    document.getElementById("load-detail").textContent = "有一张素材没有读到，请保持 assets 文件夹完整后刷新。";
    document.getElementById("retry").hidden = false;
    console.error("素材加载失败", error);
  }

  // All artwork keeps its aspect ratio. Bounding boxes remove transparent padding;
  // character poses share the existing 384×288 source canvas and foot anchor.
  function sprite(id, x, feet, size, alpha = 1, flip = false, anchor = "bottom") {
    const img = images.get(id);
    if (!img) return;
    const [l, t, r, b] = ART[id].bbox;
    const h = (b - t) * size / (r - l);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, feet);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, l, t, r - l, b - t, -size / 2, anchor === "top" ? 0 : -h, size, h);
    ctx.restore();
  }

  function drawBackground() {
    const img = images.get("depth");
    if (!img) return;
    const w = 1140, h = w * img.height / img.width;
    ctx.drawImage(img, -65 - camera.x * .12, -10 - camera.y * .10, w, h);
    ctx.save();
    ctx.globalAlpha = .37;
    ctx.drawImage(images.get("r1-oral-far-layer"), -90 - camera.x * .24, -25 - camera.y * .16, 1260, 710);
    ctx.restore();
    const veil = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    veil.addColorStop(0, "rgba(5,18,25,.38)");
    veil.addColorStop(.48, "rgba(5,18,25,.06)");
    veil.addColorStop(1, "rgba(5,18,25,.48)");
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function drawTerrain(p) {
    if (p.x + p.w < camera.x - 100 || p.x > camera.x + VIEW.width + 100) return;
    // Each deep bank uses complete 2D arch supports; no stretched side textures.
    if (p.h > 40) {
      const supportWidth = Math.max(330, (p.h + 80) * 1536 / (1024 - 245));
      const supportTop = p.y - 245 * supportWidth / 1536;
      for (let x = p.x; x < p.x + p.w; x += supportWidth - 20) {
        ctx.save();
        ctx.beginPath(); ctx.rect(p.x, p.y + 12, p.w, p.h + 160); ctx.clip();
        sprite("foundation", x + supportWidth / 2, supportTop, supportWidth, .95, false, "top");
        ctx.restore();
      }
    }
    // Repeat a whole shelf at one fixed scale, clipping the last piece at its edge.
    const tileCount = Math.ceil(p.w / 400);
    const tileWidth = (p.w + 5 * (tileCount - 1)) / tileCount;
    ctx.save();
    ctx.beginPath();ctx.rect(p.x, p.y - 20, p.w, 180);ctx.clip();
    const shelf = ART["r1-tongue-ledge"];
    const surfaceOffset = (shelf.pivot[1] - shelf.bbox[1]) * tileWidth / (shelf.bbox[2] - shelf.bbox[0]);
    for (let x = p.x; x < p.x + p.w; x += tileWidth - 5) {
      sprite("r1-tongue-ledge", x + tileWidth / 2, p.y - surfaceOffset - 1, tileWidth, 1, false, "top");
    }
    ctx.restore();
    if (p.h <= 40 && p.w >= 170) {
      sprite("r1-hanging-root", p.x + p.w / 2, p.y + 10, Math.min(p.w * .7, 150), .75, false, "top");
    }
  }

  function drawPlayer() {
    let pose = "idle_0";
    if (player.hurtTime > 0) pose = "hit_0";
    else if (player.dashTime > 0) pose = "dash_0";
    else if (player.attackTime > 0) pose = `attack_${Math.min(2, Math.floor((1 - player.attackTime / CONFIG.attackDuration) * 3))}`;
    else if (!player.grounded) pose = "jump_0";
    else if (Math.abs(player.vx) > 15) pose = `run_${Math.floor(animationTime * 9) % 2}`;
    const img = images.get("hero-" + pose);
    const scale = 54 / 236;
    const alpha = player.invulnerable > 0 && Math.floor(player.invulnerable * 14) % 2 === 0 ? .5 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(player.x + BODY.width / 2, player.y + BODY.height + 1);
    ctx.scale(player.facing, 1);
    if (player.dashTime > 0) sprite("fx-dash-trail", -50, -2, 120, .65);
    ctx.drawImage(img, -192 * scale, -270 * scale, 384 * scale, 288 * scale);
    ctx.restore();
  }

  function drawAttack() {
    if (player.attackTime <= 0) return;
    const box = attackBox();
    sprite("fx-short-swipe", box.x + box.w / 2, box.y + box.h + 7, 78,
      Math.min(1, player.attackTime / .045), player.attackFacing < 0);
  }

  function drawCombat() {
    for (const enemy of enemiesByRoom[roomId]) {
      if (enemy.hp <= 0) continue;
      ctx.save();
      if (enemy.flash > 0) ctx.filter = "brightness(2.6)";
      sprite("corpse-crab", enemy.x + enemy.w / 2, enemy.y + enemy.h + 2, 69, 1, enemy.dir > 0);
      ctx.restore();
      if (enemy.hp < CONFIG.enemyHealth) {
        ctx.fillStyle = "rgba(7,24,31,.8)"; ctx.fillRect(enemy.x, enemy.y - 14, enemy.w, 3);
        ctx.fillStyle = "#d1ac78"; ctx.fillRect(enemy.x, enemy.y - 14, enemy.w * enemy.hp / CONFIG.enemyHealth, 3);
      }
      if (enemy.flash > 0) sprite("fx-hit-burst", enemy.x + enemy.w / 2, enemy.y + 35, 58, .8);
    }
  }

  function itemAvailable(item) {
    return item.kind === "ability" ? !progress.abilities[item.id] : !progress.collected.has(item.id);
  }

  function label(text, x, y, sub = "") {
    ctx.save();
    ctx.textAlign = "center";
    ctx.shadowColor = "#071820"; ctx.shadowBlur = 8;
    ctx.font = '14px "Songti SC", serif'; ctx.fillStyle = "#e3d6b6";
    ctx.fillText(text, x, y);
    if (sub) { ctx.font = "10px system-ui"; ctx.fillStyle = "#9eb7b8"; ctx.fillText(sub, x, y + 20); }
    ctx.restore();
  }

  function drawRoomObjects() {
    const room = currentRoom();
    for (const [id, cp] of Object.entries(CHECKPOINTS)) {
      if (cp.room !== roomId) continue;
      sprite("shell-camp", cp.x, cp.floor + 7, id === "beacon" ? 144 : 112,
        id === "beacon" && !progress.completed ? .65 : 1);
      if (Math.abs(player.x - cp.x) < 110) label(id === "beacon" ? (progress.completed ? "壳灯已点亮" : "彼岸的微光") : "壳灯 · 存档 / 回血", cp.x, cp.floor - 91);
    }
    for (const sign of room.signs) label(sign.text, sign.x, sign.y, sign.sub);
    for (const [side, door] of Object.entries(room.doors)) {
      const left = side === "left";
      label(left ? "← " + ROOMS[door.to].name : ROOMS[door.to].name + " →",
        left ? 95 : room.width - 105, door.floor - 88);
    }
    for (const item of room.items) {
      const available = itemAvailable(item);
      const x = item.x + item.w / 2, bottom = item.y + item.h;
      if (item.id === "dash") {
        sprite(available ? "dash-grant-cocoon-closed" : "dash-grant-cocoon-open", x, bottom + 7, 56);
        if (available) sprite("fx-heavy-ring", x, bottom + 18 + Math.sin(animationTime * 2) * 3, 84, .35);
      } else if (available) {
        const id = item.kind === "ability" ? "life-fragment" : "migration-memory";
        sprite(id, x, bottom + Math.sin(animationTime * 2.6) * 4, item.kind === "ability" ? 34 : 31);
        if (item.kind === "ability") label("浮升", x, item.y - 28, "触碰获得二段跳");
      }
    }
  }

  function drawHud() {
    const shade = ctx.createLinearGradient(0, 0, 0, 115);
    shade.addColorStop(0, "rgba(4,17,23,.84)"); shade.addColorStop(1, "rgba(4,17,23,0)");
    ctx.fillStyle = shade; ctx.fillRect(0, 0, VIEW.width, 115);
    for (let i = 0; i < CONFIG.playerHealth; i++) {
      sprite(i < player.health ? "ui-life-full" : "ui-life-empty", 29 + i * 25, 43, 22);
    }
    ctx.textAlign = "left"; ctx.font = '17px "Songti SC", serif'; ctx.fillStyle = "#e8dfca";
    ctx.fillText(currentRoom().name, 22, 76);
    ctx.font = "8px system-ui"; ctx.fillStyle = "#8ca5aa";
    ctx.fillText(currentRoom().subtitle, 23, 93);
    ctx.textAlign = "right"; ctx.font = "11px system-ui"; ctx.fillStyle = "#d4c6a9";
    ctx.fillText(`潮汐记忆  ${progress.collected.size} / ${COLLECTIBLE_IDS.length}`, VIEW.width - 22, 32);
    ctx.fillStyle = "#99b1b5";
    ctx.fillText(progress.completed ? "壳灯已点亮 · 旅程完成" : progress.abilities.dash ? "回到浅滩 · 跨越断口" : progress.abilities.doubleJump ? "寻找潮息茧 →" : "沿壳灯向右探索 →", VIEW.width - 22, 54);
    const ids = Object.keys(ROOMS);
    ids.forEach((id, i) => {
      ctx.fillStyle = roomId === id ? "#d6c598" : progress.visited.has(id) ? "#6d9293" : "#304c58";
      ctx.fillRect(VIEW.width - 102 + i * 27, 73, 20, 3);
    });
    document.getElementById("room-name").textContent = currentRoom().name;
    document.getElementById("jump-status").textContent = progress.abilities.doubleJump ? "浮升已获得" : "浮升待发现";
    dashStatus.textContent = !progress.abilities.dash ? "贴流冲待发现" : player.cooldown > 0 ? "贴流冲恢复中" : "贴流冲已获得";
    document.getElementById("collection-status").textContent = `记忆 ${progress.collected.size} / ${COLLECTIBLE_IDS.length}`;
    document.getElementById("objective").textContent = progress.completed ? "断口彼岸的壳灯，终于亮起来了。" : progress.abilities.dash ? "带着潮息回到浅滩，去往断口的另一侧。" : progress.abilities.doubleJump ? "沿须林继续向上，寻找潮息育窝里的微光。" : "循着微光深入须林，寻找越过断口的力量。";
  }

  function draw() {
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    if (!assetsReady) return;
    drawBackground();
    ctx.save();
    const shake = CONFIG.shakeDuration > 0 ? shakeTime / CONFIG.shakeDuration * CONFIG.shakeStrength : 0;
    ctx.translate(-Math.round(camera.x) + Math.sin(effectClock * 190) * shake,
      -Math.round(camera.y) + Math.cos(effectClock * 157) * shake);
    for (const item of currentRoom().decor) sprite(item.id, item.x, item.y, item.size, item.alpha);
    for (const p of currentRoom().platforms) drawTerrain(p);
    drawRoomObjects();
    drawCombat();
    drawPlayer();
    drawAttack();
    ctx.restore();
    // Foreground remains in screen coordinates when the camera moves vertically.
    sprite("foreground", VIEW.width / 2 - camera.x * .05, VIEW.height + 230, 1100, .6);
    drawHud();
    if (noticeTime > 0) {
      ctx.font = "12px system-ui";
      const width = Math.min(VIEW.width - 40, ctx.measureText(notice).width + 36);
      ctx.fillStyle = "rgba(7,25,32,.92)"; ctx.fillRect((VIEW.width - width) / 2, VIEW.height - 49, width, 31);
      ctx.fillStyle = "#d9d6c3"; ctx.textAlign = "center"; ctx.fillText(notice, VIEW.width / 2, VIEW.height - 29);
    }
    if (paused) {
      ctx.fillStyle = "rgba(4,16,23,.65)";ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      label("潮息暂歇", VIEW.width / 2, VIEW.height / 2 - 10, "点击画面 / 按键继续");
    }
  }


  const gameKeys = new Set(["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "Space", "ShiftLeft", "ShiftRight", "KeyJ", "KeyR", "KeyF", "Escape"]);
  window.addEventListener("keydown", event => {
    if (!gameKeys.has(event.code) || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    if (!assetsReady) return;
    paused = false;
    if (event.repeat || keys.has(event.code)) return;
    keys.add(event.code);
    if (event.code === "Space") jumpBuffer = CONFIG.jumpBufferTime;
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") dashRequested = true;
    if (event.code === "KeyJ") attackRequested = true;
    if (event.code === "KeyR") {
      reset();
      notify(`已返回${CHECKPOINTS[progress.checkpoint].name}`);
    }
    if (event.code === "KeyF") {
      const operation = document.fullscreenElement
        ? document.exitFullscreen?.() : canvas.requestFullscreen?.();
      if (operation) operation.catch(() => {});
    }
    if (event.code === "Escape" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  });
  window.addEventListener("keyup", event => keys.delete(event.code));

  function pause() {
    keys.clear();
    jumpBuffer = 0;
    dashRequested = false;
    attackRequested = false;
    paused = true;
    accumulator = 0;
    draw();
  }
  window.addEventListener("blur", pause);
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  canvas.addEventListener("pointerdown", () => { paused = false; canvas.focus(); });
  document.getElementById("restart").addEventListener("click", () => {
    paused = false;
    reset();
    notify(`已返回${CHECKPOINTS[progress.checkpoint].name}`);
    canvas.focus();
  });
  document.getElementById("new-game").addEventListener("click", () => {
    newGame();
    canvas.focus();
  });

  function frame(now) {
    const elapsed = Math.min((now - (lastFrame || now)) / 1000, 0.05);
    lastFrame = now;
    if (!manualTime && !paused) {
      accumulator += elapsed;
      while (accumulator >= STEP) {
        accumulator -= STEP;
        update(STEP);
      }
    }
    draw();
    requestAnimationFrame(frame);
  }

  // 自动化验证用：正常游玩无需调用。
  window.advanceTime = ms => {
    manualTime = true;
    const steps = Math.max(0, Math.round(ms / (STEP * 1000)));
    for (let i = 0; i < steps; i++) if (!paused) update(STEP);
    draw();
  };
  window.render_game_to_text = () => JSON.stringify(!assetsReady ? {
    mode: "loading", assets: { ready: false, loaded: images.size, total: Object.keys(ART).length },
  } : {
    coordinates: "世界坐标；左上原点；x 向右，y 向下；单位 px，时间 s",
    mode: paused ? "paused" : "playing",
    player: { ...player, width: BODY.width, height: BODY.height,
      pose: player.dashTime > 0 ? "dash" : !player.grounded ? "jump"
        : Math.abs(player.vx) > 15 ? "run" : "idle" },
    jumpBuffer,
    camera: { ...camera, width: VIEW.width, height: VIEW.height },
    room: { id: roomId, name: currentRoom().name, width: currentRoom().width,
      height: currentRoom().height, doors: currentRoom().doors },
    abilities: { ...progress.abilities },
    checkpoint: { id: progress.checkpoint, ...CHECKPOINTS[progress.checkpoint] },
    collected: [...progress.collected], totalCollectibles: COLLECTIBLE_IDS.length,
    visited: [...progress.visited], deaths, notice: noticeTime > 0 ? notice : "",
    combat: { hitStop: hitStopTime, shakeTime, attackSerial,
      attackBox: player.attackTime > 0 ? attackBox() : null },
    enemies: enemiesByRoom[roomId].filter(enemy => enemy.hp > 0).map(enemy => ({ ...enemy })),
    
    completed: progress.completed, assets: { ready: assetsReady, loaded: images.size, total: Object.keys(ART).length },
    visibleItems: currentRoom().items.filter(itemAvailable).filter(p => p.x + p.w >= camera.x
      && p.x <= camera.x + VIEW.width && p.y + p.h >= camera.y && p.y <= camera.y + VIEW.height),
    visiblePlatforms: currentRoom().platforms.filter(p => p.x + p.w >= camera.x
      && p.x <= camera.x + VIEW.width && p.y + p.h >= camera.y
      && p.y <= camera.y + VIEW.height),
  });

  async function boot() {
  await loadArt();
  loadProgress();
  reset();
  notify(progress.checkpoint === "start" && !progress.abilities.doubleJump
    ? roomHint() : `从${CHECKPOINTS[progress.checkpoint].name}继续 · 已恢复本地进度`);
  requestAnimationFrame(frame);
  }
  boot().catch(showLoadError);
