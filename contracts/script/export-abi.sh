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
cat > "${OUT_DIR}/index.js" <<'EOF'
import XCupMarketAbi from "./XCupMarket.abi.json" with { type: "json" };
import MockUSDCAbi from "./MockUSDC.abi.json" with { type: "json" };
export { XCupMarketAbi, MockUSDCAbi };
EOF

cat > "${OUT_DIR}/index.d.ts" <<'EOF'
export declare const XCupMarketAbi: readonly unknown[];
export declare const MockUSDCAbi: readonly unknown[];
EOF

echo "ABI export complete."
