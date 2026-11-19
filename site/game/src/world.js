// The game state and its update step: movement, shooting, waves,
// collisions, score and combo, pickups, upgrades, winning and losing.
// Rendering lives in render.js; this file never draws anything.

import { VIEW, PLAYER, WAVES, COMBO, DROPS, ENEMIES, BOMB, ELITE, FRENZY, BANNER_TIME, BOSS } from './config.js';
import { makePlayer, makeEnemy, makeBullet, makePickup, makeParticle, burst, makeFloater } from './entities.js';
import { makeRng, range, chance, pick } from './random.js';
import { waveQueue, rollUpgrades } from './waves.js';

export function makeWorld(seed) {
  const rng = makeRng(seed);
  return {
    rng,
    state: 'title', // title | playing | levelup | paused | gameover | victory
    time: 0,
    runTime: 0,
    player: makePlayer(),
    enemies: [],
    bullets: [],
    enemyBullets: [],
    pickups: [],
    particles: [],
    floaters: [],
    wave: 0,
    queue: [],
    spawnTimer: 0,
    betweenTimer: 0,
    score: 0,
    best: 0,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    comboTier: 1,
    shake: 0,
    hitStop: 0, // brief freeze on a big kill, for punch
    eliteChance: ELITE.chance,
    banner: '',
    bannerTimer: 0,
    upgrades: [],
    waveClearPending: false,
    endless: false,
    stats: { shots: 0, hits: 0 },
  };
}

export function startRun(world, best) {
  world.player = makePlayer();
  world.enemies = [];
  world.bullets = [];
  world.enemyBullets = [];
  world.pickups = [];
  world.particles = [];
  world.floaters = [];
  world.wave = 0;
  world.score = 0;
  world.best = best;
  world.kills = 0;
  world.combo = 0;
  world.comboTimer = 0;
  world.comboTier = 1;
  world.runTime = 0;
  world.endless = false;
  world.state = 'playing';
  nextWave(world);
}

export function nextWave(world) {
  world.wave += 1;
  world.queue = waveQueue(world.wave, world.rng);
  world.spawnTimer = 0.5;
  world.betweenTimer = 0;
  const eliteWave = ELITE.eliteWaves.includes(world.wave);
  world.eliteChance = eliteWave ? ELITE.eliteWaveChance : ELITE.chance;
  world.banner = world.wave === WAVES.total ? 'THE SHARDKEEPER' : eliteWave ? `ELITE WAVE ${world.wave}` : `WAVE ${world.wave}`;
  world.bannerTimer = BANNER_TIME;
}

function detonateNova(world, audio) {
  const p = world.player;
  p.bombs -= 1;
  world.enemyBullets = [];
  for (const e of world.enemies) {
    e.hp -= BOMB.damage;
    e.flash = 1;
    if (e.hp <= 0) killEnemy(world, e, audio);
  }
  burst(world.particles, p.x, p.y, '#ffd166', 30, 420);
  burst(world.particles, p.x, p.y, '#35f0ff', 20, 340);
  world.shake = Math.min(12, world.shake + 8);
  world.floaters.push(makeFloater(p.x, p.y - 30, 'NOVA!', '#ffd166'));
  audio.nova();
}

