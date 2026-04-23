import { Ollama } from "ollama";
import { randomUUID } from "crypto";
import type { ExtractedOrder, ChatMessage, ExtractedChatOrder } from "../schema";
import { log, logError } from "../middlewares/logger";
import { getPrompt } from "./promptManager";
import { env } from "../config/env";
import { getEncoding, type Tiktoken } from "js-tiktoken";

// ─── Token counter ─────────────────────────────────────────────────────────────
let _encoder: Tiktoken | null = null;
function getEncoder(): Tiktoken {
  if (!_encoder) _encoder = getEncoding("cl100k_base");
  return _encoder;
}
function countTokens(text: string): number {
  return getEncoder().encode(text).length;
}

// ─── Ollama Cloud client ────────────────────────────────────────────────────────
// Use values from dotenv-parsed env (not process.env directly, to avoid the
// local Ollama daemon setting OLLAMA_HOST=0.0.0.0:11434 at the system level).
const OLLAMA_HOST = env.OLLAMA_HOST; // from .env: https://ollama.com
const OLLAMA_API_KEY = env.OLLAMA_API_KEY ?? "";

// Fail fast: cloud endpoint requires an API key
if (OLLAMA_HOST.includes("ollama.com") && !OLLAMA_API_KEY) {
  throw new Error(
    "OLLAMA_API_KEY is not set. Set it in Railway → Variables (or your .env file) to use Ollama Cloud."
  );
}

const ollama = new Ollama({
  host: OLLAMA_HOST,
  headers: OLLAMA_API_KEY ? { Authorization: `Bearer ${OLLAMA_API_KEY}` } : {},
});

const MODEL = env.AI_MODEL_SMART;
const REQUEST_TIMEOUT_MS = parseInt(env.AI_REQUEST_TIMEOUT_MS);
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2000;
const MAX_RETRY_DELAY = 10000;


// ─── Sliding window ────────────────────────────────────────────────────────────
function applySlidingWindow(messages: ChatMessage[], maxTokens = 8000): ChatMessage[] {
  let currentTokens = 0;
  const pruned: ChatMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const line = `${messages[i].sender}: ${messages[i].text}\n`;
    const lineTokens = countTokens(line);
    if (currentTokens + lineTokens > maxTokens) break;
    currentTokens += lineTokens;
    pruned.unshift(messages[i]);
  }
  log(`applySlidingWindow: kept ${pruned.length}/${messages.length} messages (~${currentTokens} tokens)`, "ollama");
  return pruned;
}

const calculateBackoff = (attempt: number): number =>
  Math.min(MAX_RETRY_DELAY, INITIAL_RETRY_DELAY * Math.pow(2, attempt)) + Math.random() * 500;

// ─── Core: direct REST call to Ollama Cloud ───────────────────────────────────
async function ollamaChat(
  systemPrompt: string,
  userContent: string,
  stream = false
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = calculateBackoff(attempt - 1);
        log(`Retry attempt ${attempt}/${MAX_RETRIES}, waiting ${Math.round(delay)}ms`, "ollama");
        await new Promise((r) => setTimeout(r, delay));
      }

      log(`Ollama API call starting (model: ${MODEL}, input: ${userContent.length} chars)`, "ollama");
      const start = Date.now();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(OLLAMA_API_KEY ? { Authorization: `Bearer ${OLLAMA_API_KEY}` } : {}),
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          stream: false,
          // Note: Ollama Cloud does not support structured outputs (format: "json").
          // JSON is enforced via the system prompt instead.
          options: {
            temperature: 0.1,
            num_predict: 2048, // Increased to prevent truncated JSON objects
            num_ctx: 8192,     // Larger context for better multilingual extraction
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const err = new Error(`Ollama Cloud HTTP ${res.status}: ${body}`);
        (err as any).status = res.status;
        throw err;
      }

      const data = await res.json() as any;
      const content: string = data?.message?.content ?? "";
      log(`Ollama responded in ${Date.now() - start}ms, content length: ${content.length}`, "ollama");
      return content;
    } catch (err: any) {
      lastError = err;
      const status = err?.status ?? 0;
      // Don't retry on 4xx (except 429 rate limit)
      if (status >= 400 && status < 500 && status !== 429) {
        logError("Ollama 4xx — not retrying", err);
        throw err;
      }
    }
  }

  throw new Error(`Ollama API failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`);
}

// ─── JSON extraction helper ───────────────────────────────────────────────────
async function extractJSON(systemPrompt: string, userContent: string): Promise<any> {
  const raw = await ollamaChat(systemPrompt, userContent);
  
  // Find the first '{' and the last '}' to isolate the JSON object
  // from any conversational text the AI might have added.
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error(`AI returned invalid JSON structure: ${raw.slice(0, 50)}...`);
  }
  
  const cleaned = raw.substring(firstBrace, lastBrace + 1).trim();
  
  try {
    return JSON.parse(cleaned);
  } catch (err: any) {
    logError(`JSON Parse failed. Raw response snippet: ${raw.slice(0, 200)}`, err);
    throw new Error(`AI generated malformed JSON: ${err.message}`);
  }
}


