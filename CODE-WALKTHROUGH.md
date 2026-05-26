# X-Cup OS — Code Walkthrough for Demo Narration

> Two flows explained end-to-end with file:function references so you can read
> them aloud during the video and a judge can verify every claim in the repo.

**Use as a script.** Each section is paced for ~60-90 seconds of narration.

---

## Mental model first

The spec (page 8) is explicit and worth repeating verbatim:

> *"The agent isn't intelligent in the AI-overlord sense. It's:*
> *— An LLM that converts English to JSON (one-shot, at creation time)*
> *— A boring cron loop that checks 'does this JSON match the latest match data?'*
> *— A signer that fires a transaction when there's a match (event-driven)*
> *
> *That's it. The 'AI' is the parser. The 'agent' is the loop + signer."*

Everything in this doc serves that mental model.

State lives in three places:

| Layer | What's there | Why |
|---|---|---|
| **On-chain** (X Layer testnet, `XCupMarket.sol`) | Markets, pots, user stakes, settlement winners, USDC escrow | Trustless, public, the source of truth |
| **Backend DB** (SQLite via Prisma) | Users, encrypted burner privkeys, Strategy rows, parsed JSON, StrategyFire history, Fixture cache, FixtureMarket↔ marketId mapping | Cheap, fast, doesn't need to be public |
| **In-memory** (Node process, React state) | API-Football cache, team list, transient UI state | Disposable |

---

## SECTION 1 — Full Agent Loop

> 5 beats. Read aloud, ~75 seconds total.

### Beat 1: User connects wallet (~5s)

User clicks **Connect Wallet** in the header. OKX Wallet pops up, user approves, the frontend's `WalletProvider` (`apps/web/components/WalletProvider.tsx`) stores the address in React context. Backend isn't touched yet.

If user is on the wrong chain, `ensureXLayerTestnet()` in `apps/web/lib/wallet.ts` prompts a chain switch to chainId 1952.

### Beat 2: User funds their agent (~10s)

User clicks **Fund Agent**. Three things happen:

1. Frontend calls `GET /users/by-address/0xFaC8…9d8E`. Backend route at `apps/api/src/routes/users.ts` calls `ensureUserWithAgent()` in `apps/api/src/lib/burner.ts` which:
   - Creates a `User` row if missing
   - Generates a fresh burner via `ethers.Wallet.createRandom()`
   - Encrypts the privkey with AES-256-GCM (key from `BURNER_ENCRYPTION_KEY` in env)
   - Returns the burner's public address (e.g. `0xA5b4…Eefe`)
2. Frontend signs `USDC.transfer(burner, 200_000_000)` with the user's wallet — **the main wallet never directly funds the contract; it funds the burner.**
3. After the tx confirms, the burner's balance is visible in `AgentPanel.tsx`. The main wallet keeps `200_000_000` minus the transfer.

**Why a burner?** So the agent can sign stake() transactions for the user without ever needing user interaction. The user controls the burner's USDC balance — agent's reach is bounded by what was funded.

### Beat 3: User writes English strategy (~15s)

User types in the strategy editor (`apps/web/components/StrategyEditor.tsx`). On each keystroke, a 600ms debounce fires `POST /strategies/parse` to the backend.

Backend route in `apps/api/src/routes/strategies.ts` calls `parseStrategy()` in `apps/api/src/parser.ts`:

```ts
const response = await groq.chat.completions.create({
  model: "llama-3.3-70b-versatile",
  messages: [{ role: "system", content: SYSTEM_PROMPT_WITH_TEAMS }, ...],
  tools: [STRATEGY_TOOL],
  tool_choice: { type: "function", function: { name: "emit_strategy" } },
});
```

The `tool_choice` is **forced** — Groq must call the tool, can't return free text. The tool's parameters are a JSON Schema. The LLM's choice of arguments IS the parsed strategy. Zero malformed JSON possible.

System prompt is dynamically built each call from `apps/api/src/lib/teams.ts` — the 32 canonical WC team names are injected so the LLM normalizes aliases ("Les Bleus" → "France", "La Albiceleste" → "Argentina").

Response: a `ParsedStrategy` like:

```json
{
  "trigger": { "combinator": "AND", "conditions": [
    { "kind": "match_winner", "team": "Argentina" }
  ]},
  "action": { "marketRef": "argentina_wins_final", "outcome": "YES", "stakeUsdc": 30 },
  "riskLimits": { "maxLossUsdc": 200 }
}
```

