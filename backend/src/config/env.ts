import { z } from "zod";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load root monorepo .env (two dirs up from src/config/), then local .env as fallback
const rootEnvPath = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: rootEnvPath, override: true });
dotenv.config({ override: false }); // fallback: backend/.env


const envSchema = z.object({
  PORT: z.string().default("3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  GEMINI_API_KEY: z.string().optional(),
  OLLAMA_API_KEY: z.string().optional(),
  OLLAMA_HOST: z.string().default("https://ollama.com"),
  AI_MODEL_FAST: z.string().default("minimax-m2.1:cloud"),
  AI_MODEL_SMART: z.string().default("minimax-m2.1:cloud"),
  AI_REQUEST_TIMEOUT_MS: z.string().default("60000"),

  /** Fallback when no business_profile document exists in Firestore */
  DEFAULT_GST_NUMBER: z.string().default("22AAAAA0000A1Z5"),
  DEFAULT_BUSINESS_NAME: z.string().default("BizChat Store"),

  /** Per-tier rate limits (overridable without redeploy) */
  RATE_LIMIT_FREE: z.string().default("20"),
  RATE_LIMIT_PRO: z.string().default("200"),
  RATE_LIMIT_ENTERPRISE: z.string().default("2000"),
  RATE_LIMIT_WINDOW_MS: z.string().default("900000"),

  NEON_AUTH_URL: z.string().url().optional().default("https://neon.tech"),
  NEON_JWKS_URL: z.string().url().optional().default("https://neon.tech/.well-known/jwks.json"),

  AZURE_STORAGE_ACCOUNT_NAME: z.string().optional().default(""),
  AZURE_STORAGE_ACCOUNT_KEY: z.string().optional().default(""),
  AZURE_STORAGE_CONTAINER_NAME: z.string().default("invoices"),

  SENTRY_DSN: z.string().url().optional(),
  FRONTEND_URL: z.string().url().optional(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Invalid environment variables:", _env.error.format());
  process.exit(1);
}

export const env = _env.data;