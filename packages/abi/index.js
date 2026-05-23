import XCupMarketAbi from "./XCupMarket.abi.json" with { type: "json" };
import MockUSDCAbi from "./MockUSDC.abi.json" with { type: "json" };
import addresses from "./addresses.json" with { type: "json" };

export { XCupMarketAbi, MockUSDCAbi, addresses };

/**
 * Convenience accessor: getDeployment(1952) → { contracts, seedMarkets, ... }
 */
export function getDeployment(chainId) {
  const d = addresses[String(chainId)];
  if (!d) throw new Error(`No deployment recorded for chain ${chainId}`);
  return d;
}
