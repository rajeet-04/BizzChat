async function test() {
  try {
    const res = await fetch("https://bizchatv2.vercel.app/api/whatsapp/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: "5d0b33dd-8896-4f01-a428-a351ddb6b4d2" })
    });
    console.log("Disconnect Status:", res.status);
    console.log("Response:", await res.text());
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
