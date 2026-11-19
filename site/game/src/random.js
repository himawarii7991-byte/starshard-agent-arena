// Seeded random numbers (mulberry32) so a screenshot scene and a
// replayed wave always come out the same way for the same seed.
// Gameplay uses a seed from the clock; screenshot mode uses a fixed one.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, min, max) {
  return min + rng() * (max - min);
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function pickDistinct(rng, list, count) {
  const copy = list.slice();
  const out = [];
  while (copy.length > 0 && out.length < count) {
    out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  }
  return out;
}

export function chance(rng, p) {
  return rng() < p;
}
