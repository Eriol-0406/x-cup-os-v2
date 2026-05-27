# X-Cup OS — Context Window Handoff

> **For the next Claude session that picks this up.** Self-contained — assumes zero prior conversation memory. Everything you need to resume work lives here or in linked docs.

---

## Project at a glance

X-Cup OS is an AI-agent betting dApp on **X Layer testnet** built for a hackathon submission. Users write a betting strategy in plain English ("If Argentina wins their next match and Messi scores, stake 50 USDC YES"), the system parses it via Groq (Llama 3.3 70B with forced tool-use), and an autonomous agent fires bets on parimutuel prediction markets when the conditions hit. Real World Cup 2022 fixture data flows from API-Football. Multiple market types: 1x2 fixture markets, tournament-winner outrights, to-reach-final outrights, first-scorer player-props, over/under 2.5, BTTS, top-scorer, per-group winner, and yes/no opinion markets users can create themselves.

**Pitch:** "Polymarket meets autonomous agents, sized for the World Cup. Write a strategy, agent does the rest."

**Spec:** the original 28-page spec is at `~/Downloads/X-Cup OS (1).pdf`. Read pages 3, 5, 8 for the architectural mental model.

---

## Repo split — v1 vs v2

| Repo | GitHub | Local | Purpose |
|---|---|---|---|
| **v1** (submission state) | https://github.com/Eriol-0406/x-cup-os | `~/x-cup-os/` | **Demo recording target.** Do NOT touch unless fixing a recording-blocker bug. |
| **v2** (post-submission work) | https://github.com/Eriol-0406/x-cup-os-v2 | `~/x-cup-os-v2/` | Where Postgres migration, variable fees + contract redeploy, and cross-market arb UI happen. Just forked from v1 — same code, different remote. |

**Rule: anything risky goes in v2. Submission video records against v1.**

---

## v2 status — DONE (2026-05-27)

All three pending v2 items shipped in this session. v1 stays at `74b8584`; v2 diverges.

| Item | Status | Where |
|---|---|---|
| Postgres migration (Railway) | ✅ done | `apps/api/.env` → `DATABASE_URL`, Prisma provider `postgresql`, fresh init migration in `prisma/migrations/20260527081353_init/` |
| Variable fees per market + redeploy | ✅ done | `contracts/src/XCupMarket.sol` (added `feeBps`, `treasury`, `setTreasury`, fee deducted in `claim`). 20 Foundry tests pass. New contract at `0x5349be46935302f77acD6363D063efFE5DE27c42`. Per-category fees centralized in `apps/api/src/lib/marketFees.ts`. |
| Cross-market arb visibility UI | ✅ done | `GET /arb-signals` endpoint + `/arb` page. Detects winner_vs_reach_final per-team violations + global winner-sum / reach-final-sum anomalies. |

### v2 ports

v1 (frozen for recording) uses 4000 + 3001. v2 uses **4001 + 3002** so both can run side-by-side.

```
v2 API   http://localhost:4001
v2 Web   http://localhost:3002
```

### v2 on-chain (X Layer testnet, chain ID 1952)

```
XCupMarket  0x5349be46935302f77acD6363D063efFE5DE27c42   (deploy tx 0x15fa6160…05d923a)
MockUSDC    0x6D0ecefecCE861B9353Ca353ccfb39a1537335e6   (deploy tx 0xda8aa9b6…f4798d31)
Treasury    0xFaC819e2465C24529ad3684D61BFb442cC239d8E   (= deployer for now; admin can call setTreasury(<safe>) to migrate)
```

286 markets re-seeded on the new contract (same counts as v1, marketId starts back at 1).

### v2 fee schedule (basis points, capped at 500 = 5%)

```
FIXTURE_1X2          180   (highest vig — easy market, deep liquidity)
OVER_UNDER_25        160
BTTS                 160
FIRST_SCORER         140
GROUP_WINNER         130
TOURNAMENT_WINNER    120
TO_REACH_FINAL       110
PREDICTION_OPINION   100
TOP_SCORER            90   (lowest vig — hardest call)
```

Live at `GET /admin/fee-schedule`. To change, edit `apps/api/src/lib/marketFees.ts` (per-category constants). To raise the cap, change `MAX_FEE_BPS` in the contract and redeploy.

