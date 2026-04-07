import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { db } from "../utils/firebaseAdmin";

// Define strict typing for our signatures
interface SignatureEntry {
  signer: string;
  signature: string;
}

// --- FIREBASE INIT ---

// NEW COLLECTION: Isolating manager votes from Merkle Root votes
const managerUpdatesRef = db.collection("organizations").doc("org_1").collection("manager_updates");

// --- GET: Fetch the current queue for the UI ---
export async function GET() {
  try {
    const snapshot = await managerUpdatesRef.get();
    const updates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ updates });
  } catch (error) {
    console.error("Failed to fetch manager updates:", error);
    return NextResponse.json({ error: "Failed to fetch." }, { status: 500 });
  }
}

// --- POST: Add a new signature to a specific manager action ---
export async function POST(req: Request) {
  try {
    const { action, targetAddress, nonce, deadline, signature, signerAddress, totalManagersRequired } = await req.json();

    // Use the target wallet address as the unique document ID
    const docRef = managerUpdatesRef.doc(targetAddress.toLowerCase());
    const docSnap = await docRef.get();

    let signatures: SignatureEntry[] = [];
    if (docSnap.exists) {
      signatures = docSnap.data()?.signatures || [];
    }

    // Prevent duplicate signatures from the same wallet
    if (!signatures.some((s: SignatureEntry) => s.signer.toLowerCase() === signerAddress.toLowerCase())) {
      signatures.push({ signer: signerAddress.toLowerCase(), signature });
    }

    // Save the updated queue item
    await docRef.set({
      action,
      targetAddress: targetAddress.toLowerCase(),
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
    console.error("Failed to save manager update:", error);
    return NextResponse.json({ error: "Failed to save." }, { status: 500 });
  }
}

// --- DELETE: Clean up the queue after execution or invalidation ---
export async function DELETE(req: Request) {
  try {
    const { targetAddress } = await req.json();
    await managerUpdatesRef.doc(targetAddress.toLowerCase()).delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete manager update:", error);
    return NextResponse.json({ error: "Failed to delete." }, { status: 500 });
  }
}