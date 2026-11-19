# STARSHARD Agent Arena

An arena survival shooter with an **on-chain leaderboard that only Binance Agent ID holders can write to**. Built for the [Binance Agent ID Hackathon](https://www.binance.com/en/square/post/389517345917641) (18 Nov – 9 Dec 2026).

- **Play it live:** https://creative-licorice-5f7968.netlify.app
- **Demo video:** https://creative-licorice-5f7968.netlify.app/demo.mp4
- **Leaderboard contract (BNB Smart Chain):** [`0x2456102c0A3bd670828DBa2DE91Ca064Fe9B13Dc`](https://bscscan.com/address/0x2456102c0A3bd670828DBa2DE91Ca064Fe9B13Dc#code) — source verified on BscScan (Solidity 0.8.38, optimizer 200 runs, EVM osaka, MIT)
- **Deployed:** 19 Nov 2026, block 134433848, tx [`0x5e58d97cbaa1460e7d01d0d740e89ca3fb89b7e669d37b2a1eebf9b810667428`](https://bscscan.com/tx/0x5e58d97cbaa1460e7d01d0d740e89ca3fb89b7e669d37b2a1eebf9b810667428)

## The game

STARSHARD is an original arena survival shooter that runs entirely in the browser — no install, no account, free to play. 10 waves, 5 enemy kinds (drifter, darter, splitter, spitter, bulwark), dash with i-frames, a recharging shield, a combo multiplier, and an upgrade pick (1 of 3) after each wave. Win at wave 10, then endless mode.

## How Agent ID works here

Agent ID is the identity and access layer of the leaderboard — there is no account system and no personal data is collected.

1. You connect a wallet in the browser (injected provider only — no QR-code login, no pairing).
2. The site checks read-only whether the wallet holds an Agent ID on the SPACE ID registry (`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`).
3. You type your `.ai` Agent ID name. The site verifies read-only that the name belongs to your wallet.
4. `submitScore(score, name)` on the contract enforces it on-chain: it reverts unless the sender holds an Agent ID **and** `ownerOf(keccak256(name)) == sender`. Every leaderboard row is therefore provably tied to a real Agent ID, and the board cannot be farmed by throwaway wallets.

Agent IDs are soulbound (the registry reverts any transfer), so a leaderboard identity cannot be bought, sold, or moved to another wallet.

The contract has no owner privileges, no payable functions, no approvals, no withdrawals, and no pausing. It only records best scores and names per address and emits `ScoreSubmitted` / `NewBest` events. The leaderboard is read from those events.

First score on the board: **13,730 by `minkymomo`**, tx [`0xb2db30c855687a986e097c3ab8943c7528e6c098af2fcd8fb3c27c9d3b2a6ab6`](https://bscscan.com/tx/0xb2db30c855687a986e097c3ab8943c7528e6c098af2fcd8fb3c27c9d3b2a6ab6) (block 134447185).

## Repository layout

| Path | What it is |
| --- | --- |
| `contracts/StarshardArena.sol` | The leaderboard contract (the deployed source, MIT) |
| `contracts/MockAgentID.sol` | A mock registry used only for local tests |
| `site/` | The static website: game + arena panel + demo video |
| `site/arena/config.js` | The single deployment switch (contract address, deploy block) |
| `test/StarshardArena.test.js` | Contract tests (Hardhat) |
| `scripts/deploy-local.mjs` | Local Hardhat deployment for testing |
| `scripts/gen-deploy-data.mjs` | Regenerates the deployment bytecode in `site/arena/deploy-data.js` |

## Run it locally

```bash
npm install
npx hardhat test          # contract tests
npx hardhat node          # local chain on 127.0.0.1:8545
node scripts/deploy-local.mjs
# then serve site/ with any static server, e.g.:
npx serve site
```

The site is static — no build step, no backend, no keys, no tracking, no CDN. All reads work without a wallet; only submitting a score needs one.

## Security notes

- The site never asks for a seed phrase, private key, API secret, or pairing code.
- `site/arena/config.js` honours `?contract=` / `?rpc=` / `?registry=` URL overrides **only on localhost**, so a crafted link cannot serve fake verification data.
- The contract never takes custody of funds: `submitScore` is `value: 0` and there is no token approval anywhere in the flow.

## License

MIT — see [LICENSE](LICENSE).
