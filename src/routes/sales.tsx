import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { AppShell, StatCard } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { actions, useAppState } from "@/lib/store";
import { fmtNum, fmtRs, summarize, reconcileAll, type Sale } from "@/lib/stock";

export const Route = createFileRoute("/sales")({
  head: () => ({
    meta: [
      { title: "Unposted Sales — Westpoint Stock Audit" },
      {
        name: "description",
        content: "Record items that were sold but not yet posted in the computer, so they are not counted as shortage.",
      },
      { property: "og:title", content: "Unposted Sales — Westpoint Stock Audit" },
      {
        property: "og:description",
        content: "Keep a separate list of sold items to post as sales in the computer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalesPage,
});

const today = () => new Date().toISOString().slice(0, 10);

function SalesPage() {
  const { items, sales } = useAppState();
  const s = useMemo(() => summarize(reconcileAll(items, sales), sales), [items, sales]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState<string>("");
  const [qty, setQty] = useState("1");
  const [saleRate, setSaleRate] = useState("");
  const [date, setDate] = useState(today());
  const [billNo, setBillNo] = useState("");
  const [note, setNote] = useState("");
  const qtyRef = useRef<HTMLInputElement>(null);

  const selected = itemId ? byId.get(itemId) : undefined;

  const submit = () => {
    if (!selected) { toast.error("Please choose an item."); return; }
    const q = Number(qty);
    if (!Number.isInteger(q) || q <= 0) { toast.error("Quantity must be a whole number above 0."); return; }
    const r = saleRate.trim() === "" ? selected.rate : Number(saleRate);
    if (!Number.isFinite(r) || r < 0) { toast.error("Sale rate must be 0 or more."); return; }
    const sale: Omit<Sale, "id"> = { itemId: selected.id, qty: q, saleRate: r, date };
    if (billNo.trim()) sale.billNo = billNo.trim();
    if (note.trim()) sale.note = note.trim();
    actions.addSale(sale);
    toast.success(`${q} × ${selected.description} added to sales`);
    setItemId("");
    setQty("1");
    setSaleRate("");
    setNote("");
    setOpen(true);
  };

  // Group per item for the posting summary
  const perItem = useMemo(() => {
    const m = new Map<string, { qty: number; amount: number }>();
    for (const x of sales) {
      const cur = m.get(x.itemId) ?? { qty: 0, amount: 0 };
      cur.qty += x.qty;
      cur.amount += x.qty * x.saleRate;
      m.set(x.itemId, cur);
    }
    return [...m.entries()]
      .map(([id, v]) => ({ item: byId.get(id), ...v }))
      .filter((x) => x.item)
      .sort((a, b) => (a.item!.description < b.item!.description ? -1 : 1));
  }, [sales, byId]);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Unposted sales</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Add items that were sold but are <strong>not yet entered as sale in the computer</strong>. These are
          subtracted from computer stock so they don't show as shortage. Post them as sales in the computer later.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sale entries" value={fmtNum(sales.length)} />
        <StatCard label="Pieces sold" value={fmtNum(s.soldQty)} />
        <StatCard label="Cost value" value={fmtRs(s.soldCostValue)} />
        <StatCard label="Sale amount" tone="ink" value={fmtRs(s.soldSaleValue)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <form
          className="h-fit rounded-lg border border-border bg-card p-5 shadow-card"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <h2 className="mb-4 text-lg font-semibold">Add sale</h2>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Item</Label>
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="justify-between font-normal">
                    <span className="truncate">{selected ? selected.description : "Choose item…"}</span>
                    <ChevronsUpDown className="opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[340px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search item…" />
                    <CommandList>
                      <CommandEmpty>No item found.</CommandEmpty>
                      <CommandGroup>
                        {items.map((i) => (
                          <CommandItem
                            key={i.id}
                            value={`${i.description} ${i.id}`}
                            onSelect={() => {
                              setItemId(i.id);
                              setSaleRate(String(i.rate));
                              setOpen(false);
                              setTimeout(() => qtyRef.current?.select(), 50);
                            }}
                          >
                            <Check className={`size-4 ${itemId === i.id ? "opacity-100" : "opacity-0"}`} />
                            <span className="flex-1 truncate">{i.description}</span>
                            <span className="num text-xs text-muted-foreground">{i.inHand} in hand</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selected && (
                <p className="num text-xs text-muted-foreground">
                  In hand {selected.inHand} · Computer {selected.computer ?? "—"} · Cost {fmtRs(selected.rate)}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="qty">Quantity</Label>
                <Input ref={qtyRef} id="qty" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="srate">Sale rate (Rs)</Label>
                <Input id="srate" type="number" min={0} value={saleRate} onChange={(e) => setSaleRate(e.target.value)} placeholder="Cost rate" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bill">Bill no.</Label>
                <Input id="bill" value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="note">Customer / note</Label>
              <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </div>
            <Button type="submit">
              <Plus /> Add to sales
            </Button>
          </div>
        </form>

        <div className="grid gap-6">
          <div className="rounded-lg border border-border bg-card shadow-card">
            <div className="border-b border-border p-4">
              <h2 className="text-lg font-semibold">Sale entries</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Bill</th>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Note</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sales.map((x) => (
                    <tr key={x.id} className="border-b border-border/70">
                      <td className="num px-3 py-2 text-xs">{x.date}</td>
                      <td className="px-3 py-2 text-xs">{x.billNo ?? ""}</td>
                      <td className="px-3 py-2 font-medium">{byId.get(x.itemId)?.description ?? "Deleted item"}</td>
                      <td className="num px-3 py-2 text-right">{fmtNum(x.qty)}</td>
                      <td className="num px-3 py-2 text-right">{fmtNum(x.saleRate)}</td>
                      <td className="num px-3 py-2 text-right font-semibold">{fmtNum(x.qty * x.saleRate)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{x.note ?? ""}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          title="Delete"
                          className="rounded p-1 text-muted-foreground hover:bg-short-soft hover:text-short"
                          onClick={() => {
                            actions.deleteSale(x.id);
                            toast.success("Sale removed");
                          }}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {sales.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">
                        No sales added yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {perItem.length > 0 && (
            <div className="rounded-lg border border-border bg-card shadow-card">
              <div className="border-b border-border p-4">
                <h2 className="text-lg font-semibold">To post in computer (item-wise)</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-secondary text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {perItem.map((p) => (
                    <tr key={p.item!.id} className="border-b border-border/70">
                      <td className="px-3 py-2 font-medium">{p.item!.description}</td>
                      <td className="num px-3 py-2 text-right">{fmtNum(p.qty)}</td>
                      <td className="num px-3 py-2 text-right">{fmtNum(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
