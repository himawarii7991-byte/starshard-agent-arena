// keccak256 — minimal, dependency-free Keccak-f[1600] implementation.
//
// This is the ORIGINAL Keccak padding (suffix 0x01, rate 1088 bits), as
// used by Ethereum — NOT NIST SHA-3 (suffix 0x06). No libraries, no CDN:
// the whole site stays static and offline-capable except for its BSC
// JSON-RPC reads.
//
// Verified against ethers v6 keccak256 — see tests/keccak-check.mjs,
// which checks the empty string, "abc", "minkymomo" (whose tokenId
// 0x3ba8f89f… is verified on-chain against the Agent ID registry) and
// the ScoreSubmitted / NewBest event signatures.

const MASK64 = (1n << 64n) - 1n;

// Round constants, Keccak-f[1600].
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
  0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
  0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
  0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
  0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

// Rotation offsets r[x][y].
const R = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

function rotl(v, n) {
  if (n === 0) return v;
  const b = BigInt(n);
  return ((v << b) | (v >> (64n - b))) & MASK64;
}

function keccakF1600(a) {
  const b = new Array(25).fill(0n);
  const c = new Array(5).fill(0n);
  for (let round = 0; round < 24; round++) {
    // Theta
    for (let x = 0; x < 5; x++) {
      c[x] = a[x] ^ a[x + 5] ^ a[x + 10] ^ a[x + 15] ^ a[x + 20];
    }
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y++) a[x + 5 * y] ^= d;
    }
    // Rho + Pi
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(a[x + 5 * y], R[x][y]);
      }
    }
    // Chi
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        a[x + 5 * y] =
          b[x + 5 * y] ^ (~b[((x + 1) % 5) + 5 * y] & b[((x + 2) % 5) + 5 * y]);
      }
    }
    // Iota
    a[0] ^= RC[round];
  }
  return a;
}

const RATE_BYTES = 136; // 1088 bits
const UTF8 = new TextEncoder();

/** keccak256 of a Uint8Array. Returns a "0x…" hex string. */
export function keccak256Bytes(bytes) {
  const state = new Array(25).fill(0n);
  // pad10*1, suffix 0x01
  const paddedLen =
    Math.floor((bytes.length + 1 + RATE_BYTES - 1) / RATE_BYTES) * RATE_BYTES;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes, 0);
  padded[bytes.length] = 0x01;
  padded[paddedLen - 1] |= 0x80;
  for (let off = 0; off < paddedLen; off += RATE_BYTES) {
    for (let i = 0; i < RATE_BYTES / 8; i++) {
      let lane = 0n;
      for (let j = 0; j < 8; j++) {
        lane |= BigInt(padded[off + i * 8 + j]) << BigInt(8 * j);
      }
      state[i] ^= lane;
    }
    keccakF1600(state);
  }
  // Squeeze 32 bytes, little-endian lanes.
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let lane = state[i];
    for (let j = 0; j < 8; j++) {
      out[i * 8 + j] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }
  return (
    "0x" + [...out].map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

/** keccak256 of a UTF-8 string. Returns a "0x…" hex string. */
export function keccak256String(str) {
  return keccak256Bytes(UTF8.encode(str));
}

/** 4-byte function selector (0x…) of a canonical signature, e.g. "balanceOf(address)". */
export function selector(sig) {
  return keccak256String(sig).slice(0, 10);
}

/** Event topic (full keccak256) of a canonical event signature. */
export function topic(sig) {
  return keccak256String(sig);
}

/** Token ID of an Agent ID name: uint256(keccak256(name)), as a 32-byte hex string. */
export function agentIdTokenId(name) {
  return keccak256String(name);
}
