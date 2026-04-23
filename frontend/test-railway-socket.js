import { io } from "socket.io-client";

console.log("Connecting to Vercel Proxy socket...");
const socket = io("https://bizchatv2.vercel.app", {
  query: { orgId: "5d0b33dd-8896-4f01-a428-a351ddb6b4d2" },
  transports: ["websocket", "polling"],
});

socket.on("connect", () => {
  console.log("Connected with socket id:", socket.id);
  socket.emit("join", "5d0b33dd-8896-4f01-a428-a351ddb6b4d2");
});

socket.on("wa:qr", (qr) => {
  console.log("RECEIVED QR CODE EVENT!");
  process.exit(0);
});

socket.on("wa:ready", () => {
  console.log("RECEIVED READY EVENT! WhatsApp is fully logged in.");
  process.exit(0);
});

socket.on("disconnect", () => {
  console.log("Disconnected.");
});

setTimeout(() => {
  console.log("Timeout. Received neither QR nor ready in 15 seconds.");
  process.exit(0);
}, 15000);
