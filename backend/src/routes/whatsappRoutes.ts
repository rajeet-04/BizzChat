import { Router, IRouter } from "express";
import { connectWhatsApp, getStatus, disconnectWhatsApp, remapSession } from "../services/whatsappService";
import { getIO } from "../services/socketService";
import { logger } from "../middlewares/logger";

const router: IRouter = Router();

// Connect WhatsApp - Initiates QR code generation
router.post("/connect", async (req, res, next) => {
  try {
    const { orgId } = req.body;
    
    if (!orgId) {
      return res.status(400).json({ 
        status: "error", 
        message: "orgId is required" 
      });
    }

    logger.info({ orgId }, "Initiating WhatsApp connection");
    
    // This will trigger QR code generation and emit via Socket.IO
    await connectWhatsApp(orgId);
    
    res.json({ 
      status: "success", 
      message: "WhatsApp connection initiated. Scan QR code to continue.",
      orgId 
    });
  } catch (err) {
    logger.error({ err }, "Failed to connect WhatsApp");
    next(err);
  }
});

// Get connection status
router.get("/status/:orgId", async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const status = getStatus(orgId);
    
    res.json({ 
      orgId,
      status 
    });
  } catch (err) {
    logger.error({ err }, "Failed to get WhatsApp status");
    next(err);
  }
});

// Disconnect WhatsApp
router.post("/disconnect", async (req, res, next) => {
  try {
    const { orgId } = req.body;
    
    if (!orgId) {
      return res.status(400).json({ 
        status: "error", 
        message: "orgId is required" 
      });
    }

    logger.info({ orgId }, "Disconnecting WhatsApp");
    await disconnectWhatsApp(orgId);
    
    // Notify all connected sockets in this org's room
    try {
      getIO().to(orgId).emit("wa:disconnected", "Logged out by user");
    } catch (_) {}
    
    res.json({ 
      status: "success", 
      message: "WhatsApp disconnected successfully" 
    });
  } catch (err) {
    logger.error({ err }, "Failed to disconnect WhatsApp");
    next(err);
  }
});

// Remap WhatsApp session from one orgId to another (called after QR auth)
router.post("/remap-session", async (req, res) => {
  const { fromOrgId, toOrgId } = req.body;
  if (!fromOrgId || !toOrgId) {
    return res.status(400).json({ status: "error", message: "fromOrgId and toOrgId are required" });
  }
  const ok = remapSession(fromOrgId, toOrgId);
  res.json({ status: ok ? "success" : "not_found", remapped: ok });
});

// Diagnostic: Test if socket notifications are working for a specific org
router.get("/test-notify/:orgId", (req, res) => {
  const { orgId } = req.params;
  try {
    const io = getIO();
    io.to(orgId).emit("wa:message_received", { senderName: "🔍 Test Connection" });
    res.json({ status: "success", message: `Test notification sent to room ${orgId}` });
  } catch (err) {
    res.status(500).json({ status: "error", message: String(err) });
  }
});

// Diagnostic: Capture a screenshot of the current WhatsApp page to see why it's stuck
router.get("/screenshot/:orgId", async (req, res) => {
  const { orgId } = req.params;
  try {
    const session = (global as any).waSessions?.get(orgId);
    if (!session || !session.client?.pupPage) {
      return res.status(404).json({ status: "error", message: "No active session or page found" });
    }
    const screenshot = await session.client.pupPage.screenshot({ encoding: "base64" });
    res.send(`<html><body><img src="data:image/png;base64,${screenshot}" style="max-width:100%"/></body></html>`);
  } catch (err) {
    res.status(500).json({ status: "error", message: String(err) });
  }
});

export default router;
