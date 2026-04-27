import { Request, Response } from "express";
import { generateInvoiceData } from "../services/invoiceService";
import { storage } from "../services/storageService";
import { pdfService } from "../services/pdfService";
import { sendInvoicePdf } from "../services/whatsappService";
import { asyncHandler, AppError } from "../middlewares/errorHandler";

import { z } from "zod";

const generateInvoiceSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
});

const shareInvoiceWhatsAppSchema = z.object({
  phone: z.string().min(8).optional(),
});

export const generateInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = generateInvoiceSchema.parse(req.body);
  
  // Get orgId with fallbacks: requireOrg middleware → user's orgId → body (dev)
  const orgId = req.orgId ?? req.user?.organizationId ?? (req.body.orgId as string | undefined);
  if (!orgId) {
    throw new AppError("User is not part of an Organization", 403);
  }

  const profile = await storage.getBusinessProfile(orgId);

  const updatedOrder = await storage.generateAndAttachInvoice(orgId, orderId, (orderData, seq) => {
    return generateInvoiceData(orderData, {
      invoiceSequence: seq,
      businessName: profile.businessName,
      gstNumber: profile.gstNumber,
      taxRatePercent: profile.taxRate,
    });
  });

  if (!updatedOrder || !updatedOrder.invoice) {
    throw new AppError("Failed to generate invoice", 500);
  }

  // 2. Generate PDF Binary — non-fatal: skip upload if storage is unavailable (dev mode)
  let downloadEndpoint: string | null = null;
  try {
    const pdfBuffer = await pdfService.generateInvoicePDF(updatedOrder.invoice);
    const fileName = `invoice_${updatedOrder.invoice.invoice_number}.pdf`;
    await pdfService.uploadToStorage(fileName, pdfBuffer);
    downloadEndpoint = `/api/orders/${orderId}/download`;
  } catch (pdfErr) {
    // PDF upload failed (e.g. no Azure credentials in dev) — invoice data is still saved
    console.warn("PDF generation/upload skipped:", (pdfErr as Error).message);
  }

  res.status(201).json({
    message: "Invoice generated successfully",
    invoice: updatedOrder.invoice,
    downloadEndpoint,
  });
});

/**
 * GET /api/orders/:id/download
 *
 * Generates a short-lived (5-minute) SAS token after verifying
 * auth + org ownership, then redirects the client to the signed URL.
 */
export const downloadInvoice = asyncHandler(async (req: Request, res: Response) => {
  const orderId = req.params.id as string;
  const orgId = req.orgId!;

  const order = await storage.getChatOrder(orgId, orderId);
  if (!order) {
    throw new AppError("Order not found", 404);
  }

  if (!order.invoice) {
    throw new AppError("No invoice generated for this order", 404);
  }

  const fileName = `invoice_${order.invoice.invoice_number}.pdf`;
  const signedUrl = await pdfService.generateDownloadUrl(fileName, 5);

  res.redirect(signedUrl);
});

/**
 * POST /api/orders/:id/share-whatsapp
 *
 * Sends invoice as a real PDF document to customer's WhatsApp number.
 */
export const shareInvoiceOnWhatsApp = asyncHandler(async (req: Request, res: Response) => {
  const orderId = req.params.id as string;
  const orgId = req.orgId!;
  const parsed = shareInvoiceWhatsAppSchema.parse(req.body ?? {});

  const order = await storage.getChatOrder(orgId, orderId);
  if (!order) {
    throw new AppError("Order not found", 404);
  }

  if (!order.invoice) {
    throw new AppError("No invoice generated for this order", 400);
  }

  const targetPhone = parsed.phone ?? order.customer_phone ?? "";
  if (!targetPhone) {
    throw new AppError("Customer phone number is missing", 400);
  }

  const pdfBuffer = await pdfService.generateInvoicePDF(order.invoice);
  const fileName = `invoice_${order.invoice.invoice_number}.pdf`;

  const sent = await sendInvoicePdf(
    orgId,
    targetPhone,
    pdfBuffer,
    fileName,
    `Invoice ${order.invoice.invoice_number} from ${order.invoice.business_name}`,
  );

  res.status(200).json({
    message: "Invoice PDF sent successfully on WhatsApp",
    phone: sent.phone,
  });
});