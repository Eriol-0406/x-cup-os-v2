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
 * The script deploys MockUSDC + XCupMarket, mints some USDC to the deployer,
 * and creates two seed markets (Argentina-vs-France, England-vs-Brazil).
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

        uint256 closeTime = block.timestamp + 7 days;
        uint256 m1 = xcup.createMarket("FIFA-ARG-FRA-2026", 2, closeTime);
        uint256 m2 = xcup.createMarket("FIFA-ENG-BRA-2026", 3, closeTime);
        console2.log("Seed market 1:", m1);
        console2.log("Seed market 2:", m2);

        vm.stopBroadcast();
    }
}