function edgeSpawn(world) {
  const side = Math.floor(world.rng() * 4);
  const m = 40;
  if (side === 0) return { x: range(world.rng, m, VIEW.width - m), y: -m };
  if (side === 1) return { x: range(world.rng, m, VIEW.width - m), y: VIEW.height + m };
  if (side === 2) return { x: -m, y: range(world.rng, m, VIEW.height - m) };
  return { x: VIEW.width + m, y: range(world.rng, m, VIEW.height - m) };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function addScore(world, base, x, y) {
  const gained = base * world.comboTier;
  world.score += gained;
  world.floaters.push(makeFloater(x, y, `+${gained}`, world.comboTier > 1 ? '#ffd166' : '#f2f6ff'));
}

function dropLoot(world, enemy) {
  const r = world.rng;
  if (chance(r, DROPS.heartChance)) world.pickups.push(makePickup('heart', enemy.x, enemy.y));
  else if (chance(r, DROPS.shieldChance)) world.pickups.push(makePickup('shield', enemy.x, enemy.y));
  else if (chance(r, FRENZY.dropChance)) world.pickups.push(makePickup('frenzy', enemy.x, enemy.y));
  else if (chance(r, DROPS.shardChance)) world.pickups.push(makePickup('shard', enemy.x, enemy.y));
}

function killEnemy(world, enemy, audio) {
  world.kills += 1;
  world.combo += 1;
  world.comboTimer = world.player.comboWindow;
  world.comboTier = Math.min(COMBO.maxTier, 1 + Math.floor(world.combo / COMBO.perTier));
  addScore(world, enemy.score, enemy.x, enemy.y);
  // Shard Siphon: kills put hull back on.
  if (world.player.siphon > 0 && world.player.alive) {
    world.player.hp = Math.min(world.player.maxHp, world.player.hp + world.player.siphon);
  }
  if (enemy.kind === 'boss') {
    // The boss goes down hard: the biggest burst in the game.
    burst(world.particles, enemy.x, enemy.y, enemy.color, 60, 420);
    burst(world.particles, enemy.x, enemy.y, '#ffd166', 40, 340);
    world.shake = Math.min(14, world.shake + 12);
    world.hitStop = 0.12;
    world.floaters.push(makeFloater(enemy.x, enemy.y - 70, 'SHARDKEEPER DOWN!', '#ffd166'));
  } else {
    burst(world.particles, enemy.x, enemy.y, enemy.color, enemy.kind === 'bulwark' ? 26 : 14, 260);
    world.shake = Math.min(10, world.shake + (enemy.kind === 'bulwark' ? 7 : 3));
  }
  // A big kill freezes the action for a beat.
  if (enemy.elite) world.hitStop = 0.06;
  else if (enemy.kind === 'bulwark') world.hitStop = 0.05;
  dropLoot(world, enemy);
  if (enemy.kind === 'splitter') {
    for (let i = 0; i < 3; i++) {
      const s = makeEnemy('shardling', enemy.x + range(world.rng, -14, 14), enemy.y + range(world.rng, -14, 14), world.wave, world.rng);
      s.vx = range(world.rng, -160, 160);
      s.vy = range(world.rng, -160, 160);
      world.enemies.push(s);
    }
  }
  audio.explode();
}

function hurtPlayer(world, dmg, audio) {
  const p = world.player;
  if (p.invulnerable > 0 || !p.alive) return;
  if (p.shield > 0) {
    p.shield -= 1;
    p.shieldTimer = 0;
    p.invulnerable = 0.8;
    burst(world.particles, p.x, p.y, '#9db4ff', 12, 220);
    audio.hit();
    world.floaters.push(makeFloater(p.x, p.y - 24, 'SHIELD', '#9db4ff'));
    return;
  }
  p.hp -= dmg;
  p.invulnerable = 0.9;
  world.shake = Math.min(12, world.shake + 6);
  burst(world.particles, p.x, p.y, '#ff5470', 16, 260);
  audio.hurt();
  if (p.hp <= 0) {
    p.hp = 0;
    p.alive = false;
    burst(world.particles, p.x, p.y, '#35f0ff', 40, 380);
    burst(world.particles, p.x, p.y, '#ffd166', 24, 300);
    world.state = 'gameover';
    world.best = Math.max(world.best, world.score);
    audio.gameOver();
    audio.stopMusic();
  }
}

function firePlayer(world, audio) {
  const p = world.player;
  const n = p.shots;
  const spread = 0.14;
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? 0 : (i - (n - 1) / 2) * spread;
    const a = p.angle + off;
    const bx = p.x + Math.cos(a) * (p.radius + 8);
    const by = p.y + Math.sin(a) * (p.radius + 8);
    world.bullets.push(makeBullet(bx, by, a, PLAYER.bulletSpeed, p.damage, p.pierce, true));
  }
  world.stats.shots += n;
  p.fireTimer = p.fireInterval * (p.frenzyTimer > 0 ? FRENZY.fireMul : 1);
  audio.shoot();
}

