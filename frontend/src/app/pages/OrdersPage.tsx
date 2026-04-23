import React, { useState, useEffect } from "react";
import { NavLink } from "react-router";
import {
  Search,
  Filter,
  Download,
  X,
  FileText,
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ChevronDown,
  Send,
  Printer,
  Check,
  RefreshCw,
  CreditCard,
  Banknote,
  BookUser,
  ArrowRight,
  MessageCircle,
} from "lucide-react";
import { useOrders, useUpdateOrderStatus, useGenerateInvoice, useDeleteOrder } from "@/hooks/useApi";
import type { Order as ApiOrder } from "@/lib/types";
import { formatINR, formatDate, mapStatus, summarizeItems, computeTotal, toBaseUnit, toBaseQty } from "@/lib/format";

type Status = "Paid" | "Pending" | "Processing" | "Draft" | "Failed" | "Credit";

interface Order {
  id: string;
  customer: string;
  items: string;
  itemsList: { name: string; qty: string; rate: string; lineTotal: string }[];
  amount: string;
  amountRaw: number | null;
  status: Status;
  date: string;
  rawDate: string; // ISO date string for date-filter comparisons
  source: string;
  notes?: string;
  raw_messages?: { sender: string; text: string }[];
  delivery_date?: string | null;
  itemsCount: number;
  customerPhone: string;
  hasInvoice: boolean;
}

/** Sanitize WhatsApp customer name — remove phone-number @domain suffixes */
function sanitizeCustomerName(name: string | null | undefined): string | null {
  if (!name) return null;
  // WhatsApp phone IDs like "919876543210@c.us" or "[PHONE REDACTED]" → show as phone
  if (name.includes("@c.us") || name.includes("@s.whatsapp.net")) {
    const phone = name.split("@")[0];
    return `📞 ${phone}`;
  }
  // Redacted by PII system — means WA contact had no name saved
  if (name.includes("REDACTED") || name === "Customer") return null;
  return name;
}

/** Convert a backend Order into the display shape used by the UI. */
function toDisplayOrder(o: ApiOrder): Order {
  // Compute total from items (qty × price) when stored total is null/zero
  const totalRaw = computeTotal(o.total, o.items);

  return {
    id: o.id,
    customer: sanitizeCustomerName(o.customer_name) ?? "Unknown",
    items: summarizeItems(o.items),
    itemsList: o.items.map((i) => ({
      name: i.product_name,
      qty: i.unit ? `${i.quantity} ${i.unit}` : `${i.quantity}`,
      // Rate always shows per BASE unit: ₹35/kg even when ordered in grams
      rate: i.price != null
        ? `${formatINR(i.price)}${toBaseUnit(i.unit) ? `/${toBaseUnit(i.unit)}` : ""}`
        : "—",
      // Line total uses base-unit quantity: 500g → 0.5kg × ₹35 = ₹17.50
      lineTotal: i.price != null ? formatINR(toBaseQty(i.quantity, i.unit) * i.price) : "—",
    })),
    amount: totalRaw != null ? formatINR(totalRaw) : "—",
    amountRaw: totalRaw,
    status: mapStatus(o.status),
    date: formatDate(o.created_at),
    rawDate: o.created_at ?? "",
    source: o.raw_messages?.length ? "WhatsApp" : "Manual",
    notes: o.special_instructions ?? undefined,
    raw_messages: o.raw_messages,
    delivery_date: o.delivery_date ?? null,
    itemsCount: o.items.length,
    customerPhone: o.customer_phone ?? "",
    hasInvoice: !!o.invoice,
  };
}

const statusStyles: Record<Status, { bg: string; color: string; icon: React.ReactNode }> = {
  Paid: { bg: "#00C853", color: "#FFF", icon: <CheckCircle2 size={14} /> },
  Pending: { bg: "#FF6D00", color: "#FFF", icon: <Clock size={14} /> },
  Processing: { bg: "#2979FF", color: "#FFF", icon: <Loader2 size={14} /> },
  Draft: { bg: "#9E9E9E", color: "#FFF", icon: <FileText size={14} /> },
  Failed: { bg: "#D32F2F", color: "#FFF", icon: <AlertCircle size={14} /> },
  Credit: { bg: "#7C3AED", color: "#FFF", icon: <BookUser size={14} /> },
};

