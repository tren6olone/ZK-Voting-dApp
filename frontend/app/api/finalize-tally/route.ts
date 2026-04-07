import { NextResponse } from "next/server";
import { ethers } from "ethers";
import EthCrypto from "eth-crypto";
import * as admin from "firebase-admin";

// --- FIREBASE INIT ---
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // The replace regex is required for Vercel/Replit environment variables
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export async function POST(req: Request) {
  try {
    const { proposalId , totalMembers } = await req.json();

    // 1. Setup the Oracle Wallet
    const rpcUrl = process.env.SEPOLIA_RPC_URL || "http://127.0.0.1:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    const oraclePrivateKey = process.env.ORACLE_PRIVATE_KEY;
    if (!oraclePrivateKey) throw new Error("CRITICAL: Oracle Private Key missing from environment.");
    
    const oracleWallet = new ethers.Wallet(oraclePrivateKey, provider);

    // 2. Connect to the ProposalRegistry
    const REGISTRY_ADDRESS = "0x890c4696889172E6A8895390489F0b7f6cA51128";
    
    const REGISTRY_ABI = [
      "event EncryptedVoteRecorded(uint256 indexed id, bytes encryptedVote)",
      "function finalizeTally(uint256 proposalId, uint256 _yesVotes, uint256 _noVotes, uint256 _abstainVotes, uint256 _totalEligibleVoters, bytes32 _finalBallotsHash) external",
      "function proposals(uint256) view returns (uint256 id, address creator, bytes32 contentHash, uint256 yesVotes, uint256 noVotes, uint256 abstainVotes, uint256 endTime, bool isTallied, bytes32 ballotsHash)"
    ];
    const registryContract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, oracleWallet);

    console.log(`Starting Tally for Proposal #${proposalId}...`);

    // =========================================================================
    // 3. THE MISSING SHIELD: Check if it's already tallied BEFORE doing the math!
    // =========================================================================
    const proposalDataOnChain = await registryContract.proposals(proposalId);
    if (proposalDataOnChain.isTallied) {
      console.log(`Proposal #${proposalId} was already finalized. Returning existing results.`);
      return NextResponse.json({ 
        success: true, 
        alreadyTallied: true,
        results: { 
          yesVotes: Number(proposalDataOnChain.yesVotes), 
          noVotes: Number(proposalDataOnChain.noVotes), 
          abstainVotes: Number(proposalDataOnChain.abstainVotes) 
        }
      });
    }

    // 4. Fetch all Encrypted Votes
    const filter = registryContract.filters.EncryptedVoteRecorded(proposalId);
    const logs = await registryContract.queryFilter(filter);
    
    let yesVotes = 0;
    let noVotes = 0;
    let abstainVotes = 0;
    let computedBallotsHash = ethers.ZeroHash;

    // 5. Decrypt and Tally
    const eventLogs = logs as ethers.EventLog[];

    for (const log of eventLogs) {
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

    // 6. Get Total DAO Members (from Frontend)
    const totalEligibleVoters = totalMembers > 0 ? totalMembers : 1;

    // 7. Submit the Final Tally to the Smart Contract
    const tx = await registryContract.finalizeTally(
        proposalId,
        yesVotes,
        noVotes,
        abstainVotes,
        totalEligibleVoters,
        computedBallotsHash
      );

    const receipt = await tx.wait();

    // 8. Update Firebase
    const contentHash = proposalDataOnChain.contentHash;

    await admin.firestore().collection("proposals").doc(contentHash).set({
      status: "tallied",
      yesVotes,
      noVotes,
      abstainVotes,
      totalEligibleVoters,
      quorumMet: ((yesVotes + noVotes + abstainVotes) * 100 / totalEligibleVoters) >= 70
    }, { merge: true });
    
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