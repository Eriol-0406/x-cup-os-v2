# X-Cup OS — Task Tracker

> A dApp on X Layer where football fans deploy AI agents that read plain-English
> betting strategies and autonomously place bets on World Cup prediction markets.

**Last updated:** 2026-05-27 · **Repo:** https://github.com/Eriol-0406/x-cup-os-v2 (v1 frozen at https://github.com/Eriol-0406/x-cup-os)

## Live deployment (X Layer Testnet, chain 1952)

### v1 contract (frozen — used by demo recording)

| Contract | Address |
|---|---|
| `XCupMarket` | `0xb420447843a0868971A925C0c8ceC30c4b26b4f4` |
| `MockUSDC`   | `0x47C57Eb98A9C025114aAd96b9f6048ffdc8Bb3fA` |

### v2 contract (post-submission, variable fees + settable treasury)

| Contract | Address |
|---|---|
| `XCupMarket` | `0x5349be46935302f77acD6363D063efFE5DE27c42` (deploy tx `0x15fa6160…05d923a`) |
| `MockUSDC`   | `0x6D0ecefecCE861B9353Ca353ccfb39a1537335e6` (deploy tx `0xda8aa9b6…f4798d31`) |
| Treasury     | `0xFaC819e2465C24529ad3684D61BFb442cC239d8E` (= deployer; swap to Safe via `setTreasury(address)`) |

286 markets re-seeded on the v2 contract (matchId pattern: `WC2022-{fixtureId}`).
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

### Deferred to v2 (not blockers for submission)
- [~] ~~**Live polling cron**~~ — would auto-replay fixtures when API-Football flips them to FT. Only meaningful for LIVE WC 2026 (paid plan); the user-driven `Replay this match →` button covers the WC 2022 historical demo completely. Architecture is ready (just add a `node-cron` task in `apps/api/src/index.ts` that calls `replayFixture()` per status transition). **Skipped because:** zero demo blocker and the trigger button reads better in a video than "wait 60 seconds for cron to fire."
- [~] ~~**Stronger RPC propagation handling**~~ — current 800ms / 1500ms `setTimeout` workarounds are fragile but work reliably on X Layer testnet. The cleaner version is `provider.waitForTransaction({ confirmations: 2 })`. **Skipped because:** tech debt only, invisible to demo, swap is a 5-line change in two files when we want to do it.

---

## Phase 3 — Submission polish

### Day-7 end-to-end smoke test (DONE)
- [x] **Smoke test** — every flow walked end-to-end on `main`. Findings:
  - ✅ Servers, API, fixtures, tournament markets, agent, parser, end-to-end fire/settle/claim all green
  - 🐛 Found + fixed: LLM emitted `team: "opponent"` for "if X loses" strategies (prompt strengthened, stale strategies cleaned)
  - 🐛 Found + fixed: tournament cards had no claim button (added)
  - 📄 Wrote `DEMO.md` with exact narration, UI actions, expected outcomes, on-chain proof links, and backup recovery steps
  - · _commit on next push_

### Leaderboard + copy-strategy (DONE)
- [x] **Leaderboard + copy-strategy** — `/strategies/leaderboard` ranks strategies by `currentPnlUsdc` DESC (fireCount as tiebreak), anonymizes owners with `0x1234…ab12` short addresses. `POST /strategies/:id/copy` clones a strategy's `parsedJson` + `englishText` into another user's account, re-resolves `targetMarketIds`, auto-activates. UI table with rank medals, owner, strategy text, fires, PnL, status pill, and Copy → button. Highlights "YOU" tag on your own rows. · _commit on next push_

