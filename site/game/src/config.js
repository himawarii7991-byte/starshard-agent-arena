// STARSHARD — tuning and art direction in one place.
// Every number that shapes how the game feels lives here, so balancing
// the game means editing this file and nowhere else.

export const VIEW = { width: 1280, height: 720 };

// Palette: deep indigo space, neon cyan / magenta / gold on top.
// The game is readable when shrunk because every actor is a bright
// shape on a dark field, with a dark outline under bright text.
export const PALETTE = {
  spaceTop: '#0b1030',
  spaceBottom: '#05060f',
  nebulaA: 'rgba(88, 60, 220, 0.20)',
  nebulaB: 'rgba(255, 79, 216, 0.10)',
  nebulaC: 'rgba(53, 240, 255, 0.08)',
  star: '#dfe9ff',
  player: '#35f0ff',
  playerCore: '#eafcff',
  bullet: '#ffe066',
  enemyDrifter: '#ff4fd8',
  enemyDarter: '#ff9f43',
  enemySplitter: '#7CFFB2',
  enemySpitter: '#c77dff',
  enemyBulwark: '#ffd166',
  enemyStinger: '#4cc9f0',
  enemyBoss: '#ff2d95',
  shard: '#8affff',
  heart: '#ff5d7a',
  shieldOrb: '#9db4ff',
  text: '#f2f6ff',
  textDim: '#9aa7c7',
  danger: '#ff5470',
  gold: '#ffd166',
};

export const PLAYER = {
  radius: 16,
  speed: 300, // px per second
  maxHp: 100,
  fireInterval: 0.16, // seconds between shots
  bulletSpeed: 640,
  bulletDamage: 12,
  bulletRadius: 5,
  shots: 1,
  pierce: 0,
  dashSpeed: 900,
  dashTime: 0.16,
  dashCooldown: 2.5,
  magnetRadius: 90,
  shieldRecharge: 12, // seconds to recharge one shield charge
};

// One entry per enemy kind. `unlock` is the first wave it appears in.
export const ENEMIES = {
  drifter: { hp: 22, speed: 70, radius: 18, score: 50, damage: 10, color: PALETTE.enemyDrifter },
  darter: { hp: 16, speed: 95, radius: 14, score: 80, damage: 12, color: PALETTE.enemyDarter, unlock: 2 },
  splitter: { hp: 30, speed: 60, radius: 20, score: 90, damage: 10, color: PALETTE.enemySplitter, unlock: 3 },
  spitter: { hp: 26, speed: 55, radius: 17, score: 120, damage: 8, color: PALETTE.enemySpitter, unlock: 4 },
  bulwark: { hp: 160, speed: 38, radius: 30, score: 300, damage: 18, color: PALETTE.enemyBulwark, unlock: 5 },
  stinger: { hp: 14, speed: 130, radius: 12, score: 70, damage: 10, color: PALETTE.enemyStinger, unlock: 3 },
  boss: { hp: 900, speed: 32, radius: 62, score: 2000, damage: 25, color: PALETTE.enemyBoss },
  shardling: { hp: 8, speed: 150, radius: 9, score: 25, damage: 6, color: PALETTE.enemySplitter },
};

export const WAVES = {
  total: 10, // clearing wave 10 wins; play continues endless after that
  baseCount: 6, // enemies in wave 1
  perWave: 3, // extra enemies per wave
  spawnInterval: 0.9, // seconds between spawns
  hpScale: 0.12, // +12% enemy hp per wave
  speedScale: 0.03, // +3% enemy speed per wave
};

export const COMBO = {
  window: 3.0, // seconds without a kill before the combo resets
  perTier: 8, // kills per multiplier tier
  maxTier: 5, // multiplier caps at x5
};

export const DROPS = {
  shardChance: 0.55, // chance an enemy drops a score shard
  heartChance: 0.07, // chance an enemy drops a heal
  shieldChance: 0.05, // chance an enemy drops a shield charge
  shardScore: 25,
  heartHeal: 20,
};

// Nova bomb: a panic button. Q detonates it — every enemy on screen
// takes heavy damage and every enemy orb is cleared. Charges are
// scarce: one to start, one more every 3 waves cleared, or from an
// upgrade. Spending it is a real choice, not a reflex.
export const BOMB = {
  damage: 60,
  startCharges: 1,
  maxCharges: 3,
  grantEveryWaves: 3,
};

// Elite enemies: from wave 4, some spawns are bigger, tougher and
// worth double score, marked with a gold ring. Waves 6 and 9 are
// elite waves: half the spawns are elites.
export const ELITE = {
  unlockWave: 4,
  chance: 0.15,
  hpMul: 1.6,
  sizeMul: 1.3,
  scoreMul: 2,
  eliteWaves: [6, 9],
  eliteWaveChance: 0.5,
};

// Frenzy: a gold star pickup that doubles the fire rate for 5 seconds.
export const FRENZY = {
  duration: 5,
  fireMul: 0.5,
  dropChance: 0.04,
};

// The Shardkeeper: the boss of wave 10. A huge shard that chases
// slowly, fires rings of orbs, and calls shardlings to its side.
// Beating it — not just clearing the wave — wins the run.
export const BOSS = {
  burstEvery: 2.6, // seconds between radial orb bursts
  burstCount: 10, // orbs per burst
  orbSpeed: 150,
  summonEvery: 6, // seconds between shardling summons
  summonCount: 2,
};

export const BANNER_TIME = 3.5; // seconds the wave announcement stays up
