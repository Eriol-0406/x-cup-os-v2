#!/usr/bin/env node
/**
 * setup-second-user.mjs
 *
 * Spins up a fresh "User B" persona for the copy-trade demo:
 *   1. Generates a brand-new EVM wallet (User B's main wallet)
 *   2. POSTs to /users/by-address/{B} so the backend provisions B's burner
 *   3. Funds:
 *      - B's main wallet with 0.005 OKB (enough to sign the USDC.transfer + Copy →)
 *      - B's burner with 100 USDC (so the cloned strategy can actually stake)
 *      - B's burner with 0.005 OKB (so the burner can pay gas when firing)
 *   4. Prints everything you need to import into OKX Wallet + record the demo.
 *
 * Funding comes from the DEPLOYER_PRIVATE_KEY in apps/api/.env.
 *
 * Usage:
 *   node scripts/setup-second-user.mjs
 *
 * After running, in OKX Wallet:
 *   Settings → Wallets → Import → "Private Key" → paste the printed key
 *   Switch to that account → refresh localhost:3001 → the header shows B's address
 */

import { ethers } from "ethers";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
dotenv.config({ path: join(root, "apps/api/.env") });

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const RPC = process.env.XLAYER_TESTNET_RPC ?? "https://testrpc.xlayer.tech";

if (!DEPLOYER_KEY) {
  console.error("✗ DEPLOYER_PRIVATE_KEY not set in apps/api/.env");
  process.exit(1);
}

const addresses = JSON.parse(
  await import("node:fs/promises").then((fs) =>
    fs.readFile(join(root, "packages/abi/addresses.json"), "utf8"),
  ),
);
const deployment = addresses["1952"];
const usdcAbi = JSON.parse(
  await import("node:fs/promises").then((fs) =>
    fs.readFile(join(root, "packages/abi/MockUSDC.abi.json"), "utf8"),
  ),
);

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║          X-Cup OS — Set up a second demo user                ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Step 1 — generate a fresh wallet
  const userB = ethers.Wallet.createRandom();
  console.log("📍 Generated new User B wallet:");
  console.log(`   address:  ${userB.address}`);
  console.log(`   privkey:  ${userB.privateKey}`);
  console.log(`   mnemonic: ${userB.mnemonic?.phrase ?? "—"}\n`);

  // Step 2 — provision burner via the API
  console.log("⏳ Provisioning burner via API…");
  const provResp = await fetch(`${API_URL}/users/by-address/${userB.address}`);
  if (!provResp.ok) {
    console.error("✗ Provisioning failed — is the API running on", API_URL, "?");
    console.error(await provResp.text());
    process.exit(1);
  }
  const { agentAddress, freshlyCreated } = await provResp.json();
  console.log(`   burner:   ${agentAddress}  ${freshlyCreated ? "(new)" : "(existed)"}\n`);

  // Step 3 — fund
  const provider = new ethers.JsonRpcProvider(RPC);
  const deployer = new ethers.Wallet(DEPLOYER_KEY, provider);
  const usdc = new ethers.Contract(deployment.contracts.MockUSDC.address, usdcAbi, deployer);

  console.log("⏳ Funding User B's main wallet with 0.005 OKB…");
  const t1 = await deployer.sendTransaction({
    to: userB.address,
    value: ethers.parseEther("0.005"),
  });
  await t1.wait();
  console.log(`   ✓ ${t1.hash}\n`);

  console.log("⏳ Funding burner with 100 USDC…");
  const t2 = await usdc.transfer(agentAddress, ethers.parseUnits("100", 6));
  await t2.wait();
  console.log(`   ✓ ${t2.hash}\n`);

  console.log("⏳ Funding burner with 0.005 OKB (gas)…");
  const t3 = await deployer.sendTransaction({
    to: agentAddress,
    value: ethers.parseEther("0.005"),
  });
  await t3.wait();
  console.log(`   ✓ ${t3.hash}\n`);

  // Step 4 — verify balances. RPC nodes briefly serve stale state after a tx
  // mines, so give it a beat before reading.
  await new Promise((r) => setTimeout(r, 3000));
  const [mainOkb, burnerUsdc, burnerOkb] = await Promise.all([
    provider.getBalance(userB.address),
    usdc.balanceOf(agentAddress),
    provider.getBalance(agentAddress),
  ]);

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║                  READY — User B provisioned                   ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Main wallet  ${userB.address}  `);
  console.log(`║    OKB balance: ${ethers.formatEther(mainOkb)}`);
  console.log(`║`);
  console.log(`║  Burner       ${agentAddress}`);
  console.log(`║    USDC balance: ${ethers.formatUnits(burnerUsdc, 6)}`);
  console.log(`║    OKB  balance: ${ethers.formatEther(burnerOkb)}`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log("📋 To complete the demo flow:\n");
  console.log("   1. Open OKX Wallet → Settings → Wallets → 'Import wallet'");
  console.log("   2. Paste the privkey from above");
  console.log("   3. Switch to this new account in OKX Wallet");
  console.log("   4. Refresh http://localhost:3001 — header shows User B's address");
  console.log("   5. Navigate to /leaderboard — you'll see User A's strategies");
  console.log("   6. Click 'Copy →' on any strategy");
  console.log("   7. Replay a fixture from /match — BOTH agents fire (A's original + B's copy)\n");

  console.log("💡 Keep this script's output safe — without the privkey you can't restore the wallet.\n");
}

main().catch((err) => {
  console.error("\n✗ Fatal:", err?.message ?? err);
  process.exit(1);
});