function updatePlayer(world, dt, input, audio) {
  const p = world.player;
  if (!p.alive) return;
  p.angle = Math.atan2(input.mouse.y - p.y, input.mouse.x - p.x);

  // Dash: a short burst in the movement direction, with i-frames.
  if (input.dashPressed() && p.dashTimer <= 0) {
    const mx = input.moveX();
    const my = input.moveY();
    const len = Math.hypot(mx, my) || 1;
    const dx = (mx / len) * (mx || my ? 1 : 0);
    const dy = (my / len) * (mx || my ? 1 : 0);
    p.vx = (dx || Math.cos(p.angle)) * PLAYER.dashSpeed;
    p.vy = (dy || Math.sin(p.angle)) * PLAYER.dashSpeed;
    p.dashTimeLeft = PLAYER.dashTime;
    p.dashTimer = p.dashCooldown;
    p.invulnerable = Math.max(p.invulnerable, 0.25);
    burst(world.particles, p.x, p.y, '#35f0ff', 8, 160);
  }
  p.dashTimer = Math.max(0, p.dashTimer - dt);
  p.frenzyTimer = Math.max(0, p.frenzyTimer - dt);

  // Nova bomb: Q spends one charge to hurt every enemy on screen
  // and clear every enemy orb.
  if (input.bombPressed && input.bombPressed() && p.bombs > 0) {
    detonateNova(world, audio);
  }

  if (p.dashTimeLeft > 0) {
    p.dashTimeLeft -= dt;
  } else {
    const mx = input.moveX();
    const my = input.moveY();
    const len = Math.hypot(mx, my) || 1;
    const tx = (mx / len) * p.speed * (mx || my ? 1 : 0);
    const ty = (my / len) * p.speed * (mx || my ? 1 : 0);
    p.vx += (tx - p.vx) * Math.min(1, dt * 12);
    p.vy += (ty - p.vy) * Math.min(1, dt * 12);
  }
  p.x = Math.max(p.radius, Math.min(VIEW.width - p.radius, p.x + p.vx * dt));
  p.y = Math.max(p.radius, Math.min(VIEW.height - p.radius, p.y + p.vy * dt));
  p.invulnerable = Math.max(0, p.invulnerable - dt);

  // Engine trail while moving.
  const speed = Math.hypot(p.vx, p.vy);
  if (speed > 60) {
    world.particles.push({
      x: p.x - Math.cos(p.angle) * 20,
      y: p.y - Math.sin(p.angle) * 20,
      vx: -p.vx * 0.15 + (world.rng() - 0.5) * 40,
      vy: -p.vy * 0.15 + (world.rng() - 0.5) * 40,
      color: '#35f0ff',
      life: 0.3,
      maxLife: 0.3,
      size: 3,
    });
  }

  // Shield recharges one charge at a time.
  if (p.shield < p.shieldMax) {
    p.shieldTimer += dt;
    if (p.shieldTimer >= PLAYER.shieldRecharge) {
      p.shield += 1;
      p.shieldTimer = 0;
    }
  }

  p.fireTimer -= dt;
  if (input.firing() && p.fireTimer <= 0) firePlayer(world, audio);
}