// ─── Single message extraction ─────────────────────────────────────────────────
export async function extractOrderFromMessage(rawMessage: string, catalogItems: { name: string; price: number | null }[] = []): Promise<ExtractedOrder> {
  log(`Extracting order from single message (${rawMessage.length} chars)`, "ollama");

  const basePrompt = getPrompt("SINGLE_MESSAGE_EXTRACT", "v1", catalogItems);
  const systemPrompt = `${basePrompt}

You MUST respond with ONLY valid JSON (no markdown, no explanation) matching this exact schema:
{
  "customerName": string | null,
  "customerPhone": string | null,
  "items": [{ "name": string, "quantity": number, "unit": string | null, "pricePerUnit": number | null, "totalPrice": number | null }],
  "totalAmount": number | null,
  "notes": string | null,
  "confidence": number  // 0.0 to 1.0
}`;

  const parsed = await extractJSON(systemPrompt, rawMessage);


  log(`Extraction complete — ${parsed.items?.length || 0} items found`, "ollama");

  return {
    id: randomUUID(),
    customerName: parsed.customerName || undefined,
    customerPhone: parsed.customerPhone || undefined,
    items: Array.isArray(parsed.items)
      ? parsed.items.map((item: any) => ({
          name: String(item.name || "Unknown"),
          quantity: Number(item.quantity) || 1,
          unit: item.unit || undefined,
          pricePerUnit: item.pricePerUnit != null ? Number(item.pricePerUnit) : undefined,
          totalPrice: item.totalPrice != null ? Number(item.totalPrice) : undefined,
        }))
      : [],
    totalAmount: parsed.totalAmount != null ? Number(parsed.totalAmount) : undefined,
    currency: "INR",
    notes: parsed.notes || undefined,
    rawMessage,
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

export async function extractOrderFromChat(messages: ChatMessage[], catalogItems: { name: string; price: number | null }[] = []): Promise<ExtractedChatOrder> {
  const optimizedMessages = applySlidingWindow(messages);
  log(
    `Extracting order from chat (${optimizedMessages.length} messages)`,
    "ollama"
  );

  const conversationText = optimizedMessages
    .map((m) => `${m.sender}: ${m.text}`)
    .join("\n");

  const basePrompt = getPrompt("CHAT_EXTRACT", "v1", catalogItems);
  const systemPrompt = `${basePrompt}

You MUST respond with ONLY valid JSON (no markdown, no explanation) matching this exact schema:
{
  "customer_name": string | null,
  "items": [{ "product_name": string, "quantity": number, "unit": string | null, "price": number | null }],
  "delivery_address": string | null,
  "delivery_date": string | null,
  "special_instructions": string | null,
  "total": number | null,
  "confidence": "high" | "medium" | "low"
}`;


  const parsed = await extractJSON(systemPrompt, conversationText);

  log(
    `Chat extraction complete — customer: ${parsed.customer_name || "unknown"}, ${parsed.items?.length || 0} items, confidence: ${parsed.confidence}`,
    "ollama"
  );

  return {
    id: randomUUID(),
    customer_name: parsed.customer_name || null,
    items: Array.isArray(parsed.items)
      ? parsed.items.map((item: any) => ({
          product_name: String(item.product_name || item.name || "Unknown"),
          quantity: Number(item.quantity) || 1,
          unit: item.unit || null,
          price: item.price != null ? Number(item.price) : null,
        }))
      : [],
    delivery_address: parsed.delivery_address || null,
    delivery_date: parsed.delivery_date || null,
    special_instructions: parsed.special_instructions || null,
    total: parsed.total != null ? Number(parsed.total) : null,
    confidence: ["high", "medium", "low"].includes(parsed.confidence)
      ? parsed.confidence
      : "medium",
    status: "pending",
    created_at: new Date().toISOString(),
    raw_messages: messages,
  };
}

// ─── Streaming ─────────────────────────────────────────────────────────────────
export async function* streamExtractOrderFromChat(messages: ChatMessage[]) {
  const optimizedMessages = applySlidingWindow(messages);
  const conversationText = optimizedMessages
    .map((m) => `${m.sender}: ${m.text}`)
    .join("\n");

  const basePrompt = getPrompt("CHAT_EXTRACT", "v1");

  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(OLLAMA_API_KEY ? { Authorization: `Bearer ${OLLAMA_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: basePrompt },
        { role: "user", content: conversationText },
      ],
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama stream failed: HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value, { stream: true }).split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const chunk = JSON.parse(line);
        const text: string = chunk?.message?.content ?? "";
        if (text) yield text;
      } catch {
        // ignore malformed lines
      }
    }
  }
}

