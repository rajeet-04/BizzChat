import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { X, RefreshCw, Wifi, CheckCircle, AlertTriangle, Clock } from "lucide-react";
import { io, Socket } from "socket.io-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { WhatsAppQRCode } from "./WhatsAppQRCode";
import { Button } from "./ui/button";
import { useAuth } from "../AuthContext";
import { API_BASE_URL, SOCKET_URL } from "@/lib/config";

interface WhatsAppConnectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ModalStep = "scanning" | "connected";

interface BusinessInfo {
  name: string;
  phone: string;
  connected: boolean;
  connectedAt: string;
}

// Maximum wait time for QR to appear (2 minutes)
const QR_TIMEOUT_MS = 120_000;

export function WhatsAppConnectionModal({
  open,
  onOpenChange,
}: WhatsAppConnectionModalProps) {
  const navigate = useNavigate();
  const { loginWithToken, user } = useAuth();
  const [step, setStep] = useState<ModalStep>("scanning");
  const [qrCode, setQrCode] = useState<string>("");
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [connectionState, setConnectionState] = useState<"waiting" | "scanning" | "connecting" | "connected" | "error" | "timeout">("waiting");
  const [error, setError] = useState<string>("");
  const [retryCount, setRetryCount] = useState(0);
  const [elapsedSecs, setElapsedSecs] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startConnection = useCallback(() => {
    cleanup();

    // Resolve orgId — in order of priority:
    // 1. Live auth context (logged-in user)
    // 2. Last known auth from localStorage (logged-out but previously connected)
    // 3. Random 'pending-' UUID — anonymous first-time connection
    let orgId = user?.orgId;
    if (!orgId) {
      try {
        const cached = JSON.parse(localStorage.getItem("bizchat_auth_v2") || "{}");
        orgId = cached?.user?.orgId;
      } catch (_) {}
    }
    if (!orgId) orgId = `pending-${crypto.randomUUID()}`;

    console.log("[BizChat] WhatsApp modal orgId:", orgId, "| SOCKET_URL:", SOCKET_URL);

    setQrCode("");
    setBusinessInfo(null);
    setConnectionState("waiting");
    setError("");
    setElapsedSecs(0);

    // Elapsed timer — shows user how long they've been waiting
    let elapsed = 0;
    timerRef.current = setInterval(() => {
      elapsed += 1;
      setElapsedSecs(elapsed);
    }, 1000);

    // QR timeout — if no QR in 2 minutes, show timeout state
    timeoutRef.current = setTimeout(() => {
      if (!qrCode) {
        setConnectionState("timeout");
      }
    }, QR_TIMEOUT_MS);

    const newSocket = io(SOCKET_URL, {
      query: { orgId },
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
    socketRef.current = newSocket;

    newSocket.on("connect", () => {
      console.log("[BizChat] Socket connected! Calling /api/whatsapp/connect...");

      fetch(`${API_BASE_URL}/api/whatsapp/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      })
        .then((res) => res.json())
        .then((data) => {
          console.log("[BizChat] /whatsapp/connect:", data);
        })
        .catch((err) => {
          console.error("[BizChat] /whatsapp/connect failed:", err);
          setError("Could not reach the server. Check your internet connection.");
          setConnectionState("error");
        });
    });

    newSocket.on("connect_error", (err) => {
      console.error("[BizChat] Socket connect error:", err.message, "| URL attempted:", SOCKET_URL);
      setError(`Server unreachable (${err.message}). Check DNS or internet.`);
      setConnectionState("error");
    });

    newSocket.on("wa:qr", (qr: string) => {
      // Clear timeout — QR arrived
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setQrCode(qr);
      setConnectionState("scanning");
    });

    newSocket.on("wa:authenticated", () => {
      setConnectionState("connecting");
    });

    newSocket.on("wa:ready", async (info: BusinessInfo) => {
      localStorage.setItem("bizchat_business", JSON.stringify(info));
      setBusinessInfo(info);
      setConnectionState("connected");
      setStep("connected");

      try {
        const authRes = await fetch(`${API_BASE_URL}/api/auth/whatsapp-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: info.phone, businessName: info.name }),
        });
        if (authRes.ok) {
          const authData = await authRes.json();
          const realOrgId: string = authData.user.orgId;

          if (realOrgId && realOrgId !== orgId) {
            fetch(`${API_BASE_URL}/api/whatsapp/remap-session`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fromOrgId: orgId, toOrgId: realOrgId }),
            }).catch(() => {});
          }

          loginWithToken(authData.token, authData.user);
        }
      } catch (e) {
        console.error("WhatsApp session auth failed:", e);
      }

      setTimeout(() => {
        onOpenChange(false);
        navigate("/");
      }, 2000);
    });

    newSocket.on("wa:auth_failure", (msg: string) => {
      setError(`Authentication failed: ${msg}`);
      setConnectionState("error");
    });

    newSocket.on("wa:disconnected", (reason: string) => {
      setError(`Disconnected: ${reason}. Tap Try Again.`);
      setConnectionState("error");
    });
  }, [user?.orgId, cleanup, loginWithToken, navigate, onOpenChange]);

  // Start connection when modal opens
  useEffect(() => {
    if (open) {
      setStep("scanning");
      setRetryCount(0);
      startConnection();
    } else {
      cleanup();
      setQrCode("");
      setStep("scanning");
      setConnectionState("waiting");
      setError("");
    }
    return cleanup;
  }, [open]);

  const handleRetry = () => {
    setRetryCount((c) => c + 1);
    startConnection();
  };

  // ── Status indicator content ──────────────────────────────────────────────
  const statusContent = (() => {
    switch (connectionState) {
      case "waiting":
        return {
          icon: <Wifi size={14} className="animate-pulse" />,
          text: elapsedSecs < 10
            ? "Starting WhatsApp session…"
            : elapsedSecs < 30
            ? "Launching browser — this takes ~30 seconds…"
            : `Still working… (${elapsedSecs}s)`,
          color: "#2979FF",
        };
      case "scanning":
        return {
          icon: <CheckCircle size={14} />,
          text: "Scan the QR code with your phone",
          color: "#00C853",
        };
      case "connecting":
        return {
          icon: <RefreshCw size={14} className="animate-spin" />,
          text: "QR scanned! Setting up your account…",
          color: "#FF9800",
        };
      case "connected":
        return { icon: <CheckCircle size={14} />, text: "Connected!", color: "#00C853" };
      case "timeout":
        return {
          icon: <Clock size={14} />,
          text: "QR is taking too long. Server may be starting up. Tap Try Again.",
          color: "#FF5722",
        };
      case "error":
        return { icon: <AlertTriangle size={14} />, text: error, color: "#D32F2F" };
    }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0"
        style={{ maxWidth: "min(500px, 95vw)", width: "100%" }}
      >
        {/* Header */}
        <DialogHeader className="p-5 pb-4 space-y-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold">
              Connect WhatsApp
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="px-5 pb-5">
          <AnimatePresence mode="wait">
            {/* Step 1: Scanning */}
            {step === "scanning" && (
              <motion.div
                key="scanning"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4"
              >
                {/* QR or spinner */}
                {qrCode ? (
                  <div className="w-full flex justify-center">
                    <WhatsAppQRCode
                      qrData={qrCode}
                      size={Math.min(260, window.innerWidth - 80)}
                    />
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center justify-center bg-gray-50 rounded-2xl border border-gray-200"
                    style={{
                      width: Math.min(260, window.innerWidth - 80),
                      height: Math.min(260, window.innerWidth - 80),
                    }}
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full"
                    />
                    {elapsedSecs > 0 && (
                      <p className="mt-3 text-xs text-gray-400">{elapsedSecs}s</p>
                    )}
                  </div>
                )}

                {/* Status */}
                <div
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-full text-[12px] font-medium w-full"
                  style={{
                    backgroundColor: `${statusContent.color}12`,
                    color: statusContent.color,
                    border: `1px solid ${statusContent.color}25`,
                  }}
                >
                  {statusContent.icon}
                  <span className="text-center">{statusContent.text}</span>
                </div>

                {/* Try Again */}
                {(connectionState === "error" || connectionState === "timeout") && (
                  <Button
                    onClick={handleRetry}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    <RefreshCw size={14} />
                    Try Again {retryCount > 0 ? `(${retryCount})` : ""}
                  </Button>
                )}

                <p className="text-[11px] text-center text-gray-400 max-w-xs">
                  Open WhatsApp → Tap Menu (⋮) → Linked Devices → Link a Device
                </p>
              </motion.div>
            )}

            {/* Step 2: Connected */}
            {step === "connected" && businessInfo && (
              <motion.div
                key="connected"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4 py-6"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center"
                >
                  <CheckCircle size={36} className="text-green-600" />
                </motion.div>

                <div className="bg-green-50 border border-green-200 rounded-xl p-4 w-full text-center">
                  <p className="text-sm text-gray-500 mb-1">Connected as</p>
                  <p className="font-bold text-lg text-gray-900">{businessInfo.name}</p>
                  <p className="text-sm text-gray-500">+{businessInfo.phone}</p>
                </div>

                <p className="text-sm text-gray-500">Redirecting to dashboard…</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
