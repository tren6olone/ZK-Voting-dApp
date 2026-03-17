import { NextResponse } from "next/server";
import { ethers } from "ethers";

export async function POST(req: Request) {
  try {
    // We ONLY take the proof data. NO emails, NO names, NO user wallets.
    const { support, proposalId, nullifierHash, proof, merkleTreeDepth } = await req.json();

    // 1. Setup the Relayer (Account #1 from Hardhat)
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    
    // Use your Hardhat Private Key (stored in .env.local)
    const relayerPrivateKey = process.env.ORACLE_PRIVATE_KEY; 
    const relayerWallet = new ethers.Wallet(relayerPrivateKey!, provider);

    // 2. Connect to the AnonymousVoter Contract
    const ANONYMOUS_VOTER_ADDRESS = "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82";
    const VOTE_ABI = [
      "function castVote(bool support, uint256 proposalId, uint256 nullifierHash, uint256[8] calldata proof, uint256 merkleTreeDepth) external"
    ];
    
    const votingContract = new ethers.Contract(ANONYMOUS_VOTER_ADDRESS, VOTE_ABI, relayerWallet);

    console.log(`Relayer ${relayerWallet.address} is sponsoring vote for Proposal #${proposalId}`);

    // 3. Submit the proof and pay the gas
    const tx = await votingContract.castVote(
      support,
      proposalId,
      nullifierHash,
      proof,
      merkleTreeDepth,
      { gasLimit: 1000000 } // Ensure enough gas for ZK verification
    );

    const receipt = await tx.wait();

    return NextResponse.json({ 
      success: true, 
      txHash: receipt.hash,
      message: "Vote cast anonymously via Relayer!" 
    });

  } catch (error: unknown) {
  console.error("Relayer failed:", error);

  let message = "Internal server error";

  if (error instanceof Error) {
    message = error.message;
  }
}
}