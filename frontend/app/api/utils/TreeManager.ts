import { Group } from "@semaphore-protocol/group";
import * as admin from "firebase-admin";

// 1. Initialize the Semaphore Group
// In Semaphore v4, this automatically creates a Merkle tree with a default depth of 20 
// (capable of holding over 1 million members).
const group = new Group();
const db = admin.firestore();

/**
 * Reconstructs the tree in memory if the Node.js server restarts.
 * (Run this once when your server boots up).
 */
export async function initializeTreeFromDatabase() {
    const snapshot = await db.collection("whitelist").orderBy("treeIndex", "asc").get();
    
    // Add all existing commitments back into the tree in the exact same order
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.identityCommitment && data.isActive) {
            group.addMember(data.identityCommitment);
        } else if (data.identityCommitment && !data.isActive) {
            // If they were fired, we add a '0' to maintain the correct index spacing
            group.addMember("0"); 
        }
    });
    console.log("Tree reconstructed. Current Root:", group.root);
}

/**
 * Adds a newly verified user to the tree.
 */
export async function addMemberToTree(email: string, identityCommitment: string) {
    // 2. Add the commitment to the off-chain Semaphore group
    group.addMember(identityCommitment);

    // 3. The group length minus 1 gives us their exact leaf index
    const treeIndex = group.members.length - 1;

    // 4. Save the index in Firebase so we can find them later if they need to be removed
    await db.collection("whitelist").doc(email).set({
        identityCommitment,
        treeIndex,
        isActive: true
    }, { merge: true });

    // 5. Output the new Merkle Root 
    // This is the value an admin will submit to the smart contract!
    return group.root.toString(); 
}

/**
 * Removes a user, permanently destroying their ability to generate ZK proofs.
 */
export async function removeMemberFromTree(email: string) {
    // 1. Fetch the user's saved tree index from Firebase
    const userDoc = await db.collection("whitelist").doc(email).get();
    const userData = userDoc.data();

    if (!userData || !userData.isActive) {
        throw new Error("User not found or already removed.");
    }

    // 2. Revoke their status in Firebase (Web2 Lock)
    await db.collection("whitelist").doc(email).update({ isActive: false });

    // 3. The Cryptographic Revocation (Web3 Lock)
    // Semaphore's removeMember function automatically finds this exact index 
    // and overwrites the commitment with a '0', nullifying it.
    group.removeMember(userData.treeIndex);

    // 4. Output the newly calculated Merkle root
    return group.root.toString();
}