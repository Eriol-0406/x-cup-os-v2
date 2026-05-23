export declare const XCupMarketAbi: readonly unknown[];
export declare const MockUSDCAbi: readonly unknown[];

export interface ContractRef {
  address: string;
  deployTx: string;
}

export interface SeedMarket {
  id: number;
  matchId: string;
  outcomes: number;
  tx: string;
}

export interface ChainDeployment {
  name: string;
  rpc: string;
  explorer: string;
  deployer: string;
  contracts: {
    MockUSDC: ContractRef;
    XCupMarket: ContractRef;
  };
  seedMarkets: SeedMarket[];
  deployedAt: string;
}

export declare const addresses: Record<string, ChainDeployment>;

export declare function getDeployment(chainId: number | string): ChainDeployment;
