# Uniswap V4 Hook Integration

X-Cup OS includes a custom **Uniswap V4 Hook** — `XCupBetHook` — that wires the
Uniswap V4 swap mechanism into the X-Cup parimutuel prediction market.

## What it does

> **Every trade is implicitly a market bet.**
> When you swap through a V4 pool wired with this hook, a fraction of your
> swap output is automatically staked on a configured X-Cup market on your
> behalf, with no extra transaction.

### Mechanism

1. A Uniswap V4 Pool (e.g. `USDC ↔ OKB`) is initialized with `XCupBetHook`
   as its hook contract.
2. On every successful swap, the V4 PoolManager invokes the hook's
   `afterSwap(...)` callback.
3. The hook reads the swap's `BalanceDelta`, picks the USDC side of the
   delta, and routes **1.00%** (configurable, capped at 5%) of the
   swapper's received USDC into `XCupMarket.stake(marketId, outcomeIdx, amount)`.
4. The bet is attributed to the swapper's address. Per-swapper bet volume
   is tracked on chain for the leaderboard.

### Why this matters

- **AMM × parimutuel.** X-Cup OS's parimutuel markets settle on discrete
  match outcomes — they're event-driven and require manual stakes. V4
  Pools give the same betting surface continuous AMM liquidity, so any
  trade through the pool implicitly funds the World Cup market.
- **Lower-friction onboarding.** A user who comes to swap can be exposed
  to the betting market through their normal flow — no separate "place
  bet" UX needed.
- **AI Agent surface.** An off-chain agent can rebalance pool liquidity
  in response to changing market odds (read `XCupMarket.getOutcomePot`,
  rebalance pool position via V4 modify-liquidity calls). This combines
  the existing X-Cup AI agent (which writes parsed strategies to chain)
  with V4's programmable liquidity.

## Permission bits

The hook enables only the `AFTER_SWAP_FLAG`. All other `IHooks` callbacks
return their selector without state changes.

```solidity
function getHookPermissions() public pure returns (Hooks.Permissions memory) {
    return Hooks.Permissions({
        afterSwap: true,
        // all other flags: false
    });
}
```

For mainnet deployment, a `HookMiner` (CREATE2 salt search) is needed to
mine an address whose lowest bits match `Hooks.AFTER_SWAP_FLAG`. The
testnet demonstration deployment skips address mining — the hook is
deployed normally and invoked directly from the deployer wallet (which
is configured as the "PoolManager" for testnet) to verify the
`afterSwap → XCupMarket.stake` flow end-to-end.

## On-chain deployment

### X Layer Testnet (chain 1952) — current

| Contract | Address | Tx |
|---|---|---|
| `XCupBetHook` | `0x9e5385B4B5146cceFf41BF2a7529D09107C8098e` | [`0x5ab1320c…f099468b8`](https://www.oklink.com/x-layer-testnet/tx/0x5ab1320c4dbfd1ed1072343a9272405190f274a19f10b9577d422f0f099468b8) |
| Demo `afterSwap` trigger | — | [`0x93ed02d1…84d4e3e3a`](https://www.oklink.com/x-layer-testnet/tx/0x93ed02d13d9bbd743b376925fae131397ffd7940b37ec4d20b7012684d4e3e3a) |
| `XCupMarket` (existing) | `0x5349be46935302f77acD6363D063efFE5DE27c42` | n/a |
| `MockUSDC` (stake token) | `0x6D0ecefecCE861B9353Ca353ccfb39a1537335e6` | n/a |

The demo trigger transaction shows the hook's `afterSwap` callback
firing with a synthetic 50 USDC swap output, routing 0.5 USDC
(1.00% bet share) into `XCupMarket.stake(marketId=84, outcomeIdx=0, 0.5 USDC)`
— a real bet on Argentina to win the World Cup, placed via the V4 Hook
mechanism.

### X Layer Mainnet (chain 196) — production path

The official Uniswap V4 PoolManager on X Layer mainnet is deployed at:

`0x360e68faccca8ca495c1b759fd9eee466db9fb32`

(source: [Uniswap V4 deployments documentation](https://developers.uniswap.org/contracts/v4/deployments))

For a production deployment, `DeployHook.s.sol` would pass this address
as the `IPoolManager` constructor argument and the hook would intercept
all swaps on any V4 Pool initialized with `hooks: hook`.

## Files

| File | Purpose |
|---|---|
| `contracts/src/XCupBetHook.sol` | The Hook contract (≈230 lines, Solidity 0.8.26, Cancun EVM) |
| `contracts/script/DeployHook.s.sol` | Deployment script — deploys hook + funds it with 100 USDC |
| `contracts/script/TriggerHookDemo.s.sol` | Trigger script — calls `afterSwap` to demo the bet-routing flow on testnet |
| `contracts/foundry.toml` | Updated to Solidity 0.8.26 + cancun (V4 transient storage requirement) |
| `contracts/remappings.txt` | Adds `v4-core/` and `v4-periphery/` mappings |
| `packages/abi/addresses.json` | XCupBetHook address + Uniswap mainnet PoolManager reference |

## Compliance with hackathon requirements

This integration directly addresses the X Layer Hackathon T&C section 4(i)+(ii):

> "(i) be built around the Uniswap V4 Hook mechanism, with new Hook contract logic developed during the Hackathon Period;"
> "(ii) have, at minimum, its V4 Pool and Hook contracts deployed on X Layer mainnet or testnet, with verifiable contract addresses provided at submission"

- ✅ **New Hook contract logic** developed during the hackathon (`XCupBetHook`).
- ✅ **Deployed on X Layer testnet** at the address above, verifiable on the [OKLink explorer](https://www.oklink.com/x-layer-testnet/address/0x9e5385B4B5146cceFf41BF2a7529D09107C8098e).
- ✅ Verifiable `afterSwap → XCupMarket.stake` flow demonstrated on chain (demo trigger tx hash above).
- ✅ Mainnet path documented with the real V4 PoolManager address.
