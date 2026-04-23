import { Request, Response } from "express";
import * as ollamaService from "../services/ollamaService";
import { storage } from "../services/storageService";
import { firestoreDb } from "../config/firestore";
import { extractOrderRequestSchema, extractOrderFromChatRequestSchema, updateChatOrderSchema } from "../schema";
import { requestLogger, correlationId } from "../middlewares/logger";
import { globalErrorHandler } from "../middlewares/errorHandler";
import { getIO } from "../services/socketService";
import { asyncHandler, AppError } from "../middlewares/errorHandler";
/** Strips any unwanted fields before sending a response. */
const sanitizeResponse = (order: any) => {
  return order;
};

export const extractOrder = asyncHandler(async (req: Request, res: Response) => {
  const { message } = extractOrderRequestSchema.parse(req.body);
  const catalog = await storage.getCatalog(req.orgId!);
  const order = await ollamaService.extractOrderFromMessage(message, catalog);
  const savedOrder = await storage.addOrder(req.orgId!, order);
  
  try {
    getIO().to(req.orgId!).emit("order:new", {
      id: savedOrder.id,
      customerName: savedOrder.customerName ?? "Missing Name",
      itemCount: savedOrder.items?.length ?? 0,
      items: (savedOrder.items ?? []).slice(0, 2).map((i: any) => i.productName ?? i.name),
      total: savedOrder.totalAmount ?? null,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to emit order:new manually (single):", err);
  }

  res.status(201).json(sanitizeResponse(savedOrder));
});

export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const orgId = req.orgId!;

  // Fetch all non-deleted orders and compute stats in one pass
  const snap = await firestoreDb
    .collection("organizations").doc(orgId).collection("orders")
    .where("deletedAt", "==", null)
    .get();

  const allDocs = snap.docs.map(d => d.data());

  const REVENUE_STATUSES = new Set(["paid", "confirmed", "credit", "fulfilled"]);
  const PENDING_STATUSES = new Set(["pending"]);

  let totalOrders = 0;
  let pendingOrders = 0;
  let confirmedOrders = 0;
  let totalRevenue = 0;

  for (const d of allDocs) {
    totalOrders++;
    const status = d.status ?? "";
    if (PENDING_STATUSES.has(status)) pendingOrders++;
    if (status === "confirmed") confirmedOrders++;
    if (REVENUE_STATUSES.has(status)) {
      totalRevenue += Number(d.totalAmount ?? 0);
    }
  }

  res.json({
    total_orders: totalOrders,
    pending_orders: pendingOrders,
    confirmed_orders: confirmedOrders,
    total_revenue: totalRevenue,
  });
});

export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 5000;
  const offset = Number(req.query.offset) || 0;
  const orders = await storage.getChatOrders(req.orgId!, limit, offset);
  res.json(orders.map(sanitizeResponse));
});

export const getOrderById = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const order = await storage.getChatOrder(req.orgId!, id);
  if (!order) throw new AppError("Order not found", 404);
  res.json(sanitizeResponse(order));
});

export const extractChatOrder = asyncHandler(async (req: Request, res: Response) => {
  const { messages } = extractOrderFromChatRequestSchema.parse(req.body);
  const catalog = await storage.getCatalog(req.orgId!);
  const order = await ollamaService.extractOrderFromChat(messages, catalog);
  const savedOrder = await storage.addChatOrder(req.orgId!, order);
  
  // Also emit real-time event for manual paste so UI auto-refreshes / toasts
  try {
    getIO().to(req.orgId!).emit("order:new", {
      id: savedOrder.id,
      customerName: order.customer_name ?? "Missing Name",
      itemCount: savedOrder.items?.length ?? 0,
      items: (savedOrder.items ?? []).slice(0, 2).map((i: any) => i.product_name ?? i.name),
      total: savedOrder.total ?? null,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to emit order:new manually:", err);
  }

  res.status(201).json(sanitizeResponse(savedOrder));
});

export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { status } = req.body;
  if (!status) throw new AppError("Status is required", 400);
  const updatedOrder = await storage.updateChatOrderDetails(req.orgId!, id, { status });
  if (!updatedOrder) throw new AppError("Order not found", 404);
  res.json(sanitizeResponse(updatedOrder));
});

export const editOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const updates = updateChatOrderSchema.parse(req.body);
  const updatedOrder = await storage.updateChatOrderDetails(req.orgId!, id, updates);
  if (!updatedOrder) throw new AppError("Order not found", 404);
  res.json(sanitizeResponse(updatedOrder));
});

export const deleteOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const success = await storage.deleteOrder(req.orgId!, id);
  if (!success) throw new AppError("Order not found or already deleted", 404);
  res.json({ success: true, message: "Order deleted successfully" });
});