### First-scorer player-prop markets + AI agent integration (DONE)
- [x] **Per-fixture first-scorer markets** — 16 markets created (one per WC2022 knockout). Outcomes are real player names from API-Football goal events (Messi, Mbappé, Giroud, etc.). UI inline panel under each finished fixture card with player rows, implied odds %, pool, "Bet" buttons. Auto-settles on replay with the actual first scorer. · _commit on next push_
- [x] **AI agent fires on player-prop markets** — strategies like "If Messi scores" resolve to all player-prop markets where Messi is an outcome. New `processPlayerPropEvent()` in firing.ts looks up the player's outcome idx in the market and stakes on it. Replay flow fires both match-winner AND player-prop events, then settles+claims both. Verified: deployed "If Messi scores, stake 15 USDC YES" → replay Argentina 1-2 Saudi Arabia → agent autonomously staked 15 USDC on the Messi outcome of player-prop market 101 → settled → claimed 15 USDC. · _commit on next push_

### Pillar 2 expansion + multi-page restructure (DONE)
- [x] **Predictions markets** — 5 binary Y/N opinion markets seeded ("Will an unbeaten champion emerge?", "Top scorer 5+ goals?", "Host nation reaches R16?", "European Golden Boot?", "Underdog in semis?"). On-chain markets 120-124. Backend `PredictionMarket` model, /admin/seed-predictions, /admin/create-prediction-market, /admin/settle-prediction. · _commit on next push_
- [x] **Multi-page route restructure** — separate Next.js pages for /match, /outrights, /predictions, /specials, /bracket, /leaderboard. Header nav with all routes. Home reduced to hero + agent + editor + activity. Hero shows nav cards as visual section index. · _commit on next push_
- [x] **Visual knockout bracket page** — `KnockoutBracket` component renders R16 → QF → SF → Final as 4-column layout, reads from existing fixture data on-chain, highlights winners (incl. penalty winners) in green. · _commit on next push_
- [x] **Friend-only private market flag** — `PredictionMarket.isPrivate` + `allowlist` JSON. UI: `CreatePredictionForm` lets any user create a prediction market with optional 🔒 friend-only toggle + comma/newline-separated wallet address list. Private markets render with 🔒 badge; UI blocks bet button if wallet not allowlisted (on-chain market itself remains permissionless — v2 enforcement). · _commit on next push_

### Still to do (v1 submission)
- [ ] **Demo video + submission package** — pre-recorded (per spec Risk 5: no live demos), follow `DEMO.md` script (NEEDS UPDATE for the new multi-page + predictions + bracket flow), Twitter thread with on-chain proof, submit 24h before deadline (2026-05-28 23:59 UTC).
- [ ] **`DEMO.md` rewrite** — the script still narrates the pre-restructure flow. Walk through `/match → /outrights → /predictions → /specials → /bracket → /leaderboard` in submission order and update the on-chain proof tx hashes.

---

## Phase 4 — v2 (post-submission, shipped 2026-05-27)

### Infrastructure
- [x] **Postgres migration (Railway)** — `apps/api/.env` `DATABASE_URL` swapped to Railway, Prisma `provider = "postgresql"`, SQLite migrations replaced by a single fresh init migration (`20260527081353_init`). DB hosts all 64 fixtures + 286 markets.
- [x] **v2 ports** — v2 API on `4001`, v2 web on `3002` so both repos can run side-by-side (v1 stays on 4000/3001 for video).

### Variable fees + contract redeploy
- [x] **`feeBps` per market** — `XCupMarket.sol` now stores `uint16 feeBps` per market (capped at `MAX_FEE_BPS = 500` = 5%). `createMarket()` takes the fee at creation time; `claim()` deducts it from the gross payout and forwards to `treasury`. Constructor reverts on zero-address admin or treasury. 20 Foundry tests pass.
- [x] **Settable treasury** — `setTreasury(address)` admin-only, emits `TreasurySet`. Initial treasury = deployer wallet; can be swapped to a Gnosis Safe later without redeploy.
- [x] **Per-category fee schedule** — `apps/api/src/lib/marketFees.ts` centralizes the bps for each market type (1x2 = 180, O/U = 160, BTTS = 160, first-scorer = 140, group-winner = 130, tournament-winner = 120, reach-final = 110, prediction = 100, top-scorer = 90). Live at `GET /admin/fee-schedule`.
- [x] **UI fee surfacing** — `TournamentMarketGrid` shows a small "1.20% fee" tag on each card. Backend's enrichment endpoints include `feeBps` in the JSON.
- [x] **`quoteClaim` updated** — view function now returns the NET payout (after fee) so the agent's pre-flight check matches what `claim` actually pays.

