// arena.js — Agent Arena panel: wallet connect, Agent ID checks,
// on-chain score submission, and the event-based leaderboard.
//
// Rules enforced here (hackathon safety red lines):
//  - Wallet access ONLY through the injected provider (window.ethereum,
//    or window.BinanceChain on older Binance wallets). No QR-code login,
//    no pairing-code entry, no session storage on any server.
//  - Every transaction is sent with eth_sendTransaction so the USER
//    confirms it in their own wallet. Nothing is ever auto-signed.
//  - No token approvals, no transfers, no value sent (value: 0x0).
//  - All reads (leaderboard, Agent ID checks) work WITHOUT a wallet,
//    via public BSC JSON-RPC endpoints.

import { CONFIG, effectiveConfig } from "./config.js";
import {
  keccak256String,
  selector,
  topic,
  agentIdTokenId,
} from "./keccak.js";
import {
  rpc,
  ethCallRevertible,
  ethBlockNumber,
  ethGasPrice,
  ethGetBalance,
  ethGetLogs,
  ethGetTransactionReceipt,
  encAddress,
  encUint,
  encodeSubmitScore,
  decodeUint,
  decodeAddress,
  decodeString,
  decodeScoreSubmittedLog,
} from "./rpc.js";
import {
  buildDeployData,
  DEPLOY_DATA_BYTES,
  DEPLOY_ESTIMATED_GAS,
} from "./deploy-data.js";

const cfg = effectiveConfig();

const SEL = {
  balanceOf: selector("balanceOf(address)"),
  ownerOf: selector("ownerOf(uint256)"),
  playerCount: selector("playerCount()"),
  getPlayer: selector("getPlayer(uint256)"),
  bestScore: selector("bestScore(address)"),
  agentName: selector("agentName(address)"),
  totalSubmissions: selector("totalSubmissions()"),
  submitScore: selector("submitScore(uint256,string)"),
};
const TOPIC_SCORE_SUBMITTED = topic(
  "ScoreSubmitted(address,string,uint256,uint256,uint256)",
);

const $ = (id) => document.getElementById(id);
const shortAddr = (a) => a.slice(0, 6) + "…" + a.slice(-4);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const state = {
  provider: null,
  account: null,
  chainId: null,
  hasAgentId: null, // null = unchecked, true/false = checked
  verifiedName: null,
  submitting: false,
  deploying: false,
  deploySummaryReady: false,
  deployBalanceOk: null, // null = unknown (gas price unreadable), true/false = checked
  lastScore: 0,
  best: 0,
  gameState: "title",
};

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function show(id) {
  const el = $(id);
  if (el) el.hidden = false;
}
function hide(id) {
  const el = $(id);
  if (el) el.hidden = true;
}

// ---------------------------------------------------------------------------
// Game bridge polling — reads window.__starshard (set by game/src/main.js)
// ---------------------------------------------------------------------------

function pollGame() {
  const g = window.__starshard;
  if (!g) return;
  state.gameState = g.state || "title";
  state.lastScore = g.score | 0;
  state.best = g.best | 0;
  setText("run-state", `State: ${state.gameState}`);
  setText("run-last", `Last run: ${state.lastScore.toLocaleString("en-US")}`);
  setText("run-best", `Best: ${state.best.toLocaleString("en-US")}`);
  refreshSubmitButton();
}

function refreshSubmitButton() {
  const btn = $("btn-submit-score");
  if (!btn) return;
  const ready =
    cfg.CONTRACT_ADDRESS &&
    state.account &&
    state.chainId === cfg.CHAIN_ID &&
    state.hasAgentId === true &&
    state.verifiedName &&
    state.best > 0 &&
    !state.submitting;
  btn.disabled = !ready;
  if (!cfg.CONTRACT_ADDRESS) {
    btn.title = "Leaderboard contract not deployed yet";
  } else if (!state.account) {
    btn.title = "Connect your wallet first";
  } else if (state.chainId !== cfg.CHAIN_ID) {
    btn.title = `Switch your wallet to ${cfg.CHAIN_NAME}`;
  } else if (state.hasAgentId === false) {
    btn.title = "This wallet holds no Agent ID";
  } else if (!state.verifiedName) {
    btn.title = "Verify your Agent ID name first";
  } else if (state.best <= 0) {
    btn.title = "Play a run first — no score to submit yet";
  } else {
    btn.title = `Submit your best score (${state.best.toLocaleString("en-US")}) on-chain`;
  }
}

