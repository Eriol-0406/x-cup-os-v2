# XCupMarket contracts

Single contract: `XCupMarket.sol` — parimutuel prediction market on X Layer.

## Setup

```bash
# Install Foundry (one-time)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install OpenZeppelin
forge install OpenZeppelin/openzeppelin-contracts --no-commit
```

## Commands

```bash
forge build
forge test -vv
forge script script/Deploy.s.sol --rpc-url $XLAYER_TESTNET_RPC --broadcast
```

## Functions (planned)

- `createMarket(string matchId, string[] outcomes, uint256 closeTime)` — admin only
- `stake(uint256 marketId, uint8 outcomeIdx, uint256 amount)` — anyone, while open
- `settle(uint256 marketId, uint8 winningOutcome)` — admin only, once
- `claim(uint256 marketId)` — anyone with winnings, after settle

State: markets (struct), pots per outcome, user stakes (mapping), settlement winners.

Security: OpenZeppelin `ReentrancyGuard` + `AccessControl`. ~150 lines target.
