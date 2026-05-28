# X-Cup OS — 3-minute demo script

> **Live URL:** https://x-cup-os-v2.vercel.app
> **API:** https://x-cupapi-production.up.railway.app
> **Contract:** [`0x5349be46935302f77acD6363D063efFE5DE27c42`](https://www.oklink.com/x-layer-testnet/address/0x5349be46935302f77acD6363D063efFE5DE27c42) (X Layer testnet)

This is the recording script for a 3-minute demo video against the public deployment. Pace it at ~150 words/min — that's natural conversational speed. Every section has a target timestamp and the exact on-screen action to take.

---

## Pre-flight checklist (do BEFORE you hit record)

- [ ] Browser at `https://x-cup-os-v2.vercel.app` in a clean incognito window (fresh first-connect experience for the welcome modal demo)
- [ ] OKX Wallet extension installed, X Layer testnet network added (chain 1952)
- [ ] At least 0.05 OKB in your main wallet (faucet: https://web3.okx.com/xlayer/faucet/xlayerfaucet)
- [ ] Browser DevTools closed, zoom at 100%, tab pinned to the URL
- [ ] Disable browser notifications + Slack/Discord — no popups during recording
- [ ] Have this script open on a second screen / phone for prompts
- [ ] If `localStorage` already has `xcup_welcome_seen_v1`, clear site data so the welcome modal triggers

---

## Script

### [0:00–0:20] — Hook

> **Visual:** Homepage hero, header visible, "X LAYER TESTNET" banner at top.
>
> **Narration:**
>
> "Polymarket-style prediction markets meet autonomous AI agents — for the World Cup. You write a betting strategy in plain English, deploy an agent, and it places bets on-chain when your conditions hit. Live on X Layer testnet right now."

### [0:20–0:50] — Connect wallet + onboarding

> **Action:** Click **Connect Wallet** → approve in OKX → wait for the welcome modal.
>
> **Narration while modal is visible:**
>
> "First-time visitors get a guided onboarding. Three steps: mint test USDC, top up agent gas, write a strategy. The agent has its own burner wallet — encrypted server-side — so users never have to sign every bet themselves."
>
> **Action:** Click **Got it, let me start** → wait for AgentPanel to populate (burner address + balances).
>
> **Action:** Click **+ Mint 10k USDC** → confirm in wallet → "minted" message → balance updates.
>
> **Action:** Click **⛽ Top up agent gas** → confirm in wallet → burner OKB updates.

### [0:50–1:40] — Write the strategy + AI parse

> **Action:** Scroll to the "Your Strategy" editor. Type:
>
> > `If Argentina wins their next match and Mbappe scores, stake 50 USDC on YES for France reaches the final. Stop if I lose more than 200 USDC.`
>
> **Narration:**
>
> "The agent uses Llama 3.3 70B on Groq, with forced tool-use so we always get structured JSON back. Trigger conditions, action, risk limits — parsed live as you type."
>
> **Action:** Wait ~600ms — the right-side "Parsed Rules" panel fills with trigger cards (Argentina wins, Mbappe scores), action card (stake 50 YES on France-reaches-final), and risk card (max loss 200).
>
> **Narration:**
>
> "Notice it knows 'Argentina' means the team — we feed the AI the canonical team list, so 'La Albiceleste', 'Three Lions', 'Les Bleus' all resolve correctly. Plus team mentions get resolved to on-chain market IDs at deploy time, so the agent only fires on Argentina matches, not random France-vs-Brazil events."
>
> **Action:** Click **Deploy Agent →** → confirm. Strategy persists, status flips to **active**.

### [1:40–2:20] — Place an actual bet

Option A — **manual stake** (proves the on-chain layer is real):

> **Action:** Click **Outrights** in the nav → **Tournament Winner** tab → scroll to Argentina or your team of choice.
>
> **Narration:**
>
> "Users can also place direct bets. Here are 48 tournament-winner markets — one per team — plus reach-final, group-winner, top-scorer, BTTS, over/under, first-scorer. All on-chain on X Layer."
>
> **Action:** Click **YES** on a card → wallet popup → approve USDC allowance → stake 10 USDC → tx confirms.
>
> **Action:** Card refreshes — pot bumps to 10 USDC, YES probability updates.
>
> **Action:** Click the tx hash → opens OKLink → shows the on-chain transaction. **Pause for 2 seconds on the explorer page.**

Option B — **demo the agent firing autonomously** (only works if Railway is on `WC_SEASON=2022`; takes ~10s):

> **Action:** Open a terminal alongside. Run:
>
> ```bash
> curl -X POST https://x-cupapi-production.up.railway.app/admin/replay-fixture/855736
> ```
>
> **Narration:**
>
> "Behind the scenes, every active strategy is watched against incoming match events. When the conditions hit, the agent autonomously calls stake on the contract. Here's a replay of Argentina vs Saudi Arabia from 2022 — the agent fires, the bet lands on-chain. No human clicked anything."
>
> **Action:** Scroll to the Agent Activity dashboard at the bottom → see the new fire row with tx hash + explorer link.

### [2:20–2:50] — What's different

> **Action:** Scroll the homepage hero nav cards on-screen (Match, Outrights, Predictions, Specials, Bracket, Leaderboard).
>
> **Narration, hitting these in order:**
>
> "A few things that make this more than a Polymarket clone:
>
> - **Variable per-market fees** — 1.8% on easy 1x2 bets, 0.9% on harder outrights like Top Scorer. Higher vig where it's deserved.
> - **Cross-market arb chips** — if Argentina's winner-of-cup probability is higher than their reach-final probability, that's mathematically impossible. We surface those inconsistencies inline on the outright cards.
> - **Multi-season** — the same DB serves WC 2022 historical replay and WC 2026 live, by flipping one env var. No re-deploy.
> - **Open to anyone** — anyone with a wallet can deploy their own agent. The leaderboard ranks strategies by realized PnL, and a copy button lets you clone someone else's strategy into your account."

### [2:50–3:00] — Close

> **Narration:**
>
> "Polymarket meets autonomous agents, sized for the World Cup. Live now on X Layer testnet — link below. Mainnet path needs a TEE for burner keys plus a real settlement oracle — both are documented next steps."
>
> **Visual:** Final shot on the homepage with the testnet banner visible.

---

## Backup scripts (if something breaks on-camera)

### Wallet popup hangs
> "My wallet's being slow — let me skip ahead. The transaction will land in a few seconds."

Move on; come back if it eventually confirms.

### Groq API rate-limits
> "Free tier just kicked in. In production we'd be on a paid tier — same code, no pacing needed."

Show the activity dashboard instead — it has real fire history from earlier sessions.

### Vercel cold start makes the page slow
> "That first load is the serverless cold start — subsequent users get the cached build."

Reload once; should be instant.

### "Couldn't load X" error
> "This is a known one — usually a CORS misalignment after an env change. The data is still there; here's the API direct."

Pivot to a terminal demo of the same endpoint.

---

## On-chain proof transactions (paste these into the video description)

| What | Tx hash |
|---|---|
| First manual stake (v2 contract) | _paste after recording_ |
| Agent fire on a replay | _paste after recording_ |
| Contract deploy (XCupMarket v2) | `0x15fa6160277aca9e803e15f04eae19ead37bf530e7997d56033e041ea05d923a` |
| MockUSDC deploy (v2) | `0xda8aa9b636bc3d8305434d25b93dc8fe0e6fde85ba756cca188ce44bf4798d31` |

---

## Architecture recap (for the video description box)

```
Frontend  →  Vercel               (Next.js 14, React, ethers v6, OKX Wallet)
API       →  Railway              (Express + Prisma + Groq SDK)
Database  →  Railway Postgres     (users, strategies, fires, fixtures, market metadata)
Contract  →  X Layer testnet      (parimutuel, variable per-market fees, settable treasury)
Data feed →  API-Football Pro     (live World Cup fixtures, predictions, lineups, top scorers)
LLM       →  Groq Llama 3.3 70B   (forced tool-use, ~600ms parse latency)
```

286+ on-chain markets per season. WC 2022 (32 teams, 64 fixtures) and WC 2026 (48 teams, 104 fixtures) can coexist in one database.

---

## Talking points if asked in Q&A

- **"Why parimutuel and not AMM?"** — Lower complexity, no liquidity bootstrap problem, fair payout math, matches Polymarket's mental model.
- **"What about burner key security?"** — Encrypted in Postgres with AES-256-GCM. Acceptable for testnet. Mainnet path is OKX Agentic Wallet TEE or Lit Protocol.
- **"How does settle work?"** — Admin-signed today. Production needs Chainlink Functions or similar with API-Football as the data source.
- **"What happens if the AI mis-parses a strategy?"** — Frontend previews the parsed JSON live before deploy. User sees what the agent will actually do and can edit before confirming. Plus targetMarketIds resolution acts as a final guard — if the strategy mentions a team that doesn't exist, it just won't fire.
- **"Why X Layer?"** — Cheap gas, EVM-compatible, growing dApp ecosystem, OKX Wallet integration. Same code ports to any EVM L2.
