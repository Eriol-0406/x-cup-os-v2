/**
 * X-Cup OS — cross-layer type contract
 *
 * This is the schema the LLM is FORCED to produce via tool-use, and the same
 * schema the backend validates server-side, and the same schema the frontend
 * renders in the live parse preview. Single source of truth across all 4 layers.
 *
 * If you change anything here, three layers churn with it — change deliberately.
 */
export * from "./strategy.js";
