import { GoogleGenerativeAI, type FunctionDeclaration, SchemaType } from "@google/generative-ai";
import { randomUUID } from "crypto";
import type { ExtractedOrder, ChatMessage, ExtractedChatOrder } from "../schema";
import { log, logError } from "../middlewares/logger";
import { getPrompt } from "./promptManager";
import { env } from "../config/env";
import { getEncoding, type Tiktoken } from "js-tiktoken";

/**
 * cl100k_base is a close public approximation for token counting.
 * It consistently handles multi-byte scripts (Devanagari, Arabic, CJK).
 */
let _encoder: Tiktoken | null = null;
function getEncoder(): Tiktoken {
  if (!_encoder) _encoder = getEncoding("cl100k_base");
  return _encoder;
}

function countTokens(text: string): number {
  return getEncoder().encode(text).length;
}

const DEFAULT_MODEL_STR = env.AI_MODEL_SMART;
const CHAT_EXTRACT_MODEL = env.AI_MODEL_SMART;

const REQUEST_TIMEOUT_MS = parseInt(env.AI_REQUEST_TIMEOUT_MS);
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2000;
const MAX_RETRY_DELAY = 10000;

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY ?? "");


/**
 * Trim the message list so the conversation fits within maxTokens.
 * Uses the cl100k_base tokenizer (js-tiktoken) instead of character count.
 */
function applySlidingWindow(messages: ChatMessage[], maxTokens: number = 8000): ChatMessage[] {
  let currentTokens = 0;
  const pruned: ChatMessage[] = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const line = `${messages[i].sender}: ${messages[i].text}\n`;
    const lineTokens = countTokens(line);
    if (currentTokens + lineTokens > maxTokens) break;
    currentTokens += lineTokens;
    pruned.unshift(messages[i]);
  }

  log(`applySlidingWindow: kept ${pruned.length}/${messages.length} messages (~${currentTokens} tokens)`, "gemini");
  return pruned;
}

/** Exponential backoff with jitter to avoid thundering herd on simultaneous failures. */
const calculateBackoff = (attempt: number): number => {
  const baseDelay = Math.min(
    MAX_RETRY_DELAY,
    INITIAL_RETRY_DELAY * Math.pow(2, attempt)
  );
  const jitter = Math.random() * 1000;
  return baseDelay + jitter;
};

