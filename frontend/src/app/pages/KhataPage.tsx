import React, { useMemo, useState } from "react";
import {
  BookOpen, MessageCircle, Search, IndianRupee,
  AlertTriangle, CheckCircle2, Clock, TrendingDown,
  ChevronDown, ChevronRight, Phone, X, Loader2,
} from "lucide-react";
import { useOrders } from "@/hooks/useApi";
import { formatINR, formatDate } from "@/lib/format";
import type { Order } from "@/lib/types";

/* ─── Design Tokens ─── */
const CARD: React.CSSProperties = {
  backgroundColor: "#FFFFFF",
  borderRadius: 16,
  border: "1px solid #E5E7EB",
  boxShadow: "0px 2px 12px rgba(0,0,0,0.07)",
  fontFamily: "'DM Sans', sans-serif",
};
const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 };
const LABEL: React.CSSProperties = {
  fontWeight: 500, fontSize: 11, color: "#6B7280",
  letterSpacing: "0.06em", textTransform: "uppercase" as const,
  fontFamily: "'DM Sans', sans-serif",
};

/* ─── Khata Customer record ─── */
interface KhataCustomer {
  name: string;
  phone: string | null;
  orders: Order[];
  totalCredit: number;
  oldestCreditDate: string | null;
  daysPending: number;
}

function buildKhataData(orders: Order[]): KhataCustomer[] {
  const creditOrders = orders.filter(o => o.status === "credit");
  const map: Record<string, KhataCustomer> = {};

  creditOrders.forEach(o => {
    const name = cleanName(o.customer_name) ?? "Unknown Customer";
    const phone = extractPhone(o.customer_name);
    const key = phone ?? name;

    const orderTotal = o.total ?? o.items.reduce((s, it) => s + (it.price ?? 0) * it.quantity, 0) ?? 0;

    if (!map[key]) {
      map[key] = { name, phone, orders: [], totalCredit: 0, oldestCreditDate: null, daysPending: 0 };
    }
    map[key].orders.push(o);
    map[key].totalCredit += orderTotal;

    const dateStr = o.created_at ?? null;
    if (dateStr && (!map[key].oldestCreditDate || dateStr < map[key].oldestCreditDate!)) {
      map[key].oldestCreditDate = dateStr;
    }
  });

  // compute daysPending
  const now = Date.now();
  Object.values(map).forEach(c => {
    if (c.oldestCreditDate) {
      const d = new Date(c.oldestCreditDate);
      if (!isNaN(d.getTime())) {
        c.daysPending = Math.floor((now - d.getTime()) / 86_400_000);
      }
    }
  });

  return Object.values(map).sort((a, b) => b.totalCredit - a.totalCredit);
}

function cleanName(name: string | null | undefined): string | null {
  if (!name) return null;
  if (name.includes("@c.us") || name.includes("@s.whatsapp.net")) return null;
  if (name.includes("REDACTED") || name === "Customer") return null;
  return name;
}

function extractPhone(name: string | null | undefined): string | null {
  if (!name) return null;
  if (name.includes("@c.us") || name.includes("@s.whatsapp.net")) {
    return name.split("@")[0];
  }
  return null;
}

/* ─── Urgency tag ─── */
function UrgencyTag({ days }: { days: number }) {
  if (days >= 30) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full" style={{ backgroundColor: "#FEF2F2", color: "#D32F2F", fontWeight: 600 }}>
      <AlertTriangle size={9} /> {days}d overdue
    </span>
  );
  if (days >= 7) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full" style={{ backgroundColor: "#FFF8F0", color: "#FF6D00", fontWeight: 600 }}>
      <Clock size={9} /> {days}d pending
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full" style={{ backgroundColor: "#F0FDF4", color: "#059669", fontWeight: 600 }}>
      <CheckCircle2 size={9} /> Recent
    </span>
  );
}

