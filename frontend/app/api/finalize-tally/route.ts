import { NextResponse } from "next/server";
import { ethers } from "ethers";
import EthCrypto from "eth-crypto";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'), //bro remove this afterwards
    }),
  });
}

export async function POST(req: Request) {
  try {
    const { proposalId } = await req.json();

    // 1. Setup the Oracle Wallet
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    const oraclePrivateKey = process.env.ORACLE_PRIVATE_KEY!;
    const oracleWallet = new ethers.Wallet(oraclePrivateKey, provider);

    // 2. Connect to the ProposalRegistry
    const REGISTRY_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    
    // FIX: Added the 'proposals' read function so we can grab the contentHash!
    const REGISTRY_ABI = [
      "event EncryptedVoteRecorded(uint256 indexed id, bytes encryptedVote)",
      "function finalizeTally(uint256 proposalId, uint256 _yesVotes, uint256 _noVotes, uint256 _abstainVotes, uint256 _totalEligibleVoters, bytes32 _finalBallotsHash) external",
      "function proposals(uint256) view returns (uint256 id, address creator, bytes32 contentHash, uint256 yesVotes, uint256 noVotes, uint256 abstainVotes, uint256 endTime, bool isTallied, bytes32 ballotsHash)"
    ];
    const registryContract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, oracleWallet);

    console.log(`Starting Tally for Proposal #${proposalId}...`);

    // 3. Fetch all Encrypted Votes
    const filter = registryContract.filters.EncryptedVoteRecorded(proposalId);
    const logs = await registryContract.queryFilter(filter);
    
    let yesVotes = 0;
    let noVotes = 0;
    let abstainVotes = 0;
    let computedBallotsHash = ethers.ZeroHash;

    // 4. Decrypt and Tally
    for (const log of logs) {
      // @ts-expect-error - ethers v6 log parsing
      const encryptedVoteHex = log.args[1]; 
      
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const encodedData = abiCoder.encode(
        ["bytes32", "bytes", "uint256"],
        [computedBallotsHash, encryptedVoteHex, proposalId]
      );
      computedBallotsHash = ethers.keccak256(encodedData);

      try {
        const encryptedObject = EthCrypto.cipher.parse(encryptedVoteHex.substring(2));
        const decryptedPayload = await EthCrypto.decryptWithPrivateKey(oraclePrivateKey, encryptedObject);

        if (decryptedPayload === "YES") yesVotes++;
        else if (decryptedPayload === "NO") noVotes++;
        else if (decryptedPayload === "ABSTAIN") abstainVotes++;

      } catch (decryptError) {
        console.error("Failed to decrypt a vote. It may be corrupted or tampered with:", decryptError);
      }
    }

    console.log(`Tally Complete: ${yesVotes} Yes, ${noVotes} No, ${abstainVotes} Abstain.`);

    // 5. Get Total DAO Members
    const db = admin.firestore();
    const membersSnapshot = await db.collection("organizations").doc("org_1").collection("members").where("status", "==", "verified").get();
    
    // Fallback to 1 to prevent division by zero errors if Firebase is empty
    const totalEligibleVoters = membersSnapshot.size > 0 ? membersSnapshot.size : 1; 

    // 6. Submit the Final Tally to the Smart Contract
    const tx = await registryContract.finalizeTally(
      proposalId,
      yesVotes,
      noVotes,
      abstainVotes,
      totalEligibleVoters,
      computedBallotsHash
    );

    const receipt = await tx.wait();

    // 7. FIX: Ask the blockchain for the contentHash, then update Firebase!
    const proposalData = await registryContract.proposals(proposalId);
    const contentHash = proposalData.contentHash;

    await db.collection("proposals").doc(contentHash).update({
      status: "tallied",
      yesVotes,
      noVotes,
      abstainVotes,
      quorumMet: ((yesVotes + noVotes + abstainVotes) * 100 / totalEligibleVoters) >= 70
    });

    return NextResponse.json({ 
      success: true, 
      txHash: receipt.hash,
      results: { yesVotes, noVotes, abstainVotes, totalEligibleVoters }
    });

  } catch (error: unknown) {
    console.error("Tally API Error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}