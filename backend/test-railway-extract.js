async function test() {
  console.log("Calling Vercel proxy...");
  try {
    const res = await fetch("https://bizchatv2.vercel.app/api/debug/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "I want 5 kg apples" })
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text);
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}
test();
