import React, { useMemo, useState } from "react";
import { NavLink } from "react-router";
import {
  TrendingUp, ShoppingCart, Clock, IndianRupee,
  BookOpen, CheckCircle2, AlertTriangle, ArrowRight,
  Zap, Package, MessageCircle, BarChart2,
} from "lucide-react";
import { useOrders, useStats } from "@/hooks/useApi";
import { formatINR, toBaseQty, toBaseUnit } from "@/lib/format";
import type { Order } from "@/lib/types";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

/* ─── Tokens ─── */
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

/* ─── Helpers ─── */
function safe(d: string | undefined | null) {
  if (!d) return null;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Compute order total with unit-aware price calculation.
 * Falls back to stored total if available. Uses g→kg / ml→L conversion.
 */
function orderTotal(o: Order): number {
  if (o.total != null && o.total > 0) return o.total;
  return o.items.reduce((s, it) => {
    if (it.price != null && it.price > 0) {
      return s + toBaseQty(it.quantity, it.unit) * it.price;
    }
    return s;
  }, 0);
}

/** Local date string "YYYY-MM-DD" from any Date. */
function localDateStr(d: Date): string {
  return d.toLocaleDateString("en-CA"); // en-CA = ISO 8601 format
}

function buildRevenueChart(orders: Order[]) {
  const now = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const dateStr = localDateStr(d);
    const dayOrders = orders.filter(o => {
      const od = safe(o.created_at);
      return od ? localDateStr(od) === dateStr : false;
    });
    const revenue = dayOrders.reduce((s, o) => s + orderTotal(o), 0);
    return {
      label: d.toLocaleDateString("en-IN", { weekday: "short" }),
      revenue,
      orders: dayOrders.length,
    };
  });
}

