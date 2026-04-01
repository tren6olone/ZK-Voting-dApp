import { NextResponse } from "next/server";
import { verifyTypedData } from "ethers";

export async function POST(req: Request) {
  try {
    const { address, timestamp, signature, chainId } = await req.json();
    
    // IMPORTANT: Make sure this exactly matches the address in your frontend file!
    const PROPOSAL_CONTRACT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    
    // Reconstruct the exact structural domains
    const domain = { 
      name: "ZKVoting", 
      version: "1", 
      chainId: chainId, 
      verifyingContract: PROPOSAL_CONTRACT_ADDRESS 
    };
    
    const types = { 
      WorkspaceLogin: [ 
        { name: "action", type: "string" }, 
        { name: "timestamp", type: "uint256" } 
      ] 
    };
    
    const value = { action: "Authenticate", timestamp: timestamp };

    // mathematically recover the wallet from the structured JSON
    const recoveredAddress = verifyTypedData(domain, types, value, signature);

    if (recoveredAddress.toLowerCase() === address.toLowerCase()) {
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ success: false, error: "Invalid EIP-712 cryptographic signature" }, { status: 401 });
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json({ error: "Server failed to verify signature structure" }, { status: 500 });
  }
}