import { NextResponse } from "next/server";
import { ethers } from "ethers";
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

export async function POST(req: Request) {
  try {
    const { userWallet, title, description, contentHash } = await req.json();
    
    // 1. Fetch all members
    const membersRef = db.collection("organizations").doc("org_1").collection("members");
    const snapshot = await membersRef.get();
    
    // 2. FOOLPROOF FIX: Perform a strict case-insensitive match in memory
    const matchedDoc = snapshot.docs.find(doc => {
        const dbWallet = doc.data().walletAddress || "";
        return dbWallet.toLowerCase() === userWallet.toLowerCase();
    });
    
    // 3. Reject if they truly do not exist
    if (!matchedDoc) {
      return NextResponse.json({ error: "Wallet not found in verified DAO members." }, { status: 404 });
    }
  
    // 4. Check if their status is actually active
    const userData = matchedDoc.data();
    if (userData.status !== 'verified') {
        return NextResponse.json({ error: "Your DAO membership is not currently active." }, { status: 403 });
    }
  
    // ... [The rest of your ticket signing logic stays exactly the same!]
    
    if (userData?.walletAddress.toLowerCase() !== userWallet.toLowerCase()) {
      return NextResponse.json({ error: "Wallet address does not match registered profile." }, { status: 403 });
    }

    // 4. SAVE TO FIREBASE: Because the blockchain only stores the hash, 
    // we must save the actual text here so the dashboard can display it later!
    await db.collection("proposals").doc(contentHash).set({
      creator: userWallet,
      title: title,
      description: description,
      contentHash: contentHash,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 5. Setup the Server's Wallet (The Oracle)
    const oraclePrivateKey = process.env.ORACLE_PRIVATE_KEY;
    if (!oraclePrivateKey) {
      return NextResponse.json({ error: "Server misconfiguration: Oracle key missing." }, { status: 500 });
    }
    const oracleWallet = new ethers.Wallet(oraclePrivateKey);

    // 6. THE CRITICAL MATH FIX: Generate the exact same hash the NEW Solidity contract expects
    // keccak256(abi.encodePacked(userWallet, contentHash))
    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "bytes32"],
      [userWallet, contentHash]
    );

    // 7. Sign the hash to create the Ticket
    const ticket = await oracleWallet.signMessage(ethers.getBytes(messageHash));

    return NextResponse.json({ 
      success: true, 
      ticket, 
      message: "Cryptographic ticket generated successfully." 
    });

  } catch (error) {
    console.error("Ticket generation error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}