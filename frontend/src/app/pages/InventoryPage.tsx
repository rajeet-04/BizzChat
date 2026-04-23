import React, { useEffect, useRef, useState } from "react";
import { Package, RefreshCw } from "lucide-react";
import { useApiClient } from "../ApiClientContext";
import { getSocket } from "@/lib/socket";
import type { InventoryItem } from "@/lib/types";
import { toBaseUnit } from "@/lib/format";

const CARD: React.CSSProperties = {
  backgroundColor: "#FFFFFF",
  borderRadius: 16,
  border: "1px solid #E5E7EB",
  boxShadow: "0px 2px 12px rgba(0,0,0,0.07)",
  fontFamily: "'DM Sans', sans-serif",
};

export interface MergedInventoryItem extends InventoryItem {
  price: number | null;
}

export function InventoryPage() {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const client = useApiClient();
  const [items, setItems] = useState<MergedInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Price editing state
  const [editingPriceName, setEditingPriceName] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);

  const fetchInventory = async () => {
    setLoading(true);
    setError(null);
    try {
      const [invData, catData] = await Promise.all([
        client.getInventory(),
        client.getCatalog()
      ]);

      const priceMap = new Map(catData.items.map(i => [i.name, i.price]));

      const merged = invData.items.map(i => ({
        ...i,
        price: priceMap.get(i.name) ?? null
      }));

      setItems(merged);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  };

  const fetchRef = useRef(fetchInventory);
  useEffect(() => { fetchRef.current = fetchInventory; });

  // Initial load
  useEffect(() => {
    fetchInventory();
  }, []);

  // Real-time: refresh inventory whenever a new order arrives
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = () => fetchRef.current();
    socket.on("order:new", handler);
    return () => { socket.off("order:new", handler); };
  }, []);

  const handlePriceSave = async (name: string, unit: string) => {
    if (!editPriceValue) {
      setEditingPriceName(null);
      return;
    }
    const val = parseFloat(editPriceValue);
    if (isNaN(val)) return;

    setSavingPrice(true);
    try {
      await client.updateCatalogPrice(name, val, unit);
      setItems(prev => prev.map(i => i.name === name ? { ...i, price: val } : i));
      setEditingPriceName(null);
    } catch (err: any) {
      alert("Failed to update price: " + err.message);
    } finally {
      setSavingPrice(false);
    }
  };

  return (
    <div className="p-6" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col gap-1">
          <h1
            className="m-0"
            style={{ fontWeight: 700, fontSize: 24, color: "#0D0F12", lineHeight: 1.2 }}
          >
            Inventory & Catalog
          </h1>
          <p className="m-0 text-[13px]" style={{ color: "#6B7280" }}>
            Real-time stock and prices derived from your order history. Set prices here to help AI extraction.
          </p>
        </div>
        <button
          onClick={fetchInventory}
          disabled={loading || savingPrice}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 8,
            border: "1px solid #E5E7EB",
            backgroundColor: "#fff",
            cursor: (loading || savingPrice) ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 500,
            color: "#374151",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div style={CARD} className="overflow-hidden">
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid #E5E7EB" }}
        >
          <span style={{ fontWeight: 600, fontSize: 16, color: "#0D0F12" }}>
            Stock & Prices
          </span>
          <span className="text-[12px]" style={{ color: "#6B7280" }}>
            {loading ? "Loading…" : `${items.length} product${items.length !== 1 ? "s" : ""}`}
          </span>
        </div>

        {/* Header row */}
        <div
          className="grid px-6 py-3 gap-3"
          style={{
            gridTemplateColumns: isMobile ? "1.2fr 1fr" : "1fr 200px",
            backgroundColor: "#F8F9FA",
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          {["Item Name", "Price per Unit"].map((h) => (
            <span
              key={h}
              className="text-[11px] tracking-[0.06em] uppercase"
              style={{ fontWeight: 600, color: "#6B7280", fontFamily: "'DM Sans', sans-serif" }}
            >
              {h}
            </span>
          ))}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="px-6 py-10 flex items-center justify-center gap-3" style={{ color: "#6B7280" }}>
            <RefreshCw size={18} className="animate-spin" />
            <span className="text-[14px]">Syncing inventory...</span>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="px-6 py-10 flex flex-col items-center gap-2">
            <span className="text-[14px]" style={{ color: "#D32F2F" }}>{error}</span>
            <button
              onClick={fetchInventory}
              className="px-4 py-2 border rounded-lg text-[13px] text-blue-600 border-blue-200"
            >
              Try again
            </button>
          </div>
        )}

        {/* Data rows */}
        {!loading && !error && items.map((item, i) => (
          <div
            key={item.name}
            className="grid px-6 py-4 gap-3 items-center hover:bg-gray-50 transition-colors"
            style={{
              gridTemplateColumns: isMobile ? "1.2fr 1fr" : "1fr 200px",
              borderBottom: i < items.length - 1 ? "1px solid #F3F4F6" : "none",
            }}
          >
            {/* Item name + unit label */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[14px]" style={{ fontWeight: 700, color: "#0D0F12" }}>
                {item.name}
              </span>
              <span className="text-[11px] text-gray-400 font-medium tracking-wide">
                per {toBaseUnit(item.unit) ?? item.unit}
              </span>
            </div>

            {/* Price cell */}
            <div className="flex items-center">
              {editingPriceName === item.name ? (
                <div className="flex items-center gap-2 w-full">
                  <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[12px]">₹</span>
                    <input
                      type="number"
                      value={editPriceValue}
                      onChange={(e) => setEditPriceValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handlePriceSave(item.name, item.unit);
                        if (e.key === "Escape") setEditingPriceName(null);
                      }}
                      autoFocus
                      className="w-full pl-5 pr-2 py-1.5 text-[14px] border border-blue-400 rounded-lg focus:ring-0 font-mono shadow-sm"
                      disabled={savingPrice}
                    />
                  </div>
                  <button
                    onClick={() => handlePriceSave(item.name, item.unit)}
                    className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                    disabled={savingPrice}
                  >
                    {savingPrice ? <RefreshCw size={14} className="animate-spin" /> : <Package size={14} />}
                  </button>
                </div>
              ) : (
                <div
                  className="flex items-center gap-2 group cursor-pointer w-full"
                  onClick={() => {
                    setEditPriceValue(item.price?.toString() ?? "");
                    setEditingPriceName(item.name);
                  }}
                >
                  <div className="flex flex-col items-start">
                    <span
                      className="text-[15px]"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 700,
                        color: item.price ? "#1A1A2E" : "#94A3B8",
                      }}
                    >
                      {item.price ? `₹${item.price}` : "Set Price"}
                    </span>
                    <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">TAP TO EDIT</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        className="flex items-center justify-center gap-3 mt-6 p-6"
        style={CARD}
      >
        <Package size={20} color="#6B7280" />
        <span className="text-[14px]" style={{ color: "#6B7280" }}>
          Inventory is derived from all your orders. Click a price to set or update it.
        </span>
      </div>
    </div>
  );
}
