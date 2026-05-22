import Groq from "groq-sdk";
import { ParsedStrategy, PARSED_STRATEGY_TOOL_SCHEMA } from "@x-cup/types";
import { env } from "./env.js";

const groq = new Groq({ apiKey: env.GROQ_API_KEY });

/**
 * System prompt for the parser. Kept terse on purpose — Groq's free tier is
 * generous but every token still costs latency, and the live-preview UX wants
 * sub-300ms. The tool schema does the heavy lifting; the prompt just sets
 * domain context and a few hard rules.
 */
const SYSTEM_PROMPT = `You are the strategy parser for X-Cup OS, a World Cup betting dApp.

Your only job: convert the user's English betting strategy into the exact JSON
shape required by submit_parsed_strategy. Call that tool exactly once. Do not
add commentary.

Rules:
- Team names: use the standard short name the user wrote (e.g. "France", "Argentina", "Brazil").
- Player names: keep as written (e.g. "Mbappe", "Messi").
- marketRef: a short snake_case slug describing the market (e.g. "france_reaches_final", "argentina_wins_qf").
- outcome must be either YES or NO — coerce other phrasings.
- stakeUsdc is in USDC (whole or fractional). Refuse if the user gives no stake.

OPTIONAL fields — only include them if the user explicitly mentions them.
NEVER invent or default these:
- riskLimits.maxLossUsdc: only if user names a stop-loss
- riskLimits.maxFires: only if user names a max-fire count
- riskLimits.expiresAt: only if user names an explicit expiry date/time
- notes: only as a human-readable rephrasing of THE USER'S strategy

If the strategy mixes multiple bets, pick the FIRST one and ignore the rest.
If the strategy is ambiguous or you can't fill required fields, still call
the tool with your best guess — server-side validation will reject anything
truly invalid, and the user can iterate.

Be deterministic: same input ⇒ same output.`;

export interface ParseResult {
  ok: true;
  parsed: ParsedStrategy;
  latencyMs: number;
  model: string;
}

export interface ParseFailure {
  ok: false;
  error: string;
  rawToolArgs?: unknown;
  latencyMs: number;
}

/**
 * Call Groq with forced tool-use and return the validated ParsedStrategy.
 * This is a pure function (no DB side effects) so it's easy to test and to
 * call from the live-preview endpoint without persisting half-formed input.
 */
export async function parseStrategy(englishText: string): Promise<ParseResult | ParseFailure> {
  const t0 = Date.now();

  const response = await groq.chat.completions.create({
    model: env.GROQ_MODEL,
    temperature: 0, // deterministic
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: englishText },
    ],
    tools: [{ type: "function", function: PARSED_STRATEGY_TOOL_SCHEMA }],
    tool_choice: {
      type: "function",
      function: { name: PARSED_STRATEGY_TOOL_SCHEMA.name },
    },
  });

  const latencyMs = Date.now() - t0;
  const choice = response.choices[0];
  const toolCall = choice?.message?.tool_calls?.[0];

  if (!toolCall || toolCall.function.name !== PARSED_STRATEGY_TOOL_SCHEMA.name) {
    return {
      ok: false,
      error: "model did not call submit_parsed_strategy",
      latencyMs,
    };
  }

  let rawArgs: unknown;
  try {
    rawArgs = JSON.parse(toolCall.function.arguments);
  } catch {
    return {
      ok: false,
      error: "tool arguments were not valid JSON",
      rawToolArgs: toolCall.function.arguments,
      latencyMs,
    };
  }

  // Server-side validation — Risk 3 mitigation from the spec.
  const validated = ParsedStrategy.safeParse(rawArgs);
  if (!validated.success) {
    return {
      ok: false,
      error: "tool arguments did not match ParsedStrategy schema",
      rawToolArgs: { args: rawArgs, zodIssues: validated.error.issues },
      latencyMs,
    };
  }

  return {
    ok: true,
    parsed: validated.data,
    latencyMs,
    model: env.GROQ_MODEL,
  };
}
