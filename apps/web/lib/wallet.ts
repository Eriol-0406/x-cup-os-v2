/**
 * OKX Wallet / EIP-1193 provider helpers.
 *
 * We prefer window.okxwallet when present, fall back to window.ethereum
 * (which OKX also injects, but using the OKX-specific surface lets the
 * user pick OKX even when MetaMask is also installed).
 */

export const XLAYER_TESTNET_CHAIN_ID = 1952;

export const XLAYER_TESTNET_CHAIN_PARAMS = {
  chainId: "0x" + (1952).toString(16), // "0x7a0"
  chainName: "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: ["https://testrpc.xlayer.tech"],
  blockExplorerUrls: ["https://www.oklink.com/x-layer-testnet"],
} as const;

/** Minimal EIP-1193 surface we actually call. */
export interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  isOKXWallet?: boolean;
  isMetaMask?: boolean;
}

declare global {
  interface Window {
    okxwallet?: EthereumProvider;
    ethereum?: EthereumProvider;
  }
}

/**
 * Returns the injected provider we want to use, preferring OKX Wallet.
 * Returns null during SSR or when no wallet is installed.
 */
export function getProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  if (window.okxwallet) return window.okxwallet;
  if (window.ethereum) return window.ethereum;
  return null;
}

export async function requestAccounts(provider: EthereumProvider): Promise<string[]> {
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  return accounts ?? [];
}

export async function getCurrentAccounts(provider: EthereumProvider): Promise<string[]> {
  const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
  return accounts ?? [];
}

export async function getChainId(provider: EthereumProvider): Promise<number> {
  const chainHex = (await provider.request({ method: "eth_chainId" })) as string;
  return parseInt(chainHex, 16);
}

/**
 * Switch the wallet to X Layer testnet. If the chain isn't in the wallet yet
 * (error 4902), add it first then retry the switch implicitly via the add call.
 */
export async function ensureXLayerTestnet(provider: EthereumProvider): Promise<void> {
  const current = await getChainId(provider);
  if (current === XLAYER_TESTNET_CHAIN_ID) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: XLAYER_TESTNET_CHAIN_PARAMS.chainId }],
    });
  } catch (err: any) {
    const code = err?.code;
    const message: string = err?.message ?? "";
    const isUnknownChain = code === 4902 || /unrecognized|not added|not been added/i.test(message);
    if (isUnknownChain) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [XLAYER_TESTNET_CHAIN_PARAMS],
      });
    } else {
      throw err;
    }
  }
}

export function shortAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr ?? "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
