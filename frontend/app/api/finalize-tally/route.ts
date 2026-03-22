import { NextResponse } from "next/server";
import { ethers } from "ethers";
import EthCrypto from "eth-crypto";
import * as admin from "firebase-admin"; // To get total eligible voters

// ... Firebase initialization here ...

export async function POST(req: Request) {
  try {
    const { proposalId } = await req.json();

    // 1. Setup the Oracle Wallet (Must match the oracleSigner in your contract)
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    const oraclePrivateKey = process.env.ORACLE_PRIVATE_KEY!;
    const oracleWallet = new ethers.Wallet(oraclePrivateKey, provider);

    // 2. Connect to the ProposalRegistry
    const REGISTRY_ADDRESS = "0xYourProposalRegistryAddress";
    const REGISTRY_ABI = [
      "event EncryptedVoteRecorded(uint256 indexed id, bytes encryptedVote)",
      "function finalizeTally(uint256 proposalId, uint256 _yesVotes, uint256 _noVotes, uint256 _abstainVotes, uint256 _totalEligibleVoters, bytes32 _finalBallotsHash) external"
    ];
    const registryContract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, oracleWallet);

    console.log(`Starting Tally for Proposal #${proposalId}...`);

    // 3. Fetch all Encrypted Votes directly from the Blockchain Logs
    const filter = registryContract.filters.EncryptedVoteRecorded(proposalId);
    const logs = await registryContract.queryFilter(filter);
    
    let yesVotes = 0;
    let noVotes = 0;
    let abstainVotes = 0;
    
    // We must perfectly recreate the rolling hash to prove integrity
    let computedBallotsHash = ethers.ZeroHash; // Starts as bytes32(0)

    // 4. Decrypt and Tally
    for (const log of logs) {
      // @ts-expect-error - ethers v6 log parsing
      const encryptedVoteHex = log.args[1]; 
      
      // A. Update the rolling hash EXACTLY as Solidity does:
      // keccak256(abi.encode(ballotsHash, encryptedVote, proposalId))
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const encodedData = abiCoder.encode(
        ["bytes32", "bytes", "uint256"],
        [computedBallotsHash, encryptedVoteHex, proposalId]
      );
      computedBallotsHash = ethers.keccak256(encodedData);

      // B. Decrypt the payload
      try {
        // Convert hex back to the encrypted object eth-crypto expects
        const encryptedObject = EthCrypto.cipher.parse(encryptedVoteHex.substring(2));
        
        // Decrypt using the Oracle's Private Key
        const decryptedPayload = await EthCrypto.decryptWithPrivateKey(
          oraclePrivateKey,
          encryptedObject
        );

        // Parse the vote (Assuming frontend sent "YES", "NO", or "ABSTAIN")
        if (decryptedPayload === "YES") yesVotes++;
        else if (decryptedPayload === "NO") noVotes++;
        else if (decryptedPayload === "ABSTAIN") abstainVotes++;

      } catch (decryptError) {
        console.error("Failed to decrypt a vote. It may be corrupted or tampered with:", decryptError);
        // We still counted it in the hash to maintain integrity, but we can't tally it.
      }
    }

    console.log(`Tally Complete: ${yesVotes} Yes, ${noVotes} No, ${abstainVotes} Abstain.`);
    console.log(`Calculated Integrity Hash: ${computedBallotsHash}`);

    // 5. Get Total DAO Members for Quorum Calculation (from Firebase)
    const db = admin.firestore();
    const membersSnapshot = await db.collection("organizations").doc("org_1").collection("members").where("status", "==", "approved").get();
    const totalEligibleVoters = membersSnapshot.size;

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

    // 7. (Optional) Update your Firebase database to show the proposal is officially closed
    await db.collection("proposals").doc(proposalId.toString()).update({
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

  const message =
    error instanceof Error ? error.message : "Internal server error";

  return NextResponse.json({ error: message }, { status: 500 });
}
}