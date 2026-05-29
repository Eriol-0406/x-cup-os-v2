// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/types/BeforeSwapDelta.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IXCupMarket {
    function stake(uint256 marketId, uint8 outcomeIdx, uint256 amount) external;
    function getMarket(uint256 marketId) external view returns (
        string memory matchId,
        uint8 outcomeCount,
        uint8 status,
        uint256 closeTime,
        uint8 winningOutcome,
        uint256 totalPot,
        uint16 feeBps
    );
}

/**
 * @title XCupBetHook — Uniswap V4 Hook that channels swap value into X-Cup prediction markets.
 *
 * @notice On every swap routed through this hook, a fraction of the swap output is captured
 *         and automatically staked into a configured XCupMarket on behalf of the swapper.
 *         "Every trade is a market bet — your swap fee funds the World Cup pool."
 *
 *         This Hook complements the existing X-Cup OS parimutuel system by:
 *           (a) bringing AMM-style continuous liquidity (Uniswap V4 Pool) into a market that
 *               is otherwise discrete-event-driven (XCupMarket settles on match outcomes),
 *           (b) lowering the friction of betting — users who swap USDC↔OKB through this pool
 *               implicitly stake on a World Cup market without a separate transaction,
 *           (c) providing a Hook-mechanism integration point for an AI Agent: an off-chain
 *               agent can rebalance pool liquidity in response to changing market odds.
 *
 *         Permission bits: AFTER_SWAP_FLAG is enabled. All other hook callbacks return
 *         their selectors without state changes so the deployment address can be mined to
 *         satisfy only that bit in production.
 *
 *         IMPORTANT — deployment: V4 PoolManager inspects the hook contract's deployed
 *         address bits to determine which callbacks are enabled. For a production deployment
 *         a `HookMiner` (or CREATE2 salt search) must be used to mine an address whose
 *         lowest bits match `Hooks.AFTER_SWAP_FLAG`. The deploy script provided uses a basic
 *         loop salt-miner suitable for X Layer testnet.
 */
