// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title XCupMarket
 * @notice Parimutuel prediction market for X-Cup OS.
 *
 *         Lifecycle of a market:
 *           createMarket  →  stake  ...  stake  →  (closeTime hits)  →  settle  →  claim ... claim
 *
 *         Math: a winning user gets back (totalPot * userWinningStake / winningPot).
 *         Losers get 0. Sum of all winner payouts = totalPot (no protocol fee for v1).
 *
 *         Trust model: a single ORACLE_ROLE (held by the backend oracle wallet) calls
 *         settle() with the final outcome. createMarket is admin-only. Everything else
 *         is permissionless.
 */
contract XCupMarket is ReentrancyGuard, AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    enum MarketStatus {
        None,
        Open,
        Settled,
        Cancelled
    }

    struct Market {
        string matchId; // external reference, e.g. API-Football fixture id
        uint8 outcomeCount; // 2 = binary YES/NO; up to 8 (win/draw/loss/etc)
        MarketStatus status;
        uint256 closeTime; // unix timestamp; staking disabled at or after
        uint8 winningOutcome;
        uint256 totalPot; // sum of all stakes across outcomes
    }

    /// @notice ERC-20 staked in every market (USDC on X Layer). Immutable per deployment.
    IERC20 public immutable stakeToken;

    uint256 public nextMarketId;
    mapping(uint256 => Market) private _markets;
    mapping(uint256 => mapping(uint8 => uint256)) private _outcomePots;
    mapping(uint256 => mapping(address => mapping(uint8 => uint256))) private _userStakes;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    event MarketCreated(uint256 indexed marketId, string matchId, uint8 outcomeCount, uint256 closeTime);
    event Staked(uint256 indexed marketId, address indexed user, uint8 outcomeIdx, uint256 amount);
    event Settled(uint256 indexed marketId, uint8 winningOutcome);
    event Claimed(uint256 indexed marketId, address indexed user, uint256 payout);

    error MarketNotOpen();
    error MarketClosed();
    error InvalidOutcome();
    error InvalidOutcomeCount();
    error InvalidCloseTime();
    error AlreadySettled();
    error NotSettled();
    error AlreadyClaimed();
    error NothingToClaim();
    error ZeroAmount();
    error EmptyMatchId();

    constructor(IERC20 _stakeToken, address admin) {
        stakeToken = _stakeToken;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, admin);
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    /// @notice Create a new prediction market. Admin-only.
    function createMarket(string calldata matchId, uint8 outcomeCount, uint256 closeTime)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        returns (uint256 marketId)
    {
        if (bytes(matchId).length == 0) revert EmptyMatchId();
        if (outcomeCount < 2 || outcomeCount > 8) revert InvalidOutcomeCount();
        if (closeTime <= block.timestamp) revert InvalidCloseTime();

        marketId = ++nextMarketId; // ids start at 1
        _markets[marketId] = Market({
            matchId: matchId,
            outcomeCount: outcomeCount,
            status: MarketStatus.Open,
            closeTime: closeTime,
            winningOutcome: 0,
            totalPot: 0
        });
        emit MarketCreated(marketId, matchId, outcomeCount, closeTime);
    }

    /// @notice Post the final result. Oracle-only. Idempotent guard via status.
    function settle(uint256 marketId, uint8 winningOutcome) external onlyRole(ORACLE_ROLE) {
        Market storage m = _markets[marketId];
        if (m.status != MarketStatus.Open) revert AlreadySettled();
        if (winningOutcome >= m.outcomeCount) revert InvalidOutcome();

        m.status = MarketStatus.Settled;
        m.winningOutcome = winningOutcome;

        emit Settled(marketId, winningOutcome);
    }

    // -----------------------------------------------------------------------
    // User actions
    // -----------------------------------------------------------------------

    /// @notice Stake `amount` of stakeToken on `outcomeIdx` of `marketId`.
    function stake(uint256 marketId, uint8 outcomeIdx, uint256 amount) external nonReentrant {
        Market storage m = _markets[marketId];
        if (m.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp >= m.closeTime) revert MarketClosed();
        if (outcomeIdx >= m.outcomeCount) revert InvalidOutcome();
        if (amount == 0) revert ZeroAmount();

        // CEI: effects before interaction (SafeERC20 transferFrom is the interaction).
        _outcomePots[marketId][outcomeIdx] += amount;
        _userStakes[marketId][msg.sender][outcomeIdx] += amount;
        m.totalPot += amount;

        stakeToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Staked(marketId, msg.sender, outcomeIdx, amount);
    }

    /// @notice Pull proportional payout for a winning stake on a settled market.
    function claim(uint256 marketId) external nonReentrant returns (uint256 payout) {
        Market storage m = _markets[marketId];
        if (m.status != MarketStatus.Settled) revert NotSettled();
        if (hasClaimed[marketId][msg.sender]) revert AlreadyClaimed();

        uint256 userWinningStake = _userStakes[marketId][msg.sender][m.winningOutcome];
        if (userWinningStake == 0) revert NothingToClaim();

        uint256 winningPot = _outcomePots[marketId][m.winningOutcome];
        payout = (m.totalPot * userWinningStake) / winningPot;

        // Effects first.
        hasClaimed[marketId][msg.sender] = true;

        stakeToken.safeTransfer(msg.sender, payout);
        emit Claimed(marketId, msg.sender, payout);
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return _markets[marketId];
    }

    function getOutcomePot(uint256 marketId, uint8 outcomeIdx) external view returns (uint256) {
        return _outcomePots[marketId][outcomeIdx];
    }

    function getUserStake(uint256 marketId, address user, uint8 outcomeIdx) external view returns (uint256) {
        return _userStakes[marketId][user][outcomeIdx];
    }

    /// @notice Off-chain helper: how much would `user` receive if they claimed `marketId` now?
    function quoteClaim(uint256 marketId, address user) external view returns (uint256) {
        Market storage m = _markets[marketId];
        if (m.status != MarketStatus.Settled) return 0;
        if (hasClaimed[marketId][user]) return 0;
        uint256 userWinningStake = _userStakes[marketId][user][m.winningOutcome];
        if (userWinningStake == 0) return 0;
        uint256 winningPot = _outcomePots[marketId][m.winningOutcome];
        return (m.totalPot * userWinningStake) / winningPot;
    }
}
