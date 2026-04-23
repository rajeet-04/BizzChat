import React, { useEffect, useState } from "react";
import { FileWarning, Clock, HelpCircle, CheckCircle, RefreshCw } from "lucide-react";
import { useApiClient } from "../ApiClientContext";
import { useNavigate } from "react-router";
import type { Order } from "@/lib/types";

interface ActionItem {
  icon: React.ReactNode;
  text: string;
  cta: string;
  orderId?: string;
  ctaRoute?: string;
}

function deriveActions(orders: Order[]): ActionItem[] {
  const items: ActionItem[] = [];

  // Pending orders without invoices → need confirmation
  const pendingNoInvoice = orders.filter(
    (o) => o.status === "pending" && !o.invoice
  );
  for (const o of pendingNoInvoice.slice(0, 3)) {
    const shortId = o.id.slice(0, 8).toUpperCase();
    items.push({
      icon: <FileWarning size={16} color="#FF6D00" />,
      text: `Invoice missing for #${shortId}`,
      cta: "Generate",
      orderId: o.id,
      ctaRoute: "/invoices",
    });
  }

  // Low-confidence orders → need review
  const lowConf = orders.filter(
    (o) => o.confidence === "low" && o.status === "pending"
  );
  for (const o of lowConf.slice(0, 2)) {
    const shortId = o.id.slice(0, 8).toUpperCase();
    items.push({
      icon: <HelpCircle size={16} color="#FF6D00" />,
      text: `Low-confidence extraction: #${shortId}`,
      cta: "Review",
      orderId: o.id,
      ctaRoute: "/orders",
    });
  }

  // Orders pending for > 2 days → follow-up
  const twoDaysAgo = Date.now() - 1000 * 60 * 60 * 48;
  const stale = orders.filter(
    (o) =>
      o.status === "pending" &&
      new Date(o.created_at).getTime() < twoDaysAgo
  );
  for (const o of stale.slice(0, 2)) {
    const shortId = o.id.slice(0, 8).toUpperCase();
    items.push({
      icon: <Clock size={16} color="#FF6D00" />,
      text: `Follow-up overdue: #${shortId}`,
      cta: "Confirm",
      orderId: o.id,
      ctaRoute: "/orders",
    });
  }

  return items.slice(0, 6);
}

export function ActionQueue() {
  const client = useApiClient();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await client.getOrders(100, 0);
      setOrders(data);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const actions = deriveActions(orders);

  return (
    <div
      className="flex flex-col col-span-1"
      style={{
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        border: "1px solid #E5E7EB",
        boxShadow: "0px 2px 12px rgba(0,0,0,0.07)",
        fontFamily: "'DM Sans', sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid #E5E7EB" }}
      >
        <span style={{ fontWeight: 600, fontSize: 18, color: "#0D0F12" }}>
          Action Queue
        </span>
        <div className="flex items-center gap-2">
          {actions.length > 0 && (
            <span
              className="flex items-center justify-center w-[24px] h-[24px] text-[12px]"
              style={{
                backgroundColor: "#FF6D00",
                color: "#FFFFFF",
                borderRadius: 100,
                fontWeight: 700,
              }}
            >
              {actions.length}
            </span>
          )}
          <button
            onClick={load}
            title="Refresh"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
          >
            <RefreshCw size={14} color="#9CA3AF" style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Content */}
      <div className="flex flex-col gap-2 p-4">
        {loading && (
          <div className="flex items-center justify-center py-8 gap-2" style={{ color: "#9CA3AF" }}>
            <RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} />
            <span className="text-[13px]">Loading…</span>
          </div>
        )}

        {!loading && actions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <CheckCircle size={28} color="#00C853" />
            <span className="text-[13px]" style={{ color: "#6B7280", textAlign: "center" }}>
              All caught up! No pending actions.
            </span>
          </div>
        )}

        {!loading && actions.map((action, i) => (
          <div
            key={i}
            className="flex items-start gap-3 p-3"
            style={{
              borderRadius: 12,
              backgroundColor: "#FFFAF5",
              borderLeft: "3px solid #FF6D00",
            }}
          >
            <div className="shrink-0 mt-0.5">{action.icon}</div>
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <span
                className="text-[13px]"
                style={{ fontWeight: 500, color: "#0D0F12", lineHeight: 1.4 }}
              >
                {action.text}
              </span>
              <button
                className="self-start px-3 py-1 text-[11px] cursor-pointer"
                onClick={() => action.ctaRoute && navigate(action.ctaRoute)}
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 600,
                  color: "#FF6D00",
                  backgroundColor: "rgba(255,109,0,0.08)",
                  borderRadius: 6,
                  border: "1px solid rgba(255,109,0,0.2)",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#FF6D00";
                  e.currentTarget.style.color = "#FFFFFF";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255,109,0,0.08)";
                  e.currentTarget.style.color = "#FF6D00";
                }}
              >
                {action.cta}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