// ---------------------------------------------------------------------------
// Wallet (injected provider only)
// ---------------------------------------------------------------------------

// Shown when no injected wallet is present. Tells the user exactly where
// to open the page — dApp browsers often inject the provider only after
// the page has loaded, so the Connect button re-detects on every click.
const NO_WALLET_MESSAGE =
  "No wallet found in this browser. Open this page in the Binance App's dApp browser (Web3 Wallet → Discover/browser → paste this link) or in a browser with the Binance Wallet / MetaMask extension, then tap Connect again. The game itself is free to play without a wallet.";

function detectProvider() {
  // Prefer window.ethereum; older Binance wallets expose
  // window.BinanceChain instead. dApp browsers can inject either one
  // AFTER the page scripts have run, so this is re-run on every Connect
  // click — never trust only the boot-time check.
  const injected =
    typeof window.ethereum !== "undefined"
      ? window.ethereum
      : typeof window.BinanceChain !== "undefined"
        ? window.BinanceChain
        : null;
  if (injected) {
    state.provider = injected;
    return true;
  }
  return false;
}

// Attach the provider's account/chain listeners once, whenever the
// provider is first found (at boot or on a later Connect click).
let providerEventsWired = false;
function wireProviderEvents() {
  if (!state.provider || providerEventsWired) return;
  providerEventsWired = true;
  state.provider.on?.("accountsChanged", (accounts) => {
    state.account = accounts && accounts[0] ? accounts[0] : null;
    state.hasAgentId = null;
    state.verifiedName = null;
    state.deploySummaryReady = false;
    state.deployBalanceOk = null;
    if (state.account) {
      setText("wallet-status", `Connected: ${shortAddr(state.account)}`);
      checkAgentId();
      renderDeploySummary();
    } else {
      setText("wallet-status", "Wallet disconnected. Connect again to submit a score.");
      show("btn-connect");
      hide("account-line");
      hide("name-row");
      renderDeploySummary();
    }
    refreshSubmitButton();
  });
  state.provider.on?.("chainChanged", () => {
    refreshChain().then(() => {
      if (state.chainId !== cfg.CHAIN_ID) show("btn-switch-chain");
      else hide("btn-switch-chain");
      renderDeploySummary();
      refreshSubmitButton();
    });
  });
}

async function connectWallet() {
  // Re-detect on every click: a dApp browser may have injected the
  // provider after the page loaded, and older Binance wallets expose
  // window.BinanceChain instead of window.ethereum.
  if (!state.provider && detectProvider()) wireProviderEvents();
  if (!state.provider) {
    setText("wallet-status", NO_WALLET_MESSAGE);
    return;
  }
  try {
    setText("wallet-status", "Waiting for you to approve the connection in your wallet…");
    const accounts = await state.provider.request({
      method: "eth_requestAccounts",
    });
    if (!accounts || !accounts.length) {
      setText("wallet-status", "No account was shared. Try connecting again.");
      return;
    }
    state.account = accounts[0];
    await refreshChain();
    setText(
      "wallet-status",
      `Connected: ${shortAddr(state.account)} — ${cfg.CHAIN_NAME} ${state.chainId === cfg.CHAIN_ID ? "(correct network)" : "(wrong network — switch below)"}`,
    );
    show("account-line");
    setText("account-line", `Wallet: ${state.account}`);
    hide("btn-connect");
    if (state.chainId !== cfg.CHAIN_ID) show("btn-switch-chain");
    else hide("btn-switch-chain");
    await checkAgentId();
    await renderDeploySummary();
  } catch (e) {
    setText(
      "wallet-status",
      `Connection was not approved (${(e && e.message) || e}). Nothing was signed.`,
    );
  }
  refreshSubmitButton();
}

