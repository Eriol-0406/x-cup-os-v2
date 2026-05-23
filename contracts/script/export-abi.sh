#!/usr/bin/env bash
# Export ABIs from forge build artifacts into packages/abi/ for cross-workspace consumption.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(cd .. && pwd)"
OUT_DIR="$ROOT/packages/abi"

forge build --silent

for contract in XCupMarket MockUSDC; do
  jq '.abi' "out/${contract}.sol/${contract}.json" > "${OUT_DIR}/${contract}.abi.json"
  echo "exported ${contract} → packages/abi/${contract}.abi.json"
done

# Generate an index.js so consumers can `import { XCupMarketAbi } from '@x-cup/abi'`
# NOTE: index.js and index.d.ts are hand-maintained (they also export
# addresses.json which is populated by the deploy script, not by forge build).
# We do NOT regenerate them here — that would clobber the addresses export.

echo "ABI export complete."
