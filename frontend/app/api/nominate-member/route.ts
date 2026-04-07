import { NextResponse } from "next/server";
import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { db } from "../utils/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { email, name, linkedinUrl, walletAddress, isManager, targetId, signature, managerAddress } = data;

    // 1. Recreate the EXACT message the frontend signed
    const role = isManager ? "MANAGER" : "MEMBER";
    const expectedMessage = `I nominate ${targetId} as a new ${role} in the organization.`;
    
    // 2. Cryptographically verify the signature
    const recoveredAddress = ethers.verifyMessage(expectedMessage, signature);

    if (recoveredAddress.toLowerCase() !== managerAddress.toLowerCase()) {
       return NextResponse.json({ success: false, error: "Invalid cryptographic signature." }, { status: 403 });
    }

    // 3. Save the Nomination to Firebase
    // If it's a manager, we use their Wallet Address as the database ID. Otherwise, we use their email.
    const docId = isManager ? walletAddress : email;

    await db.collection("organizations").doc("org_1").collection("members").doc(docId).set({
       id: docId,
       name: isManager ? "Admin Manager" : name,
       email: isManager ? "" : email,
       linkedinUrl: isManager ? "" : linkedinUrl,
       walletAddress: walletAddress.toLowerCase(),
       isManager: isManager,
       status: "pending", 
       approvals: [managerAddress.toLowerCase()], // The nominating manager counts as the first signature!
       createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return NextResponse.json({ success: true, message: "Nomination recorded successfully." });
    
  } catch (error: unknown) {
    console.error("Nomination API error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}