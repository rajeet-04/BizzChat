import { firestoreDb } from "./src/config/firestore.js";

async function run() {
  const orgs = await firestoreDb.collection("organizations").get();
  
  for (const org of orgs.docs) {
    const orders = await firestoreDb.collection("organizations").doc(org.id).collection("orders").get();
    console.log(`\nOrg: ${org.id} | Orders: ${orders.docs.length}`);
    const sorted = orders.docs.map(d => d.data().createdAt).sort();
    sorted.slice(-5).forEach(d => console.log(` - ${d}`));
  }
}

run();
