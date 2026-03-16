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
    const snapshot = await db.collection("organizations").doc("org_1").collection("members").get();
    
    const members = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id, // The email acts as the doc ID
        name: data.name,
        linkedinUrl: data.linkedinUrl,
        walletAddress: data.walletAddress,
        status: data.status,
        approvals: data.approvals || []
      };
    });

    return NextResponse.json({ success: true, members });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }
}