import { NextResponse } from "next/server";
import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { Group } from "@semaphore-protocol/group";

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
// The exact address you just deployed to!
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; 
// Connect to your local Hardhat Node
const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545"); 
// The specific function we want to ask the blockchain about
const MINIMAL_ABI = ["function isManager(address) view returns (bool)"];
const contract = new ethers.Contract(CONTRACT_ADDRESS, MINIMAL_ABI, provider);

export async function POST(req: Request) {
  try {
    const { managerAddress, signature } = await req.json();

    // 1. TRUE WEB3 AUTHENTICATION: Ask the Smart Contract!
    const isAuthorizedManager = await contract.isManager(managerAddress);
    
    if (!isAuthorizedManager) {
      return NextResponse.json({ error: "Blockchain rejected: Wallet is not an on-chain manager." }, { status: 403 });
    }

    // 2. Cryptographically verify the manager actually signed the request
    const expectedMessage = "I authorize the generation of the official Merkle Tree for verified members.";
    const recoveredAddress = ethers.verifyMessage(expectedMessage, signature);

    if (recoveredAddress.toLowerCase() !== managerAddress.toLowerCase()) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
    }

    // 3. Fetch ONLY fully verified members from Firestore
    const snapshot = await db.collection("organizations")
                             .doc("org_1")
                             .collection("members")
                             .where("status", "==", "verified")
                             .get();

    if (snapshot.empty) {
      return NextResponse.json({ error: "No verified members found to add to the tree." }, { status: 400 });
    }

    // 4. Initialize the Semaphore Group (Merkle Tree)
    const group = new Group();

    // 5. Sweep all verified identity commitments into the tree
    const commitmentsAdded: string[] = [];
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.identityCommitment) {
        group.addMember(data.identityCommitment);
        commitmentsAdded.push(data.email);
      }
    });

    // 6. Output the Master Merkle Root
    const merkleRoot = group.root.toString();

    // Save the official root state back to Firebase for the frontend to easily read
    await db.collection("organizations").doc("org_1").set({
      currentMerkleRoot: merkleRoot,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      totalMembersInTree: commitmentsAdded.length
    }, { merge: true });

    return NextResponse.json({ 
      success: true, 
      merkleRoot,
      totalMembers: commitmentsAdded.length,
      message: "Tree successfully generated via Smart Contract authorization." 
    });

  } catch (error) {
    console.error("Tree generation error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}