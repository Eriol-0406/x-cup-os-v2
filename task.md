# X-Cup OS — Task Tracker

> A dApp on X Layer where football fans deploy AI agents that read plain-English
> betting strategies and autonomously place bets on World Cup prediction markets.

**Last updated:** 2026-05-24 · **Repo:** https://github.com/Eriol-0406/x-cup-os

## Live deployment (X Layer Testnet, chain 1952)

| Contract | Address | Explorer |
|---|---|---|
| `XCupMarket` | `0xb420447843a0868971A925C0c8ceC30c4b26b4f4` | [view ↗](https://www.oklink.com/x-layer-testnet/address/0xb420447843a0868971A925C0c8ceC30c4b26b4f4) |
| `MockUSDC` (test stake token) | `0x47C57Eb98A9C025114aAd96b9f6048ffdc8Bb3fA` | [view ↗](https://www.oklink.com/x-layer-testnet/address/0x47C57Eb98A9C025114aAd96b9f6048ffdc8Bb3fA) |
| Deployer / oracle | `0xFaC819e2465C24529ad3684D61BFb442cC239d8E` | [view ↗](https://www.oklink.com/x-layer-testnet/address/0xFaC819e2465C24529ad3684D61BFb442cC239d8E) |
| Demo agent (burner) | `0xA831DC61aa514D05fAEe4942237b3d682022f502` | [view ↗](https://www.oklink.com/x-layer-testnet/address/0xA831DC61aa514D05fAEe4942237b3d682022f502) |

64 on-chain markets, one per WC 2022 fixture (matchId pattern: `WC2022-{fixtureId}`).
Switching to live WC 2026 once API-Football plan is upgraded = change `WC_SEASON=2026` in `apps/api/.env`.

## Stack

| Layer | Tech | Status |
|---|---|---|
| Frontend | Next.js 14 + React + ethers v6 + OKX Wallet | ✅ |
| Backend | Node + Express + Prisma + SQLite (Postgres later) | ✅ |
| Smart contract | Solidity 0.8.24 + Foundry + OpenZeppelin v5 | ✅ |
| LLM parser | Groq Llama 3.3 70B (tool-use forced JSON) | ✅ |
| Match data | API-Football (api-sports.io) — env-driven league/season | ✅ |

---

## Phase 1 — Core build (DONE)

### Foundation
- [x] **Scaffold monorepo** — npm workspaces, apps/web, apps/api, contracts, packages/types, packages/abi · `b126be3`
- [x] **Lock parsed-strategy JSON schema** — Zod schema in `packages/types`, same shape Groq is forced to emit, the backend validates, and the frontend renders · `b126be3`

### Smart contract
- [x] **`XCupMarket.sol`** — parimutuel market, OpenZeppelin guards, 12 Foundry tests passing · `f23f6cb`
- [x] **Deploy to X Layer testnet** — initial deploy at `0x74A0…F5Fc4E3`, redeployed to `0xb420…26b4f4` after fixture refactor · `77a91c7`, `0f0cbcf`

### Backend
- [x] **Express + Groq parser** — POST `/strategies/parse`, forced tool-use, Zod-validated, ~600-900ms latency · `99a43b2`
- [x] **Session wallet generation + funding** — AES-256-GCM burner privkey in DB, `/users/by-address` upserts user + creates burner, "Fund Agent" UI sends USDC via user's main wallet · `29a7b48`
- [x] **Watch loop + first end-to-end fire** — evaluator for `match_winner` / `player_scores` / `score_threshold`, agent signs `approve` + `stake` autonomously, `StrategyFire` table with race-condition retry · `faff8e6`
- [x] **Oracle settle + auto-claim** — POST `/admin/settle` signs settle then iterates winning agents and auto-claims, `Claim` table, idempotent · `ea81c12`

### Frontend
- [x] **Next.js + real OKX Wallet connect** — chain 1952 detection, auto-switch via `wallet_switchEthereumChain`, 5-state context machine · `2402a2f`
- [x] **Live parse preview wired ↔ backend** — 600ms debounce, AbortController, animated trigger/action/risk cards · `a01a497`
- [x] **On-chain match list + activity dashboard** — cards reading directly from `XCupMarket` via ethers, agent activity table with explorer links · `84d8a1f`

### Real data — replacing all hardcoded matches (Phase 1 final)
- [x] **API-Football integration** — typed client + in-memory cache (TTL 1h), `Fixture` + `FixtureMarket` Prisma models, GET `/fixtures`, POST `/admin/sync-fixtures`, POST `/admin/create-markets`, GET `/admin/api-status` · `0f0cbcf`
- [x] **Fixture-driven Match List + filter pills** — real team logos from `media.api-sports.io`, filters `All / Live / Upcoming / Finished`, live cards animate, finished cards highlight winner, penalty score shown · `0f0cbcf`
- [x] **DB wipe + contract redeploy + create markets per fixture** — 64 WC 2022 fixtures synced, 64 on-chain markets created, env-driven so swap to WC 2026 is one line · `0f0cbcf`

---

## Phase 2 — Real-time + auto-settlement

### Demo replay flow (DONE)
- [x] **Replay endpoint** — `POST /admin/replay-fixture/:id` pulls the real historical outcome from API-Football, fires matching strategies on-chain, settles the market, auto-claims for winners. UI "Replay this match →" button on every finished fixture card. · `15736f1`
- [x] **Penalty-aware evaluator** — `MatchEvent.penaltyHome/penaltyAway` propagated through, `match_winner` correctly recognizes knockout penalty winners (e.g. ARG-FRA final 3-3 P 4-2). · `15736f1`

### Strategy ↔ fixture mapping (DONE)
- [x] **Strategy targets specific fixtures** — on deploy, backend resolves team mentions → matching `Fixture` rows → `marketId[]`, persists `Strategy.targetMarketIds`, `processMatchEvent` filters on it. "If Argentina wins" now fires only on Argentina matches, never on a France-vs-Brazil event. `POST /admin/backfill-targets` re-resolves existing strategies. · `04d1964`

### Team-aware parser (DONE)
- [x] **Parser knows real teams** — `apps/api/src/lib/teams.ts` fetches `/teams?league=1&season=2022` (32 teams), 24h in-memory cache, pre-warmed at API boot. Groq system prompt now lists canonical team names so LLM normalizes aliases ("Les Bleus" → "France", "La Albiceleste" → "Argentina", "Three Lions" → "England", "Selecao" → "Brazil"). Verified end-to-end: all three aliases resolve to the correct canonical name and the strategy resolver finds the right markets. · `67ffb4c`

### Pillar 1 — Tournament-winner markets (DONE)
- [x] **32 on-chain binary markets per team** — one "Does <team> win the cup?" market per WC 2022 nation (markets 65-96). matchId pattern `WC2022-WINNER-{teamCode}`. POST `/admin/create-tournament-markets` (idempotent), POST `/admin/settle-tournament` (winning team → YES, others → NO). · _commit on next push_
- [x] **TournamentMarketGrid UI** — compact card grid above Live Markets. Per card: team logo, name, current implied YES%, total pool, amount input + YES/NO bet buttons. Direct user-wallet stake (no AI agent — these are long-term sentiment bets). Settled markets show CHAMP / OUT badges. Sort by pot / odds / A-Z. 20s auto-refresh. · _commit on next push_

### Still to do
- [ ] **Live polling cron** — backend polls `/fixtures?live=all` every N minutes, detects status transition to FT/AET/PEN, auto-replays the fixture. Mostly valuable for live WC 2026; the historical replay covers the WC 2022 demo.
- [ ] **Stronger RPC propagation handling** — replace 800ms / 1500ms `setTimeout` workarounds with `provider.waitForTransaction({confirmations: 2})` OR move to log-subscription / event-driven flow

---

## Phase 3 — Submission polish

### Day-7 end-to-end smoke test (DONE)
- [x] **Smoke test** — every flow walked end-to-end on `main`. Findings:
  - ✅ Servers, API, fixtures, tournament markets, agent, parser, end-to-end fire/settle/claim all green
  - 🐛 Found + fixed: LLM emitted `team: "opponent"` for "if X loses" strategies (prompt strengthened, stale strategies cleaned)
  - 🐛 Found + fixed: tournament cards had no claim button (added)
  - 📄 Wrote `DEMO.md` with exact narration, UI actions, expected outcomes, on-chain proof links, and backup recovery steps
  - · _commit on next push_

### Still to do
- [ ] **Leaderboard + copy-strategy** — top public strategies ranked by PnL, "copy this agent" clones rules into current user's account · _spec-marked scope-cuttable: first feature to drop if Day 7 checkpoint is at risk_
- [ ] **Demo video + submission package** — pre-recorded (per spec Risk 5: no live demos), follow `DEMO.md` script, Twitter thread with on-chain proof, submit 24h before deadline. _Recording requires you behind the camera — script is ready._

---

## Out of scope (per spec — do NOT build)

- AMM pool for team tokens
- Custom Onchain OS skill
- Chainlink Functions oracle
- StrategyVault contract
- AgentRegistry contract for copy-trading
- Multi-chain support
- Mobile app
- Production-grade auth (wallet signature IS auth)

> If you're tempted to build something not on the Phase 2/3 list, the answer is:
> **"Add it to the v2 backlog. We're shipping the v1."**

---

## Quick commands

```bash
# Start both servers (in two terminals)
cd ~/x-cup-os/apps/api && npm run dev   # :4000
cd ~/x-cup-os/apps/web && npm run dev   # :3001

# Sync fixtures from API-Football (uses 1 of 100 daily requests)
curl -X POST http://localhost:4000/admin/sync-fixtures | jq

# Create on-chain markets for every unmapped fixture
curl -X POST http://localhost:4000/admin/create-markets -H 'Content-Type: application/json' -d '{}' | jq

# Check API-Football quota
curl http://localhost:4000/admin/api-status | jq

# Stop everything
pkill -f "next dev"; pkill -f "tsx watch"
```

## End-to-end demo flow (works today)

1. Open `http://localhost:3001`, connect OKX Wallet (chain 1952)
2. Agent burner auto-generated, fund it with mock USDC
3. Type strategy: `"Stake 25 USDC on YES if Argentina beats France"`, click Deploy
4. POST `/admin/match-event` with the match result → agent fires autonomously
5. POST `/admin/settle` → market settles, auto-claim runs, USDC returns to agent
6. Activity dashboard shows the full trail with explorer-linked tx hashes
