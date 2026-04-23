import { useEffect } from "react";
import { useToast } from "@/app/components/ToastProvider";
import { formatINR } from "@/lib/format";
import { initSocket, disconnectSocket } from "@/lib/socket";


/**
 * Connects to the backend Socket.IO server with the given orgId
 * and shows toast notifications when new WhatsApp orders arrive.
 * 
 * Mount this once at the app shell level (e.g. Layout.tsx).
 * Uses a singleton socket so all pages share one connection.
 */
export function useOrderNotifications(orgId: string | undefined) {
  const { push } = useToast();

  useEffect(() => {
    if (!orgId) return;

    const socket = initSocket(orgId);

    socket.on("connect", () => {
      console.info("[BizChat] Socket connected to org room:", orgId);
    });

    const handleOrder = (data: {
      id: string;
      customerName: string;
      itemCount: number;
      items: string[];
      total: number | null;
      createdAt: string;
    }) => {
      const itemPreview = data.items?.length > 0
        ? data.items.join(", ") + (data.itemCount > 2 ? ` +${data.itemCount - 2} more` : "")
        : `${data.itemCount} item${data.itemCount !== 1 ? "s" : ""}`;

      push({
        kind: "order",
        title: `🛒 New order from ${data.customerName || "WhatsApp"}`,
        message: data.total
          ? `${itemPreview} · ${formatINR(data.total)}`
          : itemPreview,
        duration: 8000,
      });

      // Dispatch a global event so the Dashboard and other pages automatically refresh their data
      window.dispatchEvent(new CustomEvent("bizchat:refresh_orders"));
    };

    socket.on("order:new", handleOrder);

    socket.on("wa:message_received", (data: { senderName: string }) => {
      push({
        kind: "info",
        title: `💬 Message from ${data.senderName}`,
        message: "Message received, preparing to process...",
        duration: 3000,
      });
    });

    socket.on("wa:extraction_started", (data: { senderName: string }) => {
      push({
        kind: "info",
        title: "🧠 AI Extraction",
        message: `Analyzing orders from ${data.senderName}...`,
        duration: 8000,
      });
    });

    socket.on("wa:extraction_failed", (data: { senderName: string, error: string }) => {
      push({
        kind: "error",
        title: "❌ Extraction Failed",
        message: `AI failed for ${data.senderName}: ${data.error}`,
        duration: 10000,
      });
    });

    socket.on("disconnect", () => {
      console.info("[BizChat] Socket disconnected");
    });

    return () => {
      socket.off("order:new", handleOrder);
      // Don't disconnect here — singleton lives for the app session.
      // Only disconnect on logout via disconnectSocket().
    };
  }, [orgId]);
}

export { disconnectSocket };
