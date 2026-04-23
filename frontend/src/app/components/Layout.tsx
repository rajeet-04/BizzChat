import React, { useEffect, useState } from "react";
import { Outlet, useNavigate, Navigate } from "react-router";
import { TopNav } from "./TopNav";
import { Sidebar } from "./Sidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { useAuth } from "../AuthContext";
import { useOrderNotifications } from "@/hooks/useOrderNotifications";

export function Layout() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, login } = useAuth();
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isConnLoading, setIsConnLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 🔔 Real-time WhatsApp order notifications via Socket.IO
  useOrderNotifications(user?.orgId);


  useEffect(() => {
    // Check for business connection
    const checkConnection = async () => {
      let connected = false;
      const storedBusiness = localStorage.getItem("bizchat_business");
      if (storedBusiness) {
        try {
          const parsed = JSON.parse(storedBusiness);
          connected = parsed.connected === true;
        } catch (error) {
          connected = false;
        }
      }
      setIsConnected(connected);
      
      setIsConnLoading(false);
    };

    if (!authLoading) {
      checkConnection();
    }
  }, [authLoading, user, login]);

  useEffect(() => {
    const handleLogout = () => {
      localStorage.removeItem("bizchat_business");
      setIsConnected(false);
      navigate("/landing");
    };
    window.addEventListener("bizchat_logout", handleLogout);
    return () => window.removeEventListener("bizchat_logout", handleLogout);
  }, [navigate]);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  useEffect(() => {
    // If mobile, sidebar starts closed. If desktop, starts open.
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  if (authLoading || isConnLoading) return null;
  if (!isConnected) return <Navigate to="/landing" replace />;

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <TopNav onToggleSidebar={() => setSidebarOpen((v) => !v)} />
      <div className="flex flex-1 overflow-hidden relative">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex">
          <Sidebar open={sidebarOpen} />
        </div>

        {/* Mobile Drawer Overlay */}
        {isMobile && sidebarOpen && (
          <>
            <div 
              className="fixed inset-0 bg-black/50 z-[90] transition-opacity" 
              onClick={() => setSidebarOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-[100] bg-[#111318] shadow-2xl animate-slide-in-left">
              <Sidebar open={true} />
            </div>
          </>
        )}

        <main
          className="flex-1 overflow-y-auto pb-16 md:pb-0"
          style={{ backgroundColor: "#F8F9FA" }}
        >
          <Outlet />
        </main>
        <MobileBottomNav />
      </div>

      <style>{`
        @keyframes slide-in-left {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-left {
          animation: slide-in-left 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
