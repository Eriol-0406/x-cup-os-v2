import "dotenv/config";
import { z } from "zod";
import { appendFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { generateKey } from "./lib/crypto.js";

/**
 * Validate the environment on boot. If anything required is missing we crash
 * loudly — silent fallback to undefined would mean the parser endpoint succeeds
 * locally and then 500s in production with a useless stack.
 *
 * Exception: BURNER_ENCRYPTION_KEY is auto-generated on first run and
 * appended to .env so burners encrypted in this process survive a restart.
 */

// Auto-bootstrap BURNER_ENCRYPTION_KEY if missing (dev-friendly).
function maybeGenerateBurnerKey() {
  if (process.env.BURNER_ENCRYPTION_KEY && process.env.BURNER_ENCRYPTION_KEY.length === 64) {
    return;
  }
  const newKey = generateKey();
  process.env.BURNER_ENCRYPTION_KEY = newKey;

  // Best-effort persist to .env so a restart doesn't orphan existing burners.
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    try {
      appendFileSync(envPath, `\nBURNER_ENCRYPTION_KEY=${newKey}\n`);
      console.warn("⚠️  Generated a fresh BURNER_ENCRYPTION_KEY and appended it to .env");
      console.warn("    Existing burners (if any) encrypted with the previous key are now unrecoverable.");
    } catch (err) {
      console.warn("⚠️  Generated BURNER_ENCRYPTION_KEY in-memory but couldn't persist to .env:", err);
    }
  }
}
maybeGenerateBurnerKey();

const EnvSchema = z.object({
  GROQ_API_KEY: z.string().min(10, "GROQ_API_KEY missing — set it in .env"),
  API_FOOTBALL_KEY: z.string().min(10).optional(),
  API_FOOTBALL_HOST: z.string().default("v3.football.api-sports.io"),
  XLAYER_TESTNET_RPC: z.string().url().default("https://testrpc.xlayer.tech"),
  XLAYER_CHAIN_ID: z.coerce.number().int().default(1952),
  DATABASE_URL: z.string().default("file:./dev.db"),
  PORT: z.coerce.number().int().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  BURNER_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "BURNER_ENCRYPTION_KEY must be 64-char hex"),
  DEPLOYER_PRIVATE_KEY: z
    .string()
    .regex(/^(0x)?[0-9a-fA-F]{64}$/, "DEPLOYER_PRIVATE_KEY must be 64-char hex")
    .optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
