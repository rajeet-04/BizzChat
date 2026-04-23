import { motion, AnimatePresence } from "motion/react";
import { QrCode, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export type ConnectionState = "scanning" | "connecting" | "connected" | "error";

interface ConnectionStatusProps {
  state: ConnectionState;
  message?: string;
}

const statusConfig = {
  scanning: {
    icon: QrCode,
    color: "text-gray-600",
    bgColor: "bg-gray-100",
    label: "Waiting for scan",
  },
  connecting: {
    icon: Loader2,
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
    label: "Connecting...",
  },
  connected: {
    icon: CheckCircle2,
    color: "text-green-600",
    bgColor: "bg-green-100",
    label: "Connected successfully",
  },
  error: {
    icon: AlertCircle,
    color: "text-red-600",
    bgColor: "bg-red-100",
    label: "Connection failed",
  },
};

export function ConnectionStatus({ state, message }: ConnectionStatusProps) {
  const config = statusConfig[state];
  const Icon = config.icon;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-center gap-3"
      >
        {/* Icon with Animation */}
        <motion.div
          className={`${config.bgColor} ${config.color} p-2 rounded-full`}
          animate={
            state === "connecting"
              ? { rotate: 360 }
              : state === "connected"
              ? { scale: [1, 1.2, 1] }
              : {}
          }
          transition={
            state === "connecting"
              ? { duration: 1, repeat: Infinity, ease: "linear" }
              : state === "connected"
              ? { duration: 0.5 }
              : {}
          }
        >
          <Icon className="w-5 h-5" />
        </motion.div>

        {/* Status Text */}
        <div className="flex flex-col">
          <span className={`font-medium ${config.color}`}>
            {message || config.label}
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