The frontend renders this as readable cards in `ParsePreview.tsx`. **This is the only LLM call in the entire system.**

### Beat 4: User clicks Deploy (~15s)

Frontend: `deployStrategy(walletAddress, text, parsed)` in `apps/web/lib/api.ts`.

Backend POST `/strategies`:
1. Persists a new `Strategy` row with `englishText`, `parsedJson`, default status `draft`
2. Runs `resolveStrategyTargets(parsed)` in `apps/api/src/lib/strategyResolver.ts`:
   - Phase 1: For each `match_winner` / `score_threshold` condition, find every fixture where home or away team name matches. Collect `FixtureMarket.marketId`.
   - Phase 2: For each `player_scores` condition, find every PlayerPropMarket where the player is one of the outcomes. Collect those marketIds.
   - Phase 3 (the Task #30 addition): For each team mention, also include the team's `tournament_winner` + `to_reach_final` marketIds from the TournamentMarket table.
   - Returns deduped array — for "If Argentina wins" that's 9 markets (7 Argentina fixtures + tournament-winner + to-reach-final).
3. Saves `targetMarketIds` as JSON on the Strategy row.

Then `POST /strategies/:id/activate` flips status to `active`. The strategy is now live.

### Beat 5: A match plays out → agent fires autonomously (~25s)

User clicks **Replay this match →** on a finished fixture (in production this would be a cron polling `/fixtures?live=all` every minute).

Backend `POST /admin/replay-fixture/:id` calls `replayFixture(id)` in `apps/api/src/lib/replay.ts`:

```
Phase A: Build MatchEvent
   – Fetch fixture from DB + fresh events from API-Football (1 request/replay)
   – Compute winningOutcomeIdx via fixtureToOutcomeIdx() (penalty-aware)
   – ev = { marketId, winningOutcomeIdx, homeTeam, awayTeam, homeScore, awayScore, penaltyHome, penaltyAway, scorers[] }

Phase B: processMatchEvent(ev) — fires on the FIXTURE'S 1x2 market
   – For each active Strategy:
     1. Skip if targetMarketIds doesn't include ev.marketId
     2. triggerMatches(parsed, ev) — evaluator.ts runs match_winner / player_scores / score_threshold checks
     3. If trigger fires: fireStrategy(s.id, ev)

Phase B': processPlayerPropEvent — fires on FIRST-SCORER market
   – Build PlayerPropEvent with firstScorer = scorers[0]
   – For each active Strategy:
     1. Skip if targetMarketIds doesn't include the player-prop marketId
     2. Match strategy's player_scores.player against actual first scorer (with accent normalization — "Vinicius" matches "Vinícius Júnior")
     3. Find which outcome idx in the market is that player
     4. fireStrategy with outcomeIdxOverride = that player's idx

Phase B'' (Task #30 addition): TOURNAMENT-FIRING
   – Determine winningTeamName (penalty-aware)
   – If fixture.round = "Final" → find the winner's tournament-winner market → fire
   – If fixture.round = "Semi-finals" → find the winner's to-reach-final market → fire
   – Tournament event reuses processMatchEvent() — same trigger matching, just redirected marketId

Phase C+D: settleAndClaim(marketId, winningOutcomeIdx) — oracle settles, auto-claims
Phase E+F: settle player-prop market + claim
```

The actual fire (`fireStrategy` in `apps/api/src/lib/firing.ts`):

1. **Preflight** — re-check at fire time per spec page 7:
   - `maxFires` limit
   - `maxLossUsdc` stop-loss
   - `expiresAt` deadline
   - Market still status=Open + closeTime in future (on-chain read)
   - Burner has enough USDC (on-chain read)
2. **Build signer** — `getAgentSigner(mainWallet, rpc)` in `apps/api/src/lib/burner.ts`:
   - Look up User row → `agentWalletEncryptedKey` (base64 AES-256-GCM ciphertext)
   - Decrypt with `BURNER_ENCRYPTION_KEY` from env
   - `new ethers.Wallet(privkey, provider)` — the burner is the signer
3. **Approve** — if `usdc.allowance(burner, XCupMarket) < stakeAmount`, call `usdc.approve(XCupMarket, MaxUint256)` once. Cached for all future fires.
4. **Static-call sim** — `market.stake.staticCall(...)` to surface revert reasons cleanly before broadcasting (we hit RPC race conditions earlier without this).
5. **Stake** — `market.stake(marketId, outcomeIdx, stakeAmount)` — USDC moves from burner to XCupMarket contract, pot updated.
6. Update `StrategyFire` row with `status=confirmed`, `txHash`.

After all fires, Phase C+D settles + auto-claims (`apps/api/src/lib/oracle.ts`):
- `market.settle(marketId, winningOutcomeIdx)` — oracle (admin key) marks the market resolved
- For each user who staked on the winning outcome: their burner calls `market.claim(marketId)` which computes:

```solidity
payout = market.totalPot × userStakes[market][user][winningOutcome] / outcomePots[market][winningOutcome]
```

That's the parimutuel formula — winner takes proportional share of the pool. Losers get nothing (their stake stayed in the pot, funded the winners' profit).

