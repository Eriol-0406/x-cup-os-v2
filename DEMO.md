# X-Cup OS — Demo Script

> Exact happy-path sequence for the pre-recorded demo video. Every step has a
> narration cue, a UI action, an expected outcome, and an on-chain proof link.

**Run time target:** 3 minutes (judges usually skim past 4 min)
**Recording tool:** screen recorder of your choice (QuickTime, Loom, OBS).
**Wallet shown on screen:** the deployer/demo wallet only — never your main wallet.

---

## Pre-demo checklist (do once, ~5 min before recording)

```bash
# 1. Both servers up?
lsof -i:3001 -i:4000 -P -n | grep LISTEN
# Expect 2 LISTEN lines. If missing one:
cd ~/x-cup-os/apps/api && npm run dev   # tab 1
cd ~/x-cup-os/apps/web && npm run dev   # tab 2

# 2. API quota left?
curl -s http://localhost:4000/admin/api-status | jq '.requests'
# Need at least 5 free for the demo. If less, wait until 00:00 UTC.

# 3. Agent funded with USDC + OKB?
curl -s http://localhost:4000/users/by-address/0xFaC819e2465C24529ad3684D61BFb442cC239d8E | jq '.agentAddress'
# Then check that agent has USDC + OKB
node -e "
const { ethers } = require('ethers');
(async () => {
  const p = new ethers.JsonRpcProvider('https://testrpc.xlayer.tech');
  const usdc = new ethers.Contract(
    '0x47C57Eb98A9C025114aAd96b9f6048ffdc8Bb3fA',
    ['function balanceOf(address) view returns (uint256)'],
    p,
  );
  const agent = '0xA5b4C9eD2Fa661Ed350E0d0D50F8E202A6c6Eefe';
  const [u, o] = await Promise.all([usdc.balanceOf(agent), p.getBalance(agent)]);
  console.log('USDC:', ethers.formatUnits(u, 6), '| OKB:', ethers.formatEther(o));
})();
"
# Need: USDC >= 100, OKB >= 0.005. If short, run the funding script below.

# 4. Browser tabs ready
# Tab A: http://localhost:3001 (the dApp)
# Tab B: https://www.oklink.com/x-layer-testnet/address/0xb420447843a0868971A925C0c8ceC30c4b26b4f4 (XCupMarket explorer)
# Tab C: an unused fixture's API-Football page for the "real data" beat
```

### Funding script (only if agent balance is low)

```bash
cd ~/x-cup-os && node --input-type=module -e "
import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config({ path: 'apps/api/.env' });
const usdcAbi = (await import('./packages/abi/MockUSDC.abi.json', { with: { type: 'json' } })).default;
const addr = (await import('./packages/abi/addresses.json', { with: { type: 'json' } })).default['1952'];
const p = new ethers.JsonRpcProvider(addr.rpc);
const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, p);
const agent = '0xA5b4C9eD2Fa661Ed350E0d0D50F8E202A6c6Eefe';
const usdc = new ethers.Contract(addr.contracts.MockUSDC.address, usdcAbi, deployer);
await (await usdc.transfer(agent, ethers.parseUnits('200', 6))).wait();
await (await deployer.sendTransaction({ to: agent, value: ethers.parseEther('0.01') })).wait();
console.log('Agent refunded: 200 USDC + 0.01 OKB');
"
```

---

## Demo flow (the recording)

### Beat 1 — "What is this?" (15 seconds)

**Narration:** *"X-Cup OS is an autonomous betting product for the World Cup, built on X Layer. You write a strategy in plain English. An AI agent reads it, watches matches, and places bets on chain — without you ever clicking 'place bet'."*

**Screen:** localhost:3001 hero, scroll once so judges see the editor + tournament grid + match list.

---

### Beat 2 — "Three pillars, all on chain" (20 seconds)

**Narration:** *"There are three markets to bet on. First — tournament-winner markets: 32 nations, one binary market per team."*