async function extractWithFunctionCall(
  modelName: string,
  systemPrompt: string,
  userContent: string,
  functionName: string,
  functionDeclaration: FunctionDeclaration
): Promise<any> {
  let lastError: Error | null = null;
  const callStart = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        log(`Retry attempt ${attempt}/${MAX_RETRIES} for Gemini API call`, "warn");
      }

      log(`Gemini API call starting (model: ${modelName}, input: ${userContent.length} chars)`, "gemini");
      const attemptStart = Date.now();

      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations: [functionDeclaration] }],
        toolConfig: { functionCallingConfig: { mode: "ANY" as any, allowedFunctionNames: [functionName] } },
      });

      const result = await Promise.race([
        model.generateContent(userContent),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Gemini API request timed out")), REQUEST_TIMEOUT_MS)
        ),
      ]);

      const elapsed = Date.now() - attemptStart;

      const response = (result as any).response;
      const candidate = response.candidates?.[0];
      const part = candidate?.content?.parts?.find((p: any) => p.functionCall);

      if (!part?.functionCall) {
        throw new Error("Gemini did not return the expected function call.");
      }

      const usageMeta = response.usageMetadata;
      log(
        `Gemini API responded in ${elapsed}ms (usage: ${usageMeta?.promptTokenCount ?? "?"}in/${usageMeta?.candidatesTokenCount ?? "?"}out)`,
        "gemini"
      );

      return part.functionCall.args;
    } catch (error: any) {
      lastError = error;
      const elapsed = Date.now() - callStart;
      const status = error?.status ?? error?.statusCode ?? 0;
      const isClientError = status >= 400 && status < 500 && status !== 429;
      const isRateLimit = status === 429;

      if (isClientError) {
        throw error;
      }

      if (attempt < MAX_RETRIES) {
        let delay: number;

        if (isRateLimit && error.headers?.["retry-after"]) {
          const retryAfterSec = Number(error.headers["retry-after"]);
          delay = isNaN(retryAfterSec) ? calculateBackoff(attempt) : retryAfterSec * 1000;
          log(`Rate limited (429). Using Retry-After header: ${Math.round(delay)}ms`, "gemini");
        } else {
          delay = calculateBackoff(attempt);
          log(`${isRateLimit ? "Rate limited (429)" : "Server error"}. Backoff: ${Math.round(delay)}ms`, "gemini");
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Gemini API failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`);
}

export async function extractOrderFromMessage(rawMessage: string): Promise<ExtractedOrder> {
  log(`Extracting order from single message (${rawMessage.length} chars)`, "gemini");

  const systemPrompt = getPrompt("SINGLE_MESSAGE_EXTRACT", "v1");

  const functionDeclaration: FunctionDeclaration = {
    name: "record_order",
    description: "Record structured order details from the provided message",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        customerName: { type: SchemaType.STRING, nullable: true },
        customerPhone: { type: SchemaType.STRING, nullable: true },
        items: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              name: { type: SchemaType.STRING },
              quantity: { type: SchemaType.NUMBER },
              unit: { type: SchemaType.STRING, nullable: true },
              pricePerUnit: { type: SchemaType.NUMBER, nullable: true },
              totalPrice: { type: SchemaType.NUMBER, nullable: true },
            },
            required: ["name", "quantity"],
          },
        },
        totalAmount: { type: SchemaType.NUMBER, nullable: true },
        notes: { type: SchemaType.STRING, nullable: true },
        confidence: { type: SchemaType.NUMBER, description: "Confidence score from 0.0 to 1.0" },
      },
      required: ["items", "confidence"],
    } as any,
  };

  const parsed = await extractWithFunctionCall(DEFAULT_MODEL_STR, systemPrompt, rawMessage, "record_order", functionDeclaration);

  log(`Extraction complete — ${parsed.items?.length || 0} items found`, "gemini");

  const order: ExtractedOrder = {
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

  return order;
}

export async function extractOrderFromChat(messages: ChatMessage[]): Promise<ExtractedChatOrder> {
  const optimizedMessages = applySlidingWindow(messages);
  log(
    `Extracting order from chat (${optimizedMessages.length} messages, senders: ${Array.from(new Set(optimizedMessages.map((m) => m.sender))).join(", ")})`,
    "gemini"
  );

  const conversationText = optimizedMessages.map((m) => `${m.sender}: ${m.text}`).join("\n");
  const systemPrompt = getPrompt("CHAT_EXTRACT", "v1");

  const functionDeclaration: FunctionDeclaration = {
    name: "record_chat_order",
    description: "Record structured order details from the provided chat/conversation",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        customer_name: { type: SchemaType.STRING, nullable: true },
        items: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              product_name: { type: SchemaType.STRING },
              quantity: { type: SchemaType.NUMBER },
              price: { type: SchemaType.NUMBER, nullable: true },
            },
            required: ["product_name", "quantity"],
          },
        },
        delivery_address: { type: SchemaType.STRING, nullable: true },
        delivery_date: { type: SchemaType.STRING, nullable: true },
        special_instructions: { type: SchemaType.STRING, nullable: true },
        total: { type: SchemaType.NUMBER, nullable: true },
        confidence: {
          type: SchemaType.STRING,
          enum: ["high", "medium", "low"],
        },
      },
      required: ["items", "confidence"],
    } as any,
  };

  const parsed = await extractWithFunctionCall(CHAT_EXTRACT_MODEL, systemPrompt, conversationText, "record_chat_order", functionDeclaration);

  log(
    `Chat extraction complete — customer: ${parsed.customer_name || "unknown"}, ${parsed.items?.length || 0} items, confidence: ${parsed.confidence}`,
    "gemini"
  );

  const order: ExtractedChatOrder = {
    id: randomUUID(),
    customer_name: parsed.customer_name || null,
    items: Array.isArray(parsed.items)
      ? parsed.items.map((item: any) => ({
          product_name: String(item.product_name || item.name || "Unknown"),
          quantity: Number(item.quantity) || 1,
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
  return order;
}

export async function* streamExtractOrderFromChat(messages: ChatMessage[]) {
  const optimizedMessages = applySlidingWindow(messages);
  const conversationText = optimizedMessages.map((m) => `${m.sender}: ${m.text}`).join("\n");
  const systemPrompt = getPrompt("CHAT_EXTRACT", "v1");

  const model = genAI.getGenerativeModel({
    model: CHAT_EXTRACT_MODEL,
    systemInstruction: systemPrompt,
  });

  const streamResult = await model.generateContentStream(conversationText);

  for await (const chunk of streamResult.stream) {
    const text = chunk.text();
    if (text) {
      yield text;
    }
  }
}
