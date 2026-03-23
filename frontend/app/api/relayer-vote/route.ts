import { NextResponse } from "next/server";
import { ethers } from "ethers";

export async function POST(req: Request) {
  try {
    // 1. Extract the NEW payload (Notice 'encryptedVote' instead of 'support')
    const { proposalId, nullifierHash, encryptedVote, proof, merkleTreeDepth } = await req.json();
    
    // 2. Setup the Relayer
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    const relayerPrivateKey = process.env.ORACLE_PRIVATE_KEY; 
    const relayerWallet = new ethers.Wallet(relayerPrivateKey!, provider);
    
    // 3. Connect to AnonymousVoter using the NEW ABI
    const ANONYMOUS_VOTER_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
    const VOTE_ABI = [
      "function castVote(uint256 proposalId, uint256 nullifierHash, bytes calldata encryptedVote, uint256[8] calldata proof, uint256 merkleTreeDepth) external"
    ];
    
    const votingContract = new ethers.Contract(ANONYMOUS_VOTER_ADDRESS, VOTE_ABI, relayerWallet);

    console.log(`Relayer ${relayerWallet.address} is sponsoring encrypted vote for Proposal #${proposalId}`);

    // 4. Submit the transaction (Order must perfectly match the ABI above!)
    const tx = await votingContract.castVote(
      proposalId,
      nullifierHash,
      encryptedVote,
      proof,
      merkleTreeDepth,
      { gasLimit: 2000000 } // Bumped gas limit slightly for the encryption parsing
    );

    const receipt = await tx.wait();

    return NextResponse.json({ 
      success: true, 
      txHash: receipt.hash,
      message: "Encrypted vote cast anonymously via Relayer!" 
    });

  } catch (error: unknown) {
    console.error("Relayer failed:", error);
    
    // FIX: Actually return the error to the frontend so it doesn't hang!
    let message = "Internal server error";
    if (error instanceof Error) {
      message = error.message;
    }
    
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}