USDC arrives in the user's burner. User sees it on the Agent Panel. End of loop.

---

## SECTION 2 — Copy-Strategy + Follow-Trade

> 4 beats. Read aloud, ~60 seconds total.

### Setup: Two users in the system

- **User A** — the strategy author. Wallet connected, burner provisioned, strategies deployed.
- **User B** — a fresh persona for the demo. Generated by `scripts/setup-second-user.mjs`:
  - Creates a brand-new EVM wallet
  - Provisions B's burner via the API
  - Funds B's main wallet with 0.005 OKB (for signing)
  - Funds B's burner with 100 USDC + 0.005 OKB

User imports B's privkey into OKX Wallet → switches account → the page re-renders with B's address.

### Beat 1: User B browses /leaderboard (~10s)

Frontend `apps/web/components/Leaderboard.tsx` calls `listLeaderboard()`.

Backend `GET /strategies/leaderboard?limit=15` in `apps/api/src/routes/strategies.ts`:

```sql
SELECT Strategy.*, User.mainWallet
FROM Strategy JOIN User ON Strategy.userId = User.id
ORDER BY fireCount DESC, currentPnlUsdc DESC
LIMIT 15
```

The frontend renders ranks 1-N with 🥇🥈🥉 medals. **Crucial UI bit:** the "Copy →" button only shows on rows NOT owned by the current wallet. Your own strategies show "your own" instead. This is the social signal — you copy other people's work, not your own.

### Beat 2: User B clicks "Copy →" (~15s)

Frontend `copyStrategy(sourceStrategyId, walletAddress=B)` in `apps/web/lib/api.ts`.

Backend `POST /strategies/:sourceId/copy {walletAddress: B}` in `apps/api/src/routes/strategies.ts`:

1. Load source `Strategy` row (parsedJson + englishText)
2. `ensureUserWithAgent(B)` — creates User B + burner if missing
3. Insert NEW `Strategy` row for User B with:
   - Same `englishText`
   - Same `parsedJson`
   - `status = "draft"`
   - User B's own `userId`
   - Empty `fireCount`, `currentPnlUsdc=0`
4. Re-run `resolveStrategyTargets(parsed)` → save B's own `targetMarketIds`
   - Same markets as User A (because resolver is deterministic and DB state is identical) but the TARGET LIST is stored against B's strategy row.

Then `POST /strategies/:newId/activate` flips status to `active`. **B's strategy is now live, independent of A's.**

**Important:** The cloned strategy is a separate row. If User A pauses or deletes their original, B's copy keeps firing. There's no reference, no linked execution. Pure clone semantics.

### Beat 3: A match replays — both A's and B's strategies fire independently (~25s)

User clicks **Replay this match →** on a fixture both strategies target (e.g. Argentina vs Mexico).

Inside `processMatchEvent(ev)` in `apps/api/src/lib/firing.ts`:

```js
const actives = await prisma.strategy.findMany({ where: { status: "active" }, include: { user: true } });
for (const s of actives) {
  // Targeting filter
  if (!targets.includes(ev.marketId)) continue;
  // Trigger check
  if (!triggerMatches(parsed, ev)) continue;
  // Fire
  await fireStrategy(s.id, ev);
}
```

When it hits User A's strategy:
- `fireStrategy(A.strategyId, ev)`
- Inside, `getAgentSigner(A.user.mainWallet, rpc)` returns **A's burner signer**
- `market.stake(marketId, outcomeIdx, 30 USDC)` is signed by A's burner
- StrategyFire row with `strategyId = A.strategyId`

