import { NextResponse } from "next/server";
import { ethers } from "ethers";

export async function POST(req: Request) {
  try {
    const { proposalId, nullifierHash, encryptedVote, proof, merkleTreeDepth } = await req.json();
    
    // --- 1. THE MISSING PARSER ---
    // First, parse the JSON string
    let parsedProof = typeof proof === "string" ? JSON.parse(proof) : proof;

    // Second, flatten it into the exact 8-item array Solidity expects
    if (!Array.isArray(parsedProof) && parsedProof.pi_a) {
      // Handle standard SnarkJS object format
      parsedProof = [
        parsedProof.pi_a[0], parsedProof.pi_a[1],
        parsedProof.pi_b[0][1], parsedProof.pi_b[0][0], // pi_b reversed for Solidity!
        parsedProof.pi_b[1][1], parsedProof.pi_b[1][0],
        parsedProof.pi_c[0], parsedProof.pi_c[1]
      ];
    } else if (Array.isArray(parsedProof)) {
      // Handle nested arrays by flattening them
      parsedProof = parsedProof.flat(Infinity);
    }

    // Third, verify it's exactly 8 items before calling the contract
    if (!Array.isArray(parsedProof) || parsedProof.length !== 8) {
      console.error("Malformed Proof Data:", parsedProof);
      return NextResponse.json({ success: false, error: "Relayer parsed an invalid proof length." }, { status: 400 });
    }
    // ----------------------------

    // 2. Setup the Relayer
    const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/N8mYXhL1a38jGYohZ8_oH");
    const relayerPrivateKey = process.env.ORACLE_PRIVATE_KEY; 
    const relayerWallet = new ethers.Wallet(relayerPrivateKey!, provider);
    
    // 3. Connect to AnonymousVoter
    const ANONYMOUS_VOTER_ADDRESS = "0x6ABA8442972cCDbc4FF6e59cA2fC482f8e520974";
    const VOTE_ABI = [
      "function castVote(uint256 proposalId, uint256 nullifierHash, bytes calldata encryptedVote, uint256[8] calldata proof, uint256 merkleTreeDepth) external"
    ];
    
    const votingContract = new ethers.Contract(ANONYMOUS_VOTER_ADDRESS, VOTE_ABI, relayerWallet);

    console.log(`Relayer ${relayerWallet.address} is sponsoring encrypted vote for Proposal #${proposalId}`);

    // 4. Submit the transaction
    const tx = await votingContract.castVote(
      proposalId,
      nullifierHash,
      encryptedVote,
      parsedProof, // <--- NOW PASSING THE PARSED ARRAY
      merkleTreeDepth,
      { gasLimit: 2000000 }
    );

    const receipt = await tx.wait();

    return NextResponse.json({ 
      success: true, 
      txHash: receipt.hash,
      message: "Encrypted vote cast anonymously via Relayer!" 
    });

  } catch (error: unknown) {
    console.error("Relayer failed:", error);
    
    let message = "Internal server error";
    if (error instanceof Error) {
      message = error.message;
    }
    
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}