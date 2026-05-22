import { z } from "zod";

/**
 * Trigger conditions — what has to be true in match data for the agent to fire.
 *
 * Kept deliberately small for v1. The LLM picks one of these kinds and fills
 * the required fields. New trigger kinds = new entries here AND new evaluator
 * branches in apps/api/src/watch/evaluator.ts.
 */
export const TriggerCondition = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("match_winner"),
    team: z.string().min(2).max(32), // ISO code or canonical team name e.g. "FRA"
    match: z.enum(["next", "specific"]).default("next"),
    matchId: z.string().optional(), // required when match === "specific"
  }),
  z.object({
    kind: z.literal("player_scores",),
    player: z.string().min(2).max(64),
    match: z.enum(["next", "specific"]).default("next"),
    matchId: z.string().optional(),
  }),
  z.object({
    kind: z.literal("score_threshold"),
    team: z.string().min(2).max(32),
    operator: z.enum([">=", ">", "==", "<", "<="]),
    goals: z.number().int().min(0).max(20),
    match: z.enum(["next", "specific"]).default("next"),
    matchId: z.string().optional(),
  }),
]);
export type TriggerCondition = z.infer<typeof TriggerCondition>;

export const Trigger = z.object({
  combinator: z.enum(["AND", "OR"]).default("AND"),
  conditions: z.array(TriggerCondition).min(1).max(4),
});
export type Trigger = z.infer<typeof Trigger>;

/**
 * Action — what the agent actually does when the trigger fires.
 * v1: a single stake on a prediction market outcome. No multi-leg.
 */
export const Action = z.object({
  marketRef: z.string().min(1).max(128), // canonical name e.g. "france_reaches_final"
  outcome: z.enum(["YES", "NO"]),
  stakeUsdc: z.number().positive().max(10_000),
});
export type Action = z.infer<typeof Action>;

/**
 * Risk limits — bounded autonomy. The watch loop re-checks these on every fire.
 */
export const RiskLimits = z.object({
  maxLossUsdc: z.number().positive().max(100_000).optional(),
  maxFires: z.number().int().positive().max(50).optional(),
  expiresAt: z.string().datetime().optional(), // ISO 8601
});
export type RiskLimits = z.infer<typeof RiskLimits>;

/**
 * The full parsed strategy. This is what Groq's tool-use call must return,
 * what Zod validates server-side, and what the watch loop evaluates.
 */
export const ParsedStrategy = z.object({
  trigger: Trigger,
  action: Action,
  riskLimits: RiskLimits.default({}),
  notes: z.string().max(280).optional(), // optional LLM-generated human summary
});
export type ParsedStrategy = z.infer<typeof ParsedStrategy>;

/**
 * JSON Schema form of ParsedStrategy for the Groq tool-use call.
 * Hand-maintained to mirror the Zod schema above — keep them in sync.
 */
export const PARSED_STRATEGY_TOOL_SCHEMA = {
  name: "submit_parsed_strategy",
  description:
    "Submit the structured parsed strategy. Call this exactly once with the user's English strategy converted into the required schema.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["trigger", "action"],
    properties: {
      trigger: {
        type: "object",
        required: ["conditions"],
        properties: {
          combinator: { type: "string", enum: ["AND", "OR"] },
          conditions: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: {
              oneOf: [
                {
                  type: "object",
                  required: ["kind", "team"],
                  properties: {
                    kind: { const: "match_winner" },
                    team: { type: "string" },
                    match: { type: "string", enum: ["next", "specific"] },
                    matchId: { type: "string" },
                  },
                },
                {
                  type: "object",
                  required: ["kind", "player"],
                  properties: {
                    kind: { const: "player_scores" },
                    player: { type: "string" },
                    match: { type: "string", enum: ["next", "specific"] },
                    matchId: { type: "string" },
                  },
                },
                {
                  type: "object",
                  required: ["kind", "team", "operator", "goals"],
                  properties: {
                    kind: { const: "score_threshold" },
                    team: { type: "string" },
                    operator: { type: "string", enum: [">=", ">", "==", "<", "<="] },
                    goals: { type: "integer", minimum: 0, maximum: 20 },
                    match: { type: "string", enum: ["next", "specific"] },
                    matchId: { type: "string" },
                  },
                },
              ],
            },
          },
        },
      },
      action: {
        type: "object",
        required: ["marketRef", "outcome", "stakeUsdc"],
        properties: {
          marketRef: { type: "string" },
          outcome: { type: "string", enum: ["YES", "NO"] },
          stakeUsdc: { type: "number", exclusiveMinimum: 0, maximum: 10000 },
        },
      },
      riskLimits: {
        type: "object",
        properties: {
          maxLossUsdc: { type: "number", exclusiveMinimum: 0 },
          maxFires: { type: "integer", minimum: 1 },
          expiresAt: { type: "string", format: "date-time" },
        },
      },
      notes: { type: "string", maxLength: 280 },
    },
  },
} as const;
