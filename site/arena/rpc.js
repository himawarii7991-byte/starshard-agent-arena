// rpc.js — minimal BSC JSON-RPC client + ABI encode/decode helpers.
// No libraries, no CDN: plain fetch() against public BSC RPCs, rotating
// on failure. All reads work without a connected wallet.

export const DEFAULT_RPCS = [
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc.publicnode.com",
];

const FETCH_TIMEOUT_MS = 15000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One JSON-RPC call against a single endpoint. Throws on network or RPC error. */
async function rpcOnce(url, method, params) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) {
      const err = new Error(json.error.message || "RPC error");
      err.code = json.error.code;
      err.data = json.error.data;
      throw err;
    }
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * JSON-RPC call, rotating through the configured endpoints.
 * Retries once per endpoint with a short back-off; throws if all fail.
 */
export async function rpc(method, params, rpcUrls = DEFAULT_RPCS) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const url of rpcUrls) {
      try {
        return await rpcOnce(url, method, params);
      } catch (e) {
        lastErr = e;
      }
    }
    await sleep(400 * (attempt + 1));
  }
  throw lastErr || new Error("all RPC endpoints failed");
}

/** eth_call that returns null instead of throwing when the call reverts. */
export async function ethCallRevertible(to, data, rpcUrls) {
  try {
    return await rpc("eth_call", [{ to, data }, "latest"], rpcUrls);
  } catch (e) {
    if (e && (e.code === 3 || /revert/i.test(e.message || ""))) return null;
    throw e;
  }
}

export async function ethBlockNumber(rpcUrls) {
  const hex = await rpc("eth_blockNumber", [], rpcUrls);
  return Number(BigInt(hex));
}

export async function ethGasPrice(rpcUrls) {
  const hex = await rpc("eth_gasPrice", [], rpcUrls);
  return BigInt(hex);
}

export async function ethGetBalance(address, rpcUrls) {
  const hex = await rpc("eth_getBalance", [address, "latest"], rpcUrls);
  return BigInt(hex);
}

export async function ethGetLogs(address, topics, fromBlock, toBlock, rpcUrls) {
  return rpc(
    "eth_getLogs",
    [
      {
        address,
        topics,
        fromBlock: "0x" + fromBlock.toString(16),
        toBlock: "0x" + toBlock.toString(16),
      },
    ],
    rpcUrls,
  );
}

export async function ethGetTransactionReceipt(txHash, rpcUrls) {
  return rpc("eth_getTransactionReceipt", [txHash], rpcUrls);
}

// ---------------------------------------------------------------------------
// ABI helpers (hand-rolled; selectors come from keccak.js)
// ---------------------------------------------------------------------------

const HEX = "0123456789abcdef";

export function hexToBytes(hex) {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes) {
  let s = "0x";
  for (const b of bytes) s += HEX[b >> 4] + HEX[b & 15];
  return s;
}

export function pad32Hex(hexWithout0x) {
  return hexWithout0x.padStart(64, "0");
}

/** ABI-encode an address (20 bytes) as a 32-byte word. */
export function encAddress(addr) {
  return pad32Hex(addr.toLowerCase().replace(/^0x/, ""));
}

/** ABI-encode an unsigned integer as a 32-byte word. */
export function encUint(value) {
  return pad32Hex(BigInt(value).toString(16));
}

/** ABI-encode a UTF-8 string as (offset-independent) length + padded data. */
export function encStringTail(str) {
  const bytes = new TextEncoder().encode(str);
  const len = pad32Hex(bytes.length.toString(16));
  const data = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return len + data + "00".repeat((32 - (bytes.length % 32)) % 32);
}

/** Calldata for submitScore(uint256 score, string name). */
export function encodeSubmitScore(selectorHex, score, name) {
  const head = selectorHex.slice(2) + encUint(score) + encUint(0x40);
  return "0x" + head + encStringTail(name);
}

/** Decode a uint256 return value (0x hex) to BigInt. */
export function decodeUint(hex) {
  return BigInt(hex);
}

/** Decode an address return value (0x + 32-byte word) to a checksummed-ish lowercase address. */
export function decodeAddress(hex) {
  return "0x" + hex.slice(-40).toLowerCase();
}

/** Decode a string return value (0x hex, offset+length+data) to a JS string. */
export function decodeString(hex) {
  const bytes = hexToBytes(hex);
  const off = Number(
    bytes.slice(0, 32).reduce((a, b) => (a << 8n) | BigInt(b), 0n),
  );
  const len = Number(
    bytes.slice(off, off + 32).reduce((a, b) => (a << 8n) | BigInt(b), 0n),
  );
  return new TextDecoder().decode(bytes.slice(off + 32, off + 32 + len));
}

/** Decode a bool return value. */
export function decodeBool(hex) {
  return BigInt(hex) !== 0n;
}

/**
 * Decode a ScoreSubmitted log. Returns
 * { player, agentName, score, best, timestamp, blockNumber, txHash }.
 * Log data layout: string offset | score | best | timestamp | string length | string bytes.
 */
export function decodeScoreSubmittedLog(log) {
  const player = decodeAddress(log.topics[1]);
  const bytes = hexToBytes(log.data);
  const word = (i) =>
    bytes.slice(i * 32, i * 32 + 32).reduce((a, b) => (a << 8n) | BigInt(b), 0n);
  const strOff = Number(word(0));
  const score = word(1);
  const best = word(2);
  const timestamp = word(3);
  // String length word sits at byte offset strOff; the bytes follow it.
  const len = Number(word(strOff / 32));
  const agentName = new TextDecoder().decode(
    bytes.slice(strOff + 32, strOff + 32 + len),
  );
  return {
    player,
    agentName,
    score,
    best,
    timestamp,
    blockNumber: Number(BigInt(log.blockNumber)),
    txHash: log.transactionHash,
  };
}