Then the loop hits User B's strategy:
- `fireStrategy(B.strategyId, ev)`
- `getAgentSigner(B.user.mainWallet, rpc)` returns **B's burner signer** — different burner, different decrypted privkey
- `market.stake(marketId, outcomeIdx, 30 USDC)` is signed by B's burner
- StrategyFire row with `strategyId = B.strategyId`

**Two independent stake() transactions** on chain. **Two separate USDC transfers** from two separate burners. **Two separate StrategyFire rows** in the DB. Same market, same outcome, different signers.

### Beat 4: Settle + both burners claim (~10s)

`settleAndClaim(marketId, winningOutcomeIdx)` in `apps/api/src/lib/oracle.ts`:

1. Oracle (deployer key) calls `market.settle(marketId, winningOutcome)` — ONE settlement covers ALL stakers, both A and B included.
2. For each user with a winning stake, the auto-claim loop:
   - A's burner calls `market.claim(marketId)` → USDC payout proportional to A's stake on the winning outcome arrives in A's burner
   - B's burner calls `market.claim(marketId)` → same calculation, payout to B's burner

Each burner's payout depends ONLY on their own stake / the winning pool. If A and B both staked 30 USDC YES and they were the only YES stakers (60 USDC YES pot), and the total pot was 100 USDC, each gets `100 × 30 / 60 = 50` — they each profit 20 USDC.

**The key insight for the narration:** *"Anyone who deposits USDC can clone a winning strategy with one click. The clones are independent — A's bot doesn't fund B's bot. Each user's burner stakes their own USDC, claims their own winnings. No shared state. This is how betting strategies spread on-chain — not via screenshots, but via cryptographic copies that fire autonomously."*

---

## Proof links (paste in your video description)

Real on-chain transactions from real testnet replays.

| Event | TX | Open in explorer |
|---|---|---|
| Strategy fires on first-scorer market (Vinícius Brazil-Korea) | `0x04f245cb…` | https://www.oklink.com/x-layer-testnet/tx/0x04f245cbe1f1afa7d7c7cb7b83c4d611dbef93f687a0369bf29cdd89b9e737a6 |
| Strategy fires on to-reach-final market (France semi-final) | `0x7963f601…` | https://www.oklink.com/x-layer-testnet/tx/0x7963f6016d3dfc1c2c7835243b7ead83099ccd025ca2b783158e1da76e23e73b |
| Strategy fires on tournament-winner market (Argentina final) | `0xc5d222bd…` | https://www.oklink.com/x-layer-testnet/tx/0xc5d222bd31347527f9a655338f0e82baed03e94a6e9dc7e4ee89fc878424f2b3 |
| Original fire on match-winner market (Argentina-Mexico) | `0x7ea6429a…` | https://www.oklink.com/x-layer-testnet/tx/0x7ea6429a7b1240d56fd8ddaf0ed7cf8f531184b59f4144559044ed38893d6f40 |
| Auto-claim payout | `0x3438a688…` | https://www.oklink.com/x-layer-testnet/tx/0x3438a688a1c71e0229146c47f8c51b385671123715f1dba329b3967c230b4a92 |

Repo for cross-reference: https://github.com/Eriol-0406/x-cup-os

---

## Cheat sheet — file → what it does

| File | Role |
|---|---|
| `apps/web/components/StrategyEditor.tsx` | Live parse preview UI |
| `apps/web/components/Leaderboard.tsx` | Top strategies + Copy button |
| `apps/web/components/AgentPanel.tsx` | Wallet ↔ burner UI, fund flow |
| `apps/web/components/WalletProvider.tsx` | OKX Wallet connect + chain detection |
| `apps/api/src/parser.ts` | Groq tool-use parser |
| `apps/api/src/lib/strategyResolver.ts` | parsed JSON → on-chain marketIds |
| `apps/api/src/lib/evaluator.ts` | Trigger condition evaluator |
| `apps/api/src/lib/firing.ts` | Signer + stake() submission + StrategyFire bookkeeping |
| `apps/api/src/lib/replay.ts` | The whole agent loop (Phase A through F) |
| `apps/api/src/lib/oracle.ts` | Settle + auto-claim |
| `apps/api/src/lib/burner.ts` | Burner creation + AES encryption |
| `contracts/src/XCupMarket.sol` | Parimutuel logic, parimutuel payout math, settle, claim |
| `scripts/setup-second-user.mjs` | Demo helper — generates + funds User B |
