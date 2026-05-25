"use client";

import { useState } from "react";
import { createPredictionMarket } from "@/lib/api";
import { useWallet } from "./WalletProvider";

type Category = "Tournament" | "Player" | "Special";
type State =
  | { kind: "idle" }
  | { kind: "open" }
  | { kind: "creating" }
  | { kind: "done"; slug: string; marketId: number }
  | { kind: "error"; message: string };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function CreatePredictionForm({ onCreated }: { onCreated: () => void }) {
  const { state: walletState, connect } = useWallet();
  const [state, setState] = useState<State>({ kind: "idle" });

  // Form fields
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState<Category>("Tournament");
  const [isPrivate, setIsPrivate] = useState(false);
  const [allowlist, setAllowlist] = useState("");

  const reset = () => {
    setQuestion("");
    setCategory("Tournament");
    setIsPrivate(false);
    setAllowlist("");
    setState({ kind: "idle" });
  };

  const onSubmit = async () => {
    if (walletState.kind !== "connected") {
      void connect();
      return;
    }
    if (question.trim().length < 8) {
      setState({ kind: "error", message: "Question must be at least 8 characters" });
      return;
    }
    const slug = slugify(question) || `pred-${Date.now()}`;
    const addresses = allowlist
      .split(/[,\s\n]+/)
      .map((a) => a.trim())
      .filter((a) => /^0x[a-fA-F0-9]{40}$/.test(a));
    if (isPrivate && addresses.length === 0) {
      // Default friend-only to just the creator
      addresses.push(walletState.address);
    }

    setState({ kind: "creating" });
    try {
      const result = await createPredictionMarket({
        slug,
        question: question.trim(),
        category,
        isPrivate,
        allowlist: addresses,
      });
      if (!result.ok) {
        setState({ kind: "error", message: result.error ?? "Create failed" });
        return;
      }
      setState({ kind: "done", slug, marketId: result.market!.marketId });
      onCreated();
    } catch (err: any) {
      setState({ kind: "error", message: err?.message ?? "Create failed" });
    }
  };

  if (state.kind === "idle") {
    return (
      <button className="btn btn-primary" onClick={() => setState({ kind: "open" })} style={{ marginBottom: 16 }}>
        + Create your own prediction
      </button>
    );
  }

  return (
    <div className="create-prediction-card">
      <div className="create-prediction-header">
        <strong>Create a new prediction market</strong>
        <button className="tourney-cancel" onClick={reset}>close</button>
      </div>

      {state.kind === "done" ? (
        <div className="create-prediction-success">
          ✓ Market deployed on-chain as <code>M#{state.marketId}</code> (slug: <code>{state.slug}</code>)
          <button className="btn btn-primary" onClick={reset} style={{ marginTop: 12 }}>
            Create another
          </button>
        </div>
      ) : (
        <>
          <label className="create-prediction-label">
            Question (yes/no)
            <input
              type="text"
              maxLength={280}
              placeholder='e.g. "Will Brazil reach the final?"'
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="strategy-input"
              style={{ minHeight: 36, padding: "8px 12px", marginTop: 4 }}
            />
          </label>

          <label className="create-prediction-label">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="strategy-input"
              style={{ minHeight: 36, padding: "8px 12px", marginTop: 4 }}
            >
              <option value="Tournament">Tournament</option>
              <option value="Player">Player</option>
              <option value="Special">Special</option>
            </select>
          </label>

          <label className="create-prediction-checkbox-row">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            <span>🔒 Friend-only — restrict to the allowlist below</span>
          </label>

          {isPrivate && (
            <label className="create-prediction-label">
              Allowed wallet addresses (comma or newline-separated)
              <textarea
                value={allowlist}
                onChange={(e) => setAllowlist(e.target.value)}
                placeholder={`0x...\n0x...\nLeave empty to default to your own address only`}
                className="strategy-input"
                rows={3}
                style={{ marginTop: 4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11 }}
              />
            </label>
          )}

          {state.kind === "error" && (
            <div style={{ fontSize: 12, color: "var(--error)" }}>✗ {state.message}</div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="btn btn-primary"
              onClick={onSubmit}
              disabled={state.kind === "creating"}
            >
              {state.kind === "creating" ? "Deploying on-chain…" : "Deploy market"}
            </button>
            <button className="btn" onClick={reset}>Cancel</button>
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>
              Costs ~0.00005 OKB to create the on-chain market
            </span>
          </div>
        </>
      )}
    </div>
  );
}
