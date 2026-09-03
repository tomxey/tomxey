// Gas budgeting for account transactions.
//
// Storage dominates the cost of writing a blob, and it is far more expensive
// than the protocol's `obj_data_cost_refundable` (100) suggests on its own.
// Measured by dry-running `recipe::create` against testnet on 2026-09-03:
//
//   payload 16 000 bytes -> computation 1 000 000 + storage 123 872 400
//   payload 16 340 bytes -> computation 1 000 000 + storage 126 456 400
//
// which is ~7 600 nanos per byte plus a ~3.3 M fixed part — so a 16 KB recipe
// costs ~125 M nanos, two and a half times the flat 50 M budget this app used
// before recipes existed. A flat budget cannot serve both: sized for todo
// items it fails every large recipe, and sized for recipes it demands a
// quarter of an IOTA of gas on hand to tick a checkbox.

/// The budget every transaction gets regardless of size. Unchanged from the
/// pre-recipes value, so todo writes behave exactly as they did.
export const BASE_GAS_BUDGET = 50_000_000;

/// Per-byte allowance, ~30% above the measured ~7 600 nanos/byte so that a
/// protocol gas-price change doesn't immediately start failing writes.
const NANOS_PER_BYTE = 10_000;

/// Budget for a transaction carrying `bytes` of payload. A budget is a cap,
/// not a charge — unused budget is not spent — but the account must hold at
/// least this much, which is why it is not simply set high for everything.
export function gasBudgetForBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return BASE_GAS_BUDGET;
  return BASE_GAS_BUDGET + Math.ceil(bytes) * NANOS_PER_BYTE;
}
