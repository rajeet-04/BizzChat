import { env } from "./src/config/env.js";
import * as ollama from "./src/services/ollamaService.js";

async function test() {
  try {
    const res = await ollama.extractOrderFromChat([{ sender: "Alice", text: "I want 5 kg apples" }]);
    console.log("Success:", res);
  } catch (err) {
    console.error("Extraction Error:", err.message);
  }
}

test();
