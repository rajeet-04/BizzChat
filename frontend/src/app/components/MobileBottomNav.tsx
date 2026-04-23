import React from "react";
import { NavLink } from "react-router";
import {
  LayoutDashboard,
  ShoppingCart,
  ScanText,
  FileText,
  Grid3X3,
} from "lucide-react";

export function MobileBottomNav() {
  const links = [
    { to: "/", icon: LayoutDashboard, label: "Home" },
    { to: "/orders", icon: ShoppingCart, label: "Orders" },
    { to: "/extraction", icon: ScanText, label: "Extract" },
    { to: "/invoices", icon: FileText, label: "Invoices" },
    // "More" simply opens the mobile sidebar or navigates to settings. For now we route to /settings.
    { to: "/settings", icon: Grid3X3, label: "More", isMore: true },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 md:hidden bg-white border-t border-gray-200 z-50 px-2 pb-safe"
      style={{
        boxShadow: "0 -2px 10px rgba(0,0,0,0.03)",
        height: "64px",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div className="flex items-center justify-between h-full">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.label}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
                  isActive ? "text-[#2979FF]" : "text-gray-400 hover:text-gray-600"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={22}
                    color={isActive ? "#1A1A2E" : "#6B7280"}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                  <span
                    className="text-[10px] tracking-wide"
                    style={{
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? "#1A1A2E" : "#6B7280",
                    }}
                  >
                    {link.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