function updateEnemies(world, dt, audio) {
  const p = world.player;
  for (const e of world.enemies) {
    e.flash = Math.max(0, e.flash - dt * 6);
    e.wobble += dt * 3;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;

    if (e.kind === 'darter') {
      e.stateTimer -= dt;
      if (e.state === 'chase') {
        e.vx = ux * e.speed;
        e.vy = uy * e.speed;
        if (e.stateTimer <= 0 && d < 320) {
          e.state = 'aim';
          e.stateTimer = 0.45;
        }
      } else if (e.state === 'aim') {
        e.vx *= 0.9;
        e.vy *= 0.9;
        if (e.stateTimer <= 0) {
          e.state = 'lunge';
          e.stateTimer = 0.4;
          e.vx = ux * e.speed * 4.2;
          e.vy = uy * e.speed * 4.2;
        }
      } else {
        if (e.stateTimer <= 0) {
          e.state = 'chase';
          e.stateTimer = 1 + world.rng() * 1.5;
        }
      }
    } else if (e.kind === 'spitter') {
      // Keep a ring around the player and shoot slow orbs.
      const want = 260;
      const radial = d < want - 40 ? -1 : d > want + 40 ? 1 : 0;
      e.vx = ux * e.speed * radial + -uy * e.speed * 0.4;
      e.vy = uy * e.speed * radial + ux * e.speed * 0.4;
      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && d < 520) {
        e.fireTimer = 2.4;
        world.enemyBullets.push(makeBullet(e.x, e.y, Math.atan2(dy, dx), 170, e.damage, 0, false));
        audio.hit();
      }
    } else if (e.kind === 'stinger') {
      // Weaves at the player: a fast sine across the chase line.
      const sway = Math.sin(e.wobble * 2.2) * 0.9;
      e.vx = (ux + -uy * sway) * e.speed;
      e.vy = (uy + ux * sway) * e.speed;
    } else if (e.kind === 'boss') {
      // The Shardkeeper: a slow chase, rings of orbs, and shardling
      // summons. It never leaves the arena — victory needs it dead.
      e.vx = ux * e.speed;
      e.vy = uy * e.speed;
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        e.fireTimer = BOSS.burstEvery;
        const base = e.wobble;
        for (let i = 0; i < BOSS.burstCount; i++) {
          const a = base + (i / BOSS.burstCount) * Math.PI * 2;
          world.enemyBullets.push(makeBullet(e.x, e.y, a, BOSS.orbSpeed, 10, 0, false));
        }
        audio.hit();
      }
      e.summonTimer -= dt;
      if (e.summonTimer <= 0) {
        e.summonTimer = BOSS.summonEvery;
        for (let i = 0; i < BOSS.summonCount; i++) {
          const s = makeEnemy('shardling', e.x + range(world.rng, -30, 30), e.y + range(world.rng, -30, 30), world.wave, world.rng);
          s.vx = range(world.rng, -160, 160);
          s.vy = range(world.rng, -160, 160);
          world.enemies.push(s);
        }
        burst(world.particles, e.x, e.y, ENEMIES.shardling.color, 10, 200);
      }
    } else if (e.kind === 'shardling') {
      e.vx += (ux * e.speed - e.vx) * Math.min(1, dt * 2);
      e.vy += (uy * e.speed - e.vy) * Math.min(1, dt * 2);
    } else {
      // Drifter, splitter, bulwark: steer at the player, with a wobble.
      const wob = Math.sin(e.wobble) * 0.35;
      e.vx = (ux + -uy * wob) * e.speed;
      e.vy = (uy + ux * wob) * e.speed;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;

    // Touching the player hurts.
    if (p.alive && dist(e, p) < e.radius + p.radius - 2) {
      hurtPlayer(world, e.damage, audio);
      // Knock the enemy back so one touch is not a chain of hits.
      e.x -= ux * 26;
      e.y -= uy * 26;
    }
  }
}

function updateBullets(world, dt, audio) {
  // Friendly bullets vs enemies.
  for (const b of world.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    for (const e of world.enemies) {
      if (b.hitIds.has(e) || b.life <= 0) continue;
      if (dist(b, e) < b.radius + e.radius) {
        e.hp -= b.damage;
        e.flash = 1;
        world.stats.hits += 1;
        burst(world.particles, b.x, b.y, '#ffe066', 4, 140);
        audio.hit();
        if (b.pierce > 0) {
          b.hitIds.add(e);
          b.pierce -= 1;
        } else {
          b.life = 0;
        }
        if (e.hp <= 0) killEnemy(world, e, audio);
        break;
      }
    }
  }
  world.bullets = world.bullets.filter((b) => b.life > 0 && b.x > -20 && b.x < VIEW.width + 20 && b.y > -20 && b.y < VIEW.height + 20);
  world.enemies = world.enemies.filter((e) => e.hp > 0);

  // Enemy orbs vs the player.
  const p = world.player;
  for (const b of world.enemyBullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (p.alive && dist(b, p) < b.radius + p.radius - 2) {
      b.life = 0;
      hurtPlayer(world, b.damage, audio);
    }
  }
  world.enemyBullets = world.enemyBullets.filter((b) => b.life > 0 && b.x > -20 && b.x < VIEW.width + 20 && b.y > -20 && b.y < VIEW.height + 20);
}

