// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {XCupMarket} from "../src/XCupMarket.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract XCupMarketTest is Test {
    XCupMarket internal market;
    MockUSDC internal usdc;

    address internal admin = address(0xAD);
    address internal treasury = address(0xBEEF);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCAB01);

    uint256 internal constant ONE_USDC = 1e6; // 6 decimals
    uint256 internal closeTime;

    function setUp() public {
        usdc = new MockUSDC();
        vm.prank(admin);
        market = new XCupMarket(IERC20(address(usdc)), admin, treasury);

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
    // Happy path (fee = 0, back-compat behavior)
    // -----------------------------------------------------------------------

    function test_happyPath_singleWinner_zeroFee() public {
        vm.prank(admin);
        uint256 id = market.createMarket("FIFA-FRA-ARG", 2, closeTime, 0);
        assertEq(id, 1);

        vm.prank(alice);
        market.stake(id, 0, 100 * ONE_USDC);
        vm.prank(bob);
        market.stake(id, 1, 300 * ONE_USDC);

        vm.prank(admin);
        market.settle(id, 0);

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(alice);
        uint256 payout = market.claim(id);

        assertEq(payout, 400 * ONE_USDC);
        assertEq(usdc.balanceOf(alice) - aliceBefore, 400 * ONE_USDC);
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, 0, "no fee at feeBps=0");

        vm.expectRevert(XCupMarket.NothingToClaim.selector);
        vm.prank(bob);
        market.claim(id);
    }

    function test_parimutuelMath_multipleWinners_zeroFee() public {
        vm.prank(admin);
        uint256 id = market.createMarket("FIFA-FRA-ARG", 2, closeTime, 0);

        vm.prank(alice);
        market.stake(id, 0, 100 * ONE_USDC);
        vm.prank(carol);
        market.stake(id, 0, 300 * ONE_USDC);
        vm.prank(bob);
        market.stake(id, 1, 600 * ONE_USDC);

        vm.prank(admin);
        market.settle(id, 0);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        market.claim(id);
        assertEq(usdc.balanceOf(alice) - aliceBefore, 250 * ONE_USDC);

        uint256 carolBefore = usdc.balanceOf(carol);
        vm.prank(carol);
        market.claim(id);
        assertEq(usdc.balanceOf(carol) - carolBefore, 750 * ONE_USDC);

        assertEq(usdc.balanceOf(address(market)), 0);
        assertEq(usdc.balanceOf(treasury), 0);
    }

    // -----------------------------------------------------------------------
    // Variable-fee behavior
    // -----------------------------------------------------------------------

    function test_fee180bps_deductsFromGrossPayout() public {
        // 1.80% fee (typical fixture 1x2 market)
        vm.prank(admin);
        uint256 id = market.createMarket("FIFA-FRA-ARG", 2, closeTime, 180);

        vm.prank(alice);
        market.stake(id, 0, 100 * ONE_USDC);
        vm.prank(bob);
        market.stake(id, 1, 300 * ONE_USDC);

        vm.prank(admin);
        market.settle(id, 0);

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(alice);
        uint256 payout = market.claim(id);

        // gross = 400, fee = 400 * 180 / 10000 = 7.2
        // net = 392.8
        assertEq(payout, 392_800_000, "net payout after 1.8% fee");
        assertEq(usdc.balanceOf(alice) - aliceBefore, 392_800_000);
        assertEq(usdc.balanceOf(treasury) - treasuryBefore, 7_200_000, "fee transferred to treasury");
        // Sum reconciles to pot
        assertEq(usdc.balanceOf(address(market)), 0);
    }

    function test_fee500bps_maxAllowedFee() public {
        // Max fee (5%)
        vm.prank(admin);
        uint256 id = market.createMarket("x", 2, closeTime, 500);
        vm.prank(alice);
        market.stake(id, 0, 100 * ONE_USDC);
        vm.prank(bob);
        market.stake(id, 1, 100 * ONE_USDC);
        vm.prank(admin);
        market.settle(id, 0);

        vm.prank(alice);
        uint256 payout = market.claim(id);
        // gross = 200, fee = 10, net = 190
        assertEq(payout, 190 * ONE_USDC);
        assertEq(usdc.balanceOf(treasury), 10 * ONE_USDC);
    }

    function test_fee_revertsWhenAboveMax() public {
        vm.prank(admin);
        vm.expectRevert(XCupMarket.FeeTooHigh.selector);
        market.createMarket("x", 2, closeTime, 501);
    }

    function test_fee_multipleClaimantsPayProportionally() public {
        // 200bps fee. YES: Alice 100, Carol 300 (winning pot 400). NO: Bob 600. Total pot 1000.
        vm.prank(admin);
        uint256 id = market.createMarket("x", 2, closeTime, 200);
        vm.prank(alice);
        market.stake(id, 0, 100 * ONE_USDC);
        vm.prank(carol);
        market.stake(id, 0, 300 * ONE_USDC);
        vm.prank(bob);
        market.stake(id, 1, 600 * ONE_USDC);

        vm.prank(admin);
        market.settle(id, 0);

        // Alice: gross 250, fee 5, net 245
        vm.prank(alice);
        uint256 aliceP = market.claim(id);
        assertEq(aliceP, 245 * ONE_USDC);

        // Carol: gross 750, fee 15, net 735
        vm.prank(carol);
        uint256 carolP = market.claim(id);
        assertEq(carolP, 735 * ONE_USDC);

        // Treasury total fee = 20
        assertEq(usdc.balanceOf(treasury), 20 * ONE_USDC);
        // Pot fully drained
        assertEq(usdc.balanceOf(address(market)), 0);
    }

    function test_quoteClaim_reflectsNetAfterFee() public {
        vm.prank(admin);
        uint256 id = market.createMarket("x", 2, closeTime, 180);
        vm.prank(alice);
        market.stake(id, 0, 100 * ONE_USDC);
        vm.prank(bob);
        market.stake(id, 1, 300 * ONE_USDC);

        vm.prank(admin);
        market.settle(id, 0);

        // Quote = net (after 1.8% fee on gross 400)
        assertEq(market.quoteClaim(id, alice), 392_800_000);

        vm.prank(alice);
        market.claim(id);
        assertEq(market.quoteClaim(id, alice), 0);
    }

    // -----------------------------------------------------------------------
    // Treasury management
    // -----------------------------------------------------------------------

    function test_setTreasury_admin_canSwap() public {
        address newSafe = address(0xCAFE);
        vm.prank(admin);
        market.setTreasury(newSafe);
        assertEq(market.treasury(), newSafe);

        // Fees should now flow to the new treasury
        vm.prank(admin);
        uint256 id = market.createMarket("x", 2, closeTime, 200);
        vm.prank(alice);
        market.stake(id, 0, 100 * ONE_USDC);
        vm.prank(bob);
        market.stake(id, 1, 100 * ONE_USDC);
        vm.prank(admin);
        market.settle(id, 0);
        vm.prank(alice);
        market.claim(id);
        assertEq(usdc.balanceOf(newSafe), 4 * ONE_USDC); // 200bps of 200 = 4
        assertEq(usdc.balanceOf(treasury), 0, "old treasury unchanged");
    }

    function test_setTreasury_revertsForNonAdmin() public {
        bytes32 role = market.DEFAULT_ADMIN_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role)
        );
        vm.prank(alice);
        market.setTreasury(address(0x123));
    }

    function test_setTreasury_revertsOnZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(XCupMarket.ZeroAddress.selector);
        market.setTreasury(address(0));
    }

    function test_constructor_revertsOnZeroAddresses() public {
        vm.expectRevert(XCupMarket.ZeroAddress.selector);
        new XCupMarket(IERC20(address(usdc)), address(0), treasury);
        vm.expectRevert(XCupMarket.ZeroAddress.selector);
        new XCupMarket(IERC20(address(usdc)), admin, address(0));
    }

    // -----------------------------------------------------------------------
    // Access control
    // -----------------------------------------------------------------------

    function test_createMarket_revertsForNonAdmin() public {
        bytes32 role = market.DEFAULT_ADMIN_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role)
        );
        vm.prank(alice);
        market.createMarket("x", 2, closeTime, 0);
    }

    function test_settle_revertsForNonOracle() public {
        vm.prank(admin);
        uint256 id = market.createMarket("x", 2, closeTime, 0);
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
        uint256 id = market.createMarket("x", 2, closeTime, 0);
        market.settle(id, 0);
        vm.expectRevert(XCupMarket.AlreadySettled.selector);
        market.settle(id, 1);
        vm.stopPrank();
    }

    function test_stake_revertsAfterClose() public {
        vm.prank(admin);
        uint256 id = market.createMarket("x", 2, closeTime, 0);
        vm.warp(closeTime + 1);
        vm.prank(alice);
        vm.expectRevert(XCupMarket.MarketClosed.selector);
        market.stake(id, 0, 10 * ONE_USDC);
    }

    function test_stake_revertsOnInvalidOutcome() public {
        vm.prank(admin);
        uint256 id = market.createMarket("x", 2, closeTime, 0);
        vm.prank(alice);
        vm.expectRevert(XCupMarket.InvalidOutcome.selector);
        market.stake(id, 5, 10 * ONE_USDC);
    }

    function test_stake_revertsOnZeroAmount() public {
        vm.prank(admin);
        uint256 id = market.createMarket("x", 2, closeTime, 0);
        vm.prank(alice);
        vm.expectRevert(XCupMarket.ZeroAmount.selector);
        market.stake(id, 0, 0);
    }

    function test_claim_revertsBeforeSettle() public {
        vm.prank(admin);
        uint256 id = market.createMarket("x", 2, closeTime, 0);
        vm.prank(alice);
        market.stake(id, 0, 10 * ONE_USDC);
        vm.prank(alice);
        vm.expectRevert(XCupMarket.NotSettled.selector);
        market.claim(id);
    }

    function test_claim_revertsOnDoubleClaim() public {
        vm.prank(admin);
        uint256 id = market.createMarket("x", 2, closeTime, 0);
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
        market.createMarket("", 2, closeTime, 0);
        vm.expectRevert(XCupMarket.InvalidOutcomeCount.selector);
        market.createMarket("x", 1, closeTime, 0);
        vm.expectRevert(XCupMarket.InvalidOutcomeCount.selector);
        market.createMarket("x", 9, closeTime, 0);
        vm.expectRevert(XCupMarket.InvalidCloseTime.selector);
        market.createMarket("x", 2, block.timestamp, 0);
        vm.stopPrank();
    }
}
