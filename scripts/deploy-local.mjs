// Deploy MockAgentID + StarshardArena to a LOCAL Hardhat node for the
// headless site test. No real chain, no private keys: the Hardhat node
// signs with its unlocked test accounts.
//
// Usage:
//   npx hardhat node            (in another terminal; http://127.0.0.1:8545)
//   node scripts/deploy-local.mjs
//
// Writes the addresses + deploy block to scripts/deploy-local.json, which
// site/tests/headless-test.mjs reads.
import { JsonRpcProvider, ContractFactory } from "ethers";
import { readFile, writeFile } from "node:fs/promises";

const RPC = "http://127.0.0.1:8545";
const provider = new JsonRpcProvider(RPC);
const signer0 = await provider.getSigner(0);
const signer1 = await provider.getSigner(1);
const signer2 = await provider.getSigner(2);

const mockAbi = JSON.parse(
  await readFile("build/contracts_MockAgentID_sol_MockAgentID.abi", "utf8"),
);
const mockBin = (await readFile("build/contracts_MockAgentID_sol_MockAgentID.bin", "utf8")).trim();
const arenaAbi = JSON.parse(await readFile("contracts/StarshardArena.abi.json", "utf8"));
const arenaBin = (await readFile("build/contracts_StarshardArena_sol_StarshardArena.bin", "utf8")).trim();

const mock = await new ContractFactory(mockAbi, mockBin, signer0).deploy();
await mock.waitForDeployment();
const mockAddr = await mock.getAddress();

const p0 = await signer0.getAddress();
const p1 = await signer1.getAddress();
const p2 = await signer2.getAddress();
await (await mock.mint(p0, "minkymomo")).wait();
await (await mock.mint(p1, "starpilot")).wait();
// signer2 deliberately gets NO Agent ID (non-holder test case).

const arena = await new ContractFactory(arenaAbi, arenaBin, signer0).deploy(mockAddr);
const deployTx = arena.deploymentTransaction();
const receipt = await deployTx.wait();
const arenaAddr = await arena.getAddress();

const out = {
  rpc: RPC,
  chainId: 31337,
  mockAgentId: mockAddr,
  arena: arenaAddr,
  deployBlock: receipt.blockNumber,
  player0: p0, // minkymomo
  player1: p1, // starpilot
  player2: p2, // no Agent ID
};
await writeFile("scripts/deploy-local.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
