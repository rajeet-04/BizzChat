<div align="center">

<img src="https://img.shields.io/badge/BizChat-AI%20Order%20Manager-1A1A2E?style=for-the-badge&logo=whatsapp&logoColor=25D366" />

# 🟢 BizChat — WhatsApp-First AI Order Management for Indian Businesses

> *"Your customers already order on WhatsApp. BizChat turns those chats into a full business management system — automatically."*

[![Live Demo](https://img.shields.io/badge/Live%20Demo-bizchat.vercel.app-2979FF?style=flat-square&logo=vercel)](https://bizchat.vercel.app)
[![Backend](https://img.shields.io/badge/API-Railway-7C3AED?style=flat-square&logo=railway)](https://railway.app)
[![Google Gemini](https://img.shields.io/badge/AI-Google%20Gemini-4285F4?style=flat-square&logo=google)](https://ai.google.dev)
[![Firebase](https://img.shields.io/badge/Database-Firebase%20Firestore-FF6F00?style=flat-square&logo=firebase)](https://firebase.google.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)

</div>

---

## 🌍 The Problem — And Why It's Bigger Than You Think

Walk into any kirana store, vegetable vendor, or small wholesale shop in India and you'll see the same scene: the owner's phone buzzing with WhatsApp messages.

> *"Bhaiya 2 kilo aloo, 1 kilo pyaaz aur 500gm dhaniya chahiye"*
> *"Same as last time bhej do"*
> *"Kal tak deliver kar dena, aur wo doodh wala bhi lena"*

**That's an order.** But right now, the business owner is manually reading it, writing it down in a notebook, calculating the price on a calculator, and trying to remember if the customer's khata (credit) is settled.

This is happening **800 million times a day** across India's 63 million small businesses. It's entirely manual, error-prone, and invisible to any accounting or inventory system.

**BizChat fixes this.**

---

## 💡 The Solution — What BizChat Does

BizChat is a **WhatsApp-native AI business assistant** that:

1. **Listens to your WhatsApp** — connects as a WhatsApp Web client on your existing number
2. **Understands every order** — in English, Hindi, Hinglish, or any mixture, including colloquial terms like "kilo", "darjan", "dabba"
3. **Extracts & structures it automatically** — products, quantities, units, prices (from your catalog), delivery dates
4. **Runs your entire business** — dashboard, orders, inventory, khata (credit book), and GST-compliant invoices

No app for the customer to download. No new habit to build. They just keep ordering on WhatsApp. BizChat handles everything else.

---

## ✨ Feature Highlights

| Feature | What It Does |
|---|---|
| 🤖 **AI Order Extraction** | Turns raw WhatsApp conversations into structured orders using Google Gemini |
| 🌐 **Multilingual Understanding** | Handles English, Hindi, Hinglish — "2 kilo aloo" → `{qty: 2, unit: "kg", item: "aloo"}` |
| 📱 **WhatsApp Integration** | Connects to your existing WhatsApp number, no secondary device needed |
| 📊 **Live Dashboard** | Real-time stats, revenue chart, order status — all updated as messages arrive |
| 📦 **Smart Inventory** | Auto-tracks stock movements from orders, with per-unit pricing (kg/packet/piece) |
| 📒 **Khata Book** | Credit order tracking for trusted customers ("udhaari" management) |
| 🧾 **GST Invoices** | Auto-generates GST-compliant invoices (CGST + SGST) and shares on WhatsApp |
| 📅 **Date Filtering** | Dashboard, Orders, Inventory, and Invoices all filter by date |
| 🔒 **Multi-Tenant** | Each business has isolated data, own pricing catalog, own WhatsApp session |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CUSTOMER                                  │
│                 Sends WhatsApp message                          │
│         "Bhaiya 2kg aloo, 500gm doodh chahiye"                  │
└────────────────────────────┬────────────────────────────────────┘
                             │ WhatsApp Web Protocol
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     WHATSAPP SERVICE                            │
│              (whatsapp-web.js / Puppeteer)                      │
│                                                                 │
│  • Maintains persistent session (volume-mounted auth folder)    │
│  • Buffers messages per sender (5s debounce window)            │
│  • Groups multi-line orders into a single conversation         │
└────────────────────────────┬────────────────────────────────────┘
                             │ Buffered Message Array
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       AI EXTRACTION ENGINE                      │
│            Google Gemini 2.0 Flash / Ollama (local)            │
│                                                                 │
│  Input:  Raw conversation + business catalog (with prices)      │
│  Prompt: Multilingual Hinglish parser + Indian unit maps        │
│  Output: {customer, items: [{name, qty, unit, price}], total}   │
│                                                                 │
│  Smart conversions:                                             │
│    "kilo" → kg  |  "darjan" → 12pcs  |  "dabba" → packet       │
│    500g @ ₹35/kg → base_qty=0.5 → total=₹17.50                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ Structured ExtractedChatOrder
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     STORAGE SERVICE                             │
│                  Firebase Firestore                             │
│                                                                 │
│  organizations/{orgId}/orders/{orderId}                         │
│    ├── customer_name, customer_phone                            │
│    ├── items: [{product_name, quantity, unit, pricePerUnit}]    │
│    ├── totalAmount (unit-aware: g→kg before multiplication)     │
│    ├── status: pending → confirmed → fulfilled                  │
│    └── invoice: {invoice_number, subtotal, cgst, sgst, total}  │
│                                                                 │
│  organizations/{orgId}/catalog/{itemId}                         │
│    └── {name, price_per_unit, unit}                             │
└────────────────────────────┬────────────────────────────────────┘
                             │ Real-time via Socket.IO
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND DASHBOARD                           │
│               React + Vite (deployed on Vercel)                 │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │Dashboard │  │ Orders   │  │Inventory │  │   Invoices   │   │
│  │+ Revenue │  │+ Filter  │  │+ Pricing │  │+ GST PDF     │   │
│  │+ KPI     │  │+ Delete  │  │+ Units   │  │+ WhatsApp    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
│  ┌──────────┐  ┌──────────┐                                    │
│  │KhataBook │  │WhatsApp  │                                    │
│  │+ Credit  │  │+ QR Scan │                                    │
│  └──────────┘  └──────────┘                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🧠 How the AI Works (The Magic Part)

This is where BizChat is genuinely different. We don't just do keyword matching — we use **Google Gemini** to understand natural Indian business conversations.

### Example Extraction

**Input conversation:**
```
Customer (Ramesh): Bhaiya namaste
Customer: 2 kilo aloo chahiye aur ek darjan anda
Customer: aur 500gm doodh wala bhi
Customer: kal tak bhej dena please
```

**What Gemini understands:**
- `"bhaiya"` = respectful address, not a name → customer = Ramesh (from sender)
- `"2 kilo aloo"` → `{qty: 2, unit: "kg", item: "aloo"}`
- `"ek darjan anda"` → `{qty: 12, unit: "piece", item: "anda"}` (darjan = dozen)
- `"500gm doodh"` → `{qty: 500, unit: "g", item: "doodh"}`
- `"kal tak"` → delivery_date: "tomorrow"

**Price calculation with unit awareness:**
```
Catalog: doodh = ₹35/kg

qty=500, unit="g" → convert to base: 500/1000 = 0.5 kg
price = 0.5 × ₹35 = ₹17.50  ✅

(Old broken way: 500 × 35 = ₹17,500 ❌)
```

### Supported Languages & Terms

| Input | Understood As |
|---|---|
| "kilo", "किलो" | kg |
| "darjan", "dozen" | 12 pieces |
| "dabba", "packet", "pkt" | packet |
| "aur", "bhi" | additional items |
| "kal", "parso" | tomorrow, day after tomorrow |
| "chahiye", "bhej do" | order request |
| "jaldi", "urgent" | priority delivery |
| Numbers in Hindi words | "paanch" = 5, "das" = 10 |

---

## 🛠️ Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| **Node.js + Express** | REST API server |
| **TypeScript** | Type-safe throughout |
| **Google Gemini 2.0 Flash** | Primary AI for order extraction |
| **Ollama** | Local AI fallback (privacy mode) |
| **whatsapp-web.js** | WhatsApp Web client via Puppeteer |
| **Firebase Firestore** | Multi-tenant NoSQL database |
| **Socket.IO** | Real-time order push to dashboard |
| **Azure Blob Storage** | Invoice PDF storage & delivery |
| **Zod** | Runtime schema validation |
| **Decimal.js** | Precision-safe financial math |
| **Railway** | Cloud deployment with persistent volumes |

### Frontend
| Technology | Purpose |
|---|---|
| **React + Vite** | UI framework |
| **TypeScript** | Type-safe components |
| **React Router** | SPA navigation |
| **Recharts** | Revenue and analytics charts |
| **Lucide React** | Consistent icon system |
| **Vercel** | Edge-deployed frontend |

---

## 🗂️ Project Structure

```
BizChat/
├── backend/
│   ├── src/
│   │   ├── services/
│   │   │   ├── whatsappService.ts    # WhatsApp session + message buffering
│   │   │   ├── geminiService.ts      # Google Gemini AI extraction
│   │   │   ├── ollamaService.ts      # Local Ollama AI (fallback)
│   │   │   ├── promptManager.ts      # Multilingual Hinglish prompts
│   │   │   ├── storageService.ts     # Firestore CRUD + unit conversion
│   │   │   ├── invoiceService.ts     # GST invoice generation
│   │   │   ├── pdfService.ts         # PDF generation + Azure upload
│   │   │   └── socketService.ts      # Real-time WebSocket events
│   │   ├── controllers/
│   │   │   ├── orderController.ts    # Order CRUD endpoints
│   │   │   └── invoiceController.ts  # Invoice generation endpoint
│   │   ├── routes/index.ts           # All API routes + admin migrations
│   │   ├── middlewares/              # Auth, rate limiting, error handling
│   │   ├── config/
│   │   │   ├── env.ts                # Zod-validated environment config
│   │   │   └── firestore.ts          # Firebase admin SDK init
│   │   └── schema.ts                 # Zod schemas for all data models
│   └── Dockerfile                    # Production Docker container
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── pages/
│   │   │   │   ├── DashboardPage.tsx  # KPI cards, revenue chart, date filter
│   │   │   │   ├── OrdersPage.tsx     # Order list, detail panel, date filter
│   │   │   │   ├── InventoryPage.tsx  # Auto-tracked inventory from orders
│   │   │   │   ├── InvoicesPage.tsx   # GST invoices + customer column
│   │   │   │   ├── KhataPage.tsx      # Credit/udhaari tracker
│   │   │   │   ├── ExtractionPage.tsx # Manual message extraction tool
│   │   │   │   └── WhatsAppPage.tsx   # QR code connect + session status
│   │   │   └── components/           # Shared UI components
│   │   ├── hooks/useApi.ts           # React Query-style data hooks
│   │   └── lib/format.ts             # Formatting + unit conversion helpers
│   └── vercel.json                   # SPA routing config
│
├── docker-compose.yml                # Local dev with Redis + backend
├── railway.toml                      # Railway deployment config
└── pnpm-workspace.yaml               # Monorepo workspace
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- A Firebase project with Firestore enabled
- Google Gemini API key ([get one free](https://ai.google.dev))
- (Optional) Azure Storage account for invoice PDFs

### 1. Clone & Install

```bash
git clone https://github.com/mrashis06/BizChat-V2.git
cd BizChat
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# AI
GEMINI_API_KEY=your_gemini_api_key_here
AI_MODEL_FAST=gemini-2.0-flash-exp
AI_MODEL_SMART=gemini-2.0-flash-exp

# Firebase (paste your service account JSON fields)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."

# Business defaults
DEFAULT_BUSINESS_NAME=My Store
DEFAULT_GST_NUMBER=22AAAAA0000A1Z5

# Optional: Azure for PDF storage
AZURE_STORAGE_ACCOUNT_NAME=
AZURE_STORAGE_ACCOUNT_KEY=
```

### 3. Run Locally

```bash
# Start backend (port 3000)
pnpm --filter backend dev

# Start frontend (port 5173) — in another terminal
pnpm --filter frontend dev
```

Open `http://localhost:5173`, create an account, and scan the QR code on the WhatsApp page.

### 4. Deploy to Production

**Backend → Railway:**
1. Connect your GitHub repo to Railway
2. Set environment variables in Railway dashboard
3. Add a **Persistent Volume** at mount path `/app/backend/.wwebjs_auth`  
   *(This keeps your WhatsApp session alive across deploys)*
4. Railway auto-deploys on every git push

**Frontend → Vercel:**
```bash
# Push to main branch — Vercel auto-deploys
git push origin main
```

---

## 📡 API Overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new business account |
| `POST` | `/api/auth/login` | Login and get JWT token |
| `GET` | `/api/orders` | List all orders (with pagination) |
| `POST` | `/api/orders/invoice` | Generate GST invoice for an order |
| `PATCH` | `/api/orders/:id/status` | Update order status |
| `DELETE` | `/api/orders/:id` | Delete an order |
| `GET` | `/api/stats` | Dashboard KPI stats |
| `GET` | `/api/inventory` | Inventory derived from orders |
| `POST` | `/api/whatsapp/connect` | Connect WhatsApp (returns QR) |
| `GET` | `/api/debug/wa-status` | Check WhatsApp session health |
| `POST` | `/api/debug/extract` | Test AI extraction manually |
| `POST` | `/api/admin/recalculate-totals` | Fix order totals (migration) |

---

## 🔑 Key Design Decisions

### 1. Unit-Aware Price Calculation
Indian orders use grams, kilograms, and millilitres interchangeably. We built a conversion layer that ensures `500g @ ₹35/kg = ₹17.50` — not ₹17,500. This runs at every level: AI extraction, backend storage, frontend display, and invoice generation.

### 2. Message Buffering (Debounce Window)
Customers often send orders in multiple messages. BizChat waits 5 seconds after the last message before triggering extraction, collecting all messages into a single conversation batch — just like a human would read a full thread.

### 3. Persistent WhatsApp Sessions
WhatsApp session credentials are stored in a Railway persistent volume (`/app/backend/.wwebjs_auth`). This means **you scan the QR code once and stay connected forever** — even across deploys and container restarts.

### 4. Catalog-Grounded Extraction
When extracting orders, we inject the business's product catalog into the AI prompt. This means:
- Product names are normalized (customer says "aloo", catalog says "Potato" → matched correctly)
- Missing prices are auto-filled from catalog
- Typos and abbreviations ("aata" vs "ata") are handled gracefully

### 5. Multi-Tenant Isolation
Every business's data lives under `organizations/{orgId}` in Firestore. Orders, catalog, invoices, and WhatsApp sessions are completely isolated between businesses.

---

## 🌟 Why This Matters

India has **63 million small and medium businesses**. The vast majority have no digital order management — they use notebooks, paper slips, or just their memory.

But **97% of these business owners are already on WhatsApp**. That's their transaction layer. BizChat doesn't ask them to change their behavior — it meets them exactly where they operate.

For a kirana shop owner managing 50-100 orders a day on WhatsApp:

| Task | Before BizChat | After BizChat |
|---|---|---|
| Record an order | Manual, notebook | **Automatic** |
| Calculate total | Calculator, error-prone | **Instant, unit-aware** |
| Track inventory | Mental count | **Auto-updated** |
| Know who owes money | Memory + notebook | **Khata book** |
| Generate invoice | Not possible | **1-click GST invoice** |
| Share invoice | Manually typed | **WhatsApp in 1 tap** |
| Daily revenue | Count at end of day | **Live dashboard** |

**BizChat is infrastructure for the next 100 million Indian businesses to go digital — without changing anything about how they work today.**

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit: `git commit -m "feat: your feature"`
4. Push: `git push origin feat/your-feature`
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Made with ❤️ by Ashis** — for India's small business owners

*Powered by Google Gemini 2.0 Flash · Google Firebase · WhatsApp Web · Railway · Vercel*

</div>