async function refreshChain() {
  if (!state.provider) return;
  try {
    const hex = await state.provider.request({ method: "eth_chainId" });
    state.chainId = Number(BigInt(hex));
  } catch {
    state.chainId = null;
  }
}

async function switchChain() {
  if (!state.provider) return;
  try {
    await state.provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: cfg.CHAIN_HEX }],
    });
    await refreshChain();
    setText(
      "wallet-status",
      `Connected: ${shortAddr(state.account)} — now on ${cfg.CHAIN_NAME}.`,
    );
    hide("btn-switch-chain");
    await checkAgentId();
  } catch (e) {
    if (e && e.code === 4902 && cfg.CHAIN_ID === 56) {
      // Chain not added to the wallet: ask the user to add BNB Smart Chain.
      try {
        await state.provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: cfg.CHAIN_HEX,
              chainName: "BNB Smart Chain",
              nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
              rpcUrls: ["https://bsc-dataseed.bnbchain.org"],
              blockExplorerUrls: ["https://bscscan.com"],
            },
          ],
        });
        await refreshChain();
        hide("btn-switch-chain");
        await checkAgentId();
      } catch (e2) {
        setText(
          "wallet-status",
          `Could not switch networks (${(e2 && e2.message) || e2}). Please switch to ${cfg.CHAIN_NAME} in your wallet manually.`,
        );
      }
    } else {
      setText(
        "wallet-status",
        `Network switch was not approved. Please switch to ${cfg.CHAIN_NAME} in your wallet to submit a score.`,
      );
    }
  }
  await renderDeploySummary();
  refreshSubmitButton();
}

// ---------------------------------------------------------------------------
// Agent ID checks (read-only, public RPC — no wallet needed for the calls)
// ---------------------------------------------------------------------------

async function checkAgentId() {
  if (!state.account) return;
  setText("agent-status", "Checking whether this wallet holds an Agent ID…");
  try {
    const raw = await ethCallRevertible(
      cfg.REGISTRY_ADDRESS,
      SEL.balanceOf + encAddress(state.account),
      cfg.RPC_URLS,
    );
    if (raw === null) {
      setText(
        "agent-status",
        "Could not read the Agent ID registry right now (RPC error). Try again in a moment.",
      );
      state.hasAgentId = null;
      return;
    }
    const balance = decodeUint(raw);
    if (balance === 0n) {
      state.hasAgentId = false;
      setText(
        "agent-status",
        "This wallet holds no Agent ID (name.ai), so it cannot submit a score. Claim an Agent ID in the Binance App first — the game itself stays free to play.",
      );
      hide("name-row");
    } else {
      state.hasAgentId = true;
      setText(
        "agent-status",
        `This wallet holds an Agent ID. Type your Agent ID name below (without ".ai") so we can verify it belongs to this wallet before submitting.`,
      );
      show("name-row");
    }
  } catch (e) {
    state.hasAgentId = null;
    setText(
      "agent-status",
      `Agent ID check failed (${(e && e.message) || e}). The public RPC may be busy — try again in a moment.`,
    );
  }
  refreshSubmitButton();
}

function normaliseName(raw) {
  let name = (raw || "").trim().toLowerCase();
  if (name.endsWith(".ai")) name = name.slice(0, -3);
  return name;
}