const CARD: React.CSSProperties = {
  backgroundColor: "#FFFFFF",
  borderRadius: 16,
  border: "1px solid #E5E7EB",
  boxShadow: "0px 2px 12px rgba(0,0,0,0.07)",
  fontFamily: "'DM Sans', sans-serif",
};

const MONO: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontWeight: 500,
  fontSize: 13,
};

const LABEL: React.CSSProperties = {
  fontWeight: 500,
  fontSize: 11,
  color: "#6B7280",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  fontFamily: "'DM Sans', sans-serif",
};

const FALLBACK_ORDERS: Order[] = [];

const tabs: { label: string; status: Status | "All" }[] = [
  { label: "All Orders", status: "All" },
  { label: "Paid", status: "Paid" },
  { label: "Pending", status: "Pending" },
  { label: "Processing", status: "Processing" },
  { label: "Draft", status: "Draft" },
  { label: "Failed", status: "Failed" },
];

function RedactedPill() {
  return (
    <span
      className="inline-block px-4 py-0.5"
      style={{
        backgroundColor: "#E5E7EB",
        borderRadius: 100,
        fontSize: 12,
        fontWeight: 500,
        userSelect: "none",
        minWidth: 80,
        textAlign: "center",
      }}
    >
      <span style={{ filter: "blur(4px)", display: "inline-block", color: "#E5E7EB" }}>
        Customer Name
      </span>
    </span>
  );
}

