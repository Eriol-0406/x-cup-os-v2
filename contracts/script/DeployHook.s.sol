// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {XCupBetHook, IXCupMarket} from "../src/XCupBetHook.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/**
 * @notice Deploy XCupBetHook on X Layer testnet alongside the existing
 *         XCupMarket + MockUSDC contracts.
 *
 *         Production deployment on X Layer MAINNET would pass the real
 *         Uniswap V4 PoolManager at 0x360e68faccca8ca495c1b759fd9eee466db9fb32
 *         (chain 196, verified via official Uniswap V4 deployments docs).
 *
 *         For the testnet hackathon submission, we pass the deployer wallet
 *         as the PoolManager parameter so the onlyPoolManager modifier on
 *         afterSwap will accept calls from the deployer — this lets us
 *         demonstrate the full bet-routing flow end-to-end on chain.
 *
 *         Default market: tournament-winner for Argentina (marketId 84),
 *         outcome 0 (YES). The hook will route 1% of any swap > 10 USDC
 *         into this market on the swapper's behalf.
 *
 *   forge script script/DeployHook.s.sol --rpc-url $XLAYER_TESTNET_RPC \
 *     --broadcast --private-key $DEPLOYER_PRIVATE_KEY
 */
contract DeployHook is Script {
    // Existing on-chain X-Cup OS v2 contracts (X Layer testnet, chain 1952)
    address constant XCUP_MARKET_V2 = 0x5349be46935302f77acD6363D063efFE5DE27c42;
    address constant MOCK_USDC_V2   = 0x6D0ecefecCE861B9353Ca353ccfb39a1537335e6;

    // Default routing target: Argentina tournament-winner market, YES side.
    uint256 constant DEFAULT_MARKET_ID = 84;
    uint8   constant DEFAULT_OUTCOME   = 0; // YES

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // For testnet demo: deployer wallet acts as the "PoolManager" so we
        // can drive afterSwap callbacks directly without a live V4 pool.
        // Mainnet deployment would use IPoolManager(0x360e...fb32).
        XCupBetHook hook = new XCupBetHook(
            IPoolManager(deployer),                 // demo PoolManager = deployer
            IXCupMarket(XCUP_MARKET_V2),
            IERC20(MOCK_USDC_V2),
            DEFAULT_MARKET_ID,
            DEFAULT_OUTCOME,
            deployer                                 // admin
        );

        console2.log("XCupBetHook deployed at:", address(hook));
        console2.log("  PoolManager (demo, mainnet would be 0x360e...fb32):", deployer);
        console2.log("  XCupMarket target:", XCUP_MARKET_V2);
        console2.log("  Stake token:", MOCK_USDC_V2);
        console2.log("  Default marketId:", DEFAULT_MARKET_ID);
        console2.log("  Default outcomeIdx:", DEFAULT_OUTCOME);
        console2.log("  betShareBps:", hook.betShareBps());
        console2.log("  minSwapForBet:", hook.minSwapForBet());

        // Seed the hook with 100 USDC so it can route bets on the first swap call.
        MockUSDC usdc = MockUSDC(MOCK_USDC_V2);
        usdc.mint(address(hook), 100 * 1e6);
        console2.log("  Funded hook with 100 USDC for demo bet routing.");

        vm.stopBroadcast();
    }
}
