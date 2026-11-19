// STARSHARD — boot, the state machine and the game loop.
// States: title -> playing <-> paused, playing -> levelup -> playing,
// playing -> gameover, playing -> victory -> endless. Shot mode renders
// one frozen scene for screenshots and never starts the loop.

import { VIEW } from './config.js';
import { makeWorld, startRun, update, applyUpgrade, continueEndless } from './world.js';
import { draw, initStars } from './render.js';
import { makeInput } from './input.js';
import { makeAudio } from './audio.js';
import { buildShotWorld } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.width;
canvas.height = VIEW.height;

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const seed = Number(params.get('seed') || 1);

const input = makeInput(canvas);
const audio = makeAudio();

const BEST_KEY = 'starshard.best';
function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}
function saveBest(score) {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // Storage unavailable (file:// in some browsers): best score just
    // does not persist, the game plays the same.
  }
}

let world;
let last = performance.now();

if (shot) {
  // Screenshot mode: one deterministic frame, no loop, no input.
  world = buildShotWorld(shot, seed);
  initStars(world.rng);
  draw(ctx, world, 2.6);
} else {
  world = makeWorld((Math.random() * 1e9) | 0);
  world.best = loadBest();
  initStars(world.rng);
  requestAnimationFrame(frame);
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  draw(ctx, world, now / 1000);
  requestAnimationFrame(frame);
}

function step(dt) {
  const pressed = input.takePressed();
  const click = input.takeClick();

  if (pressed.has('m')) {
    audio.toggleMute();
  }

  if (world.state === 'title') {
    if (pressed.has('Enter') || click) {
      audio.unlock();
      audio.startMusic();
      startRun(world, loadBest());
    }
    return;
  }

  if (world.state === 'playing') {
    if (pressed.has('p') || pressed.has('Escape')) {
      world.state = 'paused';
      return;
    }
    update(world, dt, input, audio);
    if (world.state === 'gameover') saveBest(world.best);
    return;
  }

  if (world.state === 'paused') {
    if (pressed.has('r')) {
      audio.startMusic();
      startRun(world, loadBest());
    } else if (pressed.has('p') || pressed.has('Escape') || click) {
      world.state = 'playing';
    }
    return;
  }

  if (world.state === 'levelup') {
    // Click a card, or press 1 / 2 / 3.
    let choice = -1;
    if (pressed.has('1')) choice = 0;
    if (pressed.has('2')) choice = 1;
    if (pressed.has('3')) choice = 2;
    if (click) {
      const w = 300;
      const gap = 30;
      const total = 3 * w + 2 * gap;
      const x0 = (VIEW.width - total) / 2;
      for (let i = 0; i < 3; i++) {
        const x = x0 + i * (w + gap);
        if (click.x >= x && click.x <= x + w && click.y >= 250 && click.y <= 440) choice = i;
      }
    }
    if (choice >= 0) applyUpgrade(world, choice, audio);
    return;
  }

  if (world.state === 'gameover') {
    if (pressed.has('r') || pressed.has('Enter') || click) {
      audio.unlock();
      audio.startMusic();
      startRun(world, loadBest());
    }
    return;
  }

  if (world.state === 'victory') {
    if (pressed.has('Enter')) {
      continueEndless(world, audio);
    } else if (pressed.has('r') || click) {
      audio.startMusic();
      startRun(world, loadBest());
    }
    return;
  }
}

// ---------------------------------------------------------------------------
// Agent Arena bridge (added for the STARSHARD Agent Arena site; the game
// logic above is untouched). Exposes read-only run state so the page panel
// can offer on-chain score submission after a run ends. No game state is
// written from here.
// ---------------------------------------------------------------------------
window.__starshard = {
  get state() { return world.state; },
  get score() { return world.score | 0; },
  get best() { return world.best | 0; },
  get wave() { return world.wave | 0; },
};