/* ─── WhatsApp Reminder Composer ─── */
function ReminderModal({ customer, onClose }: { customer: KhataCustomer; onClose: () => void }) {
  const defaultMsg = [
    `🙏 Namaste ${customer.name || "ji"},`,
    ``,
    `Aapke khate mein *${formatINR(customer.totalCredit)}* baaki hai.`,
    customer.orders.length === 1
      ? `Iska order ${formatDate(customer.orders[0].created_at)} ko tha.`
      : `${customer.orders.length} orders ka total amount hai.`,
    ``,
    `Jab sawida ho, payment kar dena. 🙏`,
    ``,
    `— Aapka dukandaar`,
  ].join("\n");

  const [msg, setMsg] = useState(defaultMsg);

  const sendWhatsApp = () => {
    const phone = customer.phone?.replace(/\D/g, "") ?? "";
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #E5E7EB", backgroundColor: "#F8F9FA" }}>
          <div className="flex items-center gap-2">
            <div className="w-[32px] h-[32px] flex items-center justify-center rounded-xl" style={{ backgroundColor: "#25D366" }}>
              <MessageCircle size={16} color="#FFFFFF" />
            </div>
            <div>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#0D0F12", display: "block" }}>Send Reminder</span>
              <span className="text-[11px]" style={{ color: "#6B7280" }}>
                {customer.phone ? `+${customer.phone}` : customer.name}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="w-[28px] h-[28px] flex items-center justify-center cursor-pointer" style={{ backgroundColor: "#F3F4F6", borderRadius: 8, border: "none" }}>
            <X size={14} color="#6B7280" />
          </button>
        </div>

        {/* Message editor */}
        <div className="p-5 flex flex-col gap-3">
          {/* WhatsApp preview style */}
          <div className="p-3 rounded-xl" style={{ backgroundColor: "#E7F7EE", border: "1px solid #C3E6CB" }}>
            <span className="text-[10px] block mb-1" style={{ color: "#6B7280", fontWeight: 500 }}>PREVIEW</span>
            <pre className="text-[12px] m-0 whitespace-pre-wrap" style={{ color: "#111318", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>
              {msg}
            </pre>
          </div>

          <textarea
            value={msg}
            onChange={e => setMsg(e.target.value)}
            rows={6}
            className="w-full text-[13px] resize-none outline-none"
            style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: "10px 12px", fontFamily: "'DM Sans', sans-serif", color: "#374151", lineHeight: 1.6 }}
            placeholder="Edit reminder message..."
          />

          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 text-[13px] cursor-pointer rounded-xl" style={{ border: "1px solid #E5E7EB", backgroundColor: "#F8F9FA", color: "#6B7280", fontWeight: 500, fontFamily: "'DM Sans', sans-serif" }}>
              Cancel
            </button>
            <button
              onClick={sendWhatsApp}
              className="flex-1 py-2.5 text-[13px] cursor-pointer rounded-xl flex items-center justify-center gap-2"
              style={{ border: "none", backgroundColor: "#25D366", color: "#FFFFFF", fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
            >
              <MessageCircle size={15} />
              {customer.phone ? "Send on WhatsApp" : "Open WhatsApp"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Customer Row (expandable) ─── */
function CustomerRow({
  customer,
  index,
  onRemind,
}: {
  customer: KhataCustomer;
  index: number;
  onRemind: (c: KhataCustomer) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {/* Main row */}
      <div
        className="grid gap-3 px-6 py-4 items-center cursor-pointer"
        style={{
          gridTemplateColumns: "32px 1fr 120px 100px 100px 160px",
          borderBottom: "1px solid #F3F4F6",
          transition: "background-color 0.1s",
        }}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = "#FAFBFC"}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = expanded ? "#FAFBFC" : "transparent"}
        onClick={() => setExpanded(x => !x)}
      >
        {/* Expand icon */}
        {expanded ? <ChevronDown size={16} color="#6B7280" /> : <ChevronRight size={16} color="#9E9E9E" />}

        {/* Customer name */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[14px]" style={{ fontWeight: 600, color: "#0D0F12" }}>
              {customer.name}
            </span>
            <UrgencyTag days={customer.daysPending} />
          </div>
          {customer.phone && (
            <span className="flex items-center gap-1 text-[11px]" style={{ color: "#6B7280" }}>
              <Phone size={10} /> +{customer.phone}
            </span>
          )}
        </div>

        {/* Amount owed */}
        <span style={{ ...MONO, fontSize: 16, color: "#7C3AED" }}>
          {formatINR(customer.totalCredit)}
        </span>

        {/* Orders count */}
        <span className="text-[13px]" style={{ color: "#6B7280" }}>
          {customer.orders.length} order{customer.orders.length !== 1 ? "s" : ""}
        </span>

        {/* Days pending */}
        <span className="text-[13px]" style={{ color: customer.daysPending >= 30 ? "#D32F2F" : "#6B7280" }}>
          {customer.daysPending > 0 ? `${customer.daysPending}d` : "Today"}
        </span>

        {/* Remind button */}
        <button
          onClick={e => { e.stopPropagation(); onRemind(customer); }}
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] cursor-pointer rounded-lg w-fit"
          style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, color: "#FFFFFF", backgroundColor: "#25D366", border: "none", transition: "background 0.15s" }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = "#1DA851"}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = "#25D366"}
        >
          <MessageCircle size={12} /> Send Reminder
        </button>
      </div>

      {/* Expanded order list */}
      {expanded && (
        <div style={{ backgroundColor: "#FAFBFC", borderBottom: "1px solid #F3F4F6" }}>
          <div className="px-10 py-3">
            <div className="grid gap-2 px-4 py-2 rounded-lg" style={{ gridTemplateColumns: "1fr 140px 100px", backgroundColor: "#F3F4F6" }}>
              {["Items", "Date", "Amount"].map(h => <span key={h} style={LABEL}>{h}</span>)}
            </div>
            {customer.orders.map(o => {
              const total = o.total ?? o.items.reduce((s, it) => s + (it.price ?? 0) * it.quantity, 0) ?? 0;
              const items = o.items.slice(0, 3).map(it => it.product_name).join(", ") + (o.items.length > 3 ? ` +${o.items.length - 3}` : "");
              return (
                <div key={o.id} className="grid gap-2 px-4 py-2.5 items-center" style={{ gridTemplateColumns: "1fr 140px 100px" }}>
                  <span className="text-[12px] truncate" style={{ color: "#374151" }}>{items || "—"}</span>
                  <span className="text-[12px]" style={{ color: "#6B7280" }}>{formatDate(o.created_at)}</span>
                  <span style={{ ...MONO, fontSize: 12, color: "#7C3AED" }}>{formatINR(total)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

/* ──────────────────────────────────────
   MAIN KHATA PAGE
   ────────────────────────────────────── */
export function KhataPage() {
  const { data: apiOrders, loading } = useOrders();
  const [search, setSearch] = useState("");
  const [reminderTarget, setReminderTarget] = useState<KhataCustomer | null>(null);
  const [filterDays, setFilterDays] = useState<"all" | "7" | "30">("all");

  const khataData = useMemo(() => buildKhataData(apiOrders ?? []), [apiOrders]);

  const filtered = khataData.filter(c => {
    const matchSearch = !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? "").includes(search);
    const matchDays = filterDays === "all" || c.daysPending >= parseInt(filterDays);
    return matchSearch && matchDays;
  });

  const totalCredit = khataData.reduce((s, c) => s + c.totalCredit, 0);
  const overdueCount = khataData.filter(c => c.daysPending >= 30).length;
  const pendingCount = khataData.filter(c => c.daysPending >= 7 && c.daysPending < 30).length;

  return (
    <div className="p-6 h-full overflow-y-auto" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <BookOpen size={22} color="#7C3AED" />
            <h1 className="m-0" style={{ fontWeight: 700, fontSize: 24, color: "#0D0F12" }}>Khata Book</h1>
          </div>
          <p className="m-0 text-[13px]" style={{ color: "#6B7280" }}>
            Track credit orders & send payment reminders on WhatsApp.
          </p>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Total Credit Outstanding */}
        <div style={{ ...CARD, backgroundColor: "#FAF5FF", border: "1px solid rgba(124,58,237,0.2)" }} className="p-5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span style={LABEL}>Total Outstanding</span>
            <div className="w-[32px] h-[32px] flex items-center justify-center rounded-xl" style={{ backgroundColor: "rgba(124,58,237,0.1)" }}>
              <IndianRupee size={15} color="#7C3AED" />
            </div>
          </div>
          <span style={{ ...MONO, fontSize: 28, color: "#7C3AED", lineHeight: 1.1 }}>
            {loading ? "…" : formatINR(totalCredit)}
          </span>
          <span className="text-[12px]" style={{ color: "#9CA3AF" }}>
            from {khataData.length} customer{khataData.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Overdue (30+ days) */}
        <div style={{ ...CARD, backgroundColor: overdueCount > 0 ? "#FEF2F2" : "#FFFFFF", border: overdueCount > 0 ? "1px solid rgba(211,47,47,0.2)" : "1px solid #E5E7EB" }} className="p-5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span style={LABEL}>Overdue (30d+)</span>
            <AlertTriangle size={16} color={overdueCount > 0 ? "#D32F2F" : "#9E9E9E"} />
          </div>
          <span style={{ ...MONO, fontSize: 28, color: overdueCount > 0 ? "#D32F2F" : "#9E9E9E", lineHeight: 1.1 }}>
            {loading ? "…" : overdueCount}
          </span>
          <span className="text-[12px]" style={{ color: "#9CA3AF" }}>customers need urgent follow-up</span>
        </div>

        {/* Pending (7–30 days) */}
        <div style={{ ...CARD, backgroundColor: pendingCount > 0 ? "#FFF8F0" : "#FFFFFF", border: pendingCount > 0 ? "1px solid rgba(255,109,0,0.2)" : "1px solid #E5E7EB" }} className="p-5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span style={LABEL}>Pending (7–30d)</span>
            <Clock size={16} color={pendingCount > 0 ? "#FF6D00" : "#9E9E9E"} />
          </div>
          <span style={{ ...MONO, fontSize: 28, color: pendingCount > 0 ? "#FF6D00" : "#9E9E9E", lineHeight: 1.1 }}>
            {loading ? "…" : pendingCount}
          </span>
          <span className="text-[12px]" style={{ color: "#9CA3AF" }}>send a gentle reminder</span>
        </div>
      </div>

      {/* ── Table Card ── */}
      <div style={CARD} className="overflow-hidden">
        {/* Table toolbar */}
        <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ borderBottom: "1px solid #E5E7EB" }}>
          <div className="flex items-center gap-2">
            <span style={{ fontWeight: 600, fontSize: 16, color: "#0D0F12" }}>Credit Customers</span>
            <span className="text-[12px] px-3 py-1 rounded-full" style={{ backgroundColor: "#F3F4F6", color: "#6B7280", fontWeight: 500 }}>
              {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Filter buttons */}
            {[
              { label: "All", value: "all" },
              { label: "7+ days", value: "7" },
              { label: "30+ days", value: "30" },
            ].map(f => (
              <button
                key={f.value}
                onClick={() => setFilterDays(f.value as any)}
                className="px-3 py-1.5 text-[12px] cursor-pointer rounded-lg"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: filterDays === f.value ? 600 : 400,
                  color: filterDays === f.value ? "#7C3AED" : "#6B7280",
                  backgroundColor: filterDays === f.value ? "rgba(124,58,237,0.08)" : "#F8F9FA",
                  border: filterDays === f.value ? "1px solid rgba(124,58,237,0.25)" : "1px solid #E5E7EB",
                  transition: "all 0.15s",
                }}
              >
                {f.label}
              </button>
            ))}

            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: "#F8F9FA", border: "1px solid #E5E7EB" }}>
              <Search size={14} color="#9E9E9E" />
              <input
                type="text"
                placeholder="Search customer or phone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="outline-none border-none bg-transparent text-[13px]"
                style={{ fontFamily: "'DM Sans', sans-serif", color: "#0D0F12", width: 180 }}
              />
            </div>
          </div>
        </div>

        {/* Column headers */}
        <div className="grid gap-3 px-6 py-2.5" style={{ gridTemplateColumns: "32px 1fr 120px 100px 100px 160px", backgroundColor: "#F8F9FA", borderBottom: "1px solid #E5E7EB" }}>
          <span />
          {["Customer", "Owes", "Orders", "Since", "Action"].map(h => (
            <span key={h} style={LABEL}>{h}</span>
          ))}
        </div>

        {/* Empty states */}
        {loading && (
          <div className="flex items-center justify-center py-16 gap-2">
            <Loader2 size={20} className="animate-spin" color="#7C3AED" />
            <span className="text-[13px]" style={{ color: "#6B7280" }}>Loading khata data…</span>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <BookOpen size={40} color="#D1D5DB" />
            <span className="text-[15px]" style={{ fontWeight: 600, color: "#9CA3AF" }}>
              {khataData.length === 0 ? "No credit orders yet" : "No results for your search"}
            </span>
            <span className="text-[13px]" style={{ color: "#D1D5DB" }}>
              {khataData.length === 0
                ? "Mark orders as 'Credit' in the Orders page to track them here."
                : "Try a different name or phone number."}
            </span>
          </div>
        )}

        {/* Customer rows */}
        {!loading && filtered.map((customer, i) => (
          <CustomerRow key={`${customer.name}-${i}`} customer={customer} index={i} onRemind={setReminderTarget} />
        ))}
      </div>

      {/* ── Reminder Modal ── */}
      {reminderTarget && (
        <ReminderModal customer={reminderTarget} onClose={() => setReminderTarget(null)} />
      )}
    </div>
  );
}
