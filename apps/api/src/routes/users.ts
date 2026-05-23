import { Router } from "express";
import { z } from "zod";
import { ethers } from "ethers";
import { ensureUserWithAgent } from "../lib/burner.js";

export const usersRouter = Router();

const AddressParam = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "expected a 0x EVM address");

/**
 * GET /users/by-address/:addr
 *
 * Upsert flow: if the user doesn't exist we create them; if they don't have
 * an agent burner yet we generate one and encrypt the privkey. Idempotent —
 * subsequent calls return the existing agent.
 */
usersRouter.get("/by-address/:addr", async (req, res) => {
  const parsed = AddressParam.safeParse(req.params.addr);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "invalid address" });
  }

  try {
    const checksum = ethers.getAddress(parsed.data);
    const info = await ensureUserWithAgent(checksum);
    return res.json({ ok: true, ...info });
  } catch (err: any) {
    console.error("[GET /users/by-address] error", err);
    return res.status(500).json({ ok: false, error: err?.message ?? "internal error" });
  }
});
