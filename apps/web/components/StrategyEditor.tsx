"use client";

import { useEffect, useRef, useState } from "react";
import { parseStrategy, type ParseSuccess, type ParseFailure } from "@/lib/api";
import { ParsePreview } from "./ParsePreview";

type ParseState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: ParseSuccess }
  | { kind: "error"; error: ParseFailure | { error: string } };

const EXAMPLES = [
  "If France wins their next match and Mbappe scores, stake 50 USDC on YES for France reaches the final. Stop if I lose more than 200 USDC.",
  "Stake 25 USDC on YES if Argentina beats Brazil",
  "If Messi scores in their next match, stake 100 USDC on YES that Argentina wins the cup",
  "Bet 20 USDC NO that England wins the tournament if they lose their group stage opener",
];

export function StrategyEditor() {
  const [text, setText] = useState("");
  const [state, setState] = useState<ParseState>({ kind: "idle" });
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced parse — fires 600ms after the user stops typing. The /strategies/parse
  // endpoint is stateless, so we can throw old in-flight requests away freely.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    const trimmed = text.trim();
    if (trimmed.length < 8) {
      setState({ kind: "idle" });
      return;
    }

    setState({ kind: "loading" });

    debounceRef.current = setTimeout(async () => {
      const ctl = new AbortController();
      abortRef.current = ctl;
      try {
        const result = await parseStrategy(trimmed, ctl.signal);
        if (ctl.signal.aborted) return;
        if (result.ok) {
          setState({ kind: "success", data: result });
        } else {
          setState({ kind: "error", error: result });
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setState({
          kind: "error",
          error: { error: (err as Error)?.message ?? "network error — is the API running on :4000?" },
        });
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text]);

  const canDeploy = state.kind === "success";

  return (
    <div className="editor-grid" id="editor">
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Your Strategy</span>
          <span className="panel-status">{text.length}/1000</span>
        </div>
        <textarea
          className="strategy-input"
          placeholder="Tell your agent what to bet on. e.g. 'If France wins their next match and Mbappe scores, stake 50 USDC on YES for France reaches the final…'"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
        />
        <div className="examples">
          {EXAMPLES.map((ex, i) => (
            <button key={i} className="example-chip" onClick={() => setText(ex)}>
              Try example {i + 1}
            </button>
          ))}
        </div>
        <div className="deploy-row">
          <span className="deploy-meta">
            {canDeploy ? "Ready to deploy on X Layer testnet" : "Strategy will be parsed before deploy"}
          </span>
          <button className="btn btn-primary" disabled={!canDeploy}>
            Deploy Agent →
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Parsed Rules</span>
          <span className="panel-status">
            {state.kind === "loading" && "parsing…"}
            {state.kind === "success" && (
              <>
                <span style={{ color: "var(--success)" }}>●</span> ready
              </>
            )}
            {state.kind === "error" && <span style={{ color: "var(--error)" }}>● error</span>}
            {state.kind === "idle" && "awaiting input"}
          </span>
        </div>
        <ParsePreview state={state} />
      </div>
    </div>
  );
}
