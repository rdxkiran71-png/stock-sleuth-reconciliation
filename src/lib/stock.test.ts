import { describe, expect, it } from "vitest";
import { reconcileItem, reconcileAll, summarize, type StockItem, type Sale } from "./stock";

const item = (over: Partial<StockItem> = {}): StockItem => ({
  id: "a",
  description: "04 CHOPPER",
  inHand: 27,
  rate: 1800,
  computer: 30,
  ...over,
});

describe("stock reconciliation", () => {
  it("computer more than in hand is a shortage costed at rate", () => {
    const r = reconcileItem(item(), 0);
    expect(r.status).toBe("short");
    expect(r.diff).toBe(-3);
    expect(r.diffValue).toBe(-5400);
  });

  it("unposted sales are removed from computer stock before comparing", () => {
    const r = reconcileItem(item({ computer: 30 }), 3);
    expect(r.computerAfterSales).toBe(27);
    expect(r.status).toBe("matched");
  });

  it("in hand more than computer is an excess", () => {
    const r = reconcileItem(item({ computer: 25 }), 0);
    expect(r.status).toBe("excess");
    expect(r.diff).toBe(2);
  });

  it("item with no computer qty entered stays pending and out of totals", () => {
    const rows = reconcileAll([item({ computer: null })], []);
    expect(rows[0]?.status).toBe("pending");
    expect(summarize(rows, []).shortValue).toBe(0);
  });

  it("net value is excess value minus shortage value", () => {
    const items = [
      item({ id: "a", inHand: 27, rate: 1800, computer: 30 }), // short 3 → 5400
      item({ id: "b", inHand: 12, rate: 1000, computer: 10 }), // excess 2 → 2000
    ];
    const sales: Sale[] = [{ id: "s", itemId: "b", qty: 1, saleRate: 1500, date: "2026-11-05" }];
    // b: computer after sale = 9, in hand 12 → excess 3 → 3000
    const s = summarize(reconcileAll(items, sales), sales);
    expect(s.shortValue).toBe(5400);
    expect(s.excessValue).toBe(3000);
    expect(s.netValue).toBe(-2400);
    expect(s.soldSaleValue).toBe(1500);
  });
});
