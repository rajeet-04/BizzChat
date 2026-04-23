import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { OrdersPage } from "./pages/OrdersPage";
import { ExtractionPage } from "./pages/ExtractionPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { InventoryPage } from "./pages/InventoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { MobilePage } from "./pages/MobilePage";
import { WhatsAppPage } from "./pages/WhatsAppPage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { KhataPage } from "./pages/KhataPage";

export const router = createBrowserRouter([
  {
    path: "/landing",
    Component: LandingPage,
  },
  {
    path: "/login",
    Component: LoginPage,
  },
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: DashboardPage },
      { path: "orders", Component: OrdersPage },
      { path: "extraction", Component: ExtractionPage },
      { path: "invoices", Component: InvoicesPage },
      { path: "inventory", Component: InventoryPage },
      { path: "settings", Component: SettingsPage },
      { path: "mobile", Component: MobilePage },
      { path: "whatsapp", Component: WhatsAppPage },
      { path: "khata", Component: KhataPage },
    ],
  },
]);