// Keyboard and mouse state, in game coordinates (the canvas is scaled
// to fit the window, so mouse positions are mapped back to 1280x720).

import { VIEW } from './config.js';

export function makeInput(canvas) {
  const keys = new Set();
  const mouse = { x: VIEW.width / 2, y: VIEW.height / 2, down: false, rightDown: false };
  const pressed = new Set(); // keys pressed since last frame (edge-triggered)
  let clicked = null; // {x, y} of the latest click, consumed by menus

  function toGame(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * VIEW.width,
      y: ((clientY - rect.top) / rect.height) * VIEW.height,
    };
  }

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!e.repeat) pressed.add(key);
    keys.add(key);
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  });
  canvas.addEventListener('mousemove', (e) => {
    const p = toGame(e.clientX, e.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouse.down = true;
    if (e.button === 2) mouse.rightDown = true;
    const p = toGame(e.clientX, e.clientY);
    clicked = { x: p.x, y: p.y, button: e.button };
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.rightDown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
    mouse.rightDown = false;
  });

  return {
    keys,
    mouse,
    pressed,
    moveX() {
      return (keys.has('d') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('a') || keys.has('ArrowLeft') ? 1 : 0);
    },
    moveY() {
      return (keys.has('s') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('w') || keys.has('ArrowUp') ? 1 : 0);
    },
    firing() {
      return mouse.down || keys.has(' ');
    },
    dashPressed() {
      return pressed.has('Shift') || mouse.rightDown;
    },
    bombPressed() {
      return pressed.has('q');
    },
    takeClick() {
      const c = clicked;
      clicked = null;
      return c;
    },
    takePressed() {
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
  };
}