function StatusPill({ status }: { status: Status }) {
  const s = statusStyles[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] w-fit"
      style={{
        fontWeight: 600,
        borderRadius: 100,
        backgroundColor: s.bg,
        color: s.color,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {status}
    </span>
  );
}

/* ─── Slide-over Panel ─── */
function OrderDetailPanel({
  order,
  onClose,
  onRefetch,
}: {
  order: Order;
  onClose: () => void;
  onRefetch: () => void;
}) {
  const s = statusStyles[order.status];
  const { mutate: updateStatus, loading: isUpdating } = useUpdateOrderStatus();
  const { mutate: generateInvoiceMutate, loading: isGeneratingInvoice } = useGenerateInvoice();
  const { mutate: deleteOrder, loading: isDeleting } = useDeleteOrder();
  const [invoiceError, setInvoiceError] = React.useState<string | null>(null);
  const [invoiceSuccess, setInvoiceSuccess] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateStatus(order.id, newStatus);
      onRefetch();
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      await deleteOrder(order.id);
      onRefetch();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmDelete(false);
    }
  };

  const handleGenerateInvoice = async () => {
    setInvoiceError(null);
    setInvoiceSuccess(false);
    try {
      await generateInvoiceMutate(order.id);
      setInvoiceSuccess(true);
      onRefetch();
    } catch (err: any) {
      setInvoiceError(err?.message ?? "Invoice generation failed");
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(0,0,0,0.15)" }}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="fixed md:top-0 right-0 md:bottom-0 bottom-0 z-50 flex flex-col overflow-hidden"
        style={{
          width: window.innerWidth < 768 ? "100%" : 460,
          height: window.innerWidth < 768 ? "92%" : "auto",
          backgroundColor: "#FFFFFF",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.1)",
          fontFamily: "'DM Sans', sans-serif",
          animation: window.innerWidth < 768 ? "slideInUp 0.3s ease-out" : "slideInRight 0.25s ease-out",
          borderTopLeftRadius: window.innerWidth < 768 ? 24 : 0,
          borderTopRightRadius: window.innerWidth < 768 ? 24 : 0,
        }}
      >
        {/* Mobile Handle Bar */}
        <div className="md:hidden flex justify-center py-2 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: "1px solid #E5E7EB" }}
        >
          <div className="flex items-center gap-3">
            <span style={{ ...MONO, color: "#2979FF", fontSize: 15 }}>
              #{order.id}
            </span>
            <StatusPill status={order.status} />
          </div>
          <button
            onClick={onClose}
            className="w-[32px] h-[32px] flex items-center justify-center cursor-pointer"
            style={{
              backgroundColor: "#F8F9FA",
              borderRadius: 8,
              border: "1px solid #E5E7EB",
            }}
          >
            <X size={16} color="#6B7280" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <span style={LABEL}>CUSTOMER</span>
              {order.customer && order.customer !== "Unknown" ? (
                <span className="text-[13px]" style={{ fontWeight: 600, color: "#0D0F12" }}>
                  {order.customer}
                </span>
              ) : (
                <RedactedPill />
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span style={LABEL}>DATE</span>
              <span className="text-[13px]" style={{ fontWeight: 500, color: "#0D0F12" }}>
                {order.date}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span style={LABEL}>SOURCE</span>
              <span
                className="text-[12px] px-2.5 py-1 self-start"
                style={{
                  fontWeight: 500,
                  color: order.source === "WhatsApp" ? "#25D366" : "#6B7280",
                  backgroundColor:
                    order.source === "WhatsApp" ? "rgba(37,211,102,0.08)" : "#F8F9FA",
                  borderRadius: 100,
                }}
              >
                {order.source}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span style={LABEL}>TOTAL</span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 700,
                  fontSize: 20,
                  color: "#1A1A2E",
                }}
              >
                {order.amount}
              </span>
            </div>
          </div>

          {/* Items table */}
          <div
            className="overflow-hidden"
            style={{
              border: "1px solid #E5E7EB",
              borderRadius: 12,
              backgroundColor: "#FFFFFF"
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ backgroundColor: "#F8F9FA", borderBottom: "1px solid #E5E7EB" }}>
                <tr>
                  <th style={{ ...LABEL, padding: "10px 16px", textAlign: "left" }}>ITEM</th>
                  <th style={{ ...LABEL, padding: "10px 16px", textAlign: "left" }}>QTY</th>
                  <th style={{ ...LABEL, padding: "10px 16px", textAlign: "right" }}>AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {order.itemsList.map((item, i) => (
                  <tr key={i} style={{ borderBottom: i < order.itemsList.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                    <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "#0D0F12" }}>{item.name}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#6B7280" }}>{item.qty}</td>
                    <td style={{ ...MONO, padding: "12px 16px", textAlign: "right", color: "#1A1A2E", fontWeight: 700 }}>{item.lineTotal}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot style={{ backgroundColor: "#FAFBFC", borderTop: "1px solid #E5E7EB" }}>
                <tr>
                  <td colSpan={2} style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "#0D0F12" }}>Total</td>
                  <td style={{ ...MONO, padding: "12px 16px", textAlign: "right", fontWeight: 700, color: "#1A1A2E" }}>{order.amount}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="flex flex-col gap-2">
              <span style={LABEL}>NOTES</span>
              <div
                className="p-3"
                style={{
                  backgroundColor: "#F8F9FA",
                  borderRadius: 10,
                  border: "1px solid #E5E7EB",
                }}
              >
                <span
                  className="text-[13px]"
                  style={{ color: "#374151", lineHeight: 1.6 }}
                >
                  {order.notes}
                </span>
              </div>
            </div>
          )}

          {/* Original WhatsApp Chat Aesthetics */}
          {order.raw_messages && order.raw_messages.length > 0 && (
            <div className="flex flex-col gap-2">
              <span style={LABEL}>ORIGINAL CHAT</span>
              <div
                className="p-4 relative"
                style={{
                  backgroundColor: "#FFFDE7", // Yellow tinted chat bubble
                  borderRadius: 16,
                  border: "1px solid #FFF59D",
                }}
              >
                <div className="flex flex-col gap-1.5">
                  {order.raw_messages.map((m, i) => (
                    <div key={i} className="flex flex-col">
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-tight">
                        {m.sender}
                      </span>
                      <p className="m-0 text-[13px] italic text-[#1A1A2E] leading-relaxed">
                        “{m.text}”
                      </p>
                    </div>
                  ))}
                </div>
                <button
                  className="mt-3 text-[12px] font-bold text-[#1A1A2E] flex items-center gap-1 p-0 bg-transparent border-none cursor-pointer"
                >
                  Show full chat <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Order Summary styled like a receipt */}
          <div className="flex flex-col gap-3">
            <span style={LABEL}>ORDER SUMMARY</span>
            <div className="flex flex-col gap-3">
              {order.itemsList.map((it, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[13px] font-bold text-[#0D0F12]">{it.name}</span>
                    <span className="text-[11px] text-gray-500">{it.qty}</span>
                  </div>
                  <span className="text-[13px] font-bold text-[#0D0F12]">{it.lineTotal}</span>
                </div>
              ))}
              <div className="pt-3 border-t border-dashed border-gray-200 mt-1 flex items-center justify-between">
                <span className="text-[14px] font-bold">Grand Total</span>
                <span className="text-[18px]" style={{ ...MONO, color: "#1A1A2E" }}>
                   {order.amount}
                </span>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="flex flex-col gap-2">
            <span style={LABEL}>ACTIVITY</span>
            <div className="flex flex-col gap-0">
              {[
                { text: "Order created from WhatsApp chat", time: order.date, dot: "#2979FF" },
                { text: "AI extracted 3 items successfully", time: order.date, dot: "#00C853" },
                ...(order.status === "Paid"
                  ? [{ text: "Payment confirmed via UPI", time: order.date, dot: "#00C853" }]
                  : []),
                ...(order.status === "Failed"
                  ? [{ text: "Payment failed — bank declined", time: order.date, dot: "#D32F2F" }]
                  : []),
              ].map((event, i) => (
                <div key={i} className="flex items-start gap-3 py-2.5">
                  <div className="flex flex-col items-center gap-0 mt-1.5">
                    <div
                      className="w-[8px] h-[8px] shrink-0"
                      style={{ backgroundColor: event.dot, borderRadius: 100 }}
                    />
                    {i < 2 && (
                      <div className="w-[1px] h-[20px]" style={{ backgroundColor: "#E5E7EB" }} />
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px]" style={{ fontWeight: 500, color: "#0D0F12" }}>
                      {event.text}
                    </span>
                    <span className="text-[11px]" style={{ color: "#6B7280" }}>
                      {event.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col gap-0 shrink-0" style={{ borderTop: "1px solid #E5E7EB" }}>
          {/* Status action buttons for Pending AND Processing orders */}
          {(order.status === "Pending" || order.status === "Processing") && (
            <div className="flex gap-2 px-4 pt-4">
              <button
                onClick={() => handleStatusChange("paid")}
                disabled={isUpdating}
                className="flex items-center gap-1.5 px-3 py-2.5 text-[12px] cursor-pointer flex-1 justify-center"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 600,
                  color: "#FFFFFF",
                  backgroundColor: "#00C853",
                  borderRadius: 10,
                  border: "none",
                  opacity: isUpdating ? 0.7 : 1,
                }}
              >
                {isUpdating ? <Loader2 size={13} className="animate-spin" /> : <Banknote size={13} />}
                Mark Paid
              </button>
              <button
                onClick={() => handleStatusChange("credit")}
                disabled={isUpdating}
                className="flex items-center gap-1.5 px-3 py-2.5 text-[12px] cursor-pointer flex-1 justify-center"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 600,
                  color: "#FFFFFF",
                  backgroundColor: "#7C3AED",
                  borderRadius: 10,
                  border: "none",
                  opacity: isUpdating ? 0.7 : 1,
                }}
              >
                {isUpdating ? <Loader2 size={13} className="animate-spin" /> : <BookUser size={13} />}
                Credit (Khata)
              </button>
              {order.status === "Pending" && (
                <button
                  onClick={() => handleStatusChange("processing")}
                  disabled={isUpdating}
                  className="flex items-center gap-1.5 px-3 py-2.5 text-[12px] cursor-pointer flex-1 justify-center"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 600,
                    color: "#FFFFFF",
                    backgroundColor: "#2979FF",
                    borderRadius: 10,
                    border: "none",
                    opacity: isUpdating ? 0.7 : 1,
                  }}
                >
                  {isUpdating ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Processing
                </button>
              )}
            </div>
          )}

          {/* Invoice error / success feedback */}
          {invoiceError && (
            <div className="mx-4 mt-2 px-3 py-2 text-[12px]" style={{ backgroundColor: "#FEF2F2", borderRadius: 8, color: "#D32F2F", border: "1px solid #FECACA" }}>
              {invoiceError}
            </div>
          )}
          {invoiceSuccess && (
            <div className="mx-4 mt-2 px-3 py-2 text-[12px]" style={{ backgroundColor: "#F0FDF4", borderRadius: 8, color: "#059669", border: "1px solid #BBF7D0" }}>
              ✓ Invoice generated successfully
            </div>
          )}

          {/* Bottom row buttons */}
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-1.5 px-3 py-2 text-[12px] cursor-pointer"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 600,
                color: confirmDelete ? "#FFFFFF" : "#D32F2F",
                backgroundColor: confirmDelete ? "#D32F2F" : "rgba(211,47,47,0.07)",
                borderRadius: 8,
                border: `1px solid ${confirmDelete ? "#D32F2F" : "rgba(211,47,47,0.2)"}`,
                transition: "all 0.15s",
              }}
            >
              {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
              {confirmDelete ? "Confirm Delete" : "Delete Order"}
            </button>
            {confirmDelete && (
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[12px] px-3 py-2 cursor-pointer"
                style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, color: "#6B7280", backgroundColor: "#F8F9FA", borderRadius: 8, border: "1px solid #E5E7EB" }}
              >
                Cancel
              </button>
            )}
            <button
              onClick={() => {
                const text = `Hi, this is a reminder for your order #${order.id.slice(0,8)}. Please complete your payment. Thank you!`;
                const phone = order.customerPhone.replace(/\D/g, "");
                window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-[12px] cursor-pointer"
              style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, color: "#25D366", backgroundColor: "rgba(37,211,102,0.07)", borderRadius: 8, border: "1px solid rgba(37,211,102,0.2)" }}
            >
              <MessageCircle size={13} />
              Reminder
            </button>
            <div className="flex-1" />
            
            {/* Show View Invoice if it already exists */}
            {order.hasInvoice ? (
               <NavLink to="/invoices">
                <button
                  className="flex items-center gap-1.5 px-4 py-2 text-[12px] cursor-pointer justify-center"
                  style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, color: "#FFFFFF", backgroundColor: "#00C853", borderRadius: 8, border: "none" }}
                >
                  <FileText size={13} />
                  View Invoice
                </button>
               </NavLink>
            ) : (
                /* Otherwise, allow generation if the status is appropriate */
                (order.status === "Paid" || order.status === "Credit") && (
                  <button
                    onClick={handleGenerateInvoice}
                    disabled={isGeneratingInvoice}
                    className="flex items-center gap-1.5 px-4 py-2 text-[12px] cursor-pointer justify-center"
                    style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, color: "#FFFFFF", backgroundColor: isGeneratingInvoice ? "#374151" : "#1A1A2E", borderRadius: 8, border: "none", opacity: isGeneratingInvoice ? 0.7 : 1 }}
                  >
                    {isGeneratingInvoice ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                    {isGeneratingInvoice ? "Generating..." : "Generate Invoice"}
                  </button>
                )
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes slideInUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