### Cross-market arb signals (inline)
- [x] **`GET /arb-signals` endpoint** — scans tournament-winner vs reach-final per team for `P(winner) > P(reach_final)` violations, plus global Σ-P sanity checks (Σ winner ≈ 1.0, Σ reach-final ≈ 2.0).
- [x] **Inline ⚠ chips** — when a team has a mispricing, a small red chip appears on its card in both the Winner and Reach-Final tabs of `/outrights`. Hover for the full explanation + suggested action. No standalone arb page (was demoted from the original design per product feedback).
- [x] **Honest framing** — chips surface the signal but don't auto-execute. The endpoint is also consumable by the agent loop for future "arb-aware" strategies.

---

## Phase 5 — open agent deployment (planned, not yet built)

Goal: let anyone connect a wallet and deploy their own agent + strategies. The architecture already supports this (each `User` is keyed by `mainWallet`, burner is auto-generated, watch loop already iterates all users). The deltas:

- [ ] **Public hosting** — v2 web → Vercel (env `NEXT_PUBLIC_API_URL` → public API URL). v2 API → Railway / Render / Fly with `DEPLOYER_PRIVATE_KEY`, `GROQ_API_KEY`, `API_FOOTBALL_KEY`, `BURNER_ENCRYPTION_KEY` set as env vars. Same Postgres DB as today.
- [ ] **Burner OKB funding flow** — currently the user has to send testnet OKB to their burner manually. Add a "Top up agent gas" button that sends 0.005 OKB from the user's main wallet to their burner (one-time, covers ~200 txs). Or auto-relay from the deployer (cheaper UX but couples the deployer to user growth).
- [ ] **MockUSDC mint UX** — already open-mint on-chain; add a "Mint 100 test USDC" button in the Fund Agent panel so new users don't need to find the contract address.
- [ ] **Rate-limit awareness** — API-Football free tier is 100 req/day across ALL users. With many users, calls like `/fixtures/:id/lineups` need stricter caching. Mitigated when upgrading to a paid plan.
- [ ] **Burner key security disclaimer** — encrypted-in-DB is fine for testnet but not mainnet. Add a clear "this is testnet — never send mainnet funds to your burner" notice in the UI. Upgrading to OKX Agentic Wallet / TEE is the mainnet path (already noted as intentional v2 gap in HANDOFF.md).
- [ ] **Per-wallet strategy cap** — open mint MockUSDC means there's no economic cost to spam strategies. Cap at e.g. 5 active strategies per wallet to prevent abuse.

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
# v1 (frozen, demo recording)
cd ~/x-cup-os/apps/api && npm run dev      # :4000
cd ~/x-cup-os/apps/web && npm run dev      # :3001

# v2 (current dev — Postgres + variable fees + arb chips)
cd ~/x-cup-os-v2/apps/api && npm run dev   # :4001
cd ~/x-cup-os-v2/apps/web && npm run dev   # :3002

# Sync fixtures from API-Football (uses 1 of 100 daily requests)
curl -X POST http://localhost:4001/admin/sync-fixtures | jq

# Re-seed everything on a fresh contract
curl -X POST http://localhost:4001/admin/create-markets -H 'Content-Type: application/json' -d '{}' | jq
curl -X POST http://localhost:4001/admin/create-tournament-markets | jq
curl -X POST http://localhost:4001/admin/seed-bookmaker-markets | jq
curl -X POST http://localhost:4001/admin/seed-predictions | jq
curl -X POST http://localhost:4001/admin/create-first-scorer-markets -H 'Content-Type: application/json' \
  -d '{"fixtureIds":[976533,976642,976643,976534,977344,977705,977345,977706,978072,977794,978088,978036,978279,978488,979138,979139]}' | jq

# View fee schedule + API quota
curl http://localhost:4001/admin/fee-schedule | jq
curl http://localhost:4001/admin/api-status | jq

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
