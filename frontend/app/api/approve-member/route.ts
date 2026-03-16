import { NextResponse } from "next/server";
import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { addMemberToTree } from "../utils/TreeManager";

// --- FIREBASE INIT ---
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

// --- WEB3 BACKEND CONFIG ---
// Replace this if your Hardhat deployed address changes!
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; 
const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545"); 
const MINIMAL_ABI = ["function isManager(address) view returns (bool)"];
const contract = new ethers.Contract(CONTRACT_ADDRESS, MINIMAL_ABI, provider);

const REQUIRED_APPROVALS = 1; // Set to 1 for your local testing

export async function POST(req: Request) {
  try {
    const { targetEmail, signature, managerAddress } = await req.json();

    // 1. TRUE WEB3 AUTHENTICATION: Ask the Smart Contract!
    const isAuthorizedManager = await contract.isManager(managerAddress);
    
    if (!isAuthorizedManager) {
      return NextResponse.json({ error: "Blockchain rejected: Wallet is not an on-chain manager." }, { status: 403 });
    }

    // 2. Cryptographically verify the manager's signature
    const expectedMessage = `I approve the entry of ${targetEmail} into the organization.`;
    const recoveredAddress = ethers.verifyMessage(expectedMessage, signature);

    if (recoveredAddress.toLowerCase() !== managerAddress.toLowerCase()) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
    }

    // 3. Update the user's document in Firestore
    const userRef = db.collection("organizations").doc("org_1").collection("members").doc(targetEmail);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: "User application not found." }, { status: 404 });
    }

    const userData = userDoc.data();
    const currentApprovals: string[] = userData?.approvals || [];

    if (currentApprovals.includes(managerAddress.toLowerCase())) {
      return NextResponse.json({ error: "Manager has already approved this member." }, { status: 400 });
    }

    currentApprovals.push(managerAddress.toLowerCase());

    // 4. The Multi-Sig Threshold Check
    if (currentApprovals.length >= REQUIRED_APPROVALS) {
      
      // Add them to the off-chain Merkle Tree
      const newRoot = await addMemberToTree(targetEmail, userData!.identityCommitment);
      
      await userRef.update({
        approvals: currentApprovals,
        status: "verified",
        treeIndex: userData!.treeIndex || 0 
      });

      return NextResponse.json({ success: true, message: "Member approved and verified.", newRoot });

    } else {
      await userRef.update({ approvals: currentApprovals });
      return NextResponse.json({ success: true, message: `Approval registered. ${currentApprovals.length}/${REQUIRED_APPROVALS} signatures collected.` });
    }

  } catch (error) {
    console.error("Manager approval error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}