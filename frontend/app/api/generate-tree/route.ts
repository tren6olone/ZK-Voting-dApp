import { NextResponse } from "next/server";
import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { Group } from "@semaphore-protocol/group";
import { db } from "../utils/firebaseAdmin";

// --- WEB3 BACKEND CONFIG ---
// The exact address you just deployed to!
const CONTRACT_ADDRESS = "0xa5713A2a775bbA91C942487C686C5546a459F3e4"; 
// Connect to your local Hardhat Node
const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/N8mYXhL1a38jGYohZ8_oH"); 
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
    
    // ... fetching the snapshot ...
    
      if (snapshot.empty) {
        return NextResponse.json({ error: "No verified members found to add to the tree." }, { status: 400 });
      }

      // 3.1 Create a Firebase Batch to update everyone at once
        const batch = db.batch();
    
      // 4. Create arrays to hold the emails and the BigInt commitments
        const commitmentsAdded: string[] = [];
        const commitmentsBigInt: bigint[] = [];
        
        // 5. Sweep the database and assign the true index based on array position
        snapshot.docs.forEach((doc, currentIndex) => {
          const data = doc.data();
          if (data.identityCommitment) {
            commitmentsBigInt.push(BigInt(data.identityCommitment));
            commitmentsAdded.push(data.email);
            
            // Add the correct index update to our Firebase batch
            batch.update(doc.ref, { 
              treeIndex: currentIndex 
            });
          }
        });
      
        // 6. Initialize the Group
        const group = new Group(commitmentsBigInt);
        const merkleRoot = group.root.toString();
      
        // 7. Save the Master Root
        batch.set(db.collection("organizations").doc("org_1"), {
          currentMerkleRoot: merkleRoot,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          totalMembersInTree: commitmentsAdded.length
        }, { merge: true });
      
        // 8. Commit all the index updates and the new root to the database instantly
        await batch.commit();
      
        return NextResponse.json({ 
          success: true, 
          merkleRoot,
          totalMembers: commitmentsAdded.length,
          message: "Tree generated and all member indices updated." 
        });

  } catch (error) {
    console.error("Tree generation error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}