async function verifyName() {
  if (!state.account || state.hasAgentId !== true) return;
  const name = normaliseName($("name-input").value);
  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    setText(
      "name-status",
      "Enter your Agent ID name using lowercase letters, numbers and hyphens only (for example: minkymomo).",
    );
    state.verifiedName = null;
    refreshSubmitButton();
    return;
  }
  setText("name-status", `Verifying "${name}" against the Agent ID registry…`);
  try {
    const tokenId = agentIdTokenId(name);
    const raw = await ethCallRevertible(
      cfg.REGISTRY_ADDRESS,
      SEL.ownerOf + tokenId.slice(2),
      cfg.RPC_URLS,
    );
    if (raw === null) {
      setText(
        "name-status",
        `No Agent ID named "${name}" exists, or the registry could not be read. Check the spelling and try again.`,
      );
      state.verifiedName = null;
    } else {
      const owner = decodeAddress(raw);
      if (owner.toLowerCase() === state.account.toLowerCase()) {
        state.verifiedName = name;
        setText(
          "name-status",
          `Verified: "${name}.ai" belongs to this wallet. You can now submit your best score.`,
        );
      } else {
        state.verifiedName = null;
        setText(
          "name-status",
          `"${name}.ai" belongs to a different wallet — it cannot be used from this one. Use the name on this wallet's own Agent ID.`,
        );
      }
    }
  } catch (e) {
    state.verifiedName = null;
    setText(
      "name-status",
      `Name check failed (${(e && e.message) || e}). The public RPC may be busy — try again in a moment.`,
    );
  }
  refreshSubmitButton();
}

// ---------------------------------------------------------------------------
// Score submission (user confirms in their own wallet)
// ---------------------------------------------------------------------------

async function submitScore() {
  if (state.submitting) return;
  if (!state.provider || !state.account) return;
  if (state.chainId !== cfg.CHAIN_ID) {
    setText("submit-status", `Please switch your wallet to ${cfg.CHAIN_NAME} first.`);
    return;
  }
  if (!state.verifiedName || state.best <= 0) return;
  state.submitting = true;
  refreshSubmitButton();
  setText(
    "submit-status",
    `Sending submitScore(${state.best}, "${state.verifiedName}") — please confirm the transaction in your wallet. Nothing is sent until you approve it there.`,
  );
  try {
    const data = encodeSubmitScore(SEL.submitScore, state.best, state.verifiedName);
    const txHash = await state.provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: state.account,
          to: cfg.CONTRACT_ADDRESS,
          value: "0x0",
          data,
        },
      ],
    });
    setText(
      "submit-status",
      `Transaction sent: ${txHash}. Waiting for confirmation on ${cfg.CHAIN_NAME}…`,
    );
    const link = $("tx-link");
    if (link) {
      link.href = cfg.EXPLORER_TX + txHash;
      link.textContent = "View transaction on BscScan";
      show("tx-link");
    }
    // Wait for the receipt via public RPC.
    let receipt = null;
    for (let i = 0; i < 60; i++) {
      await sleep(2000);
      receipt = await ethGetTransactionReceipt(txHash, cfg.RPC_URLS).catch(() => null);
      if (receipt) break;
    }
    if (!receipt) {
      setText(
        "submit-status",
        `Transaction ${txHash} was sent but no confirmation was seen within ~2 minutes. Check the link above — it may still confirm.`,
      );
    } else if (receipt.status === "0x1") {
      setText(
        "submit-status",
        `Confirmed! Your best score of ${state.best.toLocaleString("en-US")} is now on the leaderboard as "${state.verifiedName}.ai". Refreshing the board…`,
      );
      await loadLeaderboard();
    } else {
      setText(
        "submit-status",
        `The transaction was confirmed but it FAILED on-chain (status 0). The most likely cause is a name mismatch — re-verify your Agent ID name and try again. No score was recorded.`,
      );
    }
  } catch (e) {
    const msg = (e && e.message) || String(e);
    if (e && (e.code === 4001 || /rejected|denied/i.test(msg))) {
      setText("submit-status", "You declined the transaction in your wallet. Nothing was sent.");
    } else {
      setText("submit-status", `Submission failed before sending: ${msg}`);
    }
  } finally {
    state.submitting = false;
    refreshSubmitButton();
  }
}

// ---------------------------------------------------------------------------
// Contract deployment (project owner only; one tap from their browser wallet)
// ---------------------------------------------------------------------------