**Action:** Scroll to **Tournament Winner** section. Hover over a few cards (Argentina, France, Brazil).

**Narration cue:** *"These are the long-term sentiment bets — does this team lift the cup? Real teams from API-Football, real on-chain markets on X Layer."*

**Action:** Scroll to **Live Markets**. Click the **Live / Upcoming / Finished** filter pills to show the count change.

**Narration:** *"Second pillar — 64 per-fixture prediction markets, one per match. Synced from API-Football, real scores, real fixtures."*

---

### Beat 3 — "The AI agent" (45 seconds)

**Narration:** *"Third pillar — and the differentiator. The AI agent. Watch this."*

**Action:** Connect wallet (header button) if not already connected. The Agent panel appears showing the burner wallet address + USDC + OKB balances.

**Narration:** *"On first connect, the system generates a burner wallet — the agent's signer. The user funds it with USDC. The agent can never spend more than what's in this burner. That's the safety story."*

**Action:** Scroll to the **Strategy Editor**. Type slowly:

```
If Argentina wins their next match, stake 30 USDC on YES
```

**Narration as you type:** *"I write my strategy in plain English. As I type, the right panel parses it in real time using Groq's Llama 3.3 — and forces the output through a strict JSON schema via tool-use, so it can't hallucinate a malformed bet."*

**Action:** Pause. Show the right panel with the parsed trigger / action / risk cards.

**Narration:** *"Trigger: match winner is Argentina. Action: stake 30 USDC YES. Notice the latency — sub-one-second."*

**Action:** Click **Deploy Agent →**.

**Narration:** *"On deploy, the backend resolves 'Argentina' to its 7 fixture markets in the database — so this strategy fires only on Argentina matches, never on someone else's."*

---

### Beat 4 — "The agent fires autonomously" (45 seconds)

**Narration:** *"Now the demo trick — because we're on World Cup 2022 historical data, I can replay any finished match in one click to show what the agent would have done."*

**Action:** Scroll to Live Markets, find **Argentina vs Australia** (Round of 16). Click **"Replay this match →"** on that card.

*[Wait ~10 seconds for the on-chain flow to complete.]*

**Narration:** *"The system pulled Argentina 2-1 Australia from API-Football. My Argentina strategy matched. The agent burner approved USDC, signed the stake transaction. Now the oracle settles the market with the real outcome. Now the agent auto-claims its share."*

**Action:** Once the card shows **"✓ Replayed · 1 fire(s) · 1 claim(s) · settle tx ↗"**, click the **settle tx ↗** link.

**Narration:** *"Settle transaction on X Layer testnet — verifiable on the explorer right now."*

**Action:** Switch to the OKLink tab. The settle tx shows up.

**Action:** Switch back to localhost:3001 and scroll to **Agent Activity**.

**Narration:** *"And here in the agent activity log — the stake the agent placed, the explorer link, status confirmed. Everything that just happened is on chain."*

---

### Beat 5 — "Tournament-winner bet (Pillar 1)" (30 seconds)

**Narration:** *"You can also bet directly — no AI strategy needed — on the tournament-winner markets."*

**Action:** Scroll to Tournament Winner, sort by A-Z, find **Argentina** card. Type `100` in the amount input, click **YES**.

*[Wallet popup. Approve USDC if first time, then confirm stake.]*

**Narration as the txs sign:** *"Approve USDC, sign the stake. 100 USDC bet that Argentina wins the tournament. Watch the implied YES probability bar fill."*

**Action:** Card refreshes — bar fills, "YES 100%" appears.

---

### Beat 6 — "Settle the tournament + claim" (30 seconds)

**Action:** Cut to terminal. Run:

```bash
curl -X POST http://localhost:4000/admin/settle-tournament \
  -H 'Content-Type: application/json' \
  -d '{"winningTeamId":26}'  | jq
```

**Narration:** *"Argentina actually won World Cup 2022. The oracle now settles every tournament market — Argentina to YES, every other team to NO."*

