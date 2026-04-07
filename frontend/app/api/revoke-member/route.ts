import { NextResponse } from "next/server";
import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { db } from "../utils/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const { targetId, signature, managerAddress, totalManagersRequired } = await req.json();

    // 1. Verify the cryptographic signature
    const expectedMessage = `I vote to revoke the membership of ${targetId}.`;
    const recoveredAddress = ethers.verifyMessage(expectedMessage, signature);

    if (recoveredAddress.toLowerCase() !== managerAddress.toLowerCase()) {
      return NextResponse.json({ error: "Signature verification failed." }, { status: 403 });
    }

    // 2. Fetch the member from the database
    const memberRef = db.collection("organizations").doc("org_1").collection("members").doc(targetId);
    const memberDoc = await memberRef.get();

    if (!memberDoc.exists) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const data = memberDoc.data();
    const removalVotes = data?.removalVotes || [];

    // 3. Add the manager's vote if they haven't voted yet
    if (!removalVotes.includes(managerAddress.toLowerCase())) {
      removalVotes.push(managerAddress.toLowerCase());
    }

    // 4. Check if we reached the Multi-Sig threshold
    const newStatus = removalVotes.length >= totalManagersRequired ? 'revoked' : data?.status;

    // 5. Update the database securely
    await memberRef.update({
      removalVotes: removalVotes,
      status: newStatus
    });

    return NextResponse.json({ 
        success: true, 
        message: `Removal vote recorded. (${removalVotes.length}/${totalManagersRequired} Signatures)`, 
        newStatus 
    });

  } catch (error) {
    console.error("Revoke error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}