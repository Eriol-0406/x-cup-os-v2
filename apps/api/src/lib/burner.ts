import { ethers } from "ethers";
import { ethers as ethersGetAddress } from "ethers";
import { prisma } from "../db.js";
import { encrypt, decrypt } from "./crypto.js";
import { env } from "../env.js";

/**
 * Burner ("agent session") wallet flow.
 *
 *   When a user first hits /users/by-address with their main wallet,
 *   we generate a fresh EVM wallet, encrypt its privkey with the server's
 *   BURNER_ENCRYPTION_KEY, and store both the address + ciphertext.
 *
 *   From then on, the agent can sign txs without bothering the user — but
 *   its reach is bounded to whatever USDC + OKB the user funded it with.
 *   The user can pull funds back to their main wallet anytime.
 *
 *   In v2 we'd swap the DB-stored ciphertext for OKX Agentic Wallet's TEE.
 *   The interface here is intentionally the same shape so the swap is local.
 */

export interface AgentInfo {
  mainWallet: string;
  agentAddress: string;
  /** True if we generated the agent right now in this call. */
  freshlyCreated: boolean;
}

/** Upsert a user row by main-wallet address. Generate an agent if missing. */
export async function ensureUserWithAgent(mainWalletRaw: string): Promise<AgentInfo> {
  const mainWallet = ethers.getAddress(mainWalletRaw); // EIP-55 checksum

  // Try to find first; only generate burner if absent (avoids burning entropy
  // and avoids the edge case where a transient DB read fails and we'd
  // overwrite an existing agent).
  let user = await prisma.user.findUnique({ where: { mainWallet } });
  let freshlyCreated = false;

  if (!user) {
    user = await prisma.user.create({
      data: { mainWallet },
    });
  }

  if (!user.agentWallet || !user.agentWalletEncryptedKey) {
    const burner = ethers.Wallet.createRandom();
    const ciphertext = encrypt(burner.privateKey, env.BURNER_ENCRYPTION_KEY);

    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        agentWallet: ethers.getAddress(burner.address),
        agentWalletEncryptedKey: ciphertext,
      },
    });
    freshlyCreated = true;
  }

  return {
    mainWallet: user.mainWallet,
    agentAddress: user.agentWallet!,
    freshlyCreated,
  };
}

/** Decrypt the burner privkey for the watch loop / signer. */
export async function getAgentSigner(
  mainWalletRaw: string,
  rpcUrl: string,
): Promise<ethers.Wallet> {
  const mainWallet = ethers.getAddress(mainWalletRaw);
  const user = await prisma.user.findUnique({ where: { mainWallet } });
  if (!user?.agentWalletEncryptedKey) {
    throw new Error(`No agent provisioned for ${mainWallet}`);
  }
  const privKey = decrypt(user.agentWalletEncryptedKey, env.BURNER_ENCRYPTION_KEY);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Wallet(privKey, provider);
}
