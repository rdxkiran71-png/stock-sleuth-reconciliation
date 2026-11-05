import { useSyncExternalStore } from "react";
import seed from "@/data/westpoint-items.json";
import type { ReportMeta, Sale, StockItem } from "./stock";

export interface AppState {
  items: StockItem[];
  sales: Sale[];
  meta: ReportMeta;
}

const STORAGE_KEY = "westpoint-stock-audit-v1";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function seedState(): AppState {
  return {
    items: (seed as { description: string; inHand: number; rate: number }[]).map((s, i) => ({
      id: `i${i + 1}`,
      description: s.description,
      inHand: s.inHand,
      rate: s.rate,
      computer: null,
    })),
    sales: [],
    meta: { storeName: "Westpoint", countDate: today(), preparedBy: "", checkedBy: "" },
  };
}

const SERVER_STATE = seedState();
let state: AppState | null = null;
const listeners = new Set<() => void>();

function load(): AppState {
  if (state) return state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (Array.isArray(parsed.items) && Array.isArray(parsed.sales)) {
        state = { ...seedState(), ...parsed, meta: { ...seedState().meta, ...parsed.meta } };
        return state;
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  state = seedState();
  return state;
}

function setState(next: AppState) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage full */
  }
  listeners.forEach((l) => l());
}

function update(fn: (s: AppState) => AppState) {
  setState(fn(load()));
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, load, () => SERVER_STATE);
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const actions = {
  setComputer(id: string, computer: number | null) {
    update((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === id ? { ...i, computer } : i)),
    }));
  },
  updateItem(id: string, patch: Partial<Omit<StockItem, "id">>) {
    update((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));
  },
  addItem(item: Omit<StockItem, "id">) {
    update((s) => ({ ...s, items: [...s.items, { ...item, id: uid() }] }));
  },
  deleteItem(id: string) {
    update((s) => ({
      ...s,
      items: s.items.filter((i) => i.id !== id),
      sales: s.sales.filter((x) => x.itemId !== id),
    }));
  },
  fillPendingWithInHand() {
    update((s) => ({
      ...s,
      items: s.items.map((i) => (i.computer === null ? { ...i, computer: i.inHand } : i)),
    }));
  },
  clearComputer() {
    update((s) => ({ ...s, items: s.items.map((i) => ({ ...i, computer: null })) }));
  },
  addSale(sale: Omit<Sale, "id">) {
    update((s) => ({ ...s, sales: [{ ...sale, id: uid() }, ...s.sales] }));
  },
  deleteSale(id: string) {
    update((s) => ({ ...s, sales: s.sales.filter((x) => x.id !== id) }));
  },
  setMeta(patch: Partial<ReportMeta>) {
    update((s) => ({ ...s, meta: { ...s.meta, ...patch } }));
  },
  replaceAll(next: AppState) {
    setState(next);
  },
  resetAll() {
    setState(seedState());
  },
};

export function exportBackup() {
  const data = JSON.stringify(load(), null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `stock-audit-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function parseBackup(text: string): AppState {
  const parsed = JSON.parse(text);
  if (parsed && Array.isArray(parsed.items) && Array.isArray(parsed.sales)) {
    return { ...seedState(), ...parsed, meta: { ...seedState().meta, ...parsed.meta } };
  }
  throw new Error("This file is not a valid stock audit backup.");
}
