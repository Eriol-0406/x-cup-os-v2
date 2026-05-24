"use client";

import type { FixtureStatusFilter } from "@/lib/api";

interface Props {
  current: FixtureStatusFilter;
  onChange: (f: FixtureStatusFilter) => void;
  counts: Record<FixtureStatusFilter, number>;
}

const OPTIONS: { value: FixtureStatusFilter; label: string; icon: string }[] = [
  { value: "all", label: "All", icon: "" },
  { value: "live", label: "Live", icon: "●" },
  { value: "upcoming", label: "Upcoming", icon: "" },
  { value: "finished", label: "Finished", icon: "" },
];

export function MarketFilter({ current, onChange, counts }: Props) {
  return (
    <div className="filter-pills">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          className={`filter-pill${current === o.value ? " filter-pill-active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.icon && (
            <span
              className="filter-pill-icon"
              style={{ color: o.value === "live" ? "var(--success)" : undefined }}
            >
              {o.icon}
            </span>
          )}
          <span>{o.label}</span>
          <span className="filter-pill-count">{counts[o.value] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}
