"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  getProvider,
  requestAccounts,
  getCurrentAccounts,
  getChainId,
  ensureXLayerTestnet,
  XLAYER_TESTNET_CHAIN_ID,
} from "@/lib/wallet";

/**
 * Wallet state machine.
 *   disconnected → connecting → connected | wrong_chain | error
 *   wrong_chain → connected  (via switchChain)
 *   connected → disconnected (via disconnect or wallet emitting empty accountsChanged)
 */
export type WalletState =
  | { kind: "disconnected" }
  | { kind: "connecting" }
  | { kind: "wrong_chain"; address: string; chainId: number }
  | { kind: "connected"; address: string }
  | { kind: "error"; message: string };

interface WalletContextValue {
  state: WalletState;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchChain: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>({ kind: "disconnected" });

  // Connect button handler.
  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      setState({
        kind: "error",
        message: "No EVM wallet detected. Install OKX Wallet (recommended) or MetaMask and refresh.",
      });
      return;
    }
    setState({ kind: "connecting" });
    try {
      const accounts = await requestAccounts(provider);
      const address = accounts[0];
      if (!address) {
        setState({ kind: "error", message: "Wallet returned no accounts" });
        return;
      }
      const chainId = await getChainId(provider);
      if (chainId !== XLAYER_TESTNET_CHAIN_ID) {
        // Try auto-switch immediately. If user rejects, settle into wrong_chain state.
        try {
          await ensureXLayerTestnet(provider);
          setState({ kind: "connected", address });
        } catch {
          setState({ kind: "wrong_chain", address, chainId });
        }
      } else {
        setState({ kind: "connected", address });
      }
    } catch (err: any) {
      const code = err?.code;
      const userRejected = code === 4001 || /rejected|denied/i.test(err?.message ?? "");
      setState({
        kind: "error",
        message: userRejected ? "Wallet connect was rejected." : err?.message ?? "Wallet connect failed",
      });
    }
  }, []);

  const disconnect = useCallback(() => {
    // EIP-1193 has no real disconnect — we just clear local state.
    setState({ kind: "disconnected" });
  }, []);

  const switchChain = useCallback(async () => {
    const provider = getProvider();
    if (!provider) return;
    try {
      await ensureXLayerTestnet(provider);
      const accounts = await getCurrentAccounts(provider);
      const address = accounts[0];
      if (address) setState({ kind: "connected", address });
    } catch (err: any) {
      setState({ kind: "error", message: err?.message ?? "Chain switch failed" });
    }
  }, []);

  // Subscribe to wallet events for account/chain changes.
  useEffect(() => {
    const provider = getProvider();
    if (!provider?.on) return;

    const onAccountsChanged = (accounts: string[]) => {
      if (!accounts || accounts.length === 0) {
        setState({ kind: "disconnected" });
      } else {
        setState((s) => {
          if (s.kind === "connected" || s.kind === "wrong_chain") {
            return s.kind === "connected"
              ? { kind: "connected", address: accounts[0]! }
              : { ...s, address: accounts[0]! };
          }
          return s;
        });
      }
    };

    const onChainChanged = (chainHex: string) => {
      const chainId = parseInt(chainHex, 16);
      setState((s) => {
        const address =
          s.kind === "connected" ? s.address : s.kind === "wrong_chain" ? s.address : undefined;
        if (!address) return s;
        if (chainId === XLAYER_TESTNET_CHAIN_ID) {
          return { kind: "connected", address };
        }
        return { kind: "wrong_chain", address, chainId };
      });
    };

    provider.on("accountsChanged", onAccountsChanged);
    provider.on("chainChanged", onChainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  return (
    <WalletContext.Provider value={{ state, connect, disconnect, switchChain }}>{children}</WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