function updatePickups(world, dt, audio) {
  const p = world.player;
  for (const pk of world.pickups) {
    pk.life -= dt;
    pk.bob += dt * 4;
    const d = dist(pk, p);
    if (d < p.magnetRadius && p.alive) {
      const pull = 420 * (1 - d / p.magnetRadius) + 120;
      pk.vx += ((p.x - pk.x) / (d || 1)) * pull * dt * 4;
      pk.vy += ((p.y - pk.y) / (d || 1)) * pull * dt * 4;
    } else {
      pk.vx *= 0.92;
      pk.vy *= 0.92;
    }
    pk.x += pk.vx * dt;
    pk.y += pk.vy * dt;
    if (p.alive && d < p.radius + pk.radius + 4) {
      pk.life = 0;
      if (pk.kind === 'shard') {
        addScore(world, DROPS.shardScore, pk.x, pk.y);
        audio.pickup();
      } else if (pk.kind === 'heart') {
        p.hp = Math.min(p.maxHp, p.hp + DROPS.heartHeal);
        world.floaters.push(makeFloater(pk.x, pk.y, `+${DROPS.heartHeal} HP`, '#ff5d7a'));
        audio.pickup();
      } else if (pk.kind === 'frenzy') {
        p.frenzyTimer = FRENZY.duration;
        world.floaters.push(makeFloater(pk.x, pk.y, 'FRENZY!', '#ffd166'));
        audio.pickup();
      } else {
        p.shield = Math.min(p.shieldMax, p.shield + 1);
        world.floaters.push(makeFloater(pk.x, pk.y, '+SHIELD', '#9db4ff'));
        audio.pickup();
      }
      burst(world.particles, pk.x, pk.y, pk.kind === 'heart' ? '#ff5d7a' : pk.kind === 'frenzy' ? '#ffd166' : '#8affff', 8, 160);
    }
  }
  world.pickups = world.pickups.filter((pk) => pk.life > 0);
}

function updateFx(world, dt) {
  for (const pt of world.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.96;
    pt.vy *= 0.96;
    pt.life -= dt;
  }
  world.particles = world.particles.filter((pt) => pt.life > 0);
  for (const f of world.floaters) {
    f.y -= 34 * dt;
    f.life -= dt;
  }
  world.floaters = world.floaters.filter((f) => f.life > 0);
  world.shake = Math.max(0, world.shake - dt * 26);
  world.bannerTimer = Math.max(0, world.bannerTimer - dt);
  world.comboTimer -= dt;
  if (world.comboTimer <= 0 && world.combo > 0) {
    world.combo = 0;
    world.comboTier = 1;
  }
}

export function update(world, dt, input, audio) {
  if (world.state !== 'playing') return;
  // Hit-stop: a big kill freezes the action for a beat.
  if (world.hitStop > 0) {
    world.hitStop -= dt;
    return;
  }
  world.time += dt;
  world.runTime += dt;
  dt = Math.min(dt, 0.05);

  updatePlayer(world, dt, input, audio);
  updateEnemies(world, dt, audio);
  updateBullets(world, dt, audio);
  updatePickups(world, dt, audio);
  updateFx(world, dt);

  // Spawning. From wave 4, some spawns are elites; elite waves more so.
  if (world.queue.length > 0) {
    world.spawnTimer -= dt;
    if (world.spawnTimer <= 0) {
      world.spawnTimer = WAVES.spawnInterval;
      const kind = world.queue.shift();
      // The boss is one of a kind: never an elite.
      const elite = kind !== 'boss' && world.wave >= ELITE.unlockWave && world.rng() < world.eliteChance;
      const s = edgeSpawn(world);
      world.enemies.push(makeEnemy(kind, s.x, s.y, world.wave, world.rng, elite));
    }
  } else if (world.enemies.length === 0 && world.player.alive) {
    // Wave cleared: a nova charge every few waves, then the choice.
    if (world.wave % BOMB.grantEveryWaves === 0) {
      const p = world.player;
      if (p.bombs < p.bombMax) {
        p.bombs += 1;
        world.floaters.push(makeFloater(p.x, p.y - 30, '+NOVA', '#ffd166'));
      }
    }
    if (world.wave >= WAVES.total && !world.endless) {
      world.state = 'victory';
      world.best = Math.max(world.best, world.score);
      audio.victory();
      audio.stopMusic();
    } else {
      world.state = 'levelup';
      world.upgrades = rollUpgrades(world.rng);
      audio.waveClear();
    }
  }
}

export function applyUpgrade(world, index, audio) {
  const up = world.upgrades[index];
  if (!up) return;
  up.apply(world.player);
  world.floaters = [];
  world.upgrades = [];
  if (world.wave >= WAVES.total && !world.endless) {
    world.endless = true;
  }
  nextWave(world);
  world.state = 'playing';
  audio.levelup();
}

export function continueEndless(world, audio) {
  world.endless = true;
  nextWave(world);
  world.state = 'playing';
  audio.startMusic();
}
