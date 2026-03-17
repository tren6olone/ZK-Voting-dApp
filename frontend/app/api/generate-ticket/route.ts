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
    const { userEmail, userWallet, title, description } = await req.json();

    // 1. Verify the user actually exists in the DAO
    const userDoc = await db.collection("organizations").doc("org_1").collection("members").doc(userEmail).get();
    
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const userData = userDoc.data();

    // 2. Strict Security Checks
    if (userData?.status !== "verified") {
      return NextResponse.json({ error: "User is not a verified member." }, { status: 403 });
    }
    
    if (userData?.walletAddress.toLowerCase() !== userWallet.toLowerCase()) {
      return NextResponse.json({ error: "Wallet address does not match registered profile." }, { status: 403 });
    }

    // 3. Setup the Server's Wallet (The Oracle)
    const oraclePrivateKey = process.env.ORACLE_PRIVATE_KEY;
    if (!oraclePrivateKey) {
      return NextResponse.json({ error: "Server misconfiguration: Oracle key missing." }, { status: 500 });
    }
    const oracleWallet = new ethers.Wallet(oraclePrivateKey);

    // 4. Generate the exact same hash the Solidity contract expects:
    // keccak256(abi.encodePacked(userWallet, title, description))
    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "string", "string"],
      [userWallet, title, description]
    );

    // 5. Sign the hash to create the Ticket
    // ethers.getBytes automatically prepares the hash for Ethereum's ECDSA signature
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