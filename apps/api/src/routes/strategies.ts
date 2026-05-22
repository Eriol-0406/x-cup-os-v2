import { Router } from "express";
import { z } from "zod";
import { parseStrategy } from "../parser.js";

export const strategiesRouter = Router();

const ParseRequest = z.object({
  text: z.string().min(8, "strategy text is too short").max(1000, "strategy text is too long"),
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "walletAddress must be a 0x EVM address")
    .optional(),
});

/**
 * POST /strategies/parse
 *
 * Stateless parse — used by the live preview as the user types.
 * No DB writes. Returns the parsed strategy (or a structured failure).
 */
strategiesRouter.post("/parse", async (req, res) => {
  const body = ParseRequest.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ ok: false, error: "invalid request", issues: body.error.flatten() });
  }

  try {
    const result = await parseStrategy(body.data.text);
    if (!result.ok) {
      return res.status(422).json(result);
    }
    return res.json(result);
  } catch (err) {
    console.error("[POST /strategies/parse] upstream error", err);
    return res.status(502).json({
      ok: false,
      error: "parser upstream failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});
