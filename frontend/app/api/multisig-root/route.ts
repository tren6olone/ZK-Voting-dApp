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
    const doc = await db.collection("organizations").doc("org_1").collection("pending_tx").doc("root_update").get();
    if (doc.exists) {
      return NextResponse.json({ exists: true, ...doc.data() });
    }
    return NextResponse.json({ exists: false });
  } catch (error : unknown) {
    return NextResponse.json({ exists: false });
  }
}

export async function POST(req: Request) {
  try {
    const { root, nonce, deadline, signature, signerAddress, totalManagersRequired } = await req.json();

    const docRef = db.collection("organizations").doc("org_1").collection("pending_tx").doc("root_update");
    const doc = await docRef.get();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let signatures: any[] = [];
    
    if (doc.exists) {
      const data = doc.data();
      // If the blockchain nonce matches our pending tx, keep the existing signatures
      if (data?.nonce === nonce) {
         signatures = data?.signatures || [];
      }
    }

    // Prevent duplicate signatures from the same manager
    if (!signatures.find(s => s.signer.toLowerCase() === signerAddress.toLowerCase())) {
       signatures.push({ signer: signerAddress.toLowerCase(), signature });
    }

    await docRef.set({
      root,
      nonce,
      deadline,
      signatures,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const isReady = signatures.length >= totalManagersRequired;

    return NextResponse.json({ success: true, isReady, signatures });

  } catch (error: unknown) {
    console.error("Multi-sig API Error:", error);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}

export async function DELETE() {
   await db.collection("organizations").doc("org_1").collection("pending_tx").doc("root_update").delete();
   return NextResponse.json({ success: true });
}