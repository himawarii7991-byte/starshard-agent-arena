import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";

const { ethers } = await network.getOrCreate();

// Parse receipt logs into decoded events for a given contract.
function decodedEvents(receipt, contract) {
  const out = [];
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed) out.push(parsed);
    } catch {
      // log from another contract — ignore
    }
  }
  return out;
}

function eventOf(receipt, contract, name) {
  return decodedEvents(receipt, contract).filter((e) => e.name === name);
}

// Assert a contract call reverts with a given custom error.
async function expectCustomError(promise, contract, errorName) {
  const selector = contract.interface.getError(errorName).selector;
  try {
    await promise;
  } catch (err) {
    const data =
      err.data ?? err.info?.error?.data ?? err.error?.data ?? "";
    assert.ok(
      typeof data === "string" && data.toLowerCase().startsWith(selector.toLowerCase()),
      `expected revert ${errorName} (${selector}), got data=${data} err=${err.message}`,
    );
    return;
  }
  assert.fail(`expected revert ${errorName}, but the call succeeded`);
}

describe("StarshardArena (with MockAgentID)", function () {
  let arena, mock;
  let deployer, player1, player2, stranger;

  before(async function () {
    [deployer, player1, player2, stranger] = await ethers.getSigners();

    mock = await ethers.deployContract("MockAgentID");
    await mock.waitForDeployment();

    arena = await ethers.deployContract("StarshardArena", [
      await mock.getAddress(),
    ]);
    await arena.waitForDeployment();

    // player1 owns Agent ID "minkymomo", player2 owns "starpilot"
    await mock.mint(player1.address, "minkymomo");
    await mock.mint(player2.address, "starpilot");
  });

  it("(a) non-Agent-ID holder reverts with NotAgentIdHolder", async function () {
    await expectCustomError(
      arena.connect(stranger).submitScore(100, "nobody"),
      arena,
      "NotAgentIdHolder",
    );
  });

  it("(b) holder submitting a WRONG name reverts with NameMismatch", async function () {
    // name that does not exist at all (registry ownerOf reverts)
    await expectCustomError(
      arena.connect(player1).submitScore(100, "doesnotexist"),
      arena,
      "NameMismatch",
    );
    // name that exists but belongs to someone else
    await expectCustomError(
      arena.connect(player1).submitScore(100, "starpilot"),
      arena,
      "NameMismatch",
    );
  });

  it("(c) holder submitting with the CORRECT name succeeds and stores best + name", async function () {
    const tx = await arena.connect(player1).submitScore(100, "minkymomo");
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);

    const submitted = eventOf(receipt, arena, "ScoreSubmitted");
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].args.player, player1.address);
    assert.equal(submitted[0].args.agentName, "minkymomo");
    assert.equal(submitted[0].args.score, 100n);
    assert.equal(submitted[0].args.best, 100n);
    assert.equal(submitted[0].args.timestamp, BigInt(block.timestamp));

    const best = eventOf(receipt, arena, "NewBest");
    assert.equal(best.length, 1);
    assert.equal(best[0].args.player, player1.address);
    assert.equal(best[0].args.score, 100n);

    assert.equal(await arena.bestScore(player1.address), 100n);
    assert.equal(await arena.agentName(player1.address), "minkymomo");
    assert.equal(await arena.totalSubmissions(), 1n);
    assert.equal(await arena.playerCount(), 1n);
    assert.equal(await arena.getPlayer(0), player1.address);
    assert.equal(await arena.hasPlayed(player1.address), true);
  });

  it("(d) lower score does not overwrite best; higher score does", async function () {
    // lower score: best stays 100, no NewBest event
    const txLow = await arena.connect(player1).submitScore(50, "minkymomo");
    const rLow = await txLow.wait();
    assert.equal(eventOf(rLow, arena, "NewBest").length, 0);
    const subLow = eventOf(rLow, arena, "ScoreSubmitted");
    assert.equal(subLow.length, 1);
    assert.equal(subLow[0].args.best, 100n); // best reported, not the 50
    assert.equal(await arena.bestScore(player1.address), 100n);
    assert.equal(await arena.totalSubmissions(), 2n);

    // higher score: best becomes 250, NewBest emitted
    const txHigh = await arena.connect(player1).submitScore(250, "minkymomo");
    const rHigh = await txHigh.wait();
    const bestEv = eventOf(rHigh, arena, "NewBest");
    assert.equal(bestEv.length, 1);
    assert.equal(bestEv[0].args.score, 250n);
    assert.equal(await arena.bestScore(player1.address), 250n);
    assert.equal(await arena.totalSubmissions(), 3n);
  });

  it("(e) players list counts unique players only", async function () {
    await arena.connect(player2).submitScore(42, "starpilot");
    assert.equal(await arena.playerCount(), 2n);
    assert.equal(await arena.getPlayer(1), player2.address);

    // player1 submits again — still 2 unique players
    await arena.connect(player1).submitScore(300, "minkymomo");
    assert.equal(await arena.playerCount(), 2n);
    assert.equal(await arena.totalSubmissions(), 5n);
  });

  it("(f) events carry the right data on a fresh submission", async function () {
    const tx = await arena.connect(player2).submitScore(500, "starpilot");
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);

    const submitted = eventOf(receipt, arena, "ScoreSubmitted");
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].args.player, player2.address);
    assert.equal(submitted[0].args.agentName, "starpilot");
    assert.equal(submitted[0].args.score, 500n);
    assert.equal(submitted[0].args.best, 500n);
    assert.equal(submitted[0].args.timestamp, BigInt(block.timestamp));

    const best = eventOf(receipt, arena, "NewBest");
    assert.equal(best.length, 1);
    assert.equal(best[0].args.score, 500n);
    assert.equal(await arena.bestScore(player2.address), 500n);
  });

  it("constructor records the registry address and the deployer as owner", async function () {
    assert.equal(await arena.agentId(), await mock.getAddress());
    assert.equal(await arena.owner(), deployer.address);
  });
});
