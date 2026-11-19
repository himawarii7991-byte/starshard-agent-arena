// Deterministic screenshot scenes: ?shot=start|play|upgrade|end&seed=N
// builds a fixed game state and renders one frame of it, so the
// screenshots are real renders of the game's own code, repeatable for
// the same seed. No input is read in shot mode.

import { VIEW } from './config.js';
import { makeWorld, startRun } from './world.js';
import { makeEnemy, makePickup, makeBullet, makeFloater } from './entities.js';
import { makeRng, range } from './random.js';
import { rollUpgrades } from './waves.js';

function scatterEnemies(world, count, kinds, eliteIndex = -1) {
  const rng = world.rng;
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length];
    const x = range(rng, 120, VIEW.width - 120);
    const y = range(rng, 120, VIEW.height - 140);
    world.enemies.push(makeEnemy(kind, x, y, 4, rng, i === eliteIndex));
  }
}

function scatterShards(world, count) {
  for (let i = 0; i < count; i++) {
    world.pickups.push(makePickup('shard', range(world.rng, 100, VIEW.width - 100), range(world.rng, 120, VIEW.height - 120)));
  }
}

export function buildShotWorld(shot, seed) {
  const world = makeWorld(seed);
  const rng = makeRng(seed);
  world.best = 12450;
  world.state = 'playing';

  if (shot === 'start') {
    world.state = 'title';
    world.best = 12450;
    return world;
  }

  // A run already in progress: player near centre-left, firing.
  startRun(world, 12450);
  world.player.x = 430;
  world.player.y = 380;
  world.player.angle = -0.4;
  world.wave = 4;
  world.score = 3420;
  world.kills = 41;
  world.combo = 12;
  world.comboTimer = 2.4;
  world.comboTier = 2;
  world.player.hp = 78;
  world.player.bombs = 2;
  world.player.frenzyTimer = 3.2;
  world.banner = 'WAVE 4';
  world.bannerTimer = 2.6;
  scatterEnemies(world, 9, ['drifter', 'darter', 'splitter', 'spitter', 'drifter', 'bulwark'], 2);
  world.pickups.push(makePickup('frenzy', 950, 480));
  scatterShards(world, 6);
  world.pickups.push(makePickup('heart', 820, 300));
  // A spray of the player's own bullets, mid-flight.
  for (let i = 0; i < 4; i++) {
    const a = -0.4 + (i - 1.5) * 0.12;
    world.bullets.push(makeBullet(480 + i * 46, 366 - i * 8, a, 640, 12, 0, true));
  }
  world.enemyBullets.push(makeBullet(760, 250, Math.PI * 0.85, 170, 8, 0, false));
  world.floaters.push(makeFloater(700, 210, '+160', '#ffd166'));
  world.floaters.push(makeFloater(520, 300, '+25', '#f2f6ff'));
  for (let i = 0; i < 14; i++) {
    world.particles.push({
      x: range(rng, 600, 900),
      y: range(rng, 180, 420),
      vx: range(rng, -80, 80),
      vy: range(rng, -80, 80),
      color: i % 2 ? '#ff4fd8' : '#ffe066',
      life: 0.5,
      maxLife: 0.5,
      size: 3,
    });
  }
  world.queue = ['drifter', 'darter', 'splitter'];

  if (shot === 'upgrade') {
    world.enemies = [];
    world.bullets = [];
    world.queue = [];
    world.state = 'levelup';
    world.wave = 3;
    world.upgrades = rollUpgrades(rng);
    return world;
  }

  if (shot === 'end') {
    world.state = 'gameover';
    world.player.alive = false;
    world.score = 9840;
    world.kills = 132;
    world.best = 12450;
    world.wave = 6;
    return world;
  }

  if (shot === 'boss') {
    // The climax: wave 10, the Shardkeeper mid-fight, its ring of
    // orbs closing in, the boss bar up top.
    world.enemies = [];
    world.bullets = [];
    world.enemyBullets = [];
    world.queue = ['drifter', 'darter'];
    world.wave = 10;
    world.score = 18900;
    world.kills = 178;
    world.combo = 9;
    world.comboTimer = 2.0;
    world.comboTier = 2;
    world.player.x = 400;
    world.player.y = 420;
    world.player.angle = 0.35;
    world.player.hp = 64;
    world.player.bombs = 1;
    world.banner = 'THE SHARDKEEPER';
    world.bannerTimer = 2.6;
    const boss = makeEnemy('boss', 880, 300, 10, rng);
    boss.hp = Math.round(boss.maxHp * 0.55);
    world.enemies.push(boss);
    scatterEnemies(world, 3, ['drifter', 'stinger', 'darter']);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.4;
      world.enemyBullets.push(makeBullet(880 + Math.cos(a) * 130, 300 + Math.sin(a) * 130, a, 150, 10, 0, false));
    }
    for (let i = 0; i < 4; i++) {
      const a = 0.35 + (i - 1.5) * 0.12;
      world.bullets.push(makeBullet(450 + i * 46, 410 - i * 8, a, 640, 12, 0, true));
    }
    world.floaters.push(makeFloater(880, 200, '+2000', '#ffd166'));
    return world;
  }

  return world; // 'play' (default)
}
