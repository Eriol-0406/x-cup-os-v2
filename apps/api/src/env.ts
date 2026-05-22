import "dotenv/config";
import { z } from "zod";

/**
 * Validate the environment on boot. If anything required is missing we crash
 * loudly — silent fallback to undefined would mean the parser endpoint succeeds
 * locally and then 500s in production with a useless stack.
 */
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
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