/* ─── Main Orders Page ─── */
const POLL_INTERVAL_MS = 15_000; // auto-refresh every 15 seconds

export function OrdersPage() {
  const [activeTab, setActiveTab] = useState<Status | "All">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  // Date filter — defaults to today in local timezone (YYYY-MM-DD)
  const todayLocal = new Date().toLocaleDateString("en-CA"); // "2026-04-19"
  const [dateFilter, setDateFilter] = useState<string>(todayLocal);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  // Fetch real orders from the API
  const { data: apiOrders, loading, error, refetch } = useOrders();
  const allOrders: Order[] = apiOrders ? apiOrders.map(toDisplayOrder) : FALLBACK_ORDERS;

  // Auto-refresh every 15 seconds to pick up new WhatsApp orders
  useEffect(() => {
    const id = setInterval(async () => {
      await refetch();
      setLastRefreshed(new Date());
    }, POLL_INTERVAL_MS);

    // Listen for immediate refresh requests from the notification system
    const handleRefresh = async () => {
      await refetch();
      setLastRefreshed(new Date());
    };
    window.addEventListener("bizchat:refresh_orders", handleRefresh);

    return () => {
      clearInterval(id);
      window.removeEventListener("bizchat:refresh_orders", handleRefresh);
    };
  }, [refetch]);

  const handleManualRefresh = async () => {
    await refetch();
    setLastRefreshed(new Date());
  };

  const handleClosePanel = () => {
    setSelectedOrder(null);
    refetch(); // Automatically refresh the list when closing the panel to show updated status
  };

  const filtered = allOrders.filter((o) => {
    const matchesTab = activeTab === "All" || o.status === activeTab;
    const matchesSearch =
      !searchQuery ||
      o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.items.toLowerCase().includes(searchQuery.toLowerCase());
    // Date filter — compare in local timezone
    const orderLocalDate = o.rawDate
      ? new Date(o.rawDate).toLocaleDateString("en-CA")
      : "";
    const matchesDate = !dateFilter || orderLocalDate === dateFilter;
    return matchesTab && matchesSearch && matchesDate;
  });

  const counts: Record<string, number> = { All: allOrders.length };
  allOrders.forEach((o) => {
    counts[o.status] = (counts[o.status] || 0) + 1;
  });

  return (
    <div className="p-6" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Page header (Responsive) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div className="flex flex-col gap-1">
          <h1
            className={`m-0 ${isMobile ? 'text-2xl font-black' : 'text-2xl font-bold'}`}
            style={{ color: "#0D0F12", lineHeight: 1.2 }}
          >
            Orders
          </h1>
          <p className="m-0 text-[13px] md:block hidden" style={{ color: "#6B7280" }}>
            Manage all orders from WhatsApp and manual entry.
          </p>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <span
            className="text-[12px] px-3 py-1.5 shrink-0"
            style={{
              ...MONO,
              color: "#2979FF",
              backgroundColor: "rgba(41,121,255,0.06)",
              borderRadius: 100,
              fontSize: 11,
            }}
          >
            {allOrders.length} total
          </span>

          {/* Live auto-refresh indicator */}
          <span
            className="flex items-center gap-1.5 px-2.5 py-1.5 shrink-0"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500,
              fontSize: 11,
              color: "#059669",
              backgroundColor: "rgba(5,150,105,0.07)",
              borderRadius: 8,
              border: "1px solid rgba(5,150,105,0.15)",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                backgroundColor: "#10B981",
                display: "inline-block",
                animation: "livePulse 1.8s ease-in-out infinite",
              }}
            />
            {isMobile ? 'Live' : `Live · ${lastRefreshed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}`}
          </span>

          <button
            onClick={handleManualRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer shrink-0"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 500,
              fontSize: 12,
              color: "#6B7280",
              backgroundColor: "#F8F9FA",
              borderRadius: 8,
              border: "1px solid #E5E7EB",
            }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} color="#6B7280" />
            Refresh
          </button>
        </div>
      </div>

      {/* Loading / Error states */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin" color="#2979FF" />
          <span className="ml-2 text-[14px]" style={{ color: "#6B7280" }}>Loading orders…</span>
        </div>
      )}
      {error && !loading && (
        <div className="flex items-center justify-center py-8 mb-4" style={{ backgroundColor: "#FEF2F2", borderRadius: 12, border: "1px solid #FECACA" }}>
          <AlertCircle size={16} color="#D32F2F" />
          <span className="ml-2 text-[13px]" style={{ color: "#D32F2F" }}>
            Failed to load orders. Using offline view.
          </span>
        </div>
      )}

      {/* Filters row (Mobile optimized scrolling pills) */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar pb-1 -mx-6 px-6">
          {(["All", "Pending", "Paid", "Processing", "Credit", "Failed"] as const).map(
            (tab) => {
              const active = activeTab === tab;
              const count = counts[tab] || 0;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="flex items-center gap-1.5 px-4 py-2 shrink-0 transition-all active:scale-95"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    borderRadius: 100,
                    backgroundColor: active ? "#1A1A2E" : "#FFFFFF",
                    color: active ? "#FFFFFF" : "#6B7280",
                    border: `1px solid ${active ? "#1A1A2E" : "#E5E7EB"}`,
                    cursor: "pointer",
                  }}
                >
                  {tab}
                  {count > 0 && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: active ? "rgba(255,255,255,0.2)" : "#F3F4F6",
                        color: active ? "#FFFFFF" : "#6B7280",
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            }
          )}
        </div>

        <div className="flex items-center gap-3 flex-1 md:flex-none flex-wrap md:flex-nowrap">
          {/* Date Filter */}
          <div className="flex items-center gap-2">
            <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Date:</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 text-[13px]"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                backgroundColor: "#FFFFFF",
                borderRadius: 10,
                border: "1px solid #E5E7EB",
                outline: "none",
                cursor: "pointer",
                color: "#1A1A2E",
                fontWeight: 500,
              }}
            />
            {dateFilter !== todayLocal && (
               <button
                onClick={() => setDateFilter(todayLocal)}
                className="text-[11px] font-bold text-[#2979FF] hover:underline bg-transparent border-none cursor-pointer"
               >
                Today
               </button>
            )}
          </div>

          {/* Search */}
          <div className="relative flex-1 md:w-64 min-w-[200px]">
            <Search
              size={16}
              color="#9CA3AF"
              className="absolute left-3 top-1/2 -translate-y-1/2"
            />
            <input
              type="text"
              placeholder="Search by ID or product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-[14px]"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                backgroundColor: "#FFFFFF",
                borderRadius: 12,
                border: "1px solid #E5E7EB",
                outline: "none",
              }}
            />
          </div>
          {/* Filter button mobile */}
          <button
            className="md:hidden flex items-center justify-center w-11 h-11 bg-white border border-gray-200 rounded-xl"
            onClick={() => {}}
          >
            <Filter size={18} color="#1A1A2E" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={CARD} className="overflow-hidden">
        <div className="overflow-x-auto">
          {/* Column headers (Responsive) */}
          <div
            className="grid px-5 py-3 border-b border-gray-200 bg-gray-50/50"
            style={{
              gridTemplateColumns: isMobile ? "0.8fr 1.2fr 0.4fr 1fr" : "100px 130px 1fr 90px 90px 80px 90px",
            }}
          >
            {isMobile ? (
               <>
                <span style={LABEL}>ORDER ID</span>
                <span style={LABEL}>CUSTOMER</span>
                <span style={LABEL}>ITEMS</span>
                <span style={LABEL} className="text-right">AMOUNT</span>
               </>
            ) : (
                ["Order ID", "Customer", "Items", "Amount", "Status", "Source", "Date"].map((h) => (
                    <span key={h} style={LABEL}>{h}</span>
                ))
            )}
          </div>

          {/* Rows */}
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <span className="text-[14px]" style={{ color: "#6B7280" }}>
                No orders match your filters.
              </span>
            </div>
          ) : (
            filtered.map((order, i) => (
              <div
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                className="grid px-5 py-4 gap-3 items-center cursor-pointer transition-colors active:bg-gray-100"
                style={{
                  gridTemplateColumns: isMobile ? "0.8fr 1.2fr 0.4fr 1fr" : "100px 130px 1fr 90px 90px 80px 90px",
                  borderBottom: i < filtered.length - 1 ? "1px solid #F3F4F6" : "none",
                }}
              >
                {isMobile ? (
                    <>
                      <div className="flex flex-col">
                        <span className="text-[13px] font-mono text-blue-600 truncate">#{order.id.slice(0,8)}</span>
                        <span className="text-[10px] text-gray-400">{order.date}</span>
                      </div>
                      <span className="text-[14px] font-bold text-gray-900 truncate">
                        {order.customer && order.customer !== "Unknown" ? order.customer : "Guest"}
                      </span>
                      <div className="flex justify-center">
                        <span className="text-[12px] px-2 py-0.5 bg-gray-100 rounded-lg text-gray-600 font-medium">
                          {order.itemsCount} {order.itemsCount === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                      <span className="text-[15px] font-mono text-gray-900 font-black text-right">{order.amount}</span>
                    </>
                ) : (
                    <>
                      <span style={{ ...MONO, color: "#2979FF" }}>{`#${order.id}`}</span>
                      {order.customer && order.customer !== "Unknown" ? (
                        <span className="text-[13px] truncate" style={{ fontWeight: 500, color: "#0D0F12" }}>
                          {order.customer}
                        </span>
                      ) : (
                        <span className="text-[12px]" style={{ color: "#D1D5DB", fontStyle: "italic" }}>Unknown</span>
                      )}
                      <span
                        className="text-[13px] truncate"
                        style={{ fontWeight: 400, color: "#374151" }}
                      >
                        {order.items}
                      </span>
                      <span style={{ ...MONO, color: "#0D0F12" }}>{order.amount}</span>
                      <StatusPill status={order.status} />
                      <span
                        className="text-[12px] px-2 py-0.5 self-start mt-0.5"
                        style={{
                          fontWeight: 500,
                          color: order.source === "WhatsApp" ? "#25D366" : "#6B7280",
                          backgroundColor:
                            order.source === "WhatsApp" ? "rgba(37,211,102,0.08)" : "#F8F9FA",
                          borderRadius: 100,
                          textAlign: "center",
                        }}
                      >
                        {order.source}
                      </span>
                      <span className="text-[12px]" style={{ color: "#6B7280" }}>
                        {order.date}
                      </span>
                    </>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Slide-over */}
      {selectedOrder && (
        <OrderDetailPanel
          order={selectedOrder}
          onClose={handleClosePanel}
          onRefetch={refetch}
        />
      )}

      <style>{`
        @keyframes livePulse {
          0%   { opacity: 1; transform: scale(1); }
          50%  { opacity: 0.4; transform: scale(0.7); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
