import { NextResponse } from "next/server";
import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { db } from "../utils/firebaseAdmin";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions); 
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: "Unauthorized. Please log in first." }, { status: 401 });
    }
    
    const { signature, publicAddress, linkedinUrl, identityCommitment, profileImage, authProvider } = await req.json();

    // Only strictly require the LinkedIn URL if they logged in with LinkedIn
    if (authProvider === "LinkedIn" && (!linkedinUrl || !linkedinUrl.includes("linkedin.com/in/"))) {
      return NextResponse.json({ error: "Valid LinkedIn URL is required." }, { status: 400 });
    }

    const expectedMessage = "Associating this social account to this Web3 wallet.";
    const recoveredAddress = ethers.verifyMessage(expectedMessage, signature);

    if (recoveredAddress.toLowerCase() !== publicAddress.toLowerCase()) {
      return NextResponse.json({ error: "Signature verification failed. Wallet mismatch." }, { status: 403 });
    }

    const membersCollection = db.collection("organizations").doc("org_1").collection("members");
    
    // --- DOUBLE REGISTRATION PREVENTION ---
    const userRef = membersCollection.doc(session.user.email);
    const userDoc = await userRef.get();
    
    if (userDoc.exists) {
      return NextResponse.json({ error: "This account has already registered a wallet." }, { status: 409 });
    }

    const walletQuery = await membersCollection.where("walletAddress", "==", publicAddress.toLowerCase()).get();
    
    if (!walletQuery.empty) {
      return NextResponse.json({ error: "This Web3 wallet is already linked to another member." }, { status: 409 });
    }

    // --- SAVE PENDING STATE ---
    await userRef.set({
        name: session.user.name,
        email: session.user.email,
        image: profileImage || "",
        authProvider: authProvider,
        linkedinUrl: linkedinUrl || "",
        walletAddress: publicAddress.toLowerCase(),
        identityCommitment: identityCommitment, 
        status: "pending", 
        approvals: [], 
        registeredAt: admin.firestore.FieldValue.serverTimestamp()
      });

    return NextResponse.json({ success: true, message: "Application submitted for manager review." });

  } catch (error) {
    console.error("Wallet binding error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}