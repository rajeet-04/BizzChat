import rateLimit from "express-rate-limit";
import { Request, Response, NextFunction } from "express";
import { firestoreDb } from "../config/firestore";
import { env } from "../config/env";

const TIER_LIMITS: Record<string, number> = {
  free: parseInt(env.RATE_LIMIT_FREE),
  pro: parseInt(env.RATE_LIMIT_PRO),
  enterprise: parseInt(env.RATE_LIMIT_ENTERPRISE),
};

const windowMs = parseInt(env.RATE_LIMIT_WINDOW_MS);

// In-memory tier cache (replaces Redis cache — sufficient for a single-process server)
const tierCache = new Map<string, { tier: string; expiresAt: number }>();
const TIER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get the rate limit for an organization based on its tier.
 * Tier is cached in-memory for TIER_CACHE_TTL_MS to avoid a Firestore round-trip
 * on every authenticated request.
 */
async function getOrgRateLimit(orgId: string | undefined): Promise<number> {
  if (!orgId) return TIER_LIMITS.free;

  // 1. Try in-memory cache first
  const cached = tierCache.get(orgId);
  if (cached && cached.expiresAt > Date.now()) {
    return TIER_LIMITS[cached.tier] ?? TIER_LIMITS.free;
  }

  // 2. Cache miss: query Firestore
  try {
    const snap = await firestoreDb.collection("organizations").doc(orgId).get();
    if (snap.exists) {
      const tier = snap.data()?.tier ?? "free";
      tierCache.set(orgId, { tier, expiresAt: Date.now() + TIER_CACHE_TTL_MS });
      return TIER_LIMITS[tier] ?? TIER_LIMITS.free;
    }
  } catch {
    // Fall back to free tier on Firestore lookup failure
  }

  return TIER_LIMITS.free;
}

const limiterCache = new Map<number, ReturnType<typeof rateLimit>>();

function getLimiter(max: number) {
  if (limiterCache.has(max)) return limiterCache.get(max)!;

  const limiter = rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.orgId ?? req.ip ?? "unknown",
    message: {
      error: `Rate limit exceeded. Your plan allows ${max} requests per ${windowMs / 60000} minutes.`,
    },
  });

  limiterCache.set(max, limiter);
  return limiter;
}

/**
 * Dynamic rate limiter that adjusts limits based on organization tier.
 */
export const extractLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const limit = await getOrgRateLimit(req.orgId);
  getLimiter(limit)(req, res, next);
};

/**
 * General limiter for read operations — tier-aware with a 5x multiplier.
 */
export const generalLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const baseLimit = await getOrgRateLimit(req.orgId);
  getLimiter(baseLimit * 5)(req, res, next);
};