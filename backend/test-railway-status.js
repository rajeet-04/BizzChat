async function test() {
  try {
    const res = await fetch("https://bizchatv2.vercel.app/api/debug/wa-status");
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text);
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}
test();
