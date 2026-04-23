import { firestoreDb } from "./src/config/firestore.js";

async function run() {
  const users = await firestoreDb.collection("users").get();
  console.log(`Found ${users.docs.length} users.`);
  
  for (const doc of users.docs) {
    const data = doc.data();
    console.log(`User: ${data.id} | Name: ${data.name} | Phone: ${data.phone} | Org: ${data.organizationId}`);
  }
}

run();
