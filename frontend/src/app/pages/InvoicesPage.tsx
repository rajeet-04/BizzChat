import React, { useRef, useState, useMemo } from "react";
import {
  FileText, Eye, MessageCircle, IndianRupee, Receipt,
  Download, X, CheckCircle2, Leaf, Loader2, Printer,
} from "lucide-react";
import { useApiClient, useOrders } from "@/hooks/useApi";
import { formatINR, formatDateOnly } from "@/lib/format";
import type { Order, Invoice } from "@/lib/types";

/* ─── Design Tokens ─── */
const CARD: React.CSSProperties = {
  backgroundColor: "#FFFFFF",
  borderRadius: 16,
  border: "1px solid #E5E7EB",
  boxShadow: "0px 2px 12px rgba(0,0,0,0.07)",
  fontFamily: "'DM Sans', sans-serif",
  overflow: "hidden",
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
  textTransform: "uppercase" as const,
  fontFamily: "'DM Sans', sans-serif",
};

/* ─── Types ─── */
type InvoiceStatus = "Sent" | "Downloaded" | "Pending";

interface InvoiceRow {
  invoiceNo: string;
  orderRef: string;
  orderId: string;
  date: string;
  rawDate: string;        // ISO from order.created_at — used for date filter
  amount: string;
  gst: string;
  status: InvoiceStatus;
  invoice: Invoice;
  customerPhone: string | null;
  customerName: string | null;
}

const statusStyles: Record<InvoiceStatus, { bg: string; color: string }> = {
  Sent:       { bg: "#2979FF", color: "#FFFFFF" },
  Downloaded: { bg: "#00C853", color: "#FFFFFF" },
  Pending:    { bg: "#FF6D00", color: "#FFFFFF" },
};

/* ─── Status Pill ─── */
function StatusPill({ status }: { status: InvoiceStatus }) {
  const s = statusStyles[status];
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 text-[11px] w-fit"
      style={{ fontWeight: 600, borderRadius: 100, backgroundColor: s.bg, color: s.color, fontFamily: "'DM Sans', sans-serif" }}
    >
      {status}
    </span>
  );
}

/* ──────────────────────────────────────
   REAL PDF PREVIEW PANEL
   ────────────────────────────────────── */
