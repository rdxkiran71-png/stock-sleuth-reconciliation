import { createFileRoute } from "@tanstack/react-router";
import { memo, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CopyCheck, Download, Equal, Pencil, Plus, RotateCcw, Search, Upload } from "lucide-react";
import { AppShell, StatCard } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { ItemDialog } from "@/components/ItemDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actions, exportBackup, parseBackup, useAppState } from "@/lib/store";
import {
  fmtNum,
  fmtRs,
  fmtSigned,
  reconcileAll,
  summarize,
  type ReconciledItem,
  type Status,
  type StockItem,
} from "@/lib/stock";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stock Entry — Westpoint Stock Audit" },
      {
        name: "description",
        content: "Enter computer stock against physically counted stock and see shortages and excess instantly.",
      },
      { property: "og:title", content: "Stock Entry — Westpoint Stock Audit" },
      {
        property: "og:description",
        content: "Compare in-hand stock with computer stock, item by item.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StockEntryPage,
});

type Filter = "all" | Status;
const filters: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "short", label: "Short" },
  { key: "excess", label: "Excess" },
  { key: "matched", label: "Matched" },
];

function focusRow(idx: number) {
  const el = document.querySelector<HTMLInputElement>(`[data-cinput="${idx}"]`);
  if (el) {
    el.focus();
    el.select();
  }
}

const Row = memo(function Row({
  r,
  idx,
  serial,
  onEdit,
}: {
  r: ReconciledItem;
  idx: number;
  serial: number;
  onEdit: (item: StockItem) => void;
}) {
  const rowTone =
    r.status === "short" ? "bg-short-soft/60" : r.status === "excess" ? "bg-excess-soft/60" : "";
  return (
    <tr className={`border-b border-border/70 hover:bg-secondary/50 ${rowTone}`}>
      <td className="num px-2 py-1.5 text-xs text-muted-foreground">{serial}</td>
      <td className="px-2 py-1.5 font-medium">{r.description}</td>
      <td className="num px-2 py-1.5 text-right text-muted-foreground">{fmtNum(r.rate)}</td>
      <td className="num px-2 py-1.5 text-right font-semibold">{fmtNum(r.inHand)}</td>
      <td className="px-2 py-1">
        <div className="flex items-center justify-end gap-1">
          <input
            data-cinput={idx}
            type="number"
            inputMode="numeric"
            min={0}
            value={r.computer ?? ""}
            placeholder="—"
            aria-label={`Computer qty for ${r.description}`}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const v = e.target.value;
              actions.setComputer(r.id, v === "" ? null : Math.max(0, Math.floor(Number(v))));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "ArrowDown") {
                e.preventDefault();
                focusRow(idx + 1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                focusRow(idx - 1);
              } else if (e.key === "=") {
                e.preventDefault();
                actions.setComputer(r.id, r.inHand);
                focusRow(idx + 1);
              }
            }}
            className="num h-8 w-20 rounded-md border border-input bg-paper px-2 text-right text-sm font-semibold outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/30"
          />
          <button
            type="button"
            title="Same as in hand"
            onClick={() => actions.setComputer(r.id, r.inHand)}
            className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-primary"
          >
            <Equal className="size-3.5" />
          </button>
        </div>
      </td>
      <td className="num px-2 py-1.5 text-right text-muted-foreground">{r.sold ? fmtNum(r.sold) : ""}</td>
      <td
        className={`num px-2 py-1.5 text-right font-semibold ${
          r.diff < 0 ? "text-short" : r.diff > 0 ? "text-excess" : "text-muted-foreground"
        }`}
      >
        {r.status === "pending" ? "" : fmtSigned(r.diff)}
      </td>
      <td
        className={`num px-2 py-1.5 text-right ${
          r.diff < 0 ? "text-short" : r.diff > 0 ? "text-excess" : "text-muted-foreground"
        }`}
      >
        {r.status === "pending" || r.diff === 0 ? "" : fmtSigned(r.diffValue)}
      </td>
      <td className="px-2 py-1.5">
        <StatusBadge status={r.status} />
      </td>
      <td className="px-1 py-1.5">
        <button
          type="button"
          title="Edit item"
          onClick={() => onEdit(r)}
          className="rounded p-1 text-muted-foreground transition hover:bg-secondary hover:text-primary"
        >
          <Pencil className="size-3.5" />
        </button>
      </td>
    </tr>
  );
});

