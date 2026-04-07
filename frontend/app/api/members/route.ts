import { NextResponse } from "next/server";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

export async function GET() {
  try {
    const db = admin.firestore();
    const snapshot = await db.collection("organizations").doc("org_1").collection("members").get();
    
    const members = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        walletAddress: data.walletAddress,
        status: data.status,
        approvals: data.approvals || [],
        removalVotes: data.removalVotes || [],
        
        // MAKE SURE THESE THREE LINES EXIST:
        image: data.image || "", 
        authProvider: data.authProvider || "",
        linkedinUrl: data.linkedinUrl || ""
      };
    });

    return NextResponse.json({ members });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }
}