function PDFPreviewPanel({
  inv,
  onClose,
}: {
  inv: InvoiceRow;
  onClose: () => void;
}) {
  const client = useApiClient();
  const printRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  /* ── Download PDF by printing ── */
  const handleDownload = () => {
    if (!printRef.current) return;
    setDownloading(true);

    // Open a print window with the invoice HTML
    const printWindow = window.open("", "_blank", "width=800,height=900");
    if (!printWindow) { setDownloading(false); return; }

    const styles = Array.from(document.styleSheets)
      .map((s) => {
        try { return Array.from(s.cssRules).map((r) => r.cssText).join("\n"); }
        catch { return ""; }
      })
      .join("\n");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${inv.invoiceNo}</title>
          <meta charset="utf-8"/>
          <link rel="preconnect" href="https://fonts.googleapis.com"/>
          <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet"/>
          <style>
            ${styles}
            @media print {
              body { margin: 0; padding: 20px; }
              @page { size: A4; margin: 15mm; }
            }
            body { font-family: 'DM Sans', sans-serif; }
          </style>
        </head>
        <body>
          ${printRef.current.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
      setDownloading(false);
    }, 800);
  };

  /* ── Share on WhatsApp ── */
  const normalizeCustomerPhone = (rawPhone: string): string => {
    let normalized = rawPhone.replace(/\D/g, "");
    if (normalized.startsWith("0") && normalized.length === 11) {
      normalized = normalized.slice(1);
    }
    if (normalized.length === 10) {
      normalized = `91${normalized}`;
    }
    return normalized;
  };

  const handleWhatsApp = async () => {
    const customerPhone = inv.customerPhone ?? "";
    const normalizedPhone = normalizeCustomerPhone(customerPhone);

    if (!normalizedPhone) {
      window.alert("Customer phone number is missing for this invoice.");
      return;
    }

    setSharing(true);
    try {
      await client.shareInvoiceOnWhatsApp(inv.orderId, normalizedPhone);
      window.open(`https://wa.me/${normalizedPhone}`, "_blank");
    } catch (err) {
      console.error("Failed to share invoice on WhatsApp:", err);
      window.alert("Could not send PDF via WhatsApp. Please ensure WhatsApp is connected and try again.");
      window.open(`https://wa.me/${normalizedPhone}`, "_blank");
    } finally {
      setSharing(false);
    }
  };

  const iv = inv.invoice;

  // Safe date parsing — iv.date may be missing/malformed
  const safeDate = (str: string | undefined | null): Date => {
    if (!str) return new Date();
    const d = new Date(str);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  const invoiceDate = safeDate(iv.date);
  const dueDate = new Date(invoiceDate);
  dueDate.setDate(dueDate.getDate() + 7);

  return (
    <div className={`flex flex-col h-full ${isMobile ? 'fixed inset-0 z-[60] bg-[#111827]' : ''}`} style={isMobile ? {} : CARD}>
      {/* Mobile Top Decor */}
      {isMobile && (
        <div className="pt-10 pb-20 px-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 size={24} color="#10B981" />
            </div>
            <h2 className="m-0 text-white text-2xl font-bold tracking-tight">Invoice Generated</h2>
            <p className="mt-1 text-blue-400 font-mono text-sm leading-none">{inv.invoiceNo}</p>
            <p className="mt-3 text-gray-400 text-[11px] uppercase tracking-widest font-semibold">GST Compliant • PDF Ready</p>
        </div>
      )}

      {/* Header (Desktop Only) */}
      {!isMobile && (
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0" style={{ borderBottom: "1px solid #E5E7EB" }}>
          <div className="flex items-center gap-2">
            <FileText size={16} color="#1A1A2E" />
            <span style={{ fontWeight: 600, fontSize: 14, color: "#0D0F12" }}>Invoice Preview</span>
          </div>
          <button
            onClick={onClose}
            className="w-[28px] h-[28px] flex items-center justify-center cursor-pointer"
            style={{ backgroundColor: "#F8F9FA", borderRadius: 8, border: "1px solid #E5E7EB" }}
          >
            <X size={14} color="#6B7280" />
          </button>
        </div>
      )}

      {/* Scrollable invoice body */}
      <div className={`flex-1 overflow-y-auto ${isMobile ? 'px-6 -mt-10 pb-32' : 'p-5'}`}>

        {/* ── Printable Invoice Document ── */}
        <div
          ref={printRef}
          className="relative flex flex-col"
          style={{ border: "1px solid #E5E7EB", borderRadius: 12, backgroundColor: "#FFFFFF", overflow: "hidden" }}
        >
          {/* Watermark Overlay for Mobile Redesign */}
          <div
            className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-15deg] pointer-events-none z-10 opacity-[0.08]"
          >
            <div className="border-[4px] border-green-600 rounded-xl px-4 py-1.5 whitespace-nowrap">
              <span className="text-green-600 text-3xl font-black tracking-tighter uppercase">VALID FOR GST FILING</span>
            </div>
          </div>


          {/* Invoice Header */}
          <div className="flex items-start justify-between p-5 pb-4" style={{ borderBottom: "1px solid #E5E7EB", backgroundColor: "#FAFBFC" }}>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-[24px] h-[24px] flex items-center justify-center" style={{ backgroundColor: "#1A1A2E", borderRadius: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: "#FFFFFF" }}>B</span>
                </div>
                <span style={{ fontWeight: 700, fontSize: 14, color: "#1A1A2E" }}>{iv.business_name}</span>
                <Leaf size={13} color="#25D366" strokeWidth={2.5} />
              </div>
              <span className="text-[10px]" style={{ color: "#9E9E9E", fontWeight: 400 }}>GSTIN: {iv.gst_number}</span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span style={{ fontWeight: 700, fontSize: 16, color: "#1A1A2E", letterSpacing: "0.02em" }}>Tax Invoice</span>
              <span className="text-[11px] px-2 py-0.5 mt-0.5" style={{ fontWeight: 500, color: "#00C853", backgroundColor: "rgba(0,200,83,0.08)", borderRadius: 4 }}>
                GST Compliant
              </span>
            </div>
          </div>

          {/* Meta Grid */}
          <div className="grid grid-cols-2 gap-x-5 gap-y-3 px-5 py-4" style={{ borderBottom: "1px solid #E5E7EB" }}>
            <div className="flex flex-col gap-0.5">
              <span style={{ ...LABEL, fontSize: 9 }}>INVOICE NO.</span>
              <span style={{ ...MONO, color: "#2979FF", fontSize: 12 }}>{iv.invoice_number}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span style={{ ...LABEL, fontSize: 9 }}>DATE</span>
              <span className="text-[12px]" style={{ fontWeight: 500, color: "#0D0F12" }}>{formatDateOnly(invoiceDate.toISOString())}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span style={{ ...LABEL, fontSize: 9 }}>DUE DATE</span>
              <span className="text-[12px]" style={{ fontWeight: 500, color: "#0D0F12" }}>{formatDateOnly(dueDate.toISOString())}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span style={{ ...LABEL, fontSize: 9 }}>GSTIN</span>
              <span style={{ ...MONO, color: "#0D0F12", fontSize: 11 }}>{iv.gst_number}</span>
            </div>
          </div>

          {/* Bill To */}
          <div className="flex flex-col gap-1 px-5 py-3.5" style={{ borderBottom: "1px solid #E5E7EB", backgroundColor: "#F8F9FA" }}>
            <span style={{ ...LABEL, fontSize: 9 }}>BILL TO</span>
            <span className="text-[13px]" style={{ fontWeight: 600, color: "#0D0F12" }}>
              {/* Prefer the order's live customerName > invoice stored name > phone > fallback */}
              {inv.customerName
                || (iv.customer_name && iv.customer_name !== "Customer" && iv.customer_name !== "Unknown Customer" ? iv.customer_name : null)
                || (inv.customerPhone ? `📞 ${inv.customerPhone}` : null)
                || "Valued Customer"}
            </span>
            {inv.customerPhone && (
              <span className="text-[11px]" style={{ color: "#6B7280" }}>📞 {inv.customerPhone}</span>
            )}
          </div>

          {/* Line Items */}
          <div>
            <div className="grid gap-1 px-5 py-2" style={{ gridTemplateColumns: "1fr 50px 60px 70px", borderBottom: "1px solid #E5E7EB", backgroundColor: "#F8F9FA" }}>
              {["Item", "Qty", "Rate", "Amount"].map((h) => (
                <span key={h} style={{ ...LABEL, fontSize: 9 }}>{h}</span>
              ))}
            </div>
            {iv.items.map((row, i) => (
              <div
                key={i}
                className="grid gap-1 px-5 py-2.5 items-center"
                style={{ gridTemplateColumns: "1fr 50px 60px 70px", backgroundColor: i % 2 === 0 ? "#FFFFFF" : "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}
              >
                <span className="text-[12px]" style={{ fontWeight: 500, color: "#0D0F12" }}>{row.product_name}</span>
                <span className="text-[12px]" style={{ color: "#374151" }}>{row.quantity}</span>
                <span style={{ ...MONO, fontSize: 11, color: "#0D0F12" }}>{formatINR(row.price)}</span>
                <span style={{ ...MONO, fontSize: 11, color: "#0D0F12" }}>{formatINR(row.amount)}</span>
              </div>
            ))}
          </div>

          {/* Tax & Total */}
          <div className="flex flex-col gap-0 px-5 py-3" style={{ borderTop: "1px solid #E5E7EB", backgroundColor: "#FAFBFC" }}>
            <div className="flex justify-between py-1">
              <span className="text-[12px]" style={{ color: "#6B7280" }}>Subtotal</span>
              <span style={{ ...MONO, fontSize: 12, color: "#0D0F12" }}>{formatINR(iv.subtotal)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[12px]" style={{ color: "#6B7280" }}>CGST @ 2.5%</span>
              <span style={{ ...MONO, fontSize: 12, color: "#0D0F12" }}>{formatINR(iv.cgst)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[12px]" style={{ color: "#6B7280" }}>SGST @ 2.5%</span>
              <span style={{ ...MONO, fontSize: 12, color: "#0D0F12" }}>{formatINR(iv.sgst)}</span>
            </div>
            {iv.igst ? (
              <div className="flex justify-between py-1">
                <span className="text-[12px]" style={{ color: "#6B7280" }}>IGST @ 5%</span>
                <span style={{ ...MONO, fontSize: 12, color: "#0D0F12" }}>{formatINR(iv.igst)}</span>
              </div>
            ) : null}
            <div className="flex justify-between pt-2.5 mt-1" style={{ borderTop: "2px solid #1A1A2E" }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#1A1A2E", fontFamily: "'DM Sans', sans-serif" }}>Grand Total</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 16, color: "#1A1A2E" }}>
                {formatINR(iv.total)}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-center px-5 py-3" style={{ borderTop: "1px solid #E5E7EB", backgroundColor: "#F8F9FA" }}>
            <span className="text-[10px]" style={{ color: "#9E9E9E", textAlign: "center", fontFamily: "'DM Sans', sans-serif" }}>
              Generated by BizChat AI &nbsp;•&nbsp; GST Compliant
            </span>
          </div>
        </div>
      </div>

      {/* Action buttons (Mobile-specific sticky footer) */}
      <div className={`${isMobile ? 'fixed bottom-0 left-0 right-0 bg-[#111827] p-6 pb-8 border-t border-gray-800' : 'flex items-center gap-2 px-5 py-3.5 shrink-0 border-t border-gray-200'}`}>
        <button
          onClick={handleWhatsApp}
          disabled={sharing}
          className="w-full flex items-center justify-center gap-2.5 py-4 text-sm font-bold bg-[#22C55E] text-white rounded-xl mb-3 active:scale-95 transition-transform"
        >
          {sharing ? <Loader2 size={18} className="animate-spin" /> : <MessageCircle size={18} />}
          {sharing ? "Sending PDF..." : "Share Invoice"}
        </button>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full flex items-center justify-center gap-2.5 py-4 text-sm font-bold bg-white text-[#111827] rounded-xl border border-gray-200 active:scale-95 transition-transform"
        >
          {downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          Download PDF
        </button>
        
        {isMobile && (
          <button 
            onClick={onClose}
            className="w-full mt-4 text-blue-400 text-[13px] font-semibold bg-transparent border-none"
          >
            Back to Orders
          </button>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────
   MAIN INVOICES PAGE
   ────────────────────────────────────── */
export function InvoicesPage() {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const [selectedInv, setSelectedInv] = useState<InvoiceRow | null>(null);
  const { data: apiOrders, loading } = useOrders();

  const todayLocal = new Date().toLocaleDateString("en-CA");
  const [dateFilter, setDateFilter] = useState<string>(todayLocal);
  const isToday = dateFilter === todayLocal;

  // Safe date formatting — invoice dates from Firestore may be raw strings or missing
  const safeFmtDate = (str: string | undefined | null) => {
    if (!str) return "—";
    const d = new Date(str);
    if (isNaN(d.getTime())) return "—";
    return formatDateOnly(d.toISOString());
  };

  // All invoices from orders that have invoice data
  const allInvoices: InvoiceRow[] = useMemo(() =>
    (apiOrders ?? [])
      .filter((o: Order) => o.invoice != null)
      .map((o: Order) => ({
        invoiceNo: o.invoice!.invoice_number,
        orderRef: `#${o.id.slice(0, 8)}`,
        orderId: o.id,
        date: safeFmtDate(o.invoice!.date),
        rawDate: o.created_at ?? "",
        amount: formatINR(o.invoice!.total),
        gst: formatINR(o.invoice!.cgst + o.invoice!.sgst + (o.invoice!.igst ?? 0)),
        status: "Downloaded" as InvoiceStatus,
        invoice: o.invoice!,
        customerPhone: o.customer_phone ?? null,
        customerName: o.customer_name ?? null,
      })),
    [apiOrders]
  );

  // Filtered by selected date
  const invoices = useMemo(() =>
    allInvoices.filter(inv => {
      if (!inv.rawDate) return false;
      const d = new Date(inv.rawDate);
      return d.toLocaleDateString("en-CA") === dateFilter;
    }),
    [allInvoices, dateFilter]
  );

  const totalInvoiced = invoices.reduce((s, inv) => s + inv.invoice.total, 0);
  const totalGst = invoices.reduce((s, inv) => s + inv.invoice.cgst + inv.invoice.sgst + (inv.invoice.igst ?? 0), 0);
  const pendingCount = (apiOrders ?? []).filter((o: Order) => o.invoice == null && o.status !== "cancelled").length;

  return (
    <div className="p-6 h-full overflow-y-auto" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0" style={{ fontWeight: 700, fontSize: 24, color: "#0D0F12", lineHeight: 1.2 }}>Invoices</h1>
          <p className="m-0 text-[13px]" style={{ color: "#6B7280" }}>GST-compliant invoices auto-generated from confirmed orders.</p>
        </div>
        {/* Date filter */}
        <div className="flex items-center gap-2">
          <label style={{ fontSize: 12, fontWeight: 500, color: "#6B7280", fontFamily: "'DM Sans', sans-serif" }}>Date:</label>
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#0D0F12",
              backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB",
              borderRadius: 8, padding: "6px 10px", cursor: "pointer",
            }}
          />
          {!isToday && (
            <button
              onClick={() => setDateFilter(todayLocal)}
              style={{ fontSize: 11, fontWeight: 600, color: "#2979FF", background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Metric cards (Responsive) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

        <div style={CARD} className="p-6 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span style={LABEL}>TOTAL INVOICED</span>
            <div className="w-[32px] h-[32px] flex items-center justify-center" style={{ backgroundColor: "rgba(26,26,46,0.06)", borderRadius: 10 }}>
              <IndianRupee size={16} color="#1A1A2E" strokeWidth={2} />
            </div>
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 28, color: "#1A1A2E", lineHeight: 1.1 }}>
            {loading ? "…" : formatINR(totalInvoiced)}
          </span>
          <span className="text-[12px]" style={{ color: "#6B7280" }}>{invoices.length} invoices {isToday ? "today" : "on " + dateFilter}</span>
        </div>

        <div style={CARD} className="p-6 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span style={LABEL}>GST COLLECTED</span>
            <div className="w-[32px] h-[32px] flex items-center justify-center" style={{ backgroundColor: "rgba(0,200,83,0.08)", borderRadius: 10 }}>
              <Receipt size={16} color="#00C853" strokeWidth={2} />
            </div>
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 28, color: "#00C853", lineHeight: 1.1 }}>
            {loading ? "…" : formatINR(totalGst)}
          </span>
          <span className="text-[12px]" style={{ color: "#6B7280" }}>CGST + SGST combined</span>
        </div>

        <div style={CARD} className="p-6 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span style={LABEL}>PENDING INVOICE</span>
            <div className="w-[32px] h-[32px] flex items-center justify-center" style={{ backgroundColor: "rgba(255,109,0,0.08)", borderRadius: 10 }}>
              <Download size={16} color="#FF6D00" strokeWidth={2} />
            </div>
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 28, color: "#FF6D00", lineHeight: 1.1 }}>
            {loading ? "…" : pendingCount}
          </span>
          <span className="text-[12px]" style={{ color: "#6B7280" }}>orders without invoices</span>
        </div>
      </div>

      {/* Table + Preview split */}
      <div className="flex gap-4 items-start">
        {/* Invoice table */}
        <div className={selectedInv ? "flex-1 min-w-0" : "w-full"} style={CARD}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #E5E7EB" }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 16, color: "#0D0F12" }}>All Invoices</span>
              <p className="m-0 text-[12px] mt-0.5" style={{ color: "#6B7280" }}>
                {isToday ? "Today" : dateFilter}
              </p>
            </div>
            <span className="text-[12px] px-3 py-1" style={{ fontWeight: 500, color: "#6B7280", backgroundColor: "#F3F4F6", borderRadius: 100 }}>
              {invoices.length} invoices
            </span>
          </div>

          {/* Column headers (Responsive) */}
          <div
            className="grid gap-2 px-6 py-3"
            style={{
              gridTemplateColumns: isMobile ? "110px 1fr 100px" : (selectedInv ? "110px 80px 120px 80px 75px 55px 80px 1fr" : "130px 95px 140px 95px 80px 65px 90px 1fr"),
              backgroundColor: "#F8F9FA",
              borderBottom: "1px solid #E5E7EB",
            }}
          >
            {isMobile ? (
               <>
                <span style={LABEL}>INVOICE NO</span>
                <span style={LABEL}>CUSTOMER</span>
                <span style={LABEL} className="text-right">AMOUNT</span>
               </>
            ) : (
                ["Invoice No", "Order Ref", "Customer", "Amount", "GST", "Status", "Date", "Actions"].map((h) => (
                    <span key={h} style={LABEL}>{h}</span>
                ))
            )}
          </div>


          {/* Empty state */}
          {!loading && invoices.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <FileText size={40} color="#D1D5DB" />
              <span className="text-[14px]" style={{ color: "#9CA3AF", fontWeight: 500 }}>
                No invoices {isToday ? "today" : "on " + dateFilter}
              </span>
              {allInvoices.length > 0 && (
                <button
                  onClick={() => setDateFilter(todayLocal)}
                  style={{ fontSize: 12, color: "#2979FF", fontWeight: 500, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
                >
                  View all {allInvoices.length} invoices →
                </button>
              )}
              {allInvoices.length === 0 && (
                <span className="text-[12px]" style={{ color: "#D1D5DB" }}>Generate invoices from Orders → mark as Paid or Credit</span>
              )}
            </div>
          )}

          {/* Rows (Responsive) */}
          {invoices.map((inv, i) => (
            <div
              key={inv.invoiceNo}
              className="grid gap-2 px-6 py-4 items-center cursor-pointer"
              onClick={() => isMobile && setSelectedInv(inv)}
              style={{
                gridTemplateColumns: isMobile ? "110px 1fr 100px" : (selectedInv ? "110px 80px 120px 80px 75px 55px 80px 1fr" : "130px 95px 140px 95px 80px 65px 90px 1fr"),
                borderBottom: i < invoices.length - 1 ? "1px solid #F3F4F6" : "none",
                transition: "background-color 0.1s",
                backgroundColor: selectedInv?.invoiceNo === inv.invoiceNo ? "rgba(41,121,255,0.03)" : "transparent",
              }}
            >
              {isMobile ? (
                  <>
                    <span style={{ ...MONO, color: "#2979FF", fontSize: 13 }}>{inv.invoiceNo}</span>
                    <span className="text-[14px] truncate" style={{ fontWeight: 600, color: "#0D0F12" }}>{inv.customerName || inv.customerPhone || "—"}</span>
                    <span className="text-right" style={{ ...MONO, color: "#0D0F12", fontSize: 13 }}>{inv.amount}</span>
                  </>
              ) : (
                  <>
                    <span style={{ ...MONO, color: "#2979FF", fontSize: 12 }}>{inv.invoiceNo}</span>
                    <span style={{ ...MONO, color: "#0D0F12", fontSize: 12 }}>{inv.orderRef}</span>
                    <span className="text-[13px] truncate" style={{ fontWeight: 500, color: "#0D0F12" }}>{inv.customerName || inv.customerPhone || "—"}</span>
                    <span style={{ ...MONO, color: "#0D0F12", fontSize: 12 }}>{inv.amount}</span>
                    <span style={{ ...MONO, color: "#6B7280", fontSize: 11 }}>{inv.gst}</span>
                    <StatusPill status={inv.status} />
                    <span className="text-[12px]" style={{ color: "#6B7280" }}>{inv.date}</span>
                    <div className="flex items-center gap-1.5">
                        {/* Desktop actions remain as they were */}
                        <button
                        onClick={(e) => { e.stopPropagation(); setSelectedInv(selectedInv?.invoiceNo === inv.invoiceNo ? null : inv); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] cursor-pointer"
                        style={{
                            fontFamily: "'DM Sans', sans-serif",
                            fontWeight: 500,
                            color: selectedInv?.invoiceNo === inv.invoiceNo ? "#2979FF" : "#6B7280",
                            backgroundColor: selectedInv?.invoiceNo === inv.invoiceNo ? "rgba(41,121,255,0.06)" : "#FFFFFF",
                            borderRadius: 6,
                            border: `1px solid ${selectedInv?.invoiceNo === inv.invoiceNo ? "#2979FF" : "#E5E7EB"}`,
                        }}
                        >
                        <Eye size={12} />
                        Preview
                        </button>
                    </div>
                  </>
              )}
            </div>
          ))}

        </div>

        {/* Real PDF Preview Panel */}
        {selectedInv && (
          <div style={{ width: "45%", flexShrink: 0, minHeight: 600 }}>
            <PDFPreviewPanel inv={selectedInv} onClose={() => setSelectedInv(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
