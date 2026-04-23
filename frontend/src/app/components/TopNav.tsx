import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { Bell, Leaf, MessageCircle, Menu } from "lucide-react";
import { useAuth } from "../AuthContext";
import { API_BASE_URL } from "@/lib/config";

const pageTitles: Record<string, string> = {
  "/": "Command Center",
  "/orders": "Orders",
  "/extraction": "Extraction",
  "/invoices": "Invoices",
  "/inventory": "Inventory",
  "/settings": "Settings",
  "/mobile": "Mobile Screens",
};

export function TopNav({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const title = pageTitles[pathname] || "BizChat";
  
  const [businessInfo, setBusinessInfo] = useState<{
    name: string;
    phone: string;
    connected: boolean;
  } | null>(null);

  useEffect(() => {
    // Load business info from localStorage
    const storedBusiness = localStorage.getItem("bizchat_business");
    if (storedBusiness) {
      try {
        const parsed = JSON.parse(storedBusiness);
        setBusinessInfo(parsed);
      } catch (error) {
        console.error("Failed to parse business info:", error);
      }
    }
  }, []);

  return (
    <header
      className="h-[60px] flex items-center justify-between px-6 shrink-0"
      style={{
        backgroundColor: "#FFFFFF",
        borderBottom: "1px solid #E5E7EB",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Left: Hamburger + Logo */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onToggleSidebar}
          className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} color="#6B7280" strokeWidth={2} />
        </button>
        <div
          className="w-[34px] h-[34px] flex items-center justify-center"
          style={{ backgroundColor: "#1A1A2E", borderRadius: 9 }}
        >
          <span style={{ fontWeight: 700, fontSize: 17, color: "#FFFFFF" }}>C</span>
        </div>
        <span style={{ fontWeight: 700, fontSize: 18, color: "#1A1A2E" }}>
          BizChat
        </span>
        <Leaf size={18} color="#25D366" strokeWidth={2.5} />
      </div>

      {/* Center: Dynamic page title */}
      <span
        className="hidden sm:block"
        style={{ fontWeight: 600, fontSize: 16, color: "#0D0F12" }}
      >
        {title}
      </span>

      {/* Right: Avatar + Bell */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Bell size={20} color="#6B7280" />
          <span
            className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] flex items-center justify-center text-[10px]"
            style={{
              backgroundColor: "#D32F2F",
              color: "#FFFFFF",
              borderRadius: 100,
              fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              border: "2px solid #FFFFFF",
            }}
          >
            3
          </span>
        </div>
        <div
          className="flex items-center gap-2.5 px-3 py-1.5"
          style={{
            backgroundColor: "#F8F9FA",
            borderRadius: 100,
            border: "1px solid #E5E7EB",
          }}
        >
          {/* WhatsApp Icon with Connection Status */}
          <div className="relative">
            <div
              className="w-[28px] h-[28px] flex items-center justify-center"
              style={{
                backgroundColor: "#25D366",
                borderRadius: 100,
              }}
            >
              <MessageCircle size={16} color="#FFFFFF" strokeWidth={2.5} />
            </div>
            {/* Green status indicator dot */}
            {businessInfo?.connected && (
              <div
                className="absolute -bottom-0.5 -right-0.5 w-[10px] h-[10px]"
                style={{
                  backgroundColor: "#00C853",
                  borderRadius: 100,
                  border: "2px solid #F8F9FA",
                }}
              />
            )}
          </div>

          {/* Business Name and Phone */}
          <div className="hidden md:flex flex-col">
            <span
              className="text-[13px] leading-tight"
              style={{ fontWeight: 600, color: "#0D0F12" }}
            >
              {businessInfo?.name || "HOLA's Kirana Store"}
            </span>
            {businessInfo?.phone && (
              <span
                className="text-[11px] leading-tight"
                style={{ fontWeight: 400, color: "#6B7280" }}
              >
                {businessInfo.phone}
              </span>
            )}
          </div>

          <button
            onClick={async () => {
              if (!window.confirm("Disconnect WhatsApp? This will remove BizChat from your phone's Linked Devices.")) return;
              // Call backend to properly logout from WhatsApp servers
              try {
                await fetch(`${API_BASE_URL}/api/whatsapp/disconnect`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ orgId: user?.orgId ?? "local-org" }),
                });
              } catch (_) {
                // Proceed with local cleanup even if backend is unreachable
              }
              localStorage.removeItem("bizchat_business");
              window.dispatchEvent(new CustomEvent("bizchat_logout"));
              navigate("/landing");
            }}
            className="text-xs text-red-600 hover:text-red-700 font-medium ml-2"
          >
            Disconnect
          </button>
        </div>
      </div>
    </header>
  );
}