/** Exact BNB rendering from a wei BigInt, e.g. "0.00002718 BNB". */
function formatBnb(wei) {
  const neg = wei < 0n;
  const abs = neg ? -wei : wei;
  const whole = abs / 1000000000000000000n;
  let frac = (abs % 1000000000000000000n).toString().padStart(18, "0");
  frac = frac.slice(0, 8).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""} BNB`;
}

/** Gwei rendering from a wei BigInt, up to 3 decimals. */
function formatGwei(wei) {
  const scaled = Number(wei) / 1e9;
  return `${scaled.toLocaleString("en-US", { maximumFractionDigits: 3 })} gwei`;
}

function refreshDeployButton() {
  const btn = $("btn-deploy");
  if (!btn) return;
  const ready =
    !cfg.CONTRACT_ADDRESS &&
    state.account &&
    state.chainId === cfg.CHAIN_ID &&
    state.deploySummaryReady &&
    state.deployBalanceOk !== false &&
    !state.deploying;
  btn.disabled = !ready;
  if (cfg.CONTRACT_ADDRESS) {
    btn.title = "Contract already deployed";
  } else if (!state.account) {
    btn.title = "Connect your wallet first";
  } else if (state.chainId !== cfg.CHAIN_ID) {
    btn.title = `Switch your wallet to ${cfg.CHAIN_NAME}`;
  } else if (!state.deploySummaryReady) {
    btn.title = "Loading the deploy summary…";
  } else if (state.deployBalanceOk === false) {
    btn.title = "Your balance is below the estimated deploy cost";
  } else {
    btn.title = "Deploy StarshardArena — you confirm in your wallet";
  }
}

/**
 * Render the pre-deploy summary. Runs after connect when the wallet is on
 * the right chain. Reads the live gas price + the deployer's balance; if
 * the gas price cannot be read, the cost shows as unknown and the button
 * still works (the wallet shows the real cost before confirming).
 */
async function renderDeploySummary() {
  if (cfg.CONTRACT_ADDRESS) return;
  if (!state.account || state.chainId !== cfg.CHAIN_ID) {
    hide("deploy-summary");
    state.deploySummaryReady = false;
    state.deployBalanceOk = null;
    setText(
      "deploy-status",
      state.account
        ? `Switch your wallet to ${cfg.CHAIN_NAME} to see the deploy summary.`
        : "Connect your wallet on BNB Smart Chain to see the deploy summary.",
    );
    refreshDeployButton();
    return;
  }
  setText("deploy-status", "Reading the live gas price…");
  setText("deploy-registry", cfg.REGISTRY_ADDRESS);
  setText(
    "deploy-data-size",
    `${DEPLOY_DATA_BYTES.toLocaleString("en-US")} bytes`,
  );
  setText(
    "deploy-gas",
    `~${DEPLOY_ESTIMATED_GAS.toLocaleString("en-US")} gas (measured on a local test network — your wallet estimates the exact amount)`,
  );
  setText("deploy-deployer", state.account);

  let gasPrice = null;
  try {
    gasPrice = await ethGasPrice(cfg.RPC_URLS);
    setText("deploy-gas-price", formatGwei(gasPrice));
  } catch {
    setText(
      "deploy-gas-price",
      "unavailable — your wallet will show the cost before you confirm",
    );
  }

  let balance = null;
  try {
    if (state.provider) {
      balance = BigInt(
        await state.provider.request({
          method: "eth_getBalance",
          params: [state.account, "latest"],
        }),
      );
    }
  } catch {
    balance = null;
  }
  setText(
    "deploy-balance",
    balance === null ? "unavailable" : formatBnb(balance),
  );

  if (gasPrice !== null) {
    const cost = BigInt(DEPLOY_ESTIMATED_GAS) * gasPrice;
    setText("deploy-cost", `~${formatBnb(cost)}`);
    state.deployBalanceOk = balance === null ? null : balance >= cost;
    if (state.deployBalanceOk === false) {
      setText(
        "deploy-status",
        `Your balance (${formatBnb(balance)}) is below the estimated deploy cost (~${formatBnb(cost)}). Top up a little BNB first, or wait for a lower gas price.`,
      );
    } else {
      setText(
        "deploy-status",
        "Ready to deploy. One transaction from your wallet — confirm it there; nothing is deployed until you approve it.",
      );
    }
  } else {
    setText("deploy-cost", "unknown (gas price unreadable)");
    state.deployBalanceOk = null;
    setText(
      "deploy-status",
      "Gas price could not be read — the summary is incomplete, but your wallet will show the exact cost before you confirm.",
    );
  }
  show("deploy-summary");
  state.deploySummaryReady = true;
  refreshDeployButton();
}

async function deployContract() {
  if (state.deploying) return;
  if (!state.provider || !state.account) return;
  if (state.chainId !== cfg.CHAIN_ID) {
    setText(
      "deploy-status",
      `Please switch your wallet to ${cfg.CHAIN_NAME} first.`,
    );
    return;
  }
  if (cfg.CONTRACT_ADDRESS) return;
  state.deploying = true;
  refreshDeployButton();
  setText(
    "deploy-status",
    "Sending the deployment transaction — please confirm it in your wallet. Nothing is deployed until you approve it there.",
  );
  try {
    const data = buildDeployData(cfg.REGISTRY_ADDRESS);
    // Contract creation: NO `to` field. Value 0, no gas fields — the
    // wallet estimates. The user confirms in their own wallet.
    const txHash = await state.provider.request({
      method: "eth_sendTransaction",
      params: [{ from: state.account, value: "0x0", data }],
    });
    setText(
      "deploy-status",
      `Deployment transaction sent: ${txHash}. Waiting for confirmation on ${cfg.CHAIN_NAME}…`,
    );
    const txLink = $("deploy-tx-link");
    if (txLink) {
      txLink.href = cfg.EXPLORER_TX + txHash;
      txLink.textContent = "View deployment transaction on BscScan";
      show("deploy-tx-link");
    }
    // Wait for the receipt via public RPC.
    let receipt = null;
    for (let i = 0; i < 60; i++) {
      await sleep(2000);
      receipt = await ethGetTransactionReceipt(txHash, cfg.RPC_URLS).catch(
        () => null,
      );
      if (receipt) break;
    }
    if (!receipt) {
      setText(
        "deploy-status",
        `Transaction ${txHash} was sent but no confirmation was seen within ~2 minutes. Check the link above — it may still confirm.`,
      );
    } else if (receipt.status === "0x1" && receipt.contractAddress) {
      const deployedAt = receipt.contractAddress;
      const blockNumber = Number(BigInt(receipt.blockNumber));
      setText(
        "deploy-status",
        `Deployed! StarshardArena is live at ${deployedAt} (block ${blockNumber.toLocaleString("en-US")}).`,
      );
      const cLink = $("deploy-contract-link");
      if (cLink) {
        cLink.href = cfg.EXPLORER_ADDRESS + deployedAt;
        cLink.textContent = "View contract on BscScan";
        show("deploy-contract-link");
      }
      const after = $("deploy-after");
      if (after) {
        after.textContent =
          `To go live, set in site/arena/config.js: CONTRACT_ADDRESS = "${deployedAt}"; DEPLOY_BLOCK = ${blockNumber}; then republish the site.`;
        show("deploy-after");
      }
    } else {
      setText(
        "deploy-status",
        "The deployment transaction was confirmed but it FAILED on-chain (status 0). No contract was deployed — check the transaction link for details.",
      );
    }
  } catch (e) {
    const msg = (e && e.message) || String(e);
    if (e && (e.code === 4001 || /rejected|denied/i.test(msg))) {
      setText(
        "deploy-status",
        "You declined the transaction in your wallet. Nothing was deployed.",
      );
    } else {
      setText("deploy-status", `Deployment failed before sending: ${msg}`);
    }
  } finally {
    state.deploying = false;
    refreshDeployButton();
  }
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

function renderBoard(rows, totals, note) {
  const body = $("leaderboard-body");
  if (!body) return;
  body.innerHTML = "";
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="4">No scores on the board yet — be the first to play and submit.</td></tr>`;
  } else {
    rows.slice(0, 20).forEach((r, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td>${i + 1}</td>` +
        `<td>${escapeHtml(r.agentName)}.ai</td>` +
        `<td>${r.best.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</td>` +
        `<td title="${escapeHtml(r.player)}">${shortAddr(r.player)} · ${r.submissions} ${r.submissions === 1 ? "submit" : "submits"}</td>`;
      body.appendChild(tr);
    });
  }
  setText(
    "lb-totals",
    totals
      ? `${totals.players} player${totals.players === 1 ? "" : "s"} · ${totals.submissions} submission${totals.submissions === 1 ? "" : "s"}${totals.partial ? " (partial scan — see note)" : ""}`
      : "",
  );
  setText("lb-note", note || "");
}

function renderActivity(events) {
  const el = $("lb-activity");
  if (!el) return;
  if (!events.length) {
    el.textContent = "";
    return;
  }
  el.innerHTML =
    "<strong>Recent submissions:</strong><ul>" +
    events
      .slice(0, 5)
      .map(
        (e) =>
          `<li>${escapeHtml(e.agentName)}.ai — ${e.score.toString()} (best ${e.best.toString()})</li>`,
      )
      .join("") +
    "</ul>";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadLeaderboardFromEvents() {
  const latest = await ethBlockNumber(cfg.RPC_URLS);
  const from = cfg.DEPLOY_BLOCK;
  if (!from || from <= 0 || from > latest) {
    throw new Error("deploy block unknown");
  }
  const rows = new Map();
  const events = [];
  let scannedChunks = 0;
  let partial = false;
  for (let start = from; start <= latest; start += CONFIG.LOG_CHUNK_BLOCKS) {
    if (scannedChunks >= CONFIG.LOG_MAX_CHUNKS) {
      partial = true;
      break;
    }
    const end = Math.min(start + CONFIG.LOG_CHUNK_BLOCKS - 1, latest);
    const logs = await ethGetLogs(
      cfg.CONTRACT_ADDRESS,
      [TOPIC_SCORE_SUBMITTED],
      start,
      end,
      cfg.RPC_URLS,
    );
    scannedChunks++;
    for (const log of logs || []) {
      const ev = decodeScoreSubmittedLog(log);
      events.push(ev);
      const key = ev.player.toLowerCase();
      const prev = rows.get(key) || {
        player: ev.player,
        agentName: ev.agentName,
        best: 0n,
        submissions: 0,
      };
      prev.best = ev.best > prev.best ? ev.best : prev.best;
      prev.submissions += 1;
      rows.set(key, prev);
    }
    await sleep(120);
  }
  events.sort((a, b) => b.blockNumber - a.blockNumber);
  const list = [...rows.values()].sort((a, b) =>
    a.best > b.best ? -1 : a.best < b.best ? 1 : 0,
  );
  return {
    rows: list,
    totals: {
      players: list.length,
      submissions: events.length,
      partial,
    },
    events,
  };
}

async function loadLeaderboardFromViews() {
  const countRaw = await rpc(
    "eth_call",
    [{ to: cfg.CONTRACT_ADDRESS, data: SEL.playerCount }, "latest"],
    cfg.RPC_URLS,
  );
  const count = Number(decodeUint(countRaw));
  const rows = [];
  const capped = count > 500;
  const n = Math.min(count, 500);
  for (let i = 0; i < n; i++) {
    const playerRaw = await rpc(
      "eth_call",
      [{ to: cfg.CONTRACT_ADDRESS, data: SEL.getPlayer + encUint(i) }, "latest"],
      cfg.RPC_URLS,
    );
    const player = decodeAddress(playerRaw);
    const [bestRaw, nameRaw] = await Promise.all([
      rpc(
        "eth_call",
        [{ to: cfg.CONTRACT_ADDRESS, data: SEL.bestScore + encAddress(player) }, "latest"],
        cfg.RPC_URLS,
      ),
      rpc(
        "eth_call",
        [{ to: cfg.CONTRACT_ADDRESS, data: SEL.agentName + encAddress(player) }, "latest"],
        cfg.RPC_URLS,
      ),
    ]);
    rows.push({
      player,
      agentName: decodeString(nameRaw),
      best: decodeUint(bestRaw),
      submissions: 0,
    });
  }
  rows.sort((a, b) => (a.best > b.best ? -1 : a.best < b.best ? 1 : 0));
  const totalRaw = await rpc(
    "eth_call",
    [{ to: cfg.CONTRACT_ADDRESS, data: SEL.totalSubmissions }, "latest"],
    cfg.RPC_URLS,
  );
  return {
    rows,
    totals: {
      players: count,
      submissions: Number(decodeUint(totalRaw)),
      partial: capped,
    },
    events: [],
  };
}

async function loadLeaderboard() {
  if (!cfg.CONTRACT_ADDRESS) {
    setText(
      "lb-status",
      "Leaderboard contract not deployed yet — the board goes live here as soon as the contract is deployed on BNB Smart Chain.",
    );
    renderBoard([], null, "");
    renderActivity([]);
    return;
  }
  setText("lb-status", "Loading leaderboard from the contract…");
  try {
    const data = await loadLeaderboardFromEvents();
    renderBoard(data.rows, data.totals, data.totals.partial
      ? "Board scan hit its chunk cap and shows the most recent blocks only."
      : "Scores read from on-chain ScoreSubmitted events.");
    renderActivity(data.events);
    setText("lb-status", "");
  } catch (e) {
    // Events scan failed (RPC limits, unknown deploy block, …) — fall
    // back to the contract's own view functions.
    try {
      const data = await loadLeaderboardFromViews();
      renderBoard(data.rows, data.totals, "Event scan unavailable — board read from the contract's player list instead.");
      renderActivity([]);
      setText("lb-status", "");
    } catch (e2) {
      setText(
        "lb-status",
        `Leaderboard could not be loaded right now (${(e2 && e2.message) || e2}). The public RPC may be busy — try the refresh button in a moment.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function init() {
  setText("contract-line", cfg.CONTRACT_ADDRESS
    ? `Leaderboard contract: ${cfg.CONTRACT_ADDRESS}`
    : "Leaderboard contract: not deployed yet");
  if (cfg.CONTRACT_ADDRESS) {
    const link = $("contract-link");
    if (link) {
      link.href = cfg.EXPLORER_ADDRESS + cfg.CONTRACT_ADDRESS;
      link.textContent = "View contract on BscScan";
      show("contract-link");
    }
    // Contract is live: the deploy section has served its purpose.
    hide("deploy-card");
  }

  if (!detectProvider()) {
    // No provider at boot — the page still works (game + read-only
    // leaderboard), and the Connect button re-detects on every click,
    // so a provider injected later by a dApp browser is picked up.
    setText("wallet-status", NO_WALLET_MESSAGE);
  } else {
    setText("wallet-status", "Wallet detected. Connect to submit your score on-chain.");
    wireProviderEvents();
  }

  $("btn-connect")?.addEventListener("click", connectWallet);
  $("btn-switch-chain")?.addEventListener("click", switchChain);
  $("btn-verify-name")?.addEventListener("click", verifyName);
  $("name-input")?.addEventListener("input", () => {
    state.verifiedName = null;
    setText("name-status", "");
    refreshSubmitButton();
  });
  $("name-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") verifyName();
  });
  $("btn-submit-score")?.addEventListener("click", submitScore);
  $("btn-deploy")?.addEventListener("click", deployContract);
  $("btn-refresh-lb")?.addEventListener("click", loadLeaderboard);

  setInterval(pollGame, 500);
  pollGame();
  refreshDeployButton();
  loadLeaderboard();
}

init();
