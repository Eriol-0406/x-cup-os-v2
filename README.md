# X-Cup OS

> A dApp on X Layer where football fans deploy AI agents that read plain-English betting strategies and autonomously place bets on World Cup prediction markets.

## What this is

A user opens the dApp, connects their wallet, deposits some USDC, and writes a sentence like:

> *"If France wins their next match and Mbappe scores, stake 50 USDC on YES for 'France reaches the final'. Stop if I lose more than 200 USDC."*

The system parses that English into structured rules (Groq + Llama 3.3 via forced tool-use), watches live match data, and when the condition becomes true the agent places the bet on-chain by itself.

## Monorepo layout

```
x-cup-os/
├── apps/
│   ├── web/          Next.js dApp — wallet connect, strategy editor, dashboards
│   └── api/          Express + Prisma — Groq parser, watch loop, oracle, signer
├── contracts/
│   ├── src/          XCupMarket.sol — parimutuel prediction market
│   ├── test/         Foundry tests
│   └── script/       Deploy + seed scripts
└── packages/
    ├── types/        Shared parsed-strategy Zod schema (the cross-layer contract)
    └── abi/          Auto-exported from `forge build`
```

## The four layers

| Layer | Stack | Purpose |
|---|---|---|
| 1. Frontend | Next.js + ethers v6 + OKX Wallet | UI, wallet, strategy editor with live parse preview |
| 2. Backend | Express + Prisma + Groq + API-Football | Parser, 60s watch loop, session-wallet signer, oracle |
| 3. Contract | Solidity + Foundry on X Layer | Parimutuel markets — stake, settle, claim |
| 4. Oracle | Admin script in the backend | Posts final match results to the contract |

## The agent loop

1. **Create** — user writes English → Groq tool-use returns forced JSON → server-side Zod validation → stored in DB
2. **Watch** — every 60s: poll API-Football → match results → find triggered strategies → re-check bankroll/limits/market-open → sign with burner → submit to X Layer
3. **Settle** — admin oracle calls `settle(marketId, winningOutcome)` once per match
4. **Claim** — default auto-claim via burner wallet; user just sees USDC arrive

## Local development

```bash
# Install workspace deps
npm install

# Run the API (port 4000)
npm run dev:api

# Run the web app (port 3000)
npm run dev:web

# Contracts
npm run contract:build
npm run contract:test
npm run contract:deploy
```

## Prerequisites

- Node 20+
- Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- Postgres (optional Day 1 — defaults to SQLite locally)
- API keys: Groq, API-Football
- X Layer testnet OKB for the deployer wallet

See `.env.example` for the full list.

## Hard constraints

- **Day 7 (May 28) is the end-to-end checkpoint.** If broken: cut leaderboard → copy-trade → notifications, in that order.
- **NOT building**: AMM, Chainlink Functions, StrategyVault contract, AgentRegistry, multi-chain, mobile app.

## License

Private / hackathon submission.
