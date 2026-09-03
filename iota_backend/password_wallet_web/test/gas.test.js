// The gas budget must scale with blob size. A flat budget large enough for a
// 16 KB recipe would be wasteful for a 200-byte todo item, and a flat budget
// sized for todo items silently fails on recipes.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BASE_GAS_BUDGET, gasBudgetForBytes } from '../src/app/gas.js';

// Measured by dry-running recipe::create on testnet, 2026-09-03
// (computation + storage, no rebate):
const MEASURED_16000 = 124_872_400;
const MEASURED_16340 = 127_456_400;

test('a small payload keeps the historical flat budget', () => {
  // Todo items are tens of bytes; their budget must not jump, or an account
  // with little gas left could no longer tick a checkbox.
  assert.equal(gasBudgetForBytes(0), BASE_GAS_BUDGET);
  assert.ok(gasBudgetForBytes(200) < BASE_GAS_BUDGET * 1.1);
});

test('a max-size recipe gets a budget above its measured cost', () => {
  assert.ok(
    gasBudgetForBytes(16_000) > MEASURED_16000,
    `budget ${gasBudgetForBytes(16_000)} must exceed measured ${MEASURED_16000}`,
  );
});

test('a payload at the protocol argument limit gets a budget above its cost', () => {
  assert.ok(
    gasBudgetForBytes(16_340) > MEASURED_16340,
    `budget ${gasBudgetForBytes(16_340)} must exceed measured ${MEASURED_16340}`,
  );
});

test('the budget grows with payload size', () => {
  assert.ok(gasBudgetForBytes(16_000) > gasBudgetForBytes(1_000));
  assert.ok(gasBudgetForBytes(1_000) > gasBudgetForBytes(0));
});

test('the budget is a whole number of nanos', () => {
  for (const bytes of [0, 1, 999, 16_000]) {
    assert.equal(Number.isInteger(gasBudgetForBytes(bytes)), true);
  }
});

test('a missing or junk size falls back to the base budget', () => {
  assert.equal(gasBudgetForBytes(undefined), BASE_GAS_BUDGET);
  assert.equal(gasBudgetForBytes(-5), BASE_GAS_BUDGET);
});
