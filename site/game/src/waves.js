// Waves and upgrades. A wave is a queue of enemy kinds, dealt out over
// time; clearing it offers the player one of three upgrades to choose.

import { ENEMIES, WAVES } from './config.js';
import { pickDistinct } from './random.js';

export function waveCount(wave) {
  return WAVES.baseCount + (wave - 1) * WAVES.perWave;
}

export function waveQueue(wave, rng) {
  // The boss never joins the random pool: wave 10 is the boss plus
  // a small escort, and the run is won only when the boss falls.
  const kinds = Object.keys(ENEMIES).filter(
    (k) => k !== 'shardling' && k !== 'boss' && (!ENEMIES[k].unlock || wave >= ENEMIES[k].unlock),
  );
  const queue = [];
  if (wave >= WAVES.total) {
    queue.push('boss');
    for (let i = 0; i < 8; i++) queue.push(pickWeighted(kinds, rng));
    return queue;
  }
  const count = waveCount(wave);
  for (let i = 0; i < count; i++) {
    // Early waves are mostly drifters; later waves mix the roster.
    const pool = wave <= 1 ? ['drifter'] : kinds;
    queue.push(pickWeighted(pool, rng));
  }
  return queue;
}

// One weighted pick from a pool: drifters are common, bulwarks rare.
function pickWeighted(pool, rng) {
  const weights = pool.map((k) => (k === 'drifter' ? 3 : k === 'bulwark' ? 0.5 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let j = 0; j < pool.length; j++) {
    roll -= weights[j];
    if (roll <= 0) return pool[j];
  }
  return pool[0];
}

export const UPGRADES = [
  {
    id: 'rapid',
    name: 'Rapid Fire',
    desc: '+18% fire rate',
    apply(p) {
      p.fireInterval *= 0.82;
    },
  },
  {
    id: 'heavy',
    name: 'Heavy Rounds',
    desc: '+25% bullet damage',
    apply(p) {
      p.damage *= 1.25;
    },
  },
  {
    id: 'twin',
    name: 'Twin Shot',
    desc: '+1 projectile (max 4)',
    apply(p) {
      p.shots = Math.min(4, p.shots + 1);
    },
  },
  {
    id: 'pierce',
    name: 'Piercing Rounds',
    desc: 'Bullets pass through +1 enemy',
    apply(p) {
      p.pierce += 1;
    },
  },
  {
    id: 'swift',
    name: 'Swift Thrusters',
    desc: '+12% move speed',
    apply(p) {
      p.speed *= 1.12;
    },
  },
  {
    id: 'hull',
    name: 'Reinforced Hull',
    desc: '+25 max HP and heal 25',
    apply(p) {
      p.maxHp += 25;
      p.hp = Math.min(p.maxHp, p.hp + 25);
    },
  },
  {
    id: 'dash',
    name: 'Dash Recharge',
    desc: 'Dash recharges 25% faster',
    apply(p) {
      p.dashCooldown *= 0.75;
    },
  },
  {
    id: 'magnet',
    name: 'Magnet Core',
    desc: '+60% pickup radius',
    apply(p) {
      p.magnetRadius *= 1.6;
    },
  },
  {
    id: 'aegis',
    name: 'Aegis Shield',
    desc: '+1 shield charge, faster recharge',
    apply(p) {
      p.shieldMax += 1;
      p.shield = Math.min(p.shieldMax, p.shield + 1);
    },
  },
  {
    id: 'adrenaline',
    name: 'Adrenaline',
    desc: 'Longer combo, +10% damage',
    apply(p) {
      p.comboWindow *= 1.5;
      p.damage *= 1.1;
    },
  },
  {
    id: 'nova',
    name: 'Nova Cache',
    desc: '+1 nova bomb (max 3)',
    apply(p) {
      p.bombs = Math.min(p.bombMax, p.bombs + 1);
    },
  },
  {
    id: 'siphon',
    name: 'Shard Siphon',
    desc: 'Kills restore 1 HP',
    apply(p) {
      p.siphon = (p.siphon || 0) + 1;
    },
  },
];

export function rollUpgrades(rng) {
  return pickDistinct(rng, UPGRADES, 3);
}
