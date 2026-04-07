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
const CONTRACT_ADDRESS = "0xa5713A2a775bbA91C942487C686C5546a459F3e4"; 
const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/N8mYXhL1a38jGYohZ8_oH"); 

// UPDATED ABI: Added totalManagers to handle dynamic thresholds
const MINIMAL_ABI = [
  "function isManager(address) view returns (bool)",
  "function totalManagers() view returns (uint256)"
];
const contract = new ethers.Contract(CONTRACT_ADDRESS, MINIMAL_ABI, provider);

export async function POST(req: Request) {
  try {
    const { targetEmail, signature, managerAddress } = await req.json();

    // 1. DYNAMIC THRESHOLD: Ask the blockchain how many managers exist right now
    const totalManagersOnChain = await contract.totalManagers();
    const requiredApprovals = Number(totalManagersOnChain);

    console.log(`Dynamic Multi-Sig: ${requiredApprovals} approvals required for verification.`);

    // 2. TRUE WEB3 AUTHENTICATION: Verify the signing manager is authorized
    const isAuthorizedManager = await contract.isManager(managerAddress);
    
    if (!isAuthorizedManager) {
      return NextResponse.json({ error: "Blockchain rejected: Wallet is not an on-chain manager." }, { status: 403 });
    }

    // 3. Cryptographically verify the manager's signature
    const expectedMessage = `I approve the entry of ${targetEmail} into the organization.`;
    const recoveredAddress = ethers.verifyMessage(expectedMessage, signature);

    if (recoveredAddress.toLowerCase() !== managerAddress.toLowerCase()) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
    }

    // 4. Update the user's document in Firestore
    const userRef = db.collection("organizations").doc("org_1").collection("members").doc(targetEmail);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: "User application not found." }, { status: 404 });
    }

    const userData = userDoc.data();
    const currentApprovals: string[] = userData?.approvals || [];

    if (currentApprovals.includes(managerAddress.toLowerCase())) {
      return NextResponse.json({ error: "You have already approved this member." }, { status: 400 });
    }

    // --- NEW: ZK IDENTITY SAFETY GATE ---
    // If the member was manually nominated, they MUST visit the /register page to generate their identity first.
    if (!userData?.identityCommitment) {
      return NextResponse.json({ 
        error: "Missing ZK Identity! This user was manually nominated. They must visit the 'Join DAO' page and connect their wallet to generate their cryptographic identity before you can approve them." 
      }, { status: 400 });
    }

    currentApprovals.push(managerAddress.toLowerCase());

    // 5. THE DYNAMIC MULTI-SIG THRESHOLD CHECK
    if (currentApprovals.length >= requiredApprovals) {
      
      // Add them to the off-chain Merkle Tree (Only happens when EVERY manager has signed)
      // Safely passes the guaranteed identityCommitment
      const newRoot = await addMemberToTree(targetEmail, userData.identityCommitment);
      
      await userRef.update({
        approvals: currentApprovals,
        status: "verified",
        treeIndex: userData.treeIndex || 0 
      });

      return NextResponse.json({ 
        success: true, 
        message: "Unanimous consent reached. Member verified and added to Merkle Tree.", 
        approvalsCount: currentApprovals.length,
        requiredCount: requiredApprovals,
        newRoot 
      });

    } else {
      // Threshold not yet met - just save the signature and wait
      await userRef.update({ approvals: currentApprovals });
      
      return NextResponse.json({ 
        success: true, 
        message: `Approval registered. Waiting for other managers.`, 
        approvalsCount: currentApprovals.length,
        requiredCount: requiredApprovals
      });
    }

  } catch (error: unknown) {
    console.error("Manager approval error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}