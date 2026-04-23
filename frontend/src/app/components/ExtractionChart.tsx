import React, { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import { useApiClient } from "../ApiClientContext";
import type { Order } from "@/lib/types";

interface ChartPoint {
  label: string;
  orders: number;
}

function buildChartData(orders: Order[]): ChartPoint[] {
  // Group orders by day over last 7 days
  const now = new Date();
  const points: ChartPoint[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString("en-IN", { weekday: "short" });
    const dateStr = d.toISOString().slice(0, 10);
    const count = orders.filter((o) => o.created_at?.slice(0, 10) === dateStr).length;
    points.push({ label, orders: count });
  }
  return points;
}

export function ExtractionChart() {
  const client = useApiClient();
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    client.getOrders(200, 0)
      .then((orders) => {
        const data = buildChartData(orders);
        setChartData(data);
        setTotal(orders.length);
      })
      .catch(() => setChartData([]))
      .finally(() => setLoading(false));
  }, []);

  const peakPoint = chartData.reduce(
    (max, p) => (p.orders > max.orders ? p : max),
    { label: "", orders: 0 }
  );

  return (
    <div
      className="flex flex-col col-span-3"
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
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid #E5E7EB" }}
      >
        <div className="flex flex-col gap-0.5">
          <span style={{ fontWeight: 600, fontSize: 18, color: "#0D0F12" }}>
            Order Activity — Last 7 Days
          </span>
          <span className="text-[12px]" style={{ color: "#6B7280" }}>
            {loading ? "Loading…" : `${total} total orders`}
          </span>
        </div>
        {!loading && peakPoint.orders > 0 && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1"
            style={{
              backgroundColor: "rgba(41,121,255,0.06)",
              borderRadius: 100,
            }}
          >
            <span
              className="text-[11px]"
              style={{ fontWeight: 600, color: "#2979FF" }}
            >
              Peak: {peakPoint.label} ({peakPoint.orders})
            </span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="px-4 py-4 flex-1" style={{ minHeight: 200 }}>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart
            data={chartData}
            margin={{ top: 20, right: 20, left: -10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2979FF" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#2979FF" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#F3F4F6"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#6B7280", fontFamily: "'DM Sans', sans-serif" }}
              axisLine={{ stroke: "#E5E7EB" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6B7280", fontFamily: "'DM Sans', sans-serif" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #E5E7EB",
                borderRadius: 10,
                boxShadow: "0px 2px 12px rgba(0,0,0,0.07)",
                fontSize: 12,
                fontFamily: "'DM Sans', sans-serif",
              }}
              labelStyle={{ fontWeight: 600, color: "#0D0F12" }}
              formatter={(v: number) => [`${v} orders`, "Orders"]}
            />
            <Area
              type="monotone"
              dataKey="orders"
              stroke="#2979FF"
              strokeWidth={2.5}
              fill="url(#chartGrad)"
            />
            {peakPoint.orders > 0 && (
              <ReferenceDot
                x={peakPoint.label}
                y={peakPoint.orders}
                r={5}
                fill="#2979FF"
                stroke="#FFFFFF"
                strokeWidth={2}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
