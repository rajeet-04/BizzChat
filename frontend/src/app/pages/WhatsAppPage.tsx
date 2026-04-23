import React, { useEffect, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate } from "react-router";
import { useAuth } from "../AuthContext";
import { API_BASE_URL, SOCKET_URL } from "@/lib/config";


type WAState =
  | "idle"
  | "connecting"
  | "qr_pending"
  | "authenticated"
  | "ready"
  | "auth_failure"
  | "disconnected";

function getStoredBusiness() {
  try {
    const s = localStorage.getItem("bizchat_business");
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function WhatsAppPage() {
  const navigate = useNavigate();
  const { login, user } = useAuth();
  const orgId = user?.orgId || "local-org";
  // Initialise as "ready" immediately if already connected via QR scan
  const [state, setState] = useState<WAState>(() => {
    const stored = getStoredBusiness();
    return stored?.connected === true ? "ready" : "idle";
  });
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [businessInfo, setBusinessInfo] = useState(() => getStoredBusiness());

  // Verify status from backend to stay in sync (non-blocking)
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/whatsapp/status/${orgId}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.status === "connected") setState("ready");
        else if (res.status === "connecting") setState("connecting");
        // Only reset to idle if localStorage also doesn't show connected
        else if (!getStoredBusiness()?.connected) setState("idle");
      })
      .catch(() => {});
  }, [orgId]);

  // Socket.io lifecycle — always listen so live events update state
  useEffect(() => {
    const socket: Socket = io(SOCKET_URL, { query: { orgId } });

    socket.on("wa:qr", (data: string) => {
      setQr(data);
      setState("qr_pending");
    });

    socket.on("wa:authenticated", () => {
      setState("authenticated");
      setQr(null);
    });

    socket.on("wa:ready", async (info: { name: string; phone: string }) => {
      setState("ready");
      setQr(null);
      if (info?.name) {
        const updated = { ...getStoredBusiness(), ...info, connected: true, connectedAt: new Date().toISOString() };
        localStorage.setItem("bizchat_business", JSON.stringify(updated));
        setBusinessInfo(updated);
      }
    });

    socket.on("wa:auth_failure", (msg: string) => {
      setState("auth_failure");
      setError(msg);
      setQr(null);
    });

    socket.on("wa:disconnected", (reason: string) => {
      setState("disconnected");
      setError(reason);
      setQr(null);
    });

    return () => {
      socket.disconnect();
    };
  }, [login, orgId]);

  const handleConnect = useCallback(async () => {
    setError(null);
    setState("connecting");
    try {
      await fetch(`${API_BASE_URL}/api/whatsapp/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
    } catch (err: any) {
      setError(err.message ?? "Failed to initiate connection");
      setState("idle");
    }
  }, [orgId]);

  const handleDisconnect = useCallback(async () => {
    if (!window.confirm("Disconnect WhatsApp? This will remove BizChat from your phone's Linked Devices.")) return;
    try {
      await fetch(`${API_BASE_URL}/api/whatsapp/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
    } catch (_) {
      // Proceed with local cleanup even if backend unreachable
    }
    setState("idle");
    setQr(null);
    localStorage.removeItem("bizchat_business");
    setBusinessInfo(null);
    window.dispatchEvent(new CustomEvent("bizchat_logout"));
    navigate("/landing");
  }, [navigate]);

  return (
    <div className="flex flex-col gap-6 p-8 max-w-[640px] mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#25D366" }}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="white">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
          </svg>
        </div>
        <div>
          <h1 className="text-[20px] font-bold text-gray-900">WhatsApp Business</h1>
          <p className="text-[13px] text-gray-500">Link your account to receive and process orders</p>
        </div>
      </div>

      {/* Status card */}
      <StatusBadge state={state} />

      {/* Idle / disconnected — prompt to connect */}
      {(state === "idle" || state === "disconnected" || state === "auth_failure") && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 flex flex-col items-center gap-5 shadow-sm">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: "#f0fdf4" }}>
            <svg viewBox="0 0 24 24" width="32" height="32" fill="#25D366">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-[16px] font-semibold text-gray-900 mb-1">Connect your WhatsApp Business</p>
            <p className="text-[13px] text-gray-500 max-w-[320px]">
              Scan a QR code with your phone to link your account and start receiving orders automatically.
            </p>
          </div>
          {error && (
            <div className="w-full px-4 py-3 rounded-xl text-[13px] text-red-600 bg-red-50 border border-red-100">
              {error}
            </div>
          )}
          <button
            onClick={handleConnect}
            className="px-6 py-2.5 rounded-xl text-[14px] font-semibold text-white cursor-pointer transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#25D366" }}
          >
            Connect WhatsApp
          </button>
        </div>
      )}

      {/* QR panel */}
      {state === "qr_pending" && qr && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <p className="text-[15px] font-semibold text-gray-900">Scan QR Code</p>
            <p className="text-[13px] text-gray-500 mt-0.5">Use WhatsApp on your phone to scan</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-6 p-6">
            <div className="shrink-0 p-3 rounded-2xl border border-gray-200 shadow-inner bg-white">
              <QRCodeSVG value={qr} size={200} />
            </div>
            <ol className="text-[13px] text-gray-600 space-y-3 list-none">
              {[
                "Open WhatsApp on your phone",
                "Tap ⋮ Menu or Settings",
                "Select Linked Devices",
                "Tap Link a Device",
                "Point your phone at this QR code",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="shrink-0 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: "#25D366" }}>
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="px-6 pb-6">
            <button
              onClick={handleDisconnect}
              className="text-[13px] text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Connecting / authenticating spinner */}
      {(state === "connecting" || state === "authenticated") && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-10 flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-[3px] border-gray-200 border-t-[#25D366] rounded-full animate-spin" />
          <p className="text-[14px] font-medium text-gray-700">
            {state === "connecting" ? "Starting WhatsApp session…" : "Authenticated — syncing…"}
          </p>
          <p className="text-[12px] text-gray-400">This may take a few seconds</p>
        </div>
      )}

      {/* Ready / connected */}
      {state === "ready" && (
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden" style={{ borderColor: "#bbf7d0" }}>
          {/* Green top accent bar */}
          <div className="h-1.5 w-full" style={{ backgroundColor: "#25D366" }} />
          <div className="p-6 flex flex-col gap-5">
            {/* Business info row */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#dcfce7" }}>
                <svg viewBox="0 0 24 24" width="28" height="28" fill="#16a34a">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[17px] font-bold text-gray-900 truncate">
                  {businessInfo?.name ?? "Your Business"}
                </p>
                <p className="text-[13px] text-gray-500">
                  {businessInfo?.phone ? `+${businessInfo.phone}` : "WhatsApp Business"}
                </p>
              </div>
              <span className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold" style={{ color: "#16a34a", backgroundColor: "#dcfce7" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                Active
              </span>
            </div>

            {/* Info row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-4 bg-gray-50 border border-gray-100">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Status</p>
                <p className="text-[14px] font-semibold text-gray-800">Connected</p>
              </div>
              <div className="rounded-xl p-4 bg-gray-50 border border-gray-100">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Since</p>
                <p className="text-[14px] font-semibold text-gray-800">
                  {businessInfo?.connectedAt
                    ? new Date(businessInfo.connectedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                    : "Today"}
                </p>
              </div>
            </div>

            {/* Disconnect & Test */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 rounded-lg text-[13px] font-medium text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 cursor-pointer transition-colors"
              >
                Disconnect Account
              </button>
              
              <button
                onClick={async () => {
                  try {
                    await fetch(`${API_BASE_URL}/api/whatsapp/test-notify/${orgId}`);
                  } catch (_) {}
                }}
                className="px-4 py-2 rounded-lg text-[13px] font-medium text-blue-500 border border-blue-200 bg-blue-50 hover:bg-blue-100 cursor-pointer transition-colors"
              >
                Test Notifications
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error (standalone) */}
      {error && state !== "idle" && state !== "disconnected" && state !== "auth_failure" && (
        <div className="px-4 py-3 rounded-xl text-[13px] text-red-600 bg-red-50 border border-red-100">
          {error}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ state }: { state: WAState }) {
  const config: Record<WAState, { label: string; color: string; bg: string; border: string; dot: string }> = {
    idle:          { label: "Not Connected",  color: "#6b7280", bg: "#f3f4f6",  border: "#e5e7eb", dot: "#9ca3af" },
    connecting:    { label: "Connecting…",    color: "#92400e", bg: "#fffbeb",  border: "#fde68a", dot: "#f59e0b" },
    qr_pending:    { label: "Waiting for Scan", color: "#1e40af", bg: "#eff6ff", border: "#bfdbfe", dot: "#3b82f6" },
    authenticated: { label: "Authenticating", color: "#92400e", bg: "#fffbeb",  border: "#fde68a", dot: "#f59e0b" },
    ready:         { label: "Connected",      color: "#166534", bg: "#f0fdf4",  border: "#bbf7d0", dot: "#22c55e" },
    auth_failure:  { label: "Auth Failed",    color: "#991b1b", bg: "#fef2f2",  border: "#fecaca", dot: "#ef4444" },
    disconnected:  { label: "Disconnected",   color: "#991b1b", bg: "#fef2f2",  border: "#fecaca", dot: "#ef4444" },
  };

  const c = config[state];

  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-semibold border w-fit"
      style={{ color: c.color, backgroundColor: c.bg, borderColor: c.border }}
    >
      <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: c.dot }} />
      {c.label}
    </div>
  );
}