**Action:** Switch back to browser, refresh. Argentina card glows green with **CHAMP** badge. Every other card faded with **OUT** badge. **Claim winnings** button appears on Argentina card.

**Action:** Click **Claim winnings** on Argentina card. Sign the tx.

**Narration:** *"And now I claim my winnings. USDC arrives in my wallet. The full loop is done — on chain, verifiable, end to end."*

---

### Beat 7 — "Wrap" (10 seconds)

**Narration:** *"X-Cup OS — write a strategy in English, an AI agent does the rest, every transaction on X Layer. Built in 7 days for the X Cup hackathon. Repo and contracts in the description."*

**Screen:** show GitHub repo + contract address as on-screen text.

---

## On-chain proof links (paste in submission)

| Asset | Address | Link |
|---|---|---|
| XCupMarket contract | `0xb420447843a0868971A925C0c8ceC30c4b26b4f4` | https://www.oklink.com/x-layer-testnet/address/0xb420447843a0868971A925C0c8ceC30c4b26b4f4 |
| MockUSDC (test stake token) | `0x47C57Eb98A9C025114aAd96b9f6048ffdc8Bb3fA` | https://www.oklink.com/x-layer-testnet/address/0x47C57Eb98A9C025114aAd96b9f6048ffdc8Bb3fA |
| Demo agent (burner) | `0xA5b4C9eD2Fa661Ed350E0d0D50F8E202A6c6Eefe` | https://www.oklink.com/x-layer-testnet/address/0xA5b4C9eD2Fa661Ed350E0d0D50F8E202A6c6Eefe |
| Sample fire tx (Argentina vs Mexico stake) | — | https://www.oklink.com/x-layer-testnet/tx/0x7ea6429a7b1240d56fd8ddaf0ed7cf8f531184b59f4144559044ed38893d6f40 |
| Sample claim tx | — | https://www.oklink.com/x-layer-testnet/tx/0x3438a688a1c71e0229146c47f8c51b385671123715f1dba329b3967c230b4a92 |

**Source repo:** https://github.com/Eriol-0406/x-cup-os

---

## Backup plan if something breaks live (it shouldn't — pre-recorded — but)

| Failure | Recovery |
|---|---|
| Page blank | Cmd+Shift+R hard refresh. If still blank: `pkill -f "next dev" && cd ~/x-cup-os/apps/web && rm -rf .next && npm run dev` (deletes corrupted Next.js cache) |
| API endpoint 500s | `pkill -f "tsx watch" && cd ~/x-cup-os/apps/api && npm run dev` |
| Wallet popup hangs at "Approving USDC…" | Click the small **cancel** link on the card, then retry the bet |
| Replay fails: "market not Open" | The market is already settled from a prior replay — pick a different fixture |
| Replay fails: "agent USDC balance 0.0 < required N" | Re-fund the agent via the script in pre-demo checklist |
| API-Football says "plan: Free plans don't have access" | You're querying a season > 2024. Confirm `WC_SEASON=2022` in `apps/api/.env` |

---

## Known limitations to mention if asked

- **WC 2026 data is paywalled** on the free tier. The build runs on WC 2022 (Qatar) historical data as a deterministic replay. Switching to live 2026 = one env var change (`WC_SEASON=2026`) after upgrading the plan.
- **Cron-based live polling** is not yet wired — for the WC 2022 replay it's not needed because the manual "Replay this match" button covers the demo. Lands when we point at live data.
- **LLM parsing has one known edge case**: strategies phrased as "if team X *loses*" historically caused the LLM to emit `team: "opponent"` (a placeholder). Fixed in the prompt now — but if you encounter it, rephrase as "if [opponent team] wins" or simply use `outcome: NO` for the team you're betting against.
- **Wallet popup close detection** is wallet-vendor-specific. To work around inconsistent EIP-1193 reject codes there's a `cancel` link on every pending state and a 90s auto-timeout.