### Treasury hand-off plan

The contract is live with treasury = deployer wallet. To migrate to a Safe:

1. Create a Safe multisig on X Layer testnet (https://app.safe.global, network = X Layer Testnet 1952).
2. From the deployer wallet, call `XCupMarket.setTreasury(<safe-address>)`. Emits `TreasurySet`.
3. Confirm with `c.treasury()` view call.

No re-deploy needed. setTreasury is admin-only and idempotent.

---

## Current state — what's shipped (v1)

v1 stays frozen at commit `74b8584` ("Task #32 lineups + player profiles") for demo recording.

### Built features

| Pillar | What works | Where |
|---|---|---|
| **1. Team token markets** (Outrights) | 32 binary tournament-winner markets + 32 to-reach-final markets + 1 top-scorer multi-outcome + 8 per-group-winner multi-outcomes | `/outrights` page with 4 tabs |
| **2. Prediction markets** | 64 fixture 1x2 markets + 64 over/under 2.5 + 64 BTTS + 16 first-scorer player-prop + 5 default yes/no opinion markets (+ users can create their own) | `/match`, `/specials`, `/predictions` |
| **3. AI agent + follow-trade** | Groq parser, watch loop, signer (burner wallet per user), strategy resolver, leaderboard with Copy → button | `/`, `/leaderboard` |
| Knockout bracket | Visual 16-match tree + 8 group standings tables | `/bracket` |
| Stats pages | Group standings + Top scorers (with bet bridges to outright markets) | `/standings`, `/top-scorers` |
| Per-fixture details | H2H modal, first-scorer odds, **Model vs Pool comparison** (Task #31), **Lineups + player profile pages** (Task #32) | inline on `/match` fixture cards |
| 2-user follow-trade | `scripts/setup-second-user.mjs` provisions a fresh wallet + funds it + provides import instructions | command-line |

### What's on-chain (X Layer testnet, chain ID 1952)

```
XCupMarket  0xb420447843a0868971A925C0c8ceC30c4b26b4f4   (live)
MockUSDC    0x47C57Eb98A9C025114aAd96b9f6048ffdc8Bb3fA   (live, open mint for testing)
Deployer    0xFaC819e2465C24529ad3684D61BFb442cC239d8E   (user's wallet, holds USDC + OKB + admin role)
Demo agent  0xA5b4C9eD2Fa661Ed350E0d0D50F8E202A6c6Eefe   (User A's burner)

286 markets total:
  - 64 fixture 1x2 markets       (markets 1..64)
  - 32 tournament-winner markets (winner type)
  - 32 to-reach-final markets    (to_reach_final type)
  - 16 first-scorer markets      (player-prop type)
  - 5 prediction markets         (yes/no opinion)
  - 64 over/under 2.5 markets
  - 64 BTTS markets
  - 1 top-scorer market          (multi-outcome)
  - 8 group-winner markets       (one per group A-H)
```

Explorer: https://www.oklink.com/x-layer-testnet

### Sample proof transactions

| Description | Tx hash |
|---|---|
| Argentina vs Mexico 2-0 replay → 1x2 fire + first-scorer + tournament | https://www.oklink.com/x-layer-testnet/tx/0x7ea6429a7b1240d56fd8ddaf0ed7cf8f531184b59f4144559044ed38893d6f40 |
| France vs Morocco SF replay → fires on TRF market | https://www.oklink.com/x-layer-testnet/tx/0x7963f6016d3dfc1c2c7835243b7ead83099ccd025ca2b783158e1da76e23e73b |
| Argentina-France Final replay → tournament-winner fire | https://www.oklink.com/x-layer-testnet/tx/0xc5d222bd31347527f9a655338f0e82baed03e94a6e9dc7e4ee89fc878424f2b3 |
| Brazil 4-1 South Korea → Vinícius first-scorer fire | https://www.oklink.com/x-layer-testnet/tx/0x04f245cbe1f1afa7d7c7cb7b83c4d611dbef93f687a0369bf29cdd89b9e737a6 |

---

## ~~Pending~~ COMPLETED v2 work (kept below for reference)

**All three sections below are now shipped — keeping the original plan as a build log.**

### 1. Migrate to Railway Postgres (~30-60 min)

User has a paid Railway subscription. Steps:

1. Go to railway.app dashboard → new project → "Provision PostgreSQL"
2. Copy the `DATABASE_URL` from the Postgres service variables panel
3. In `~/x-cup-os-v2/apps/api/.env`, replace `DATABASE_URL=file:./dev.db` with `DATABASE_URL=postgresql://...`
4. In `~/x-cup-os-v2/apps/api/prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`
5. Run `cd ~/x-cup-os-v2/apps/api && npx prisma migrate deploy` — applies all 7 migrations to the fresh Postgres DB
6. Restart API. Verify with `curl localhost:4000/health` + `curl localhost:4000/admin/api-status`
7. The DB is empty so you'll need to re-seed:
   - `POST /admin/sync-fixtures` — pulls 64 WC 2022 fixtures
   - `POST /admin/seed-bookmaker-markets` — creates all 169 sub-markets (~5 min, 169 on-chain txs)
   - `POST /admin/seed-predictions` — creates 5 prediction markets
   - `POST /admin/cache-teams` — populates Team table with group letters
   - `POST /admin/create-first-scorer-markets` with `{"fixtureIds":[976533,976642,...]}` (knockout fixture IDs)

**Note on schema.prisma:** SQLite uses `String` for JSON arrays (we manually JSON.stringify/parse). Postgres has a native `Json` type — could migrate to that for cleanliness but the existing String-with-JSON-inside works too. Leave as String to minimize migration churn.

### 2. Variable fees + contract redeploy (~3-4 hrs)

User wants 0.9% (hard markets) to 1.8% (easy markets) variable fee by category. Plan:

#### a. Modify `contracts/src/XCupMarket.sol`

```solidity
struct Market {
    string matchId;
    uint8 outcomeCount;
    MarketStatus status;
    uint256 closeTime;
    uint8 winningOutcome;
    uint256 totalPot;
    uint16 feeBps;        // NEW (e.g. 180 = 1.80%)
}

address public treasury;  // NEW
event FeeAccrued(uint256 indexed marketId, uint256 amount);

constructor(IERC20 _stakeToken, address _admin, address _treasury) {
    // ... existing ...
    treasury = _treasury;
}

function createMarket(string calldata matchId, uint8 outcomeCount, uint256 closeTime, uint16 feeBps)
    external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 marketId)
{
    require(feeBps <= 500, "fee too high"); // cap at 5%
    // ... existing logic ...
    markets[marketId].feeBps = feeBps;
}

function claim(uint256 marketId) external nonReentrant returns (uint256 payout) {
    // ... existing checks (NotSettled, AlreadyClaimed, NothingToClaim) ...
    uint256 userWinningStake = userStakes[marketId][msg.sender][m.winningOutcome];
    uint256 winningPot = outcomePots[marketId][m.winningOutcome];
    uint256 rawPayout = (m.totalPot * userWinningStake) / winningPot;
    uint256 fee = (rawPayout * m.feeBps) / 10_000;
    payout = rawPayout - fee;
    
    hasClaimed[marketId][msg.sender] = true;
    if (fee > 0) {
        stakeToken.safeTransfer(treasury, fee);
        emit FeeAccrued(marketId, fee);
    }
    stakeToken.safeTransfer(msg.sender, payout);
    emit Claimed(marketId, msg.sender, payout);
}
```

#### b. Update Foundry tests in `contracts/test/XCupMarket.t.sol`

Add tests for: fee=0 (back-compat behavior), fee=180 deducted correctly, fee=500 max, fee=600 reverts, multi-winner with fees applied to each independently. Existing 12 tests need updates to include the new `feeBps` param in `createMarket()` calls.

#### c. Per-category fee assignment

In `apps/api/src/lib/`:

- `fixtureSync.ts` `createMissingMarkets`: feeBps = **180** (1.80% — easy match bets, max vig)
- `subsetMarkets.ts` `createOverUnderMarkets`: feeBps = **160**
- `subsetMarkets.ts` `createBTTSMarkets`: feeBps = **160**
- `tournamentSync.ts` `createTournamentMarkets` (winner type): feeBps = **120**
- `subsetMarkets.ts` `createToReachFinalMarkets`: feeBps = **110**
- `playerProps.ts` `createFirstScorerMarkets`: feeBps = **140**
- `subsetMarkets.ts` `createTopScorerMarket`: feeBps = **90** (hardest, lowest vig)
- `subsetMarkets.ts` `createGroupWinnerMarkets`: feeBps = **130**
- `predictionMarkets.ts` `createPredictionMarket`: feeBps = **100**

Update each function signature to accept feeBps. Update the `createMarket()` call inside each to pass it.

#### d. Redeploy + re-seed

```bash
cd contracts
forge test                                                # all tests pass
forge script script/Deploy.s.sol --rpc-url $XLAYER_TESTNET_RPC --broadcast
# Capture new XCupMarket + MockUSDC addresses
```

Then update `packages/abi/addresses.json` with new addresses + tx hashes. Then re-run all the seed endpoints (same playbook as Postgres migration above).

#### e. Treasury

For testnet, use the deployer wallet as treasury (`0xFaC819...9d8E`). The constructor takes a treasury address — pass `vm.addr(deployerKey)` in `Deploy.s.sol`. For production, swap to a multisig (Gnosis Safe).

#### f. UI surfacing

Add to each market card a small "1.8% fee" tag near the pot total. Code change in `MatchList.tsx`, `TournamentMarketGrid.tsx`, etc. Backend's market enrichment endpoints need to read `m.feeBps` from on-chain and return it in the JSON response.

### 3. Cross-market arb visibility UI (~2 hrs)

Sophisticated demo angle: visualize when related markets have inconsistent prices. E.g., if Argentina-wins-cup market shows 40% YES but Argentina-reaches-final shows only 30% YES, that's mathematically impossible (winning the cup implies reaching the final), so there's a guaranteed-profit arbitrage.

Implementation:

1. New endpoint `GET /arb-signals` that scans markets and finds inconsistencies:
   - For each team with both tournament_winner + to_reach_final markets: assert `P(winner) ≤ P(reach_final)`. If violated, flag.
   - For each fixture with both 1x2 and over/under: check P(home goals > 1.5) + P(away goals > 1.5) implies BTTS YES probability ≥ some threshold.
   - For each Group Winner market vs the 1x2 markets of that group's fixtures: compute implied "who tops the group" from the fixture markets, compare to the Group Winner pool.

2. New page `/arb` showing each detected inconsistency as a card with: team/market involved, the inconsistency in plain English, the implied guaranteed-profit %, "Take the arb →" button (links to the two markets you'd stake on).

3. Honest framing in DEMO.md: "We don't auto-execute arb; we surface opportunities. Future v2 lets users delegate this to an agent."

---

## Files to read first in a fresh session

| Purpose | File |
|---|---|
| Project overview + Pillars | `task.md` |
| Demo recording script | `DEMO.md` |
| Architecture + agent loop walkthrough | `CODE-WALKTHROUGH.md` |
| On-chain contract | `contracts/src/XCupMarket.sol` |
| Agent firing logic | `apps/api/src/lib/firing.ts` |
| Strategy resolver | `apps/api/src/lib/strategyResolver.ts` |
| Replay flow (match → fire → settle → claim) | `apps/api/src/lib/replay.ts` |
| LLM parser (Groq tool-use) | `apps/api/src/parser.ts` |
| Frontend match list (largest component) | `apps/web/components/MatchList.tsx` |
| Wallet integration | `apps/web/components/WalletProvider.tsx`, `apps/web/lib/wallet.ts` |

---

## Env vars

All in `apps/api/.env` (gitignored). Don't commit values.

```
GROQ_API_KEY                 (Llama 3.3 70B parser — free tier at console.groq.com)
API_FOOTBALL_KEY             (api-sports.io — free tier, 100/day, 10/min)
API_FOOTBALL_HOST=v3.football.api-sports.io
WC_LEAGUE_ID=1
WC_SEASON=2022               (change to 2026 with paid API tier — same code works)
FIXTURE_CACHE_TTL=3600
XLAYER_TESTNET_RPC=https://testrpc.xlayer.tech
XLAYER_CHAIN_ID=1952
XLAYER_EXPLORER=https://www.oklink.com/x-layer-testnet
DEPLOYER_PRIVATE_KEY=        (throwaway testnet key — has 0.2 OKB + 10k USDC)
BURNER_ENCRYPTION_KEY        (auto-generated on first API startup if empty — AES-256-GCM key)
DATABASE_URL=file:./dev.db   (swap to postgresql://... in v2)
PORT=4000
WEB_ORIGIN=http://localhost:3001
```

User's actual keys are in `apps/api/.env` on their local machine. **Never echo to chat or commit.**

---

## Commands to resume

### Starting servers

```bash
# v1 (frozen, demo)
cd ~/x-cup-os/apps/api && npm run dev      # port 4000
cd ~/x-cup-os/apps/web && npm run dev      # port 3001

# v2 (post-submission work — different ports so both can run)
cd ~/x-cup-os-v2/apps/api && npm run dev   # port 4001
cd ~/x-cup-os-v2/apps/web && npm run dev   # port 3002
```

### Quick sanity checks

```bash
curl -s http://localhost:4000/health | jq                           # API + chain ID
curl -s http://localhost:4000/admin/api-status | jq '.requests'     # API-Football quota left
curl -s http://localhost:4000/fixtures?status=finished&take=3 | jq  # synced fixtures
curl -s http://localhost:4000/tournament-markets | jq '.count'      # should be 32
curl -s http://localhost:4000/prediction-markets | jq '.count'      # should be ≥5
```

### Running the demo flow (1-2 user follow-trade)

```bash
# Set up a second wallet for copy-trade demo
node ~/x-cup-os/scripts/setup-second-user.mjs

# Replay a finished fixture (triggers all relevant agent fires + settle + claim)
curl -X POST http://localhost:4000/admin/replay-fixture/871850 | jq   # France 4-1 Australia
```

### Force a clean rebuild if Next.js dev hot-reload breaks

```bash
cd ~/x-cup-os/apps/web && rm -rf .next && npm run dev
```

---

## Submission timeline

- **Today (May 27):** v2 work begins. v1 stays frozen for recording.
- **Tomorrow (May 28):** Record demo video against v1. Submit before 23:59 UTC.
- **Post-submission:** v2 work continues without time pressure.

**Strict rule for the next session:** If the user wants to add a feature today, ask whether it goes in v1 (only if it's a recording-blocker bug) or v2 (default for everything else).

---

## Known intentional v2 gaps (DON'T try to "fix" these in v1)

- **Chainlink Functions oracle** — spec explicitly scoped this out. Admin-signed settle is the current design.
- **OKX Agentic Wallet TEE for burner keys** — encrypted in DB is the v1 approach.
- **AMM / fixed-odds shares** — we're parimutuel by design per spec page 3.
- **P2P backer/layer order book** — different architecture, 1-2 week rewrite.
- **Live polling cron** — manual replay endpoint covers WC 2022 demo perfectly. Only worth doing once we have WC 2026 access.
- **`>10/min` rate limit on API-Football** — free tier limit; v2 with paid plan drops the 7s pacing in `playerProps.ts` and `subsetMarkets.ts`.

---

## Open questions for the user

When the next session starts, confirm with the user:

1. **Recording timing:** are they recording today or tomorrow? Affects whether v1 is "frozen" or still mutable.
2. **Treasury for v2 fees:** deployer wallet as treasury (simple, works), or set up a Safe multisig (more legit, more work)?
3. **API-Football paid plan:** did they upgrade overnight? If yes, switch `WC_SEASON=2026` in v2 and re-run sync.

---

## Last commit + repo state

```
v1 (~/x-cup-os/)         main @ 74b8584  feat(profile): lineups + player profile pages
v2 (~/x-cup-os-v2/)      main @ 74b8584  (identical to v1 — just forked)
```

Both pushed to their respective GitHub remotes. Working trees clean.

Servers (as of context-end): both running. PIDs may vary. Kill with `pkill -f "next dev"; pkill -f "tsx watch"` if restart needed.

---

**This file is the source of truth for resuming. Read it top-to-bottom in a fresh session before doing anything else.**