function buildTopProducts(orders: Order[]) {
  const map: Record<string, { qty: number; unit: string }> = {};
  orders.forEach(o => {
    o.items.forEach(it => {
      const name = it.product_name || "Unknown";
      // Store in base unit (g→kg, ml→litre) to avoid 500 doodh vs 2 aloo mismatch
      const baseQty = toBaseQty(it.quantity, it.unit);
      const baseUnit = toBaseUnit(it.unit) ?? it.unit ?? "";
      if (!map[name]) map[name] = { qty: 0, unit: baseUnit };
      map[name].qty += baseQty;
    });
  });
  return Object.entries(map)
    .map(([name, { qty, unit }]) => ({ name, qty: Math.round(qty * 100) / 100, unit }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 6);
}

const STATUS_COLORS: Record<string, string> = {
  paid: "#00C853", confirmed: "#00C853",
  pending: "#FF6D00",
  processing: "#2979FF",
  credit: "#7C3AED",
  draft: "#9E9E9E",
  failed: "#D32F2F",
  cancelled: "#D32F2F",
};

const REVENUE_STATUSES = new Set(["paid", "confirmed", "credit", "fulfilled"]);

export function DashboardPage() {
  const { data: stats, loading: statsLoading, refetch: refetchStats } = useStats();
  const { data: apiOrders, loading: ordersLoading, refetch: refetchOrders } = useOrders();

  const todayLocal = new Date().toLocaleDateString("en-CA");
  const [dateFilter, setDateFilter] = useState<string>("all"); // "all" | "today" | "yesterday" | "7days" | YYYY-MM-DD

  const orders = apiOrders ?? [];
  const loading = statsLoading || ordersLoading;

  // Auto-refresh logic to keep Dashboard in sync with WhatsApp orders
  const refreshAll = React.useCallback(async () => {
    try {
      await Promise.all([refetchStats(), refetchOrders()]);
    } catch (err) {
      console.warn("Auto-refresh failed", err);
    }
  }, [refetchStats, refetchOrders]);

  React.useEffect(() => {
    const id = setInterval(refreshAll, 15000);

    // Listen for immediate refresh requests from the notification system
    window.addEventListener("bizchat:refresh_orders", refreshAll);

    return () => {
      clearInterval(id);
      window.removeEventListener("bizchat:refresh_orders", refreshAll);
    };
  }, [refreshAll]);
  // Resolve which orders fall in the selected window
  const dateOrders = useMemo(() => {
    if (dateFilter === "all") return orders;
    if (dateFilter === "today") {
      return orders.filter(o => {
        const d = safe(o.created_at);
        return d ? localDateStr(d) === todayLocal : false;
      });
    }
    if (dateFilter === "yesterday") {
      const yest = new Date(); yest.setDate(yest.getDate() - 1);
      const yestStr = localDateStr(yest);
      return orders.filter(o => {
        const d = safe(o.created_at);
        return d ? localDateStr(d) === yestStr : false;
      });
    }
    if (dateFilter === "7days") {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
      return orders.filter(o => {
        const d = safe(o.created_at);
        return d ? d >= cutoff : false;
      });
    }
    // Custom YYYY-MM-DD
    return orders.filter(o => {
      const d = safe(o.created_at);
      return d ? localDateStr(d) === dateFilter : false;
    });
  }, [orders, dateFilter, todayLocal]);

  const revenueChart = useMemo(() => buildRevenueChart(orders), [orders]);
  const topProducts  = useMemo(() => buildTopProducts(orders), [orders]);
  const maxQty = topProducts.length ? topProducts[0].qty : 1;

  /* ── Derived stats ── */
  // Credit orders (all time)
  const creditOrders = orders.filter(o => o.status === "credit");
  const creditTotal  = creditOrders.reduce((s, o) => s + orderTotal(o), 0);

  // Revenue for selected date
  const dateRevenue = dateOrders.reduce((s, o) => s + orderTotal(o), 0);

  // Total revenue (all time, revenue statuses only)
  const totalRevenue = useMemo(() =>
    orders
      .filter(o => REVENUE_STATUSES.has(o.status))
      .reduce((s, o) => s + orderTotal(o), 0),
    [orders]
  );

  // Recent orders = latest 6 from selected date (fallback to latest 6 overall)
  const recentOrders = useMemo(() => {
    const pool = dateOrders.length > 0 ? dateOrders : orders;
    return [...pool]
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
      .slice(0, 6);
  }, [dateOrders, orders]);

  const statusBreakdown = useMemo(() => {
    const m: Record<string, number> = {};
    dateOrders.forEach(o => { m[o.status] = (m[o.status] || 0) + 1; });
    return Object.entries(m).map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [dateOrders]);

  const isToday = dateFilter === "today";

  // Human-readable label for the current filter
  const periodLabel = (
    dateFilter === "all"       ? "all time" :
    dateFilter === "today"     ? "today" :
    dateFilter === "yesterday" ? "yesterday" :
    dateFilter === "7days"     ? "last 7 days" :
    new Date(dateFilter).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
  );

  return (
    <div className="p-6 overflow-y-auto h-full" style={{ fontFamily: "'DM Sans', sans-serif", backgroundColor: "#F8F9FA" }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="m-0 md:block hidden" style={{ fontWeight: 700, fontSize: 24, color: "#0D0F12" }}>
            Dashboard
          </h1>
          {/* Mobile Header matching screenshot */}
          <div className="md:hidden">
            <h1 className="m-0" style={{ fontWeight: 800, fontSize: 22, color: "#0D0F12", letterSpacing: "-0.02em" }}>
              BizChat
            </h1>
            <p className="m-0 text-[13px] font-medium" style={{ color: "#6B7280" }}>
              Command Center
            </p>
          </div>
          <p className="m-0 text-[11px] mt-0.5 md:block hidden" style={{ color: "#6B7280" }}>
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        {/* ── Date filter presets (Hidden on small mobile to save space, or transformed) ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {([
              { key: "all",       label: "All" },
              { key: "today",     label: "Today" },
              { key: "7days",     label: "7d" },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setDateFilter(key)}
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: 20,
                  border: "1px solid",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  ...(dateFilter === key
                    ? { backgroundColor: "#1A1A2E", color: "#fff",   borderColor: "#1A1A2E" }
                    : { backgroundColor: "#fff",    color: "#6B7280", borderColor: "#E5E7EB" }),
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <NavLink to="/orders" className="no-underline md:block hidden">
            <button
              className="flex items-center gap-2 px-4 py-2 text-[13px] cursor-pointer"
              style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, color: "#FFFFFF", backgroundColor: "#1A1A2E", borderRadius: 10, border: "none" }}
            >
              <ShoppingCart size={14} />
              All Orders
            </button>
          </NavLink>
        </div>
      </div>

      {/* ── Top KPI Cards (Responsive Grid) ── */}
      <div className="flex flex-col gap-4 mb-6">
        {/* Total Revenue - Large Card */}
        <div style={CARD} className="p-5 flex flex-col gap-1 relative overflow-hidden">
          <div className="flex items-center justify-between mb-1">
            <span style={{ ...LABEL, fontSize: 10, color: "#9CA3AF" }}>REVENUE RECOVERED</span>
            <div className="px-2 py-0.5 bg-green-50 rounded-full flex items-center gap-1">
              <TrendingUp size={10} color="#10B981" />
              <span className="text-[10px] font-bold" style={{ color: "#10B981" }}>+12%</span>
            </div>
          </div>
          <span style={{ ...MONO, fontSize: 32, color: "#1A1A2E", letterSpacing: "-0.02em" }}>
            {loading ? "…" : formatINR(totalRevenue)}
          </span>
          <span className="text-[11px] font-medium" style={{ color: "#9CA3AF" }}>
            This week
          </span>
        </div>

        {/* Two metrics side-by-side */}
        <div className="grid grid-cols-2 gap-4">
          {/* Orders */}
          <div style={CARD} className="p-4 flex flex-col gap-1">
            <span style={{ ...LABEL, fontSize: 10 }}>ORDERS</span>
            <span style={{ ...MONO, fontSize: 24, color: "#1A1A2E" }}>
              {loading ? "…" : stats?.total_orders ?? 0}
            </span>
            <span className="text-[11px] font-medium flex items-center gap-1" style={{ color: "#9CA3AF" }}>
              <TrendingUp size={12} color="#10B981" />
              {dateOrders.length} today
            </span>
          </div>
          {/* Pending */}
          <div style={{ ...CARD, backgroundColor: "#FFF8F0" }} className="p-4 flex flex-col gap-1 relative">
            <span style={{ ...LABEL, fontSize: 10 }}>PENDING</span>
            <span style={{ ...MONO, fontSize: 24, color: "#1A1A2E" }}>
              {loading ? "…" : orders.filter(o => o.status === "pending").length}
            </span>
            <span className="text-[11px] font-semibold text-orange-500">
              Need attention
            </span>
            <AlertTriangle className="absolute top-4 right-4" size={14} color="#FF6D00" />
          </div>
        </div>

        {/* AI Health Row Card */}
        <div style={CARD} className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-[36px] h-[36px] flex items-center justify-center rounded-lg bg-[#2979FF]/10">
              <Zap size={18} color="#2979FF" />
            </div>
            <div>
              <p className="m-0 text-[13px] font-bold text-[#1A1A2E]">AI Queue Health</p>
              <p className="m-0 text-[11px] text-[#6B7280]">2 active workers • 0 waiting</p>
            </div>
          </div>
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)] animate-pulse" />
        </div>
      </div>

      {/* ── Revenue Chart + Status Breakdown ── */}
      <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: "1fr 300px" }}>
        {/* Revenue Area Chart */}
        <div style={CARD} className="overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #E5E7EB" }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 16, color: "#0D0F12" }}>Revenue — Last 7 Days</span>
              <p className="m-0 text-[12px] mt-0.5" style={{ color: "#6B7280" }}>Daily revenue in ₹</p>
            </div>
            <BarChart2 size={18} color="#2979FF" />
          </div>
          <div className="px-4 py-4" style={{ minHeight: 200 }}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={revenueChart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2979FF" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#2979FF" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6B7280", fontFamily: "'DM Sans', sans-serif" }} axisLine={{ stroke: "#E5E7EB" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#6B7280", fontFamily: "'DM Sans', sans-serif" }} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toString()} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 10, boxShadow: "0px 2px 12px rgba(0,0,0,0.07)", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}
                  formatter={(v: number) => [formatINR(v), "Revenue"]}
                />
                <Area type="monotone" dataKey="revenue" stroke="#2979FF" strokeWidth={2.5} fill="url(#revGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Breakdown — filtered by selected date */}
        <div style={CARD} className="overflow-hidden">
          <div className="px-5 py-4" style={{ borderBottom: "1px solid #E5E7EB" }}>
            <span style={{ fontWeight: 600, fontSize: 16, color: "#0D0F12" }}>Order Status</span>
            <p className="m-0 text-[12px] mt-0.5" style={{ color: "#6B7280" }}>
              {isToday ? "Today" : dateFilter}
            </p>
          </div>
          <div className="flex flex-col gap-0 p-2">
            {statusBreakdown.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-[13px]" style={{ color: "#9E9E9E" }}>No orders {isToday ? "today" : "that day"}</span>
              </div>
            ) : statusBreakdown.map(({ status, count }) => {
              const color = STATUS_COLORS[status] ?? "#9E9E9E";
              const pct = Math.round((count / dateOrders.length) * 100);
              return (
                <div key={status} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ transition: "background 0.1s" }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "#F8F9FA"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <div className="w-[8px] h-[8px] shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <span className="flex-1 text-[13px] capitalize" style={{ fontWeight: 500, color: "#374151" }}>{status}</span>
                  <div className="flex-1 h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: "#F3F4F6" }}>
                    <div style={{ width: `${pct}%`, height: "100%", backgroundColor: color, borderRadius: 4, transition: "width 0.5s ease" }} />
                  </div>
                  <span style={{ ...MONO, fontSize: 12, color: "#0D0F12", minWidth: 20, textAlign: "right" }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Top Products + Recent Orders ── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "300px 1fr" }}>
        {/* Top Products */}
        <div style={CARD} className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #E5E7EB" }}>
            <span style={{ fontWeight: 600, fontSize: 16, color: "#0D0F12" }}>Top Products</span>
            <Package size={16} color="#6B7280" />
          </div>
          <div className="flex flex-col p-3 gap-1">
            {loading ? (
              <div className="py-6 text-center text-[13px]" style={{ color: "#9E9E9E" }}>Loading…</div>
            ) : topProducts.length === 0 ? (
              <div className="py-6 text-center text-[13px]" style={{ color: "#9E9E9E" }}>No orders yet</div>
            ) : topProducts.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3 px-2 py-2 rounded-lg"
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "#F8F9FA"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <span style={{ ...MONO, fontSize: 11, color: "#9E9E9E", minWidth: 16 }}>#{i + 1}</span>
                <span className="flex-1 text-[13px] truncate" style={{ fontWeight: 500, color: "#0D0F12" }}>{p.name}</span>
                <div className="w-[60px] h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: "#F3F4F6" }}>
                  <div style={{ width: `${Math.round((p.qty / maxQty) * 100)}%`, height: "100%", backgroundColor: "#2979FF", borderRadius: 4 }} />
                </div>
                <span style={{ ...MONO, fontSize: 12, color: "#374151", minWidth: 36, textAlign: "right" }}>
                  {p.qty}{p.unit ? ` ${p.unit}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Orders — from selected date */}
        <div style={CARD} className="overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #E5E7EB" }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 16, color: "#0D0F12" }}>Recent Orders</span>
              <p className="m-0 text-[12px] mt-0.5" style={{ color: "#6B7280" }}>
                {isToday ? "Today" : dateFilter}
              </p>
            </div>
            <NavLink to="/orders" style={{ textDecoration: "none" }}>
              <span className="flex items-center gap-1 text-[12px] cursor-pointer" style={{ color: "#2979FF", fontWeight: 500 }}>
                View all <ArrowRight size={12} />
              </span>
            </NavLink>
          </div>
          {/* Headers */}
          <div className="grid gap-3 px-6 py-2.5" style={{ gridTemplateColumns: "1fr 120px 80px 90px 100px", backgroundColor: "#F8F9FA", borderBottom: "1px solid #E5E7EB" }}>
            {["Items", "Customer", "Amount", "Status", "Time"].map(h => (
              <span key={h} style={LABEL}>{h}</span>
            ))}
          </div>
          {loading ? (
            <div className="py-10 flex items-center justify-center gap-2">
              <Zap size={16} color="#2979FF" className="animate-pulse" />
              <span className="text-[13px]" style={{ color: "#6B7280" }}>Loading orders…</span>
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center gap-2">
              <ShoppingCart size={32} color="#D1D5DB" />
              <span className="text-[13px]" style={{ color: "#9E9E9E" }}>
                No orders {isToday ? "today" : "on " + dateFilter}. Send a WhatsApp message to get started.
              </span>
            </div>
          ) : recentOrders.map((o, i) => {
            const statusColor = STATUS_COLORS[o.status] ?? "#9E9E9E";
            const itemSummary = o.items.slice(0, 2).map(it => it.product_name).join(", ") + (o.items.length > 2 ? ` +${o.items.length - 2}` : "");
            const total = orderTotal(o);
            const createdAt = safe(o.created_at);
            const timeLabel = createdAt ? createdAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "—";
            return (
              <div key={o.id} className="grid gap-3 px-6 py-3 items-center"
                style={{ gridTemplateColumns: "1fr 120px 80px 90px 100px", borderBottom: i < recentOrders.length - 1 ? "1px solid #F3F4F6" : "none" }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "#FAFBFC"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <span className="text-[13px] truncate" style={{ fontWeight: 500, color: "#0D0F12" }}>{itemSummary || "—"}</span>
                <span className="text-[12px] truncate" style={{ color: "#6B7280" }}>{o.customer_name || "—"}</span>
                <span style={{ ...MONO, fontSize: 12, color: "#0D0F12" }}>{formatINR(total)}</span>
                <span className="inline-flex items-center px-2 py-0.5 text-[11px] capitalize w-fit rounded-full" style={{ backgroundColor: `${statusColor}15`, color: statusColor, fontWeight: 600 }}>
                  {o.status}
                </span>
                <span className="text-[11px]" style={{ color: "#9E9E9E" }}>{timeLabel}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="grid grid-cols-3 gap-4 mt-5">
        {[
          { label: "Extract Order", sub: "Paste a WhatsApp message", icon: <Zap size={18} color="#FF6D00" />, bg: "rgba(255,109,0,0.06)", to: "/extraction" },
          { label: "View Khata Book", sub: "Track credit customers", icon: <BookOpen size={18} color="#7C3AED" />, bg: "rgba(124,58,237,0.06)", to: "/khata" },
          { label: "Generate Invoice", sub: "From confirmed orders", icon: <CheckCircle2 size={18} color="#00C853" />, bg: "rgba(0,200,83,0.06)", to: "/invoices" },
        ].map(({ label, sub, icon, bg, to }) => (
          <NavLink key={label} to={to} style={{ textDecoration: "none" }}>
            <div style={{ ...CARD, backgroundColor: bg, cursor: "pointer", transition: "box-shadow 0.15s" }} className="flex items-center gap-4 p-4"
              onMouseEnter={e => (e.currentTarget.style.boxShadow = "0px 4px 20px rgba(0,0,0,0.1)")}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = "0px 2px 12px rgba(0,0,0,0.07)")}
            >
              <div className="w-[44px] h-[44px] flex items-center justify-center shrink-0" style={{ backgroundColor: "#FFFFFF", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                {icon}
              </div>
              <div className="flex flex-col gap-0.5">
                <span style={{ fontWeight: 600, fontSize: 14, color: "#0D0F12" }}>{label}</span>
                <span className="text-[12px]" style={{ color: "#6B7280" }}>{sub}</span>
              </div>
              <ArrowRight size={16} color="#9E9E9E" className="ml-auto" />
            </div>
          </NavLink>
        ))}
      </div>
    </div>
  );
}