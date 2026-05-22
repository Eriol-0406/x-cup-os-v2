"use client";

import type { ParseSuccess, ParseFailure } from "@/lib/api";

type Props = {
  state:
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "success"; data: ParseSuccess }
    | { kind: "error"; error: ParseFailure | { error: string } };
};

function describeCondition(c: ParseSuccess["parsed"]["trigger"]["conditions"][number]): React.ReactNode {
  switch (c.kind) {
    case "match_winner":
      return (
        <>
          <span className="accent">{c.team}</span> wins their {c.match === "specific" ? "specific" : "next"} match
        </>
      );
    case "player_scores":
      return (
        <>
          <span className="accent">{c.player}</span> scores in their {c.match === "specific" ? "specific" : "next"}{" "}
          match
        </>
      );
    case "score_threshold":
      return (
        <>
          <span className="accent">{c.team}</span> scores {c.operator} {c.goals} goal{c.goals === 1 ? "" : "s"}
        </>
      );
  }
}

export function ParsePreview({ state }: Props) {
  if (state.kind === "idle") {
    return (
      <div className="preview-empty">
        Start typing a strategy on the left — the AI will parse it into structured rules here in real time.
      </div>
    );
  }

  if (state.kind === "loading") {
    return (
      <div className="loading-card">
        <span className="spinner" />
        <span>Parsing with Llama 3.3 70B…</span>
      </div>
    );
  }

  if (state.kind === "error") {
    const msg =
      "error" in state.error && typeof state.error.error === "string"
        ? state.error.error
        : "Could not parse strategy";
    return (
      <div className="error-card">
        <strong>Parse failed</strong> — {msg}
      </div>
    );
  }

  const { parsed, latencyMs, model } = state.data;

  return (
    <div className="parse-cards">
      <div className="card">
        <div className="card-label">
          Trigger
          {parsed.trigger.conditions.length > 1 && (
            <span className="combinator-badge">{parsed.trigger.combinator}</span>
          )}
        </div>
        <div className="card-content">
          <div className="condition-list">
            {parsed.trigger.conditions.map((c, i) => (
              <div className="condition-item" key={i}>
                {describeCondition(c)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-label">Action</div>
        <div className="card-content">
          Stake <span className="tag tag-stake">{parsed.action.stakeUsdc} USDC</span>{" "}
          on <span className={parsed.action.outcome === "YES" ? "tag tag-yes" : "tag tag-no"}>{parsed.action.outcome}</span>{" "}
          for <span className="accent">{parsed.action.marketRef}</span>
        </div>
      </div>

      {(parsed.riskLimits.maxLossUsdc || parsed.riskLimits.maxFires || parsed.riskLimits.expiresAt) && (
        <div className="card">
          <div className="card-label">Risk limits</div>
          <div className="card-content">
            {parsed.riskLimits.maxLossUsdc && (
              <div>
                Stop if loss exceeds <span className="accent">{parsed.riskLimits.maxLossUsdc} USDC</span>
              </div>
            )}
            {parsed.riskLimits.maxFires && (
              <div>
                Max fires: <span className="accent">{parsed.riskLimits.maxFires}</span>
              </div>
            )}
            {parsed.riskLimits.expiresAt && (
              <div>
                Expires <span className="accent">{new Date(parsed.riskLimits.expiresAt).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {parsed.notes && (
        <div className="card">
          <div className="card-label">Agent's understanding</div>
          <div className="card-content" style={{ fontStyle: "italic", color: "var(--text-2)" }}>
            "{parsed.notes}"
          </div>
        </div>
      )}

      <div className="meta-row">
        <span>⚡ {latencyMs}ms</span>
        <span>·</span>
        <span>{model}</span>
        <span>·</span>
        <span>schema-locked via tool-use</span>
      </div>
    </div>
  );
}
