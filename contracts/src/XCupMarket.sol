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
 *         Math: a winning user's gross payout is (totalPot * userWinningStake / winningPot).
 *         A protocol fee of `feeBps` (basis points, capped at MAX_FEE_BPS) is deducted from
 *         each winning claim and forwarded to `treasury`. Losers get 0.
 *
 *         Trust model: a single ORACLE_ROLE (held by the backend oracle wallet) calls
 *         settle() with the final outcome. createMarket is admin-only. setTreasury is
 *         admin-only. Everything else is permissionless.
 */
contract XCupMarket is ReentrancyGuard, AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    uint16 public constant MAX_FEE_BPS = 500; // 5%

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
        uint16 feeBps; // protocol fee in basis points (0..MAX_FEE_BPS); 0 = no fee
    }

    /// @notice ERC-20 staked in every market (USDC on X Layer). Immutable per deployment.
    IERC20 public immutable stakeToken;

    /// @notice Recipient of accrued protocol fees. Settable by admin (e.g. swap to Safe).
    address public treasury;

    uint256 public nextMarketId;
    mapping(uint256 => Market) private _markets;
    mapping(uint256 => mapping(uint8 => uint256)) private _outcomePots;
    mapping(uint256 => mapping(address => mapping(uint8 => uint256))) private _userStakes;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    event MarketCreated(
        uint256 indexed marketId, string matchId, uint8 outcomeCount, uint256 closeTime, uint16 feeBps
    );
    event Staked(uint256 indexed marketId, address indexed user, uint8 outcomeIdx, uint256 amount);
    event Settled(uint256 indexed marketId, uint8 winningOutcome);
    event Claimed(uint256 indexed marketId, address indexed user, uint256 payout);
    event FeeAccrued(uint256 indexed marketId, address indexed treasury, uint256 amount);
    event TreasurySet(address indexed previous, address indexed next);

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
    error FeeTooHigh();
    error ZeroAddress();

    constructor(IERC20 _stakeToken, address admin, address _treasury) {
        if (admin == address(0) || _treasury == address(0)) revert ZeroAddress();
        stakeToken = _stakeToken;
        treasury = _treasury;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, admin);
        emit TreasurySet(address(0), _treasury);
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    /// @notice Swap the treasury address. Used to migrate from the deployer wallet
    /// to a multisig (Gnosis Safe) once the multisig is set up.
    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasurySet(treasury, newTreasury);
        treasury = newTreasury;
    }

    /// @notice Create a new prediction market. Admin-only. `feeBps` is fixed per market
    /// at creation time — easier-to-predict (1x2) markets get higher fees, harder
    /// outright markets get lower fees. Pass 0 for no fee.
    function createMarket(string calldata matchId, uint8 outcomeCount, uint256 closeTime, uint16 feeBps)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        returns (uint256 marketId)
    {
        if (bytes(matchId).length == 0) revert EmptyMatchId();
        if (outcomeCount < 2 || outcomeCount > 8) revert InvalidOutcomeCount();
        if (closeTime <= block.timestamp) revert InvalidCloseTime();
        if (feeBps > MAX_FEE_BPS) revert FeeTooHigh();

        marketId = ++nextMarketId; // ids start at 1
        _markets[marketId] = Market({
            matchId: matchId,
            outcomeCount: outcomeCount,
            status: MarketStatus.Open,
            closeTime: closeTime,
            winningOutcome: 0,
            totalPot: 0,
            feeBps: feeBps
        });
        emit MarketCreated(marketId, matchId, outcomeCount, closeTime, feeBps);
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
    /// `feeBps` is deducted from the gross payout and forwarded to `treasury`.
    function claim(uint256 marketId) external nonReentrant returns (uint256 payout) {
        Market storage m = _markets[marketId];
        if (m.status != MarketStatus.Settled) revert NotSettled();
        if (hasClaimed[marketId][msg.sender]) revert AlreadyClaimed();

        uint256 userWinningStake = _userStakes[marketId][msg.sender][m.winningOutcome];
        if (userWinningStake == 0) revert NothingToClaim();

        uint256 winningPot = _outcomePots[marketId][m.winningOutcome];
        uint256 grossPayout = (m.totalPot * userWinningStake) / winningPot;

        uint256 fee = m.feeBps == 0 ? 0 : (grossPayout * m.feeBps) / 10_000;
        payout = grossPayout - fee;

        // Effects first.
        hasClaimed[marketId][msg.sender] = true;

        if (fee > 0) {
            stakeToken.safeTransfer(treasury, fee);
            emit FeeAccrued(marketId, treasury, fee);
        }
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
    /// Returns the NET amount (after `feeBps` is deducted), matching what `claim` actually pays.
    function quoteClaim(uint256 marketId, address user) external view returns (uint256) {
        Market storage m = _markets[marketId];
        if (m.status != MarketStatus.Settled) return 0;
        if (hasClaimed[marketId][user]) return 0;
        uint256 userWinningStake = _userStakes[marketId][user][m.winningOutcome];
        if (userWinningStake == 0) return 0;
        uint256 winningPot = _outcomePots[marketId][m.winningOutcome];
        uint256 grossPayout = (m.totalPot * userWinningStake) / winningPot;
        uint256 fee = m.feeBps == 0 ? 0 : (grossPayout * m.feeBps) / 10_000;
        return grossPayout - fee;
    }
}
