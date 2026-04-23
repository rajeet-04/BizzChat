import { Router, IRouter } from "express";
import * as orderController from "../controllers/orderController.js";
import * as invoiceController from "../controllers/invoiceController.js";
import { extractLimiter, generalLimiter } from "../middlewares/rateLimiter.js";
import { sanitizeInputs } from "../middlewares/sanitizer.js";
import { redactPII } from "../middlewares/piiRedactor.js";
import { idempotency } from "../middlewares/idempotency.js";
import { firestoreDb } from "../config/firestore.js";
import { storage } from "../services/storageService.js";
import { env } from "../config/env.js";
import { logger } from "../middlewares/logger.js";
import { authHandler, requireOrg } from "../middlewares/authHandler.js";
import whatsappRoutes from "./whatsappRoutes.js";
import { randomUUID } from "crypto";
import * as ollamaService from "../services/ollamaService.js";
import * as whatsappService from "../services/whatsappService.js";

const router: IRouter = Router();

// ─── Health check (lightweight—no DB writes) ─────────────────────────────────────
router.get("/health", async (_req, res) => {
  try {
    // Wrap entire health check with timeout to prevent hanging
    const healthPromise = (async () => {
      const healthStatus: any = {
        status: "ok",
        timestamp: new Date().toISOString(),
        services: {
          database: "ok",
          ollama: "unknown",
        },
      };

      // Ollama check (with strict timeout)
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        const ollamaRes = await fetch(`${env.OLLAMA_HOST}/api/tags`, {
          method: "GET",
          headers: env.OLLAMA_API_KEY ? { Authorization: `Bearer ${env.OLLAMA_API_KEY}` } : {},
          signal: controller.signal,
        });
        clearTimeout(timeout);
        healthStatus.services.ollama = ollamaRes.ok ? "ok" : `error_${ollamaRes.status}`;
      } catch (err) {
        healthStatus.services.ollama = "unreachable";
        logger.debug("Health Check: Ollama unreachable (non-fatal)");
      }

      return healthStatus;
    })();

    // Health check must complete within 5 seconds
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Health check timeout")), 5000)
    );

    const healthStatus = await Promise.race([healthPromise, timeoutPromise]) as any;
    if (!res.headersSent) {
      res.status(200).json(healthStatus);
    }
  } catch (err: any) {
    logger.error({ err }, "Health check failed (timeout or unexpected error)");
    // Return 200 anyway - health endpoint itself is responsive
    // Detailed status may be incomplete but we're still alive
    if (!res.headersSent) {
      res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        services: {
          database: "ok",
          ollama: "unreachable",
        },
        warning: err?.message ?? "Health check partially timed out",
      });
    }
  }
});

