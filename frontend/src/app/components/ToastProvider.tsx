import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { CheckCircle2, X, ShoppingCart, AlertCircle, Info } from "lucide-react";

/* ─── Types ─── */
export type ToastKind = "order" | "success" | "error" | "info";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  duration?: number; // ms, default 5000
}

interface ToastContextValue {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside <ToastProvider>");
  return ctx;
}

/* ─── Icon per kind ─── */
function ToastIcon({ kind }: { kind: ToastKind }) {
  switch (kind) {
    case "order":   return <ShoppingCart size={17} color="#2979FF" />;
    case "success": return <CheckCircle2 size={17} color="#00C853" />;
    case "error":   return <AlertCircle size={17} color="#D32F2F" />;
    case "info":    return <Info size={17} color="#6B7280" />;
  }
}

const KIND_STYLES: Record<ToastKind, { border: string; bg: string; dot: string }> = {
  order:   { border: "rgba(41,121,255,0.25)",  bg: "#FFFFFF", dot: "#2979FF" },
  success: { border: "rgba(0,200,83,0.25)",    bg: "#FFFFFF", dot: "#00C853" },
  error:   { border: "rgba(211,47,47,0.25)",   bg: "#FEF2F2", dot: "#D32F2F" },
  info:    { border: "rgba(107,114,128,0.2)",  bg: "#FFFFFF", dot: "#9E9E9E" },
};

/* ─── Single Toast ─── */
function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const s = KIND_STYLES[toast.kind];
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "14px 16px",
        backgroundColor: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 14,
        boxShadow: "0px 8px 30px rgba(0,0,0,0.12)",
        fontFamily: "'DM Sans', sans-serif",
        minWidth: 300,
        maxWidth: 380,
        position: "relative",
        transform: visible ? "translateX(0)" : "translateX(110%)",
        opacity: visible ? 1 : 0,
        transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease",
        overflow: "hidden",
      }}
    >
      {/* Accent left bar */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: s.dot, borderRadius: "14px 0 0 14px" }} />

      {/* Icon */}
      <div style={{ paddingLeft: 2, paddingTop: 2, flexShrink: 0 }}>
        <ToastIcon kind={toast.kind} />
      </div>

      {/* Content */}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#0D0F12", lineHeight: 1.4 }}>
          {toast.title}
        </div>
        {toast.message && (
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2, lineHeight: 1.5 }}>
            {toast.message}
          </div>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#9E9E9E", flexShrink: 0 }}
      >
        <X size={14} />
      </button>

      {/* Progress bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 2,
          backgroundColor: s.dot,
          opacity: 0.35,
          animation: `toastProgress ${toast.duration ?? 5000}ms linear forwards`,
        }}
      />
    </div>
  );
}

/* ─── Provider ─── */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = `${Date.now()}-${Math.random()}`;
    const duration = t.duration ?? 5000;
    setToasts(prev => [...prev.slice(-4), { ...t, id, duration }]); // max 5 visible
    const timer = setTimeout(() => dismiss(id), duration + 400); // +400ms for animation out
    timers.current.set(id, timer);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toasts, push, dismiss }}>
      {children}

      {/* Toast stack — bottom-right */}
      <div
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "flex-end",
        }}
      >
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>

      <style>{`
        @keyframes toastProgress {
          from { transform: scaleX(1); transform-origin: left; }
          to   { transform: scaleX(0); transform-origin: left; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
