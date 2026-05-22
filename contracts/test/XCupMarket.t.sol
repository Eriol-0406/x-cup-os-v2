// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {XCupMarket} from "../src/XCupMarket.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract XCupMarketTest is Test {
    XCupMarket internal market;
    MockUSDC internal usdc;

    address internal admin = address(0xAD);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCAB01);

    uint256 internal constant ONE_USDC = 1e6; // 6 decimals
    uint256 internal closeTime;

    function setUp() public {
        usdc = new MockUSDC();
        vm.prank(admin);
        market = new XCupMarket(IERC20(address(usdc)), admin);

        closeTime = block.timestamp + 1 days;

        // Fund users
        usdc.mint(alice, 1_000 * ONE_USDC);
        usdc.mint(bob, 1_000 * ONE_USDC);
        usdc.mint(carol, 1_000 * ONE_USDC);

        // Pre-approve
        vm.prank(alice);
        usdc.approve(address(market), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(market), type(uint256).max);
        vm.prank(carol);
        usdc.approve(address(market), type(uint256).max);
    }

    // -----------------------------------------------------------------------
    // Happy path
    // -----------------------------------------------------------------------

    function test_happyPath_singleWinner() public {
        // Create
        vm.prank(admin);
        uint256 id = market.createMarket("FIFA-FRA-ARG", 2, closeTime);
        assertEq(id, 1);

        // Alice stakes 100 on YES (0), Bob stakes 300 on NO (1)
        vm.prank(alice);
        market.stake(id, 0, 100 * ONE_USDC);
        vm.prank(bob);
        market.stake(id, 1, 300 * ONE_USDC);

        // Settle YES
        vm.prank(admin);
        market.settle(id, 0);

        // Alice claims — sole winner takes 400 USDC
        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        uint256 payout = market.claim(id);
        assertEq(payout, 400 * ONE_USDC);
        assertEq(usdc.balanceOf(alice) - aliceBefore, 400 * ONE_USDC);

        // Bob has nothing to claim
        vm.expectRevert(XCupMarket.NothingToClaim.selector);
        vm.prank(bob);
        market.claim(id);
    }

    function test_parimutuelMath_multipleWinners() public {
        vm.prank(admin);
        uint256 id = market.createMarket("FIFA-FRA-ARG", 2, closeTime);

        // YES side: Alice 100, Carol 300 (total winning pot 400)
        // NO side: Bob 600 (loses)
        // Total pot: 1000
        vm.prank(alice);
        market.stake(id, 0, 100 * ONE_USDC);
        vm.prank(carol);
        market.stake(id, 0, 300 * ONE_USDC);
        vm.prank(bob);
        market.stake(id, 1, 600 * ONE_USDC);

        vm.prank(admin);
        market.settle(id, 0);

        // Alice payout = 1000 * 100 / 400 = 250
        // Carol payout = 1000 * 300 / 400 = 750
        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        market.claim(id);
        assertEq(usdc.balanceOf(alice) - aliceBefore, 250 * ONE_USDC);

        uint256 carolBefore = usdc.balanceOf(carol);
        vm.prank(carol);
        market.claim(id);
        assertEq(usdc.balanceOf(carol) - carolBefore, 750 * ONE_USDC);

        // Sum of payouts equals total pot (no leftover dust in this case)
        assertEq(usdc.balanceOf(address(market)), 0);
    }

    // -----------------------------------------------------------------------
    // Access control
    // -----------------------------------------------------------------------

    function test_createMarket_revertsForNonAdmin() public {
        // Resolve role getter BEFORE vm.prank, otherwise the getter call consumes the prank.
        bytes32 role = market.DEFAULT_ADMIN_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role)
        );
        vm.prank(alice);
        market.createMarket("x", 2, closeTime);
    }

    function test_settle_revertsForNonOracle() public {
        vm.prank(admin);
        uint256 id = market.createMarket("x", 2, closeTime);
        bytes32 role = market.ORACLE_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role)
        );
        vm.prank(alice);
        market.settle(id, 0);
    }

    // -----------------------------------------------------------------------
    // State guards
    // -----------------------------------------------------------------------

    function test_settle_revertsTwice() public {
        vm.startPrank(admin);
        uint256 id = market.createMarket("x", 2, closeTime);
        market.settle(id, 0);
        vm.expectRevert(XCupMarket.AlreadySettled.selector);
        market.settle(id, 1);
        vm.stopPrank();
    }

    function test_stake_revertsAfterClose() public {
        vm.prank(admin);
        uint256 id = market.createMarket("x", 2, closeTime);
        vm.warp(closeTime + 1);
        vm.prank(alice);
        vm.expectRevert(XCupMarket.MarketClosed.selector);
        market.stake(id, 0, 10 * ONE_USDC);
    }

    function test_stake_revertsOnInvalidOutcome() public {
        vm.prank(admin);
        uint256 id = market.createMarket("x", 2, closeTime);
        vm.prank(alice);
        vm.expectRevert(XCupMarket.InvalidOutcome.selector);
        market.stake(id, 5, 10 * ONE_USDC);
    }

    function test_stake_revertsOnZeroAmount() public {
        vm.prank(admin);
        uint256 id = market.createMarket("x", 2, closeTime);
        vm.prank(alice);
        vm.expectRevert(XCupMarket.ZeroAmount.selector);
        market.stake(id, 0, 0);
    }

    function test_claim_revertsBeforeSettle() public {
        vm.prank(admin);
        uint256 id = market.createMarket("x", 2, closeTime);
        vm.prank(alice);
        market.stake(id, 0, 10 * ONE_USDC);
        vm.prank(alice);
        vm.expectRevert(XCupMarket.NotSettled.selector);
        market.claim(id);
    }

    function test_claim_revertsOnDoubleClaim() public {
        vm.prank(admin);
        uint256 id = market.createMarket("x", 2, closeTime);
        vm.prank(alice);
        market.stake(id, 0, 10 * ONE_USDC);
        vm.prank(admin);
        market.settle(id, 0);

        vm.prank(alice);
        market.claim(id);
        vm.prank(alice);
        vm.expectRevert(XCupMarket.AlreadyClaimed.selector);
        market.claim(id);
    }

    function test_createMarket_revertsOnBadInputs() public {
        vm.startPrank(admin);
        vm.expectRevert(XCupMarket.EmptyMatchId.selector);
        market.createMarket("", 2, closeTime);
        vm.expectRevert(XCupMarket.InvalidOutcomeCount.selector);
        market.createMarket("x", 1, closeTime);
        vm.expectRevert(XCupMarket.InvalidOutcomeCount.selector);
        market.createMarket("x", 9, closeTime);
        vm.expectRevert(XCupMarket.InvalidCloseTime.selector);
        market.createMarket("x", 2, block.timestamp);
        vm.stopPrank();
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    function test_quoteClaim_returnsCorrectPreview() public {
        vm.prank(admin);
        uint256 id = market.createMarket("x", 2, closeTime);
        vm.prank(alice);
        market.stake(id, 0, 100 * ONE_USDC);
        vm.prank(bob);
        market.stake(id, 1, 300 * ONE_USDC);

        // Before settle: 0
        assertEq(market.quoteClaim(id, alice), 0);

        vm.prank(admin);
        market.settle(id, 0);

        // After settle: alice gets full 400
        assertEq(market.quoteClaim(id, alice), 400 * ONE_USDC);

        // After claim: back to 0
        vm.prank(alice);
        market.claim(id);
        assertEq(market.quoteClaim(id, alice), 0);
    }
}
