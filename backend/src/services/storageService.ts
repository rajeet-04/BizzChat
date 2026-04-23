import { firestoreDb } from "../config/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { ExtractedOrder, ExtractedChatOrder, Invoice, Organization } from "../schema";
import { randomUUID } from "crypto";
import { env } from "../config/env";
import { normalizeUnit, normalizeProductName } from "../utils/normalizeUnit";

/**
 * Convert a quantity to its base unit for consistent price calculation.
 * Catalog prices are always stored per BASE unit (kg, litre).
 * So if someone orders in g or ml, we convert before multiplying by the per-kg/litre price.
 *
 * Examples:
 *   500g  @ ₹35/kg  → 0.5  × 35 = ₹17.50  ✅
 *   250ml @ ₹50/ltr → 0.25 × 50 = ₹12.50  ✅
 */
function toBaseQty(quantity: number, unit: string | null): number {
  if (!unit) return quantity;
  const u = unit.toLowerCase();
  if (u === "g") return quantity / 1000;   // grams → kg
  if (u === "ml") return quantity / 1000;   // ml → litre
  return quantity; // already in base unit (kg, litre, packet, piece …)
}

// ─── Collection helpers ──────────────────────────────────────────────────────

const orgsCol = () => firestoreDb.collection("organizations");
const orgDoc = (orgId: string) => orgsCol().doc(orgId);
const ordersCol = (orgId: string) => orgDoc(orgId).collection("orders");
const orderDoc = (orgId: string, orderId: string) => ordersCol(orgId).doc(orderId);
const customersCol = (orgId: string) => orgDoc(orgId).collection("customers");
const customerDoc = (orgId: string, customerId: string) => customersCol(orgId).doc(customerId);
const profileDoc = (orgId: string) => orgDoc(orgId).collection("profile").doc("business");

// ─── Interface ───────────────────────────────────────────────────────────────

export interface IStorage {
  getOrganization(orgId: string): Promise<Organization | undefined>;
  getOrders(orgId: string): Promise<ExtractedOrder[]>;
  getOrder(orgId: string, id: string): Promise<ExtractedOrder | undefined>;
  addOrder(orgId: string, order: ExtractedOrder): Promise<ExtractedOrder>;
  updateOrderStatus(orgId: string, id: string, status: ExtractedOrder["status"]): Promise<ExtractedOrder | undefined>;
  deleteOrder(orgId: string, id: string): Promise<boolean>;
  getChatOrders(orgId: string, limit?: number, offset?: number): Promise<ExtractedChatOrder[]>;
  getChatOrder(orgId: string, id: string): Promise<ExtractedChatOrder | undefined>;
  addChatOrder(orgId: string, order: ExtractedChatOrder): Promise<ExtractedChatOrder>;
  attachInvoice(orgId: string, orderId: string, invoice: Invoice): Promise<ExtractedChatOrder | undefined>;
  updateChatOrderDetails(orgId: string, id: string, updates: Partial<ExtractedChatOrder>): Promise<ExtractedChatOrder | undefined>;
  generateAndAttachInvoice(orgId: string, orderId: string, generateInvoiceFn: (order: ExtractedChatOrder, nextSequence: number) => Invoice): Promise<ExtractedChatOrder | undefined>;
  getChatOrdersCount(orgId: string, statusFilter?: string): Promise<number>;
  getTotalRevenue(orgId: string): Promise<number>;
  getBusinessProfile(orgId: string): Promise<{
    businessName: string;
    gstNumber: string;
    taxRate: number;
    currency: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  }>;
  getCatalog(orgId: string): Promise<{ name: string; unit: string | null; price: number | null }[]>;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function docToExtractedOrder(docData: FirebaseFirestore.DocumentData, id: string): ExtractedOrder {
  return {
    id,
    customerName: docData.customerName || undefined,
    customerPhone: docData.customerPhone || undefined,
    items: (docData.items ?? []).map((i: any) => ({
      name: i.productName ?? i.name,
      quantity: Number(i.quantity),
      unit: i.unit ?? undefined,
      pricePerUnit: i.pricePerUnit != null ? Number(i.pricePerUnit) : undefined,
      totalPrice: i.totalPrice != null ? Number(i.totalPrice) : undefined,
    })),
    totalAmount: docData.totalAmount != null ? Number(docData.totalAmount) : undefined,
    currency: docData.currency || "INR",
    notes: docData.specialInstructions || undefined,
    rawMessage: Array.isArray(docData.rawMessages)
      ? docData.rawMessages.map((m: any) => m.text).join("\n")
      : docData.rawMessages ?? "",
    confidence: Number(docData.confidence ?? 0),
    status: docData.status,
    createdAt: docData.createdAt,
  };
}

function docToExtractedChatOrder(docData: FirebaseFirestore.DocumentData, id: string): ExtractedChatOrder {
  return {
    id,
    customer_name: docData.customerName || undefined,
    items: (docData.items ?? []).map((i: any) => ({
      product_name: i.productName ?? i.product_name,
      quantity: Number(i.quantity),
      unit: i.unit || undefined,
      price: i.pricePerUnit != null ? Number(i.pricePerUnit) : null,
    })),
    delivery_address: docData.deliveryAddress || undefined,
    delivery_date: docData.deliveryDate || undefined,
    special_instructions: docData.specialInstructions || undefined,
    total: docData.totalAmount != null ? Number(docData.totalAmount) : undefined,
    confidence: docData.confidence,
    status: docData.status,
    created_at: docData.createdAt,
    raw_messages: docData.rawMessages ?? [],
    invoice: docData.invoice || undefined,
    customer_phone: docData.customerPhone || undefined,
  };
}

// ─── Storage implementation ───────────────────────────────────────────────────

export class FirestoreStorage implements IStorage {

