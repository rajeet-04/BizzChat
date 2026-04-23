import { Request, Response, NextFunction } from "express";
import { firestoreDb } from "../config/firestore";
import { AppError } from "./errorHandler";
import { env } from "../config/env";
import crypto from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

// ─── Firestore collection refs ───────────────────────────────────────────────
const usersCol = () => firestoreDb.collection("users");
const orgCol = () => firestoreDb.collection("organizations");
const apiKeysCol = () => firestoreDb.collection("apiKeys");

// ─── Express augmentation ────────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name?: string | null;
        organizationId?: string | null;
        role?: string | null;
      };
      orgId?: string;
    }
  }
}

const JWKS = createRemoteJWKSet(new URL(env.NEON_JWKS_URL));

export const authHandler = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers["x-api-key"] as string;

  try {
    // ── API Key authentication (machine access) ──────────────────────────────
    if (apiKeyHeader) {
      const incomingHash = crypto.createHash("sha256").update(apiKeyHeader).digest();
      const incomingHashHex = incomingHash.toString("hex");

      const snap = await apiKeysCol()
        .where("keyHash", "==", incomingHashHex)
        .where("isActive", "==", true)
        .limit(1)
        .get();

      if (snap.empty) throw new AppError("Invalid API Key", 401);

      const keyData = snap.docs[0].data();
      const storedHash = Buffer.from(keyData.keyHash, "hex");
      if (
        storedHash.length !== incomingHash.length ||
        !crypto.timingSafeEqual(incomingHash, storedHash)
      ) {
        throw new AppError("Invalid API Key", 401);
      }

      req.orgId = keyData.organizationId;
      return next();
    }

    // ── Local development bypass ─────────────────────────────────────────────
    if (env.NODE_ENV === "development" && authHeader === "Bearer mock-local-token") {
      const dummyUserId = "local-user";
      const dummyEmail = "local@example.com";
      const dummyOrgId = "local-org";

      // Ensure the org exists in Firestore
      const orgRef = orgCol().doc(dummyOrgId);
      const orgSnap = await orgRef.get();
      if (!orgSnap.exists) {
        await orgRef.set({
          id: dummyOrgId,
          name: "BizChat Local Store",
          gstNumber: null,
          tier: "free",
          invoiceSeq: 0,
          totalRevenue: 0,
          createdAt: new Date().toISOString(),
        });
      }

      // Ensure user exists in Firestore
      const userRef = usersCol().doc(dummyUserId);
      await userRef.set({
        id: dummyUserId,
        email: dummyEmail,
        name: "Local Tester",
        organizationId: dummyOrgId,
        role: "owner",
      }, { merge: true });

      req.user = { id: dummyUserId, email: dummyEmail, name: "Local Tester", organizationId: dummyOrgId, role: "owner" };
      req.orgId = dummyOrgId;
      return next();
    }

    // ── Bearer token: base64("userId:orgId") from /auth/login ───────────────
    if (authHeader?.startsWith("Bearer ")) {
      const rawToken = authHeader.split(" ")[1];

      // Try simple base64 token first
      let isBase64Token = false;
      let decodedUserId: string | null = null;
      let decodedOrgId: string | null = null;

      try {
        const decoded = Buffer.from(rawToken, "base64").toString("utf8");
        const colonIdx = decoded.indexOf(":");
        if (colonIdx > 0) {
          decodedUserId = decoded.slice(0, colonIdx);
          decodedOrgId = decoded.slice(colonIdx + 1);
          if (decodedUserId && decodedOrgId) isBase64Token = true;
        }
      } catch {
        // not base64
      }

      if (isBase64Token && decodedUserId && decodedOrgId) {
        try {
          const userRef = usersCol().doc(decodedUserId);
          const userSnap = await userRef.get();

          if (userSnap.exists) {
            const u = userSnap.data()!;
            // ✅ Always trust Firestore's organizationId — token orgId may be stale
            // (happens when whatsapp-session remaps a user to a different org)
            const resolvedOrgId = u.organizationId ?? decodedOrgId;
            req.user = { id: userSnap.id, email: u.email, name: u.name, organizationId: resolvedOrgId, role: u.role };
            req.orgId = resolvedOrgId;
            return next();
          }

          // User not in Firestore yet — auto-create with the orgId from the token
          const orgRef = orgCol().doc(decodedOrgId);
          const orgSnap = await orgRef.get();
          if (!orgSnap.exists) {
            await orgRef.set({
              id: decodedOrgId,
              name: "My Store",
              gstNumber: null,
              tier: "free",
              invoiceSeq: 0,
              totalRevenue: 0,
              createdAt: new Date().toISOString(),
            });
          }
          await userRef.set({
            id: decodedUserId,
            email: `${decodedUserId}@bizchat.local`,
            name: "User",
            organizationId: decodedOrgId,
            role: "owner",
            createdAt: new Date().toISOString(),
          }, { merge: true });

          req.user = { id: decodedUserId, email: `${decodedUserId}@bizchat.local`, name: "User", organizationId: decodedOrgId, role: "owner" };
          req.orgId = decodedOrgId;
          return next();
        } catch (firestoreErr: any) {
          throw new AppError(`Firestore error: ${firestoreErr.message}`, 500);
        }
      }


      // ── JWT authentication (Neon Auth) ─────────────────────────────────────
      try {
        const { payload } = await jwtVerify(rawToken, JWKS);
        const userId = payload.sub as string;
        const userEmail = payload.email as string;
        const userName = (payload.name as string) ?? "Unknown";

        const userRef = usersCol().doc(userId);
        await userRef.set({ id: userId, email: userEmail, name: userName }, { merge: true });

        const userSnap = await userRef.get();
        const u = userSnap.data()!;
        req.user = { id: userId, email: userEmail, name: userName, organizationId: u.organizationId ?? null, role: u.role ?? null };
        if (req.user?.organizationId) req.orgId = req.user.organizationId;
        return next();
      } catch {
        throw new AppError("Invalid or Expired Token", 401);
      }
    }

    throw new AppError("Authentication required", 401);
  } catch (err) {
    next(err);
  }
};

export const requireOrg = (req: Request, res: Response, next: NextFunction) => {
  if (!req.orgId) {
    return next(new AppError("User is not part of an Organization", 403));
  }
  next();
};
