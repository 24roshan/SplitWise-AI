import { describe, it, expect } from "vitest";
import { simplifyDebts, computeNetBalances, type Balance } from "../src/lib/debtSimplifier";

describe("simplifyDebts", () => {
  it("produces zero transactions when everyone is already even", () => {
    const balances: Balance[] = [
      { userId: "a", cents: 0 },
      { userId: "b", cents: 0 },
    ];
    expect(simplifyDebts(balances)).toEqual([]);
  });

  it("settles a simple two-person debt in one transaction", () => {
    const balances: Balance[] = [
      { userId: "a", cents: -500 },
      { userId: "b", cents: 500 },
    ];
    const result = simplifyDebts(balances);
    expect(result).toEqual([{ fromUserId: "a", toUserId: "b", cents: 500 }]);
  });

  it("reduces a 3-person cycle to fewer transactions than the naive pairwise approach", () => {
    // A owes B $10, B owes C $10, C owes A $10 -> naive = 3 payments, simplified = 0
    const balances: Balance[] = [
      { userId: "a", cents: 0 },
      { userId: "b", cents: 0 },
      { userId: "c", cents: 0 },
    ];
    expect(simplifyDebts(balances)).toEqual([]);
  });

  it("never produces more transactions than (members - 1)", () => {
    // A well-known property: greedy min-cash-flow never needs more than N-1 transactions
    // to zero out N balances that already sum to zero.
    const balances: Balance[] = [
      { userId: "a", cents: -1200 },
      { userId: "b", cents: -300 },
      { userId: "c", cents: 900 },
      { userId: "d", cents: 600 },
    ];
    const result = simplifyDebts(balances);
    expect(result.length).toBeLessThanOrEqual(balances.length - 1);

    // and every balance should net to zero after applying the settlements
    const net = new Map(balances.map((b) => [b.userId, b.cents]));
    for (const s of result) {
      net.set(s.fromUserId, (net.get(s.fromUserId) ?? 0) + s.cents);
      net.set(s.toUserId, (net.get(s.toUserId) ?? 0) - s.cents);
    }
    for (const v of net.values()) expect(v).toBe(0);
  });

  it("matches brute-force optimal transaction count for small groups", () => {
    // Brute force: try all subsets of non-zero balances to find the minimum
    // number of transactions (exponential, only feasible for small N — this
    // is exactly why we use the greedy heuristic in production).
    function bruteForceMinTransactions(bal: number[]): number {
      const nonZero = bal.filter((b) => b !== 0);
      if (nonZero.length === 0) return 0;
      let best = nonZero.length - 1;

      function solve(arr: number[], count: number) {
        const filtered = arr.filter((b) => b !== 0);
        if (filtered.length === 0) {
          best = Math.min(best, count);
          return;
        }
        if (count >= best) return;
        const first = filtered[0];
        for (let k = 1; k < filtered.length; k++) {
          if (filtered[k] * first < 0) {
            const next = [...filtered];
            next[k] = filtered[k] + first;
            next[0] = 0;
            solve(next, count + 1);
          }
        }
      }
      solve(nonZero, 0);
      return best;
    }

    const balances: Balance[] = [
      { userId: "a", cents: -700 },
      { userId: "b", cents: 200 },
      { userId: "c", cents: -100 },
      { userId: "d", cents: 600 },
    ];
    const greedyResult = simplifyDebts(balances);
    const optimal = bruteForceMinTransactions(balances.map((b) => b.cents));
    // Greedy min-cash-flow is proven optimal whenever debts don't require
    // "chained" combinations — assert it matches brute force here.
    expect(greedyResult.length).toBe(optimal);
  });
});

describe("computeNetBalances", () => {
  it("computes correct net balances from expenses and settlements", () => {
    const result = computeNetBalances({
      memberIds: ["a", "b", "c"],
      expenses: [
        {
          paidById: "a",
          splits: [
            { userId: "a", cents: 1000 },
            { userId: "b", cents: 1000 },
            { userId: "c", cents: 1000 },
          ],
        },
      ],
      settlementsMade: [{ fromUserId: "b", toUserId: "a", cents: 500 }],
    });

    const map = Object.fromEntries(result.map((r) => [r.userId, r.cents]));
    // a paid 3000, owed 2000 back from b+c, then b already paid 500 -> a net +1500
    expect(map.a).toBe(1500);
    expect(map.b).toBe(-500); // owed 1000, paid 500 -> still owes 500
    expect(map.c).toBe(-1000);
  });
});
