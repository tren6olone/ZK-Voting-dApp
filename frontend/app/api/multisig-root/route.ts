import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { db } from "../utils/firebaseAdmin";

// --- NEW: Define the strict type to replace 'any' ---
interface SignatureEntry {
  signer: string;
  signature: string;
}


const updatesRef = db.collection("organizations").doc("org_1").collection("root_updates");

export async function GET() {
  try {
    const snapshot = await updatesRef.get();
    const updates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ updates });
  } catch (error) {
    // FIXED: Actually use the error variable by logging it
    console.error("Failed to fetch root updates:", error); 
    return NextResponse.json({ error: "Failed to fetch." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { root, nonce, deadline, signature, signerAddress, totalManagersRequired } = await req.json();

    const docRef = updatesRef.doc(root);
    const docSnap = await docRef.get();

    // FIXED: Replaced 'any[]' with our strict 'SignatureEntry[]'
    let signatures: SignatureEntry[] = [];
    if (docSnap.exists) {
      signatures = docSnap.data()?.signatures || [];
    }

    // FIXED: Replaced '(s: any)' with '(s: SignatureEntry)'
    if (!signatures.some((s: SignatureEntry) => s.signer.toLowerCase() === signerAddress.toLowerCase())) {
      signatures.push({ signer: signerAddress.toLowerCase(), signature });
    }

    await docRef.set({
      root,
      nonce,
      deadline,
      signatures,
      totalManagersRequired
    }, { merge: true });

    return NextResponse.json({
      success: true,
      isReady: signatures.length >= totalManagersRequired,
      signatures
    });
  } catch (error) {
    // FIXED: Actually use the error variable by logging it
    console.error("Failed to save root update:", error);
    return NextResponse.json({ error: "Failed to save." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { root } = await req.json();
    await updatesRef.doc(root).delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    // FIXED: Actually use the error variable by logging it
    console.error("Failed to delete root update:", error);
    return NextResponse.json({ error: "Failed to delete." }, { status: 500 });
  }
}