contract XCupBetHook is IHooks {
    // -------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------

    IPoolManager public immutable poolManager;
    IXCupMarket public immutable xcup;
    IERC20 public immutable stakeToken; // MockUSDC on X Layer testnet
    address public immutable admin;

    // -------------------------------------------------------------------
    // Configurable bet routing
    // -------------------------------------------------------------------

    /// @notice The market id and outcome that swaps through this hook will stake on.
    uint256 public defaultMarketId;
    uint8 public defaultOutcomeIdx;

    /// @notice Fraction of swap output captured as a bet, in basis points (10000 = 100%).
    /// Cap at 5% (500 bps) to match XCupMarket's MAX_FEE_BPS philosophy.
    uint16 public betShareBps = 100; // 1.00% default

    /// @notice Minimum swap value (in stakeToken units) that triggers a bet route.
    uint256 public minSwapForBet = 10 * 1e6; // 10 USDC

    // -------------------------------------------------------------------
    // State accounting (mainly for verification + the AI agent loop)
    // -------------------------------------------------------------------

    /// @notice Total amount routed into bets across all swaps through this hook.
    uint256 public totalBetVolume;
    /// @notice Total number of swap-triggered bets fired.
    uint256 public betCount;
    /// @notice Per-swapper attribution — how much each address has bet via this hook.
    mapping(address => uint256) public betsBySwapper;

    // -------------------------------------------------------------------
    // Errors + events
    // -------------------------------------------------------------------

    error NotPoolManager();
    error InvalidShareBps();
    error Unauthorized();

    event BetRouted(
        address indexed swapper,
        uint256 indexed marketId,
        uint8 outcomeIdx,
        uint256 amountStaked,
        BalanceDelta swapDelta
    );
    event Configured(uint256 marketId, uint8 outcomeIdx, uint16 betShareBps, uint256 minSwapForBet);

    constructor(
        IPoolManager _poolManager,
        IXCupMarket _xcup,
        IERC20 _stakeToken,
        uint256 _defaultMarketId,
        uint8 _defaultOutcomeIdx,
        address _admin
    ) {
        poolManager = _poolManager;
        xcup = _xcup;
        stakeToken = _stakeToken;
        defaultMarketId = _defaultMarketId;
        defaultOutcomeIdx = _defaultOutcomeIdx;
        admin = _admin;
        // Pre-approve XCupMarket to pull stakes from this hook on stake() calls.
        // Hook accumulates stakeToken via afterSwap delta and forwards to XCupMarket.
        _stakeToken.approve(address(_xcup), type(uint256).max);
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }
    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    // -------------------------------------------------------------------
    // Admin — swap the active market / share / min the hook routes on
    // -------------------------------------------------------------------

    function configure(uint256 _marketId, uint8 _outcomeIdx, uint16 _betShareBps, uint256 _minSwapForBet)
        external
        onlyAdmin
    {
        if (_betShareBps > 500) revert InvalidShareBps();
        defaultMarketId = _marketId;
        defaultOutcomeIdx = _outcomeIdx;
        betShareBps = _betShareBps;
        minSwapForBet = _minSwapForBet;
        emit Configured(_marketId, _outcomeIdx, _betShareBps, _minSwapForBet);
    }

    /// @notice Returns the static permission set this hook expects to have encoded in its
    /// address bits. Used by the deploy script's HookMiner to pick a valid CREATE2 salt.
    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: false,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // -------------------------------------------------------------------
    // The actual Hook callback — fires after every swap through this pool
    // -------------------------------------------------------------------

    /// @inheritdoc IHooks
    function afterSwap(
        address sender,
        PoolKey calldata,
        IPoolManager.SwapParams calldata,
        BalanceDelta delta,
        bytes calldata
    ) external override onlyPoolManager returns (bytes4, int128) {
        // Determine the amount of stakeToken (USDC) that flowed OUT of the pool to the swapper.
        // BalanceDelta packs amount0 + amount1 — positive means user received that side.
        int128 amount0 = delta.amount0();
        int128 amount1 = delta.amount1();
        uint256 receivedUsdc = 0;
        if (amount0 > 0) receivedUsdc = uint256(uint128(amount0));
        else if (amount1 > 0) receivedUsdc = uint256(uint128(amount1));

        if (receivedUsdc < minSwapForBet) {
            return (this.afterSwap.selector, 0);
        }

        // Compute bet share, cap at hook's own USDC balance (in case of accounting drift).
        uint256 betAmount = (receivedUsdc * betShareBps) / 10_000;
        uint256 hookBal = stakeToken.balanceOf(address(this));
        if (hookBal == 0) {
            return (this.afterSwap.selector, 0);
        }
        if (betAmount > hookBal) betAmount = hookBal;

        // Stake into XCupMarket on the configured market/outcome. The XCupMarket pulls
        // betAmount of stakeToken via the pre-approval set in the constructor.
        xcup.stake(defaultMarketId, defaultOutcomeIdx, betAmount);

        totalBetVolume += betAmount;
        betCount += 1;
        betsBySwapper[sender] += betAmount;

        emit BetRouted(sender, defaultMarketId, defaultOutcomeIdx, betAmount, delta);
        return (this.afterSwap.selector, 0);
    }

    // -------------------------------------------------------------------
    // No-op implementations of the rest of IHooks. They return their selector
    // and do nothing — they're not enabled in the permission bits, but the
    // interface requires them.
    // -------------------------------------------------------------------

    function beforeInitialize(address, PoolKey calldata, uint160) external pure override returns (bytes4) {
        return this.beforeInitialize.selector;
    }
    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure override returns (bytes4) {
        return this.afterInitialize.selector;
    }
    function beforeAddLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return this.beforeAddLiquidity.selector;
    }
    function afterAddLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure override returns (bytes4, BalanceDelta) {
        return (this.afterAddLiquidity.selector, BalanceDelta.wrap(0));
    }
    function beforeRemoveLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return this.beforeRemoveLiquidity.selector;
    }
    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure override returns (bytes4, BalanceDelta) {
        return (this.afterRemoveLiquidity.selector, BalanceDelta.wrap(0));
    }
    function beforeSwap(address, PoolKey calldata, IPoolManager.SwapParams calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        return (this.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }
    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return this.beforeDonate.selector;
    }
    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return this.afterDonate.selector;
    }
}