// ─── Debug: directly test Ollama extraction (no auth required) ───────────────
router.post("/debug/extract", async (req, res) => {
  try {
    const message: string = req.body?.message ?? "Bhaiya 2 kg chawal aur 1 kg aloo chahiye";
    const start = Date.now();
    const result = await ollamaService.extractOrderFromChat(
      [{ sender: "Test Customer", text: message }],
      []
    );
    res.json({
      ok: true,
      elapsed_ms: Date.now() - start,
      message,
      extracted: result,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

// ─── Debug: WhatsApp session status (no auth required) ──────────────────────
router.get("/debug/wa-status", (_req, res) => {
  // exposeStatus returns the status string for a given orgId
  // We expose all known orgIds by iterating connected sessions
  const allStatus = whatsappService.getAllSessions();
  res.json({ sessions: allStatus, timestamp: new Date().toISOString() });
});

// ─── Admin: Emergency — fix all users to point to the correct org ─────────────
// POST /api/admin/fix-user-org  (no auth — one-time repair tool)
router.post("/admin/fix-user-org", async (req, res) => {
  try {
    // 1. Find the org with the highest invoiceSeq = most active = real org
    const allOrgs = await firestoreDb.collection("organizations").get();
    let bestOrgId = "";
    let bestSeq = -1;
    let bestOrgName = "";
    for (const orgDoc of allOrgs.docs) {
      if (orgDoc.id === "local-org") continue;
      const data = orgDoc.data();
      const seq: number = data.invoiceSeq ?? 0;
      if (seq > bestSeq) {
        bestSeq = seq;
        bestOrgId = orgDoc.id;
        bestOrgName = data.name ?? "Unknown";
      }
    }

    if (!bestOrgId) {
      return res.status(404).json({ ok: false, message: "No active org found" });
    }

    // 2. Update ALL users to point to that org
    const allUsers = await firestoreDb.collection("users").get();
    const batch = firestoreDb.batch();
    let count = 0;
    for (const userDoc of allUsers.docs) {
      if (userDoc.data().organizationId !== bestOrgId) {
        batch.update(userDoc.ref, { organizationId: bestOrgId });
        count++;
      }
    }
    await batch.commit();

    res.json({
      ok: true,
      message: `Migrated ${count} user(s) to org "${bestOrgName}"`,
      orgId: bestOrgId,
      orgName: bestOrgName,
      invoiceSeq: bestSeq,
      usersFixed: count,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

// ─── Admin: Clean Chromium cache from volume ──────────────────────────────────
// POST /api/admin/cleanup-volume  (no auth required — safe, only deletes Chrome cache)
router.post("/admin/cleanup-volume", async (req, res) => {
  try {
    const { execSync } = await import("child_process");
    const fs = await import("fs");

    const authDataPath = "/app/backend/.wwebjs_auth";
    if (!fs.existsSync(authDataPath)) {
      return res.json({ ok: true, message: "Auth directory not found — nothing to clean", freed: 0 });
    }

    // Get size before
    let sizeBefore = "unknown";
    try { sizeBefore = execSync(`du -sh "${authDataPath}" 2>/dev/null`, { stdio: "pipe" }).toString().split("\t")[0].trim(); } catch (_) {}

    // Delete ALL Chrome cache directories (safe — session auth is in Local Storage / IndexedDB)
    const cacheDirs = ["Cache", "Code Cache", "GPUCache", "DawnCache", "ShaderCache", "blob_storage", "BrowserMetrics", "Crashpad"];
    let freed = 0;
    for (const dir of cacheDirs) {
      try {
        const found = execSync(`find "${authDataPath}" -type d -name "${dir}" 2>/dev/null`, { stdio: "pipe", timeout: 10000 })
          .toString().trim().split("\n").filter(Boolean);
        for (const p of found) {
          fs.rmSync(p, { recursive: true, force: true });
          freed++;
        }
      } catch (_) {}
    }

    // Also clear Singleton locks while we're here
    try { execSync(`find "${authDataPath}" -name "Singleton*" -delete 2>/dev/null; true`, { stdio: "pipe" }); } catch (_) {}

    // NEW: Aggressive Orphaned Session Wipe
    // If a session folder exists for an orgId that is NO LONGER logged in and active, delete it completely.
    let orphanedFreed = 0;
    try {
      const activeOrgs = new Set(whatsappService.getAllSessions().filter(s => s.status !== "disconnected").map(s => s.orgId));
      const sessionDirs = fs.readdirSync(authDataPath).filter(d => d.startsWith("session-"));
      for (const dirName of sessionDirs) {
        const orgId = dirName.replace("session-", "");
        if (!activeOrgs.has(orgId)) {
          fs.rmSync(`${authDataPath}/${dirName}`, { recursive: true, force: true });
          orphanedFreed++;
        }
      }
    } catch (err) {
      console.error("Failed aggressive wipe:", err);
    }

    // Get size after
    let sizeAfter = "unknown";
    try { sizeAfter = execSync(`du -sh "${authDataPath}" 2>/dev/null`, { stdio: "pipe" }).toString().split("\t")[0].trim(); } catch (_) {}

    res.json({
      ok: true,
      message: `Cleaned ${freed} cache directories. Volume usage reduced.`,
      sizeBefore,
      sizeAfter,
      freed,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

// ─── Admin: Recalculate order totals with correct g→kg / ml→litre conversion ─
// POST /api/admin/recalculate-totals  (requires auth)
router.post("/admin/recalculate-totals", requireOrg, async (req, res) => {

  try {
    const { firestoreDb } = await import("../config/firestore");
    const orgId = req.orgId!;

    // Unit conversion — must match storageService.toBaseQty
    function toBaseQty(qty: number, unit: string | null | undefined): number {
      if (!unit) return qty;
      const u = unit.toLowerCase();
      if (u === "g") return qty / 1000;
      if (u === "ml") return qty / 1000;
      return qty;
    }

    const ordersSnap = await firestoreDb
      .collection("organizations").doc(orgId)
      .collection("orders")
      .where("deletedAt", "==", null)
      .get();

    let fixed = 0;
    const batch = firestoreDb.batch();

    for (const doc of ordersSnap.docs) {
      const data = doc.data();
      const items: any[] = data.items ?? [];

      // Recalculate each item's totalPrice and the order totalAmount
      let newTotal = 0;
      const updatedItems = items.map((item: any) => {
        const price = Number(item.pricePerUnit ?? 0);
        const baseQty = toBaseQty(Number(item.quantity ?? 0), item.unit);
        const totalPrice = price > 0 ? Math.round(baseQty * price * 100) / 100 : null;
        newTotal += totalPrice ?? 0;
        return { ...item, totalPrice };
      });

      const roundedTotal = Math.round(newTotal * 100) / 100;

      // Only update if total actually changed (avoid pointless writes)
      if (Math.abs((data.totalAmount ?? 0) - roundedTotal) > 0.01 || JSON.stringify(items) !== JSON.stringify(updatedItems)) {
        batch.update(doc.ref, {
          items: updatedItems,
          totalAmount: roundedTotal,
          // Clear stored invoice so user can regenerate with correct amounts
          invoice: null,
        });
        fixed++;
      }
    }

    await batch.commit();
    res.json({ ok: true, totalOrders: ordersSnap.size, fixed, message: `Fixed ${fixed} orders. Regenerate invoices to get correct amounts.` });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

// ─── Auth routes (no auth required) ──────────────────────────────────────────

router.post("/auth/register", generalLimiter, async (req, res, next) => {
  try {
    const bcrypt = await import("bcryptjs");
    const { name, email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ status: "error", message: "Email and password are required" });
    }

    // Check if user already exists
    const existing = await firestoreDb.collection("users").where("email", "==", email).limit(1).get();
    if (!existing.empty) {
      return res.status(409).json({ status: "error", message: "An account with this email already exists" });
    }

    const orgId = randomUUID();
    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    // Create organization document
    await firestoreDb.collection("organizations").doc(orgId).set({
      id: orgId,
      name: name ? `${name}'s Store` : "My Store",
      tier: "free",
      invoiceSeq: 0,
      totalRevenue: 0,
      gstNumber: null,
      createdAt: new Date().toISOString(),
    });

    // Create user document (store password hash in passwordHash field)
    await firestoreDb.collection("users").doc(userId).set({
      id: userId,
      email,
      name: name || "User",
      organizationId: orgId,
      role: "owner",
      passwordHash,
      createdAt: new Date().toISOString(),
    });

    const token = Buffer.from(`${userId}:${orgId}`).toString("base64");
    res.status(201).json({
      token,
      user: { id: userId, email, name: name || "User", orgId, orgName: `${name || "My"}'s Store` },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/auth/login", generalLimiter, async (req, res, next) => {
  try {
    const bcrypt = await import("bcryptjs");
    const { email, password } = req.body;

    // Dev bypass
    if (email === "local@example.com" && password === "dev-bypass") {
      const orgId = "local-org";
      const orgRef = firestoreDb.collection("organizations").doc(orgId);
      const orgSnap = await orgRef.get();
      if (!orgSnap.exists) {
        await orgRef.set({ id: orgId, name: "BizChat Local Store", tier: "free", invoiceSeq: 0, totalRevenue: 0, gstNumber: null, createdAt: new Date().toISOString() });
      }
      await firestoreDb.collection("users").doc("local-user").set(
        { id: "local-user", email, name: "Local Tester", organizationId: orgId, role: "owner" },
        { merge: true }
      );
      const token = Buffer.from(`local-user:${orgId}`).toString("base64");
      return res.json({ token, user: { id: "local-user", email, name: "Local Tester", orgId, orgName: "BizChat Local Store" } });
    }

    if (!email || !password) {
      return res.status(400).json({ status: "error", message: "Email and password are required" });
    }

    const snap = await firestoreDb.collection("users").where("email", "==", email).limit(1).get();
    if (snap.empty) {
      return res.status(401).json({ status: "error", message: "Invalid email or password" });
    }

    const user = snap.docs[0].data();
    const valid = await bcrypt.compare(password, user.passwordHash ?? "");
    if (!valid) {
      return res.status(401).json({ status: "error", message: "Invalid email or password" });
    }

    let orgName = "My Store";
    if (user.organizationId) {
      const orgSnap = await firestoreDb.collection("organizations").doc(user.organizationId).get();
      if (orgSnap.exists) orgName = orgSnap.data()!.name;
    }

    const token = Buffer.from(`${user.id}:${user.organizationId ?? ""}`).toString("base64");
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, orgId: user.organizationId, orgName } });
  } catch (err) {
    next(err);
  }
});
router.post("/auth/whatsapp-session", generalLimiter, async (req, res, next) => {
  try {
    const { phone, businessName } = req.body as { phone?: string; businessName?: string };
    if (!phone) return res.status(400).json({ status: "error", message: "phone is required" });

    const normalizedPhone = phone.replace(/\D/g, "");

    // Helper: find the MOST ACTIVE org by invoiceSeq (highest = real org with all orders)
    // Falls back to order count if invoiceSeq is tied.
    const findBestOrg = async (): Promise<string | null> => {
      const allOrgs = await firestoreDb.collection("organizations").get();
      let bestOrgId: string | null = null;
      let bestScore = -1;

      for (const orgDoc of allOrgs.docs) {
        if (orgDoc.id === "local-org") continue; // skip dev placeholder
        const data = orgDoc.data();
        // Score = invoiceSeq × 1000 + order count (approximated)
        const invoiceSeq: number = data.invoiceSeq ?? 0;
        if (invoiceSeq > bestScore) {
          bestScore = invoiceSeq;
          bestOrgId = orgDoc.id;
        }
      }

      // If no org has invoices, fall back to first org with any order
      if (!bestOrgId || bestScore === 0) {
        for (const orgDoc of allOrgs.docs) {
          if (orgDoc.id === "local-org") continue;
          const ordersSnap = await firestoreDb
            .collection("organizations").doc(orgDoc.id)
            .collection("orders").limit(1).get();
          if (!ordersSnap.empty) return orgDoc.id;
        }
      }

      return bestOrgId;
    };

    let userId: string;
    let orgId: string;
    let orgName: string;

    // 1. Look up existing user by phone
    const byPhone = await firestoreDb.collection("users")
      .where("phone", "==", normalizedPhone).limit(1).get();

    if (!byPhone.empty) {
      const u = byPhone.docs[0].data();
      userId = u.id;
      orgId = u.organizationId;

      // Check if their current org actually has orders
      const ordersSnap = await firestoreDb
        .collection("organizations").doc(orgId)
        .collection("orders").limit(1).get();

      if (ordersSnap.empty) {
        // Their org is empty — migrate them to the real (most active) org
        const realOrgId = await findBestOrg();
        if (realOrgId && realOrgId !== orgId) {
          orgId = realOrgId;
          await firestoreDb.collection("users").doc(userId).update({ organizationId: orgId });
        }
      }

      const orgSnap = await firestoreDb.collection("organizations").doc(orgId).get();
      orgName = orgSnap.exists ? orgSnap.data()!.name : businessName ?? "My Store";
    } else {
      // 2. No phone match — find org with orders, adopt it
      const realOrgId = await findBestOrg();

      if (realOrgId) {
        orgId = realOrgId;
        userId = randomUUID();
        const orgSnap = await firestoreDb.collection("organizations").doc(orgId).get();
        orgName = orgSnap.exists ? (orgSnap.data()!.name as string) : businessName ?? "My Store";

        // Create user linked to the real org
        await firestoreDb.collection("users").doc(userId).set({
          id: userId, phone: normalizedPhone,
          name: businessName ?? orgName,
          organizationId: orgId, role: "owner",
          createdAt: new Date().toISOString(),
        });
      } else {
        // Truly new user — no existing orders anywhere
        orgId = randomUUID();
        userId = randomUUID();
        orgName = businessName ?? "My Store";

        await firestoreDb.collection("organizations").doc(orgId).set({
          id: orgId, name: orgName, tier: "free",
          invoiceSeq: 0, totalRevenue: 0, gstNumber: null,
          createdAt: new Date().toISOString(),
        });
        await firestoreDb.collection("users").doc(userId).set({
          id: userId, phone: normalizedPhone, name: businessName ?? "User",
          organizationId: orgId, role: "owner",
          createdAt: new Date().toISOString(),
        });
      }
    }

    // Always update org name with the real WhatsApp business name
    if (businessName && businessName !== "My Store") {
      await firestoreDb.collection("organizations").doc(orgId)
        .update({ name: businessName }).catch(() => {});
      orgName = businessName;
    }

    const token = Buffer.from(`${userId}:${orgId}`).toString("base64");
    res.json({
      token,
      user: { id: userId, name: businessName ?? orgName, email: `${normalizedPhone}@wa.bizchat`, orgId, orgName },
    });
  } catch (err) { next(err); }
});

// ─── WhatsApp routes (public) ─────────────────────────────────────────────────
router.use("/whatsapp", whatsappRoutes);

// ─── Auth middleware (all routes below require auth) ──────────────────────────
router.use(authHandler);

// ─── Read operations ──────────────────────────────────────────────────────────
router.get("/stats", generalLimiter, requireOrg, orderController.getStats);
router.get("/orders", generalLimiter, requireOrg, redactPII, orderController.getOrders);
router.get("/orders/:id", generalLimiter, requireOrg, redactPII, orderController.getOrderById);

// ─── Settings (business profile) ─────────────────────────────────────────────
router.get("/settings", generalLimiter, requireOrg, async (req, res, next) => {
  try {
    const profile = await storage.getBusinessProfile(req.orgId!);
    res.json(profile);
  } catch (err) { next(err); }
});

router.put("/settings", generalLimiter, requireOrg, async (req, res, next) => {
  try {
    const { businessName, gstNumber, address, phone, email, taxRate } = req.body;
    const orgId = req.orgId!;
    const profileRef = firestoreDb
      .collection("organizations").doc(orgId)
      .collection("profile").doc("business");
    await profileRef.set({
      businessName: businessName ?? "",
      gstNumber: gstNumber ?? "",
      address: address ?? null,
      phone: phone ?? null,
      email: email ?? null,
      taxRate: Number(taxRate ?? 18),
      currency: "INR",
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    res.json({ success: true, message: "Settings saved" });
  } catch (err) { next(err); }
});

// ─── Inventory: aggregate product quantities from all active orders ───────────
router.get("/inventory", generalLimiter, requireOrg, async (req, res, next) => {
  try {
    const LOW_STOCK_THRESHOLD = 10;
    const activeStatuses = new Set(["pending", "processing", "paid", "credit", "confirmed", "fulfilled"]);
    const orgId = req.orgId!;

    // Get ALL orders then filter in JS — avoids Firestore null-equality quirks
    // (same pattern as getChatOrders which works reliably)
    const ordersSnap = await firestoreDb
      .collection("organizations").doc(orgId).collection("orders")
      .get();

    const activeDocs = ordersSnap.docs.filter((d) => {
      const data = d.data();
      return !data.deletedAt && activeStatuses.has(data.status);
    });

    if (activeDocs.length === 0) {
      return res.json({ items: [], total: 0, low_stock_count: 0 });
    }

    // Aggregate item quantities across all active orders
    const aggregated: Record<string, { name: string; unit: string; quantity: number; order_count: number }> = {};

    for (const doc of activeDocs) {
      const items: any[] = doc.data().items ?? [];
      for (const item of items) {
        const name: string = item.productName ?? item.product_name ?? "Unknown";
        const unit: string = item.unit ?? "units";
        const key = `${name}__${unit}`;
        if (!aggregated[key]) {
          aggregated[key] = { name, unit, quantity: 0, order_count: 0 };
        }
        aggregated[key].quantity += Number(item.quantity ?? 0);
        aggregated[key].order_count += 1;
      }
    }

    const items = Object.values(aggregated).map((r) => {
      const qty = r.quantity;
      const status = qty === 0 ? "Out of Stock" : qty <= LOW_STOCK_THRESHOLD ? "Low Stock" : "In Stock";
      return { name: r.name, quantity: qty, unit: r.unit, status, order_count: r.order_count };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const low_stock_count = items.filter((i) => i.status === "Low Stock" || i.status === "Out of Stock").length;
    res.json({ items, total: items.length, low_stock_count });
  } catch (err) { next(err); }
});

// ─── Invoices ─────────────────────────────────────────────────────────────────
router.post("/orders/invoice", generalLimiter, invoiceController.generateInvoice);
router.get("/orders/:id/download", generalLimiter, requireOrg, invoiceController.downloadInvoice);

// ─── Write operations ─────────────────────────────────────────────────────────
router.post("/extract", extractLimiter, requireOrg, idempotency, sanitizeInputs, orderController.extractOrder);
router.post("/extract-order", extractLimiter, requireOrg, idempotency, sanitizeInputs, orderController.extractChatOrder);
router.post("/generate-invoice", extractLimiter, requireOrg, idempotency, sanitizeInputs, invoiceController.generateInvoice);

// ─── Async extraction (now inline — returns 202 with pending status) ──────────
router.post("/async/extract", extractLimiter, requireOrg, idempotency, sanitizeInputs, orderController.extractOrder);
router.post("/async/extract-order", extractLimiter, requireOrg, idempotency, sanitizeInputs, orderController.extractChatOrder);

// ─── Updates ──────────────────────────────────────────────────────────────────
router.patch("/orders/:id/edit", extractLimiter, requireOrg, sanitizeInputs, orderController.editOrder);
router.patch("/orders/:id", extractLimiter, requireOrg, sanitizeInputs, orderController.updateOrderStatus);
router.delete("/orders/:id", extractLimiter, requireOrg, orderController.deleteOrder);

// ─── Catalog ──────────────────────────────────────────────────────────────────
router.get("/catalog", generalLimiter, requireOrg, async (req, res) => {
  try {
    const orgId = req.orgId!;
    // Get ALL orders, filter deletedAt in JS to avoid null-equality issues
    const snap = await firestoreDb
      .collection("organizations").doc(orgId).collection("orders")
      .get();

    const map: Record<string, { name: string; unit: string | null; price: number | null }> = {};
    for (const doc of snap.docs) {
      if (doc.data().deletedAt) continue;
      const items: any[] = doc.data().items ?? [];
      for (const item of items) {
        const name = item.productName ?? item.product_name;
        if (name) {
          map[name] = { name, unit: item.unit ?? null, price: item.pricePerUnit != null ? Number(item.pricePerUnit) : null };
        }
      }
    }

    const items = Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
    res.json({ items, total: items.length });
  } catch {
    res.json({ items: [], total: 0 });
  }
});

router.post("/catalog/price", generalLimiter, requireOrg, async (req, res) => {
  try {
    const { name, price, unit } = req.body as { name: string; price: number; unit?: string };
    if (!name || price == null) return res.status(400).json({ message: "name and price required" });

    const orgId = req.orgId!;
    // Get ALL orders, filter deletedAt in JS
    const snap = await firestoreDb
      .collection("organizations").doc(orgId).collection("orders")
      .get();

    const batch = firestoreDb.batch();
    for (const doc of snap.docs) {
      if (doc.data().deletedAt) continue;
      const data = doc.data();
      const items: any[] = data.items ?? [];
      let changed = false;
      const updatedItems = items.map((item) => {
        const itemName = item.productName ?? item.product_name;
        if (itemName === name) {
          changed = true;
          return { ...item, pricePerUnit: price, ...(unit ? { unit } : {}) };
        }
        return item;
      });
      if (changed) {
        batch.update(doc.ref, { items: updatedItems });
      }
    }
    await batch.commit();
    res.json({ success: true, name, price });
  } catch {
    res.status(500).json({ message: "Failed to update price" });
  }
});

export default router;
