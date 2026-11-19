// Every pixel the player sees: the starfield, the actors, the HUD and
// every menu screen. world.js owns the state; this file only reads it.

import { VIEW, PALETTE } from './config.js';

const FONT = '"Trebuchet MS", Verdana, sans-serif';

function makeStars(rng, count) {
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rng() * VIEW.width,
      y: rng() * VIEW.height,
      r: 0.6 + rng() * 1.6,
      tw: rng() * Math.PI * 2,
      depth: 0.2 + rng() * 0.8,
    });
  }
  return stars;
}

let stars = null;
let nebulae = null;

export function drawBackground(ctx, world, t) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  g.addColorStop(0, PALETTE.spaceTop);
  g.addColorStop(1, PALETTE.spaceBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  if (!nebulae) {
    nebulae = [
      { x: 260, y: 150, r: 320, c: PALETTE.nebulaA },
      { x: 1050, y: 560, r: 360, c: PALETTE.nebulaB },
      { x: 900, y: 120, r: 260, c: PALETTE.nebulaC },
    ];
  }
  for (const n of nebulae) {
    const rg = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    rg.addColorStop(0, n.c);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
  }
}

export function initStars(rng) {
  stars = makeStars(rng, 130);
}

export function drawStars(ctx, t, px, py) {
  if (!stars) return;
  for (const s of stars) {
    const a = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.5 + s.tw));
    ctx.globalAlpha = a;
    ctx.fillStyle = PALETTE.star;
    const ox = (VIEW.width / 2 - px) * 0.02 * s.depth;
    const oy = (VIEW.height / 2 - py) * 0.02 * s.depth;
    ctx.beginPath();
    ctx.arc(s.x + ox, s.y + oy, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function poly(ctx, x, y, r, points, rot) {
  ctx.beginPath();
  for (let i = 0; i < points; i++) {
    const a = rot + (i / points) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawPlayer(ctx, p, t) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.invulnerable > 0 && Math.floor(t * 14) % 2 === 0) ctx.globalAlpha = 0.45;
  ctx.rotate(p.angle);
  // Hull: a sleek dart with a bright core.
  ctx.shadowColor = PALETTE.player;
  ctx.shadowBlur = 18;
  ctx.fillStyle = PALETTE.player;
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(-14, 13);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-14, -13);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = PALETTE.playerCore;
  ctx.beginPath();
  ctx.arc(4, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Shield ring.
  if (p.shield > 0) {
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 4);
    ctx.strokeStyle = '#9db4ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius + 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawEnemy(ctx, e, t) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const flash = e.flash > 0;
  ctx.fillStyle = flash ? '#ffffff' : e.color;
  ctx.strokeStyle = flash ? '#ffffff' : e.color;
  ctx.shadowColor = e.color;
  ctx.shadowBlur = 14;
  if (e.kind === 'drifter') {
    poly(ctx, 0, 0, e.radius, 8, t * 0.6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0b1030';
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.kind === 'darter') {
    const a = Math.atan2(e.vy, e.vx);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(e.radius + 6, 0);
    ctx.lineTo(-e.radius, e.radius * 0.8);
    ctx.lineTo(-e.radius * 0.4, 0);
    ctx.lineTo(-e.radius, -e.radius * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    if (e.state === 'aim') {
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 20);
      ctx.strokeStyle = '#ff5470';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (e.kind === 'splitter') {
    poly(ctx, 0, 0, e.radius, 6, t * 0.4);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0b1030';
    poly(ctx, 0, 0, e.radius * 0.55, 6, -t * 0.4);
    ctx.fill();
  } else if (e.kind === 'spitter') {
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-e.radius * 0.75, -e.radius * 0.75, e.radius * 1.5, e.radius * 1.5);
    ctx.shadowBlur = 0;
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#f2f6ff';
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.kind === 'bulwark') {
    poly(ctx, 0, 0, e.radius, 6, 0);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#0b1030';
    ctx.lineWidth = 4;
    poly(ctx, 0, 0, e.radius * 0.7, 6, 0);
    ctx.stroke();
    ctx.fillStyle = '#0b1030';
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.kind === 'stinger') {
    // A slim cyan dart, fast and weaving.
    const a = Math.atan2(e.vy, e.vx);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(e.radius + 8, 0);
    ctx.lineTo(-e.radius, e.radius * 0.7);
    ctx.lineTo(-e.radius * 0.3, 0);
    ctx.lineTo(-e.radius, -e.radius * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#eafcff';
    ctx.beginPath();
    ctx.arc(2, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.kind === 'boss') {
    // The Shardkeeper: a huge magenta shard with a counter-rotating
    // inner hex and a gold core. It reads as the boss at any size.
    poly(ctx, 0, 0, e.radius, 6, t * 0.3);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 3;
    poly(ctx, 0, 0, e.radius * 0.78, 6, -t * 0.5);
    ctx.stroke();
    ctx.fillStyle = '#0b1030';
    poly(ctx, 0, 0, e.radius * 0.55, 6, -t * 0.5);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // shardling
    poly(ctx, 0, 0, e.radius, 3, t * 3);
    ctx.fill();
  }
  ctx.restore();
  // Elite enemies wear a gold ring so they read at a glance.
  if (e.elite) {
    ctx.save();
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 5);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // HP bar for tough enemies.
  if ((e.kind === 'bulwark' || e.kind === 'spitter' || e.kind === 'boss' || e.elite) && e.hp < e.maxHp) {
    const w = e.radius * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(e.x - w / 2, e.y - e.radius - 12, w, 5);
    ctx.fillStyle = e.color;
    ctx.fillRect(e.x - w / 2, e.y - e.radius - 12, w * (e.hp / e.maxHp), 5);
  }
}

function drawBullets(ctx, world) {
  for (const b of world.bullets) {
    ctx.save();
    // A short trail behind each shot, so fire reads as motion.
    ctx.strokeStyle = 'rgba(255, 224, 102, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.shadowColor = PALETTE.bullet;
    ctx.shadowBlur = 10;
    ctx.fillStyle = PALETTE.bullet;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (const b of world.enemyBullets) {
    ctx.save();
    ctx.shadowColor = PALETTE.enemySpitter;
    ctx.shadowBlur = 10;
    ctx.fillStyle = PALETTE.enemySpitter;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawPickups(ctx, world, t) {
  for (const pk of world.pickups) {
    const bob = Math.sin(pk.bob) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    ctx.shadowBlur = 12;
    if (pk.kind === 'shard') {
      ctx.shadowColor = PALETTE.shard;
      ctx.fillStyle = PALETTE.shard;
      ctx.rotate(t * 2);
      ctx.fillRect(-5, -5, 10, 10);
    } else if (pk.kind === 'heart') {
      ctx.shadowColor = PALETTE.heart;
      ctx.fillStyle = PALETTE.heart;
      ctx.beginPath();
      ctx.arc(-4, -2, 5, 0, Math.PI * 2);
      ctx.arc(4, -2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(0, 10);
      ctx.lineTo(8, 0);
      ctx.closePath();
      ctx.fill();
    } else if (pk.kind === 'frenzy') {
      // Gold star: double fire rate while it lasts.
      ctx.shadowColor = PALETTE.gold;
      ctx.fillStyle = PALETTE.gold;
      poly(ctx, 0, 0, 11, 5, t * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0b1030';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.shadowColor = '#9db4ff';
      ctx.strokeStyle = '#9db4ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#9db4ff';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawParticles(ctx, world) {
  for (const pt of world.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(ctx, world) {
  ctx.font = `bold 16px ${FONT}`;
  ctx.textAlign = 'center';
  for (const f of world.floaters) {
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function bar(ctx, x, y, w, h, frac, color, bg) {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
}

function drawHud(ctx, world) {
  const p = world.player;
  ctx.textAlign = 'left';
  // Score, big and top-left.
  ctx.font = `bold 30px ${FONT}`;
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(String(world.score).padStart(6, '0'), 24, 44);
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = PALETTE.textDim;
  ctx.fillText(`WAVE ${world.wave} / 10`, 24, 70);
  ctx.fillText(`BEST ${Math.max(world.best, world.score)}`, 24, 92);
  // HP bar.
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillStyle = PALETTE.textDim;
  ctx.fillText('HULL', 24, 122);
  bar(ctx, 24, 130, 220, 14, p.hp / p.maxHp, p.hp > 30 ? '#35f0ff' : '#ff5470', 'rgba(255,255,255,0.12)');
  ctx.fillStyle = PALETTE.text;
  ctx.font = `13px ${FONT}`;
  ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, 252, 143);
  // Shield pips.
  for (let i = 0; i < p.shieldMax; i++) {
    ctx.beginPath();
    ctx.arc(34 + i * 22, 164, 7, 0, Math.PI * 2);
    ctx.fillStyle = i < p.shield ? '#9db4ff' : 'rgba(255,255,255,0.15)';
    ctx.fill();
  }
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = `13px ${FONT}`;
  ctx.fillText('SHIELD', 34 + p.shieldMax * 22 + 8, 169);
  // Dash cooldown, top-right.
  const dashFrac = 1 - p.dashTimer / p.dashCooldown;
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillText('DASH  [SHIFT]', VIEW.width - 24, 40);
  bar(ctx, VIEW.width - 224, 50, 200, 10, dashFrac, dashFrac >= 1 ? '#35f0ff' : '#5a6b94', 'rgba(255,255,255,0.12)');
  // Enemies left, under it.
  ctx.fillStyle = PALETTE.text;
  ctx.font = `16px ${FONT}`;
  ctx.fillText(`HOSTILES ${world.enemies.length + world.queue.length}`, VIEW.width - 24, 92);
  // Nova charges, under that.
  ctx.fillStyle = p.bombs > 0 ? PALETTE.gold : PALETTE.textDim;
  ctx.fillText(`NOVA [Q]  ${'●'.repeat(p.bombs)}${'○'.repeat(p.bombMax - p.bombs)}`, VIEW.width - 24, 118);
  // Frenzy timer, under that.
  if (p.frenzyTimer > 0) {
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(`FRENZY ${p.frenzyTimer.toFixed(1)}s`, VIEW.width - 24, 142);
  }
  // Combo, centre-top, only while it runs.
  if (world.combo >= 4) {
    ctx.textAlign = 'center';
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(`COMBO x${world.comboTier}  (${world.combo})`, VIEW.width / 2, 48);
  }
  // Boss bar, centre-top, while the Shardkeeper lives.
  const boss = world.enemies.find((e) => e.kind === 'boss');
  if (boss) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff2d95';
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText('THE SHARDKEEPER', VIEW.width / 2, 74);
    bar(ctx, VIEW.width / 2 - 200, 82, 400, 12, boss.hp / boss.maxHp, '#ff2d95', 'rgba(255,255,255,0.12)');
  }
  ctx.textAlign = 'left';
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(5, 8, 20, 0.82)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(53, 240, 255, 0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

function drawTitle(ctx, world, t) {
  ctx.fillStyle = 'rgba(3, 5, 15, 0.45)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.player;
  ctx.font = `bold 84px ${FONT}`;
  ctx.shadowColor = PALETTE.player;
  ctx.shadowBlur = 26;
  ctx.fillText('STARSHARD', VIEW.width / 2, 210);
  ctx.shadowBlur = 0;
  ctx.fillStyle = PALETTE.text;
  ctx.font = `24px ${FONT}`;
  ctx.fillText('Hold the arena. Break the waves. Forge the shards.', VIEW.width / 2, 256);
  panel(ctx, VIEW.width / 2 - 330, 300, 660, 215);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `19px ${FONT}`;
  const lines = [
    'WASD / Arrows — fly     Mouse — aim     Hold click / Space — fire',
    'Shift / Right-click — dash     P — pause     M — mute',
    'Clear 10 waves to win. Wave 10 is the Shardkeeper — beat the boss.',
    'Shards are score. Hearts heal. Blue rings are shields.',
    'Q — nova bomb: hurts every enemy, clears their shots. Use it well.',
    'Gold stars grant frenzy: double fire rate for 5s.',
  ];
  lines.forEach((l, i) => ctx.fillText(l, VIEW.width / 2, 336 + i * 34));
  const pulse = 0.6 + 0.4 * Math.sin(t * 3);
  ctx.globalAlpha = pulse;
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `bold 28px ${FONT}`;
  ctx.fillText('CLICK OR PRESS ENTER TO START', VIEW.width / 2, 556);
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = `17px ${FONT}`;
  ctx.fillText(world.best > 0 ? `Best score: ${world.best}` : 'No runs yet — make this one count.', VIEW.width / 2, 600);
}

function drawLevelup(ctx, world) {
  ctx.fillStyle = 'rgba(3, 5, 15, 0.55)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillText(`WAVE ${world.wave} CLEAR`, VIEW.width / 2, 150);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `22px ${FONT}`;
  ctx.fillText('Choose an upgrade — click a card or press 1, 2 or 3', VIEW.width / 2, 190);
  // The run so far, in one line: kills, accuracy, time.
  const acc = world.stats.shots > 0 ? Math.round((world.stats.hits / world.stats.shots) * 100) : 100;
  const mins = Math.floor(world.runTime / 60);
  const secs = String(Math.floor(world.runTime % 60)).padStart(2, '0');
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = `18px ${FONT}`;
  ctx.fillText(`Kills ${world.kills}    Accuracy ${acc}%    Time ${mins}:${secs}`, VIEW.width / 2, 222);
  const w = 300;
  const h = 190;
  const gap = 30;
  const total = 3 * w + 2 * gap;
  const x0 = (VIEW.width - total) / 2;
  world.upgrades.forEach((up, i) => {
    const x = x0 + i * (w + gap);
    const y = 250;
    panel(ctx, x, y, w, h);
    ctx.fillStyle = PALETTE.player;
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillText(up.name, x + w / 2, y + 58);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `17px ${FONT}`;
    ctx.fillText(up.desc, x + w / 2, y + 100);
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `17px ${FONT}`;
    ctx.fillText(`[${i + 1}]`, x + w / 2, y + 150);
  });
}

function drawBanner(ctx, world) {
  if (world.bannerTimer <= 0 || !world.banner) return;
  const a = Math.min(1, world.bannerTimer / 1.5);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.font = `bold 44px ${FONT}`;
  ctx.shadowColor = PALETTE.gold;
  ctx.shadowBlur = 20;
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText(world.banner, VIEW.width / 2, 200);
  ctx.restore();
}

function drawLowHp(ctx, world, t) {
  const p = world.player;
  if (!p.alive || p.hp >= 30 || world.state !== 'playing') return;
  const a = 0.22 + 0.13 * Math.sin(t * 6);
  ctx.save();
  ctx.strokeStyle = `rgba(255, 84, 112, ${a.toFixed(3)})`;
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, VIEW.width - 12, VIEW.height - 12);
  ctx.restore();
}

function drawPaused(ctx) {
  ctx.fillStyle = 'rgba(3, 5, 15, 0.6)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.font = `bold 52px ${FONT}`;
  ctx.fillText('PAUSED', VIEW.width / 2, 330);
  ctx.font = `20px ${FONT}`;
  ctx.fillStyle = PALETTE.textDim;
  ctx.fillText('Press P or Esc to resume', VIEW.width / 2, 380);
  ctx.fillText('Press R to restart the run', VIEW.width / 2, 414);
}

function drawGameOver(ctx, world) {
  ctx.fillStyle = 'rgba(20, 4, 10, 0.62)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.danger;
  ctx.font = `bold 64px ${FONT}`;
  ctx.fillText('SHIP LOST', VIEW.width / 2, 250);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `28px ${FONT}`;
  ctx.fillText(`Score  ${world.score}`, VIEW.width / 2, 310);
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = `20px ${FONT}`;
  ctx.fillText(`Waves cleared: ${world.wave - 1}    Kills: ${world.kills}    Best: ${world.best}`, VIEW.width / 2, 350);
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `bold 26px ${FONT}`;
  ctx.fillText('Press R or click to fly again', VIEW.width / 2, 430);
}

function drawVictory(ctx, world) {
  ctx.fillStyle = 'rgba(4, 16, 10, 0.6)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `bold 64px ${FONT}`;
  ctx.shadowColor = PALETTE.gold;
  ctx.shadowBlur = 24;
  ctx.fillText('STARFORGED!', VIEW.width / 2, 250);
  ctx.shadowBlur = 0;
  ctx.fillStyle = PALETTE.text;
  ctx.font = `26px ${FONT}`;
  ctx.fillText('The Shardkeeper falls. The arena is yours.', VIEW.width / 2, 305);
  ctx.fillStyle = PALETTE.textDim;
  ctx.font = `20px ${FONT}`;
  ctx.fillText(`Score  ${world.score}    Kills: ${world.kills}    Time: ${Math.floor(world.runTime / 60)}:${String(Math.floor(world.runTime % 60)).padStart(2, '0')}`, VIEW.width / 2, 350);
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `bold 26px ${FONT}`;
  ctx.fillText('Press Enter for endless mode, or R to restart', VIEW.width / 2, 430);
}

export function draw(ctx, world, t) {
  ctx.save();
  if (world.shake > 0) {
    ctx.translate((Math.random() - 0.5) * world.shake, (Math.random() - 0.5) * world.shake);
  }
  drawBackground(ctx, world, t);
  drawStars(ctx, t, world.player.x, world.player.y);
  drawPickups(ctx, world, t);
  drawBullets(ctx, world);
  for (const e of world.enemies) drawEnemy(ctx, e, t);
  if (world.player.alive && world.state !== 'title') drawPlayer(ctx, world.player, t);
  drawParticles(ctx, world);
  drawFloaters(ctx, world);
  ctx.restore();

  if (world.state === 'title') drawTitle(ctx, world, t);
  else if (world.state === 'levelup') {
    drawHud(ctx, world);
    drawLevelup(ctx, world);
  } else if (world.state === 'paused') {
    drawHud(ctx, world);
    drawPaused(ctx);
  } else if (world.state === 'gameover') drawGameOver(ctx, world);
  else if (world.state === 'victory') drawVictory(ctx, world);
  else {
    drawHud(ctx, world);
    drawBanner(ctx, world);
    drawLowHp(ctx, world, t);
  }
}