function StockEntryPage() {
  const { items, sales } = useAppState();
  const rows = useMemo(() => reconcileAll(items, sales), [items, sales]);
  const s = useMemo(() => summarize(rows, sales), [rows, sales]);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StockItem | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, pending: 0, short: 0, excess: 0, matched: 0 };
    rows.forEach((r) => c[r.status]++);
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows
      .map((r, i) => ({ r, serial: i + 1 }))
      .filter(({ r }) => (filter === "all" || r.status === filter) && (!term || r.description.toLowerCase().includes(term)));
  }, [rows, filter, q]);

  const onEdit = useMemo(
    () => (item: StockItem) => {
      setEditing(item);
      setDialogOpen(true);
    },
    [],
  );

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Stock entry</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Type the quantity showing in the <strong>computer</strong> for each item. Press{" "}
            <kbd className="num rounded border bg-paper px-1">Enter</kbd> to jump to the next item, or{" "}
            <kbd className="num rounded border bg-paper px-1">=</kbd> if it is the same as in hand.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus /> Add item
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={counts.pending === 0}
            onClick={() => {
              if (
                confirm(
                  `Set computer qty = in-hand qty for all ${counts.pending} pending items? Only do this if those items match in the computer.`,
                )
              ) {
                actions.fillPendingWithInHand();
                toast.success("Pending items filled");
              }
            }}
          >
            <CopyCheck /> Fill pending = in hand
          </Button>
          <Button variant="outline" size="sm" onClick={exportBackup}>
            <Download /> Backup
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload /> Restore
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => {
              if (confirm("Reset everything back to the original list? All computer entries and sales will be cleared.")) {
                actions.resetAll();
                toast.success("Reset to original list");
              }
            }}
          >
            <RotateCcw /> Reset
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                actions.replaceAll(parseBackup(await f.text()));
                toast.success("Backup restored");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not read file");
              }
            }}
          />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="In hand value" value={fmtRs(s.inHandValue)} sub={`${fmtNum(s.inHandQty)} pcs`} />
        <StatCard
          label="Computer value"
          value={fmtRs(s.computerValue)}
          sub={`${fmtNum(s.computerQty)} pcs · ${s.enteredItems} items entered`}
        />
        <StatCard label="Shortage (loss)" tone="short" value={fmtRs(s.shortValue)} sub={`${fmtNum(s.shortQty)} pcs · ${s.shortItems} items`} />
        <StatCard label="Excess in hand" tone="excess" value={fmtRs(s.excessValue)} sub={`${fmtNum(s.excessQty)} pcs · ${s.excessItems} items`} />
        <StatCard
          label={s.netValue < 0 ? "Net loss" : "Net gain"}
          tone="ink"
          value={fmtRs(Math.abs(s.netValue))}
          sub={`after ${fmtNum(s.soldQty)} pcs unposted sales`}
        />
      </div>

      <div className="rounded-lg border border-border bg-card shadow-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <div className="flex flex-wrap gap-1">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  filter === f.key ? "bg-primary text-primary-foreground" : "hover:bg-secondary"
                }`}
              >
                {f.label} <span className="num ml-1 text-xs opacity-70">{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item…" className="pl-8" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-[57px] z-10 bg-secondary text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2 text-right">Rate</th>
                <th className="px-2 py-2 text-right">In hand</th>
                <th className="px-2 py-2 text-right">Computer qty</th>
                <th className="px-2 py-2 text-right">Unposted sold</th>
                <th className="px-2 py-2 text-right">Diff qty</th>
                <th className="px-2 py-2 text-right">Diff value</th>
                <th className="px-2 py-2">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map(({ r, serial }, idx) => (
                <Row key={r.id} r={r} idx={idx} serial={serial} onEdit={onEdit} />
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    No items here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border p-3 text-xs text-muted-foreground">
          Diff qty = In hand − (Computer qty − Unposted sold). Minus means stock is short (loss), plus means
          extra stock in hand.
        </p>
      </div>

      <ItemDialog open={dialogOpen} onOpenChange={setDialogOpen} item={editing} />
    </AppShell>
  );
}
