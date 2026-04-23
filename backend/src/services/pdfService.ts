import PDFDocument from "pdfkit";
import { Invoice } from "../schema";
import { env } from "../config/env";
import fs from "fs";
import path from "path";

/** Directory where PDFs are saved locally in dev mode */
const LOCAL_PDF_DIR = path.resolve(process.cwd(), "invoices");

export class PdfService {
  /** Generates a PDF invoice and returns it as a Buffer. */
  async generateInvoicePDF(invoice: Invoice): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      // Header
      doc.fontSize(24).font("Helvetica-Bold").text("INVOICE", { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(10).font("Helvetica").fillColor("#6B7280").text("Tax Invoice / Bill of Supply", { align: "center" });
      doc.fillColor("#000000");
      doc.moveDown();
      doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor("#E5E7EB").stroke();
      doc.moveDown();

      // Business & Customer info side by side
      const leftX = 50;
      const rightX = 350;
      const infoTop = doc.y;

      doc.font("Helvetica-Bold").fontSize(11).text("From:", leftX, infoTop);
      doc.font("Helvetica").fontSize(10)
        .text(invoice.business_name, leftX, doc.y)
        .text(`GSTIN: ${invoice.gst_number}`, leftX);

      doc.font("Helvetica-Bold").fontSize(11).text("Bill To:", rightX, infoTop);
      doc.font("Helvetica").fontSize(10)
        .text(invoice.customer_name || "Customer", rightX, infoTop + 16);

      doc.moveDown(2);
      doc.font("Helvetica").fontSize(10)
        .text(`Invoice No: ${invoice.invoice_number}`, leftX)
        .text(`Date: ${invoice.date}`, leftX);

      doc.moveDown();
      doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor("#E5E7EB").stroke();
      doc.moveDown(0.5);

      // Table header
      const tableTop = doc.y;
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#374151");
      doc.text("Item", 50, tableTop, { width: 180 });
      doc.text("Qty", 240, tableTop, { width: 60 });
      doc.text("Rate (₹)", 310, tableTop, { width: 80 });
      doc.text("Amount (₹)", 420, tableTop, { width: 90, align: "right" });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor("#E5E7EB").stroke();
      doc.moveDown(0.5);

      // Table rows
      doc.font("Helvetica").fontSize(10).fillColor("#000000");
      invoice.items.forEach((item) => {
        const y = doc.y;
        doc.text(item.product_name, 50, y, { width: 180 });
        doc.text(String(item.quantity), 240, y, { width: 60 });
        doc.text(item.price.toFixed(2), 310, y, { width: 80 });
        doc.text(item.amount.toFixed(2), 420, y, { width: 90, align: "right" });
        doc.moveDown();
      });

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor("#E5E7EB").stroke();
      doc.moveDown();

      // Totals
      const totalsX = 320;
      doc.font("Helvetica").fontSize(10);
      doc.text("Subtotal:", totalsX).text(`₹${invoice.subtotal.toFixed(2)}`, 460, doc.y - 12, { align: "right" });
      if ((invoice.cgst ?? 0) > 0) {
        doc.text(`CGST (${(invoice.cgst / invoice.subtotal * 100 / 2).toFixed(0)}%):`, totalsX)
           .text(`₹${invoice.cgst.toFixed(2)}`, 460, doc.y - 12, { align: "right" });
        doc.text(`SGST (${(invoice.sgst / invoice.subtotal * 100 / 2).toFixed(0)}%):`, totalsX)
           .text(`₹${invoice.sgst.toFixed(2)}`, 460, doc.y - 12, { align: "right" });
      }
      if (invoice.igst && invoice.igst > 0) {
        doc.text("IGST:", totalsX).text(`₹${invoice.igst.toFixed(2)}`, 460, doc.y - 12, { align: "right" });
      }

      doc.moveDown(0.5);
      doc.moveTo(320, doc.y).lineTo(550, doc.y).strokeColor("#000").stroke();
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(12);
      doc.text("TOTAL:", totalsX).text(`₹${invoice.total.toFixed(2)}`, 460, doc.y - 14, { align: "right" });

      doc.moveDown(2);
      doc.font("Helvetica").fontSize(9).fillColor("#6B7280")
        .text("This is a computer-generated invoice.", { align: "center" });

      doc.end();
    });
  }

  /**
   * Saves PDF to local filesystem (dev) or uploads to Azure (prod).
   * In dev mode with fake Azure credentials, saves locally without error.
   */
  async uploadToStorage(fileName: string, fileBuffer: Buffer): Promise<string> {
    // In development, skip Azure and save locally
    if (env.NODE_ENV === "development" || env.AZURE_STORAGE_ACCOUNT_NAME === "localaccount") {
      if (!fs.existsSync(LOCAL_PDF_DIR)) {
        fs.mkdirSync(LOCAL_PDF_DIR, { recursive: true });
      }
      const filePath = path.join(LOCAL_PDF_DIR, fileName);
      fs.writeFileSync(filePath, fileBuffer);
      console.log(`[PDF] Saved locally: ${filePath}`);
      return fileName;
    }

    // Production: upload to Azure Blob Storage
    const {
      BlobServiceClient,
      StorageSharedKeyCredential,
    } = await import("@azure/storage-blob");

    const sharedKeyCredential = new StorageSharedKeyCredential(
      env.AZURE_STORAGE_ACCOUNT_NAME,
      env.AZURE_STORAGE_ACCOUNT_KEY,
    );
    const blobServiceClient = new BlobServiceClient(
      `https://${env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
      sharedKeyCredential,
    );

    const containerClient = blobServiceClient.getContainerClient(env.AZURE_STORAGE_CONTAINER_NAME);
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);

    await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
      blobHTTPHeaders: { blobContentType: "application/pdf" },
    });

    return fileName;
  }

  /** Generates a short-lived SAS URL (prod) or a local file path (dev). */
  async generateDownloadUrl(fileName: string, expiryMinutes = 5): Promise<string> {
    if (env.NODE_ENV === "development" || env.AZURE_STORAGE_ACCOUNT_NAME === "localaccount") {
      return `/invoices/${fileName}`;
    }

    const {
      BlobSASPermissions,
      generateBlobSASQueryParameters,
      StorageSharedKeyCredential,
    } = await import("@azure/storage-blob");

    const sharedKeyCredential = new StorageSharedKeyCredential(
      env.AZURE_STORAGE_ACCOUNT_NAME,
      env.AZURE_STORAGE_ACCOUNT_KEY,
    );

    const expiresOn = new Date();
    expiresOn.setMinutes(expiresOn.getMinutes() + expiryMinutes);

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: env.AZURE_STORAGE_CONTAINER_NAME,
        blobName: fileName,
        permissions: BlobSASPermissions.parse("r"),
        expiresOn,
      },
      sharedKeyCredential,
    ).toString();

    return `https://${env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${env.AZURE_STORAGE_CONTAINER_NAME}/${fileName}?${sasToken}`;
  }
}

export const pdfService = new PdfService();