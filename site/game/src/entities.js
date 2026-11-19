// Factories for everything that moves: the player, five enemy kinds,
// bullets, pickups, particles and floating score text. Each one is a
// plain object; world.js owns how they behave.

import { PLAYER, ENEMIES, VIEW, COMBO, ELITE } from './config.js';

export function makePlayer() {
  return {
    x: VIEW.width / 2,
    y: VIEW.height / 2,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    radius: PLAYER.radius,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    speed: PLAYER.speed,
    fireInterval: PLAYER.fireInterval,
    fireTimer: 0,
    damage: PLAYER.bulletDamage,
    shots: PLAYER.shots,
    pierce: PLAYER.pierce,
    magnetRadius: PLAYER.magnetRadius,
    dashCooldown: PLAYER.dashCooldown,
    dashTimer: 0,
    dashTimeLeft: 0,
    invulnerable: 0,
    shield: 1,
    shieldMax: 1,
    shieldTimer: 0,
    comboWindow: COMBO.window,
    bombs: 1, // nova charges (see BOMB in config.js)
    bombMax: 3,
    frenzyTimer: 0, // seconds of double fire rate left
    siphon: 0, // HP restored per kill (Shard Siphon upgrade)
    alive: true,
  };
}

export function makeEnemy(kind, x, y, wave, rng, elite = false) {
  const def = ENEMIES[kind];
  const hpMul = 1 + (wave - 1) * 0.12;
  const spMul = 1 + (wave - 1) * 0.03;
  const hp = Math.round(def.hp * hpMul * (elite ? ELITE.hpMul : 1));
  return {
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: def.radius * (elite ? ELITE.sizeMul : 1),
    hp,
    maxHp: hp,
    speed: def.speed * spMul * (0.9 + rng() * 0.2),
    score: def.score * (elite ? ELITE.scoreMul : 1),
    damage: def.damage,
    color: def.color,
    elite,
    // Darter state: wander, then telegraph, then lunge.
    state: 'chase',
    stateTimer: 1 + rng() * 1.5,
    // Spitter state: keep distance and fire.
    fireTimer: 1.5 + rng(),
    // Boss state: radial bursts and shardling summons.
    summonTimer: 4 + rng() * 2,
    flash: 0,
    wobble: rng() * Math.PI * 2,
  };
}

export function makeBullet(x, y, angle, speed, damage, pierce, friendly) {
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: friendly ? 5 : 7,
    damage,
    pierce,
    friendly,
    life: 1.6,
    hitIds: new Set(),
  };
}

export function makePickup(kind, x, y) {
  return {
    kind, // 'shard' | 'heart' | 'shield' | 'frenzy'
    x,
    y,
    vx: 0,
    vy: 0,
    radius: kind === 'shard' ? 8 : 12,
    life: 12,
    bob: Math.random() * Math.PI * 2,
  };
}

export function makeParticle(x, y, color, speed, life, size) {
  const a = Math.random() * Math.PI * 2;
  return {
    x,
    y,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    color,
    life,
    maxLife: life,
    size,
  };
}

export function burst(particles, x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    particles.push(makeParticle(x, y, color, speed * (0.4 + Math.random() * 0.8), 0.4 + Math.random() * 0.4, 2 + Math.random() * 3));
  }
}

export function makeFloater(x, y, text, color) {
  return { x, y, text, color, life: 0.9, maxLife: 0.9 };
}