  // ── Ensure org doc exists (idempotent) ──────────────────────────────────────
  private async ensureOrg(orgId: string, name?: string) {
    const ref = orgDoc(orgId);
    await firestoreDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        tx.set(ref, {
          id: orgId,
          name: name ?? "BizChat Store",
          gstNumber: null,
          tier: "free",
          invoiceSeq: 0,
          totalRevenue: 0,
          createdAt: new Date().toISOString(),
        });
      }
    });
  }

  async getOrganization(orgId: string): Promise<Organization | undefined> {
    const snap = await orgDoc(orgId).get();
    if (!snap.exists) return undefined;
    const d = snap.data()!;
    return {
      id: snap.id,
      name: d.name,
      gstNumber: d.gstNumber ?? null,
      tier: d.tier ?? "free",
      createdAt: d.createdAt,
    };
  }

  async getBusinessProfile(orgId: string) {
    const snap = await profileDoc(orgId).get();
    if (snap.exists) {
      const d = snap.data()!;
      return {
        businessName: d.businessName,
        gstNumber: d.gstNumber ?? "",
        taxRate: Number(d.taxRate ?? 18),
        currency: d.currency ?? "INR",
        logoUrl: d.logoUrl ?? null,
        address: d.address ?? null,
        phone: d.phone ?? null,
        email: d.email ?? null,
      };
    }
    return {
      businessName: env.DEFAULT_BUSINESS_NAME,
      gstNumber: env.DEFAULT_GST_NUMBER,
      taxRate: 18.0,
      currency: "INR",
      logoUrl: null,
      address: null,
      phone: null,
      email: null,
    };
  }

  // ── Single-message orders ────────────────────────────────────────────────────

  async getOrders(orgId: string): Promise<ExtractedOrder[]> {
    const snap = await ordersCol(orgId)
      .where("extractionType", "==", "single_message")
      .get();

    // Filter deletedAt and sort in JS — avoids needing a Firestore composite index
    const docs = snap.docs
      .filter((d) => !d.data().deletedAt)
      .sort((a, b) => (b.data().createdAt ?? "").localeCompare(a.data().createdAt ?? ""));
    return docs.map((doc) => docToExtractedOrder(doc.data(), doc.id));
  }

  async getOrder(orgId: string, id: string): Promise<ExtractedOrder | undefined> {
    const snap = await orderDoc(orgId, id).get();
    if (!snap.exists || snap.data()?.deletedAt) return undefined;
    return docToExtractedOrder(snap.data()!, snap.id);
  }

  async addOrder(orgId: string, order: ExtractedOrder): Promise<ExtractedOrder> {
    await this.ensureOrg(orgId);

    const items = order.items.map((item) => ({
      productName: item.name,
      quantity: item.quantity,
      unit: item.unit ?? null,
      pricePerUnit: item.pricePerUnit ?? null,
      totalPrice: item.totalPrice ?? null,
    }));

    const docData = {
      extractionType: "single_message",
      customerName: order.customerName ?? "Unknown Customer",
      customerPhone: order.customerPhone ?? null,
      items,
      totalAmount: order.totalAmount ?? null,
      currency: order.currency ?? "INR",
      specialInstructions: order.notes ?? null,
      rawMessages: order.rawMessage,
      confidence: order.confidence,
      status: order.status,
      invoice: null,
      deletedAt: null,
      createdAt: order.createdAt,
    };

    await orderDoc(orgId, order.id).set(docData);
    return docToExtractedOrder(docData, order.id);
  }

  async updateOrderStatus(orgId: string, id: string, status: ExtractedOrder["status"]): Promise<ExtractedOrder | undefined> {
    const ref = orderDoc(orgId, id);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.deletedAt) return undefined;
    await ref.update({ status });
    const updated = await ref.get();
    return docToExtractedOrder(updated.data()!, id);
  }

  async deleteOrder(orgId: string, id: string): Promise<boolean> {
    const ref = orderDoc(orgId, id);
    const snap = await ref.get();
    if (!snap.exists) return false;
    await ref.update({ deletedAt: new Date().toISOString() });
    return true;
  }

  // ── Chat orders ──────────────────────────────────────────────────────────────

  async getChatOrders(orgId: string, limit: number = 50, offset: number = 0): Promise<ExtractedChatOrder[]> {
    const snap = await ordersCol(orgId)
      .where("extractionType", "==", "chat_log")
      .get();

    // Filter deletedAt in JS, sort by createdAt desc — avoids composite Firestore index
    const sorted = snap.docs
      .filter((d) => !d.data().deletedAt)
      .sort((a, b) => (b.data().createdAt ?? "").localeCompare(a.data().createdAt ?? ""));
    const paged = sorted.slice(offset, offset + limit);
    return paged.map((doc) => docToExtractedChatOrder(doc.data(), doc.id));
  }

  async getChatOrdersCount(orgId: string, statusFilter?: string): Promise<number> {
    const snap = await ordersCol(orgId)
      .where("extractionType", "==", "chat_log")
      .get();

    // Filter in JS to avoid composite index requirement
    let docs = snap.docs.filter((d) => !d.data().deletedAt);
    if (statusFilter) {
      docs = docs.filter((d) => d.data().status === statusFilter);
    }
    return docs.length;
  }

  async getTotalRevenue(orgId: string): Promise<number> {
    // We maintain a running totalRevenue on the org document
    const snap = await orgDoc(orgId).get();
    return Number(snap.data()?.totalRevenue ?? 0);
  }

  async getChatOrder(orgId: string, id: string): Promise<ExtractedChatOrder | undefined> {
    const snap = await orderDoc(orgId, id).get();
    if (!snap.exists || snap.data()?.deletedAt) return undefined;
    return docToExtractedChatOrder(snap.data()!, snap.id);
  }

  async addChatOrder(orgId: string, order: ExtractedChatOrder): Promise<ExtractedChatOrder> {
    await this.ensureOrg(orgId);

    // Upsert customer by name
    let customerId: string;
    if (order.customer_name) {
      const existing = await customersCol(orgId)
        .where("name", "==", order.customer_name)
        .limit(1)
        .get();
      if (!existing.empty) {
        customerId = existing.docs[0].id;
      } else {
        customerId = randomUUID();
        await customerDoc(orgId, customerId).set({
          name: order.customer_name,
          phone: order.customer_phone ?? null,
          createdAt: new Date().toISOString(),
        });
      }
    } else {
      customerId = randomUUID();
      await customerDoc(orgId, customerId).set({
        name: "Unknown Customer",
        phone: null,
        createdAt: new Date().toISOString(),
      });
    }

    const items = order.items.map((item) => {
      const normUnit = normalizeUnit(item.unit);
      const normName = normalizeProductName(item.product_name);
      const pricePerUnit = item.price != null ? Number(item.price) : null;
      // Convert g→kg or ml→litre before multiplying so the total is correct.
      // The stored quantity/unit stays as-is (500g) for display; only the total is adjusted.
      const baseQty = toBaseQty(item.quantity, normUnit);
      const totalPrice = pricePerUnit != null ? baseQty * pricePerUnit : null;
      return {
        productName: normName,
        quantity: item.quantity,
        unit: normUnit ?? null,
        pricePerUnit,
        totalPrice,
      };
    });

    const docData = {
      extractionType: "chat_log",
      customerId,
      customerName: order.customer_name ?? null,
      customerPhone: order.customer_phone ?? null,
      items,
      totalAmount: order.total ?? null,
      deliveryAddress: order.delivery_address ?? null,
      deliveryDate: order.delivery_date ?? null,
      specialInstructions: order.special_instructions ?? null,
      rawMessages: order.raw_messages,
      confidence: order.confidence,
      status: order.status,
      invoice: null,
      deletedAt: null,
      createdAt: order.created_at,
    };

    await orderDoc(orgId, order.id).set(docData);
    return docToExtractedChatOrder(docData, order.id);
  }

  async attachInvoice(orgId: string, orderId: string, invoice: Invoice): Promise<ExtractedChatOrder | undefined> {
    const ref = orderDoc(orgId, orderId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.deletedAt) return undefined;
    await ref.update({ invoice });
    const updated = await ref.get();
    return docToExtractedChatOrder(updated.data()!, orderId);
  }

  async updateChatOrderDetails(orgId: string, id: string, updates: Partial<ExtractedChatOrder>): Promise<ExtractedChatOrder | undefined> {
    const ref = orderDoc(orgId, id);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.deletedAt) return undefined;

    const dbUpdates: Record<string, any> = {};
    if (updates.total !== undefined) dbUpdates.totalAmount = updates.total;
    if (updates.delivery_address !== undefined) dbUpdates.deliveryAddress = updates.delivery_address;
    if (updates.delivery_date !== undefined) dbUpdates.deliveryDate = updates.delivery_date;
    if (updates.special_instructions !== undefined) dbUpdates.specialInstructions = updates.special_instructions;
    if (updates.status !== undefined) dbUpdates.status = updates.status;

    // Replace items if provided
    if (updates.items !== undefined) {
      dbUpdates.items = updates.items.map((item) => ({
        productName: item.product_name,
        quantity: item.quantity,
        unit: item.unit ?? null,
        pricePerUnit: item.price ?? null,
        totalPrice: item.price != null ? item.quantity * item.price : null,
      }));
    }

    if (updates.customer_name !== undefined) {
      dbUpdates.customerName = updates.customer_name;
      // Also update the customer document
      const custId = snap.data()?.customerId;
      if (custId) {
        await customerDoc(orgId, custId).update({ name: updates.customer_name });
      }
    }

    await ref.update(dbUpdates);
    const updated = await ref.get();
    return docToExtractedChatOrder(updated.data()!, id);
  }

  // ── Invoice sequence (Firestore transaction counter) ─────────────────────────

  async generateAndAttachInvoice(
    orgId: string,
    orderId: string,
    generateInvoiceFn: (order: ExtractedChatOrder, nextSequence: number) => Invoice,
  ): Promise<ExtractedChatOrder | undefined> {
    const orderRef = orderDoc(orgId, orderId);
    const orgRef = orgDoc(orgId);

    return firestoreDb.runTransaction(async (tx) => {
      const [orderSnap, orgSnap] = await Promise.all([tx.get(orderRef), tx.get(orgRef)]);

      if (!orderSnap.exists || orderSnap.data()?.deletedAt) return undefined;

      // Atomic invoice sequence increment
      const currentSeq: number = orgSnap.data()?.invoiceSeq ?? 0;
      const nextSeq = currentSeq + 1;
      tx.update(orgRef, { invoiceSeq: nextSeq });

      const chatOrder = docToExtractedChatOrder(orderSnap.data()!, orderId);
      const invoiceData = generateInvoiceFn(chatOrder, nextSeq);

      // Update running revenue
      const prevRevenue: number = orgSnap.data()?.totalRevenue ?? 0;
      const orderTotal = Number(orderSnap.data()?.totalAmount ?? 0);

      tx.update(orderRef, {
        invoice: invoiceData,
        invoiceSeq: nextSeq,
        status: "confirmed",
      });

      // Only add to totalRevenue if it wasn't already confirmed
      if (orderSnap.data()?.status !== "confirmed") {
        tx.update(orgRef, { totalRevenue: prevRevenue + orderTotal });
      }

      return docToExtractedChatOrder(
        { ...orderSnap.data()!, invoice: invoiceData, status: "confirmed" },
        orderId,
      );
    });
  }

  // ── Catalog ────────────────────────────────────────────────────────────────

  async getCatalog(orgId: string): Promise<{ name: string; unit: string | null; price: number | null }[]> {
    const snap = await ordersCol(orgId).get();

    const map: Record<string, { name: string; unit: string | null; price: number | null }> = {};

    for (const doc of snap.docs) {
      if (doc.data().deletedAt) continue; // skip soft-deleted
      const items: any[] = doc.data().items ?? [];
      for (const item of items) {
        const name = item.productName ?? item.product_name;
        if (name) {
          map[name] = {
            name,
            unit: item.unit ?? null,
            price: item.pricePerUnit != null ? Number(item.pricePerUnit) : null,
          };
        }
      }
    }

    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }
}

export const storage = new FirestoreStorage();
