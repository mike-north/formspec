// Fixtures for type alias constraint propagation tests.

// --- 2-level chain: Integer → Percentage → field ---

/** @multipleOf 1 */
type Integer = number;

/** @minimum 0 @maximum 100 */
type Percentage = Integer;

export class TwoLevelChain {
  /** @minimum 10 */
  cpuUsage!: Percentage;
  memoryUsage!: Percentage;
}

// --- 3-level chain: Base → Mid → Leaf → field ---

/** @minimum 0 */
type Base = number;

/** @maximum 1000 */
type Mid = Base;

/** @multipleOf 5 */
type Leaf = Mid;

export class ThreeLevelChain {
  value!: Leaf;
}

// --- No alias: field uses a primitive directly ---

export class NoAlias {
  /** @minimum 0 */
  count!: number;
}

// --- 10-level alias chain: exceeds MAX_ALIAS_CHAIN_DEPTH (8) ---
// The field references D9 (depth 0). Following the chain:
// D9→D8 (1) → D7 (2) → D6 (3) → D5 (4) → D4 (5) → D3 (6) → D2 (7) → D1 (8, throws)
// D1 is still a type reference to D0, so the depth-8 check fires before resolving it.

type D0 = number;
type D1 = D0;
type D2 = D1;
type D3 = D2;
type D4 = D3;
type D5 = D4;
type D6 = D5;
type D7 = D6;
type D8 = D7;
type D9 = D8;

export class ExceedsMaxDepth {
  value!: D9;
}
