// STARSHARD Agent Arena — single place for deployment settings.
//
// HOW TO GO LIVE (after the contract is deployed on BNB Chain mainnet):
//   1. Set CONTRACT_ADDRESS to the deployed StarshardArena address.
//   2. Set DEPLOY_BLOCK to the block number of the deployment transaction.
//   3. Leave everything else as-is. The leaderboard reads itself from
//      the contract — no other change is needed.
//
// Until then (CONTRACT_ADDRESS = "") the site shows a clear
// "contract not deployed yet" state on the leaderboard, and score
// submission is disabled. The game itself is always free to play,
// with or without a wallet.
//
// TEST OVERRIDES (local testing only): on localhost the page also honours
// URL query parameters ?contract=0x…&rpc=https://…&deployBlock=N&chainId=N,
// so a local Hardhat deployment can be exercised without editing this file.
// On any other host the overrides are ignored, so a crafted public link
// cannot point the page at a fake contract, RPC or registry.

export const CONFIG = {
  // Deployed StarshardArena contract on BNB Smart Chain (chainId 56).
  // Empty string = not deployed yet.
  CONTRACT_ADDRESS: "0x2456102c0A3bd670828DBa2DE91Ca064Fe9B13Dc",

  // Block the contract was deployed in (limits the leaderboard log scan).
  // 0 = unknown / not deployed.
  DEPLOY_BLOCK: 134433848,

  // BNB Smart Chain mainnet.
  CHAIN_ID: 56,
  CHAIN_NAME: "BNB Smart Chain",
  CHAIN_HEX: "0x38",

  // SPACE ID Agent ID registry (ERC-721) on BNB Chain mainnet.
  REGISTRY_ADDRESS: "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F",

  // Public BSC JSON-RPC endpoints (rotated on failure).
  RPC_URLS: [
    "https://bsc-dataseed.bnbchain.org",
    "https://bsc-dataseed1.defibit.io",
    "https://bsc.publicnode.com",
  ],

  // BscScan base for transaction links.
  EXPLORER_TX: "https://bscscan.com/tx/",
  EXPLORER_ADDRESS: "https://bscscan.com/address/",

  // Leaderboard scan: eth_getLogs chunk size (blocks) and hard cap.
  LOG_CHUNK_BLOCKS: 10000,
  LOG_MAX_CHUNKS: 200,
};

/** Effective config, with ?contract / ?rpc / ?deployBlock / ?chainId overrides applied. */
export function effectiveConfig() {
  const cfg = { ...CONFIG, RPC_URLS: [...CONFIG.RPC_URLS] };
  // Overrides are a local-testing aid only. Ignore them on any public host
  // so a crafted link cannot serve fake verification data.
  const host = typeof location !== "undefined" ? location.hostname : "";
  const isLocalHost =
    host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "";
  if (!isLocalHost) return cfg;
  const q = new URLSearchParams(location.search);
  const contract = q.get("contract");
  if (contract && /^0x[0-9a-fA-F]{40}$/.test(contract)) {
    cfg.CONTRACT_ADDRESS = contract;
  }
  const rpc = q.get("rpc");
  if (rpc) cfg.RPC_URLS = [rpc, ...cfg.RPC_URLS];
  const deployBlock = q.get("deployBlock");
  if (deployBlock !== null && /^\d+$/.test(deployBlock)) {
    cfg.DEPLOY_BLOCK = Number(deployBlock);
  }
  const chainId = q.get("chainId");
  if (chainId !== null && /^\d+$/.test(chainId)) {
    cfg.CHAIN_ID = Number(chainId);
    cfg.CHAIN_HEX = "0x" + cfg.CHAIN_ID.toString(16);
    cfg.CHAIN_NAME = `Chain ${cfg.CHAIN_ID}`;
  }
  const registry = q.get("registry");
  if (registry && /^0x[0-9a-fA-F]{40}$/.test(registry)) {
    cfg.REGISTRY_ADDRESS = registry;
  }
  return cfg;
}
