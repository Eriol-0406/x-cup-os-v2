// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {BalanceDelta, toBalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {XCupBetHook} from "../src/XCupBetHook.sol";

/**
 * @notice Demonstrates the V4 Hook → XCupMarket integration on X Layer testnet
 *         by calling afterSwap directly from the deployer wallet (which was
 *         configured as the "PoolManager" in the testnet deployment).
 *
 *         Simulates: user swapped some OKB for 50 USDC through the V4 pool;
 *         hook's afterSwap fires, takes 1% (0.5 USDC) and stakes it on
 *         XCupMarket market 84 (Argentina tournament-winner) outcome 0 (YES).
 *
 *   forge script script/TriggerHookDemo.s.sol --rpc-url $XLAYER_TESTNET_RPC \
 *     --broadcast --private-key $DEPLOYER_PRIVATE_KEY
 */
contract TriggerHookDemo is Script {
    address constant HOOK = 0x9e5385B4B5146cceFf41BF2a7529D09107C8098e;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // Build a synthetic BalanceDelta where amount0 = +50 USDC (user received)
        BalanceDelta delta = toBalanceDelta(int128(50 * 1e6), int128(-int256(0.0005 ether)));

        // Empty PoolKey + empty SwapParams — afterSwap only reads `delta` for the
        // bet-routing math, so empty other params are fine for the demo path.
        PoolKey memory key;
        IPoolManager.SwapParams memory params;

        vm.startBroadcast(deployerKey);
        XCupBetHook hook = XCupBetHook(HOOK);

        uint256 betCountBefore = hook.betCount();
        uint256 totalVolBefore = hook.totalBetVolume();
        console2.log("Hook state BEFORE:");
        console2.log("  betCount:", betCountBefore);
        console2.log("  totalBetVolume:", totalVolBefore);

        // Call afterSwap — onlyPoolManager passes because deployer was set as PM.
        hook.afterSwap(deployer, key, params, delta, "");

        uint256 betCountAfter = hook.betCount();
        uint256 totalVolAfter = hook.totalBetVolume();
        console2.log("Hook state AFTER:");
        console2.log("  betCount:", betCountAfter);
        console2.log("  totalBetVolume:", totalVolAfter);
        console2.log("Bet routed: ", totalVolAfter - totalVolBefore, "USDC (6 decimals)");

        vm.stopBroadcast();
    }
}
