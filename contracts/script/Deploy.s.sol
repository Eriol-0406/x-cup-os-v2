// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {XCupMarket} from "../src/XCupMarket.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/**
 * @notice X Layer testnet deploy.
 *
 *   forge script script/Deploy.s.sol \
 *     --rpc-url $XLAYER_TESTNET_RPC \
 *     --broadcast \
 *     --private-key $DEPLOYER_PRIVATE_KEY
 *
 * Deploys MockUSDC + XCupMarket, mints 10k USDC to the deployer.
 * Markets are created off-chain by the API's /admin/create-markets endpoint
 * which mirrors API-Football fixtures into on-chain markets one per fixture.
 */
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        MockUSDC usdc = new MockUSDC();
        usdc.mint(deployer, 10_000 * 1e6); // 10k USDC for testing
        console2.log("MockUSDC:", address(usdc));

        XCupMarket xcup = new XCupMarket(IERC20(address(usdc)), deployer);
        console2.log("XCupMarket:", address(xcup));

        vm.stopBroadcast();
    }
}
