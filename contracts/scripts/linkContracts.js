const { ethers } = require("hardhat");

async function main() {
  // 1. PASTE YOUR TWO ADDRESSES HERE
  const PROPOSAL_REGISTRY_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
  const ANONYMOUS_VOTER_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
  
  // 2. Connect to the deployed Proposal Registry
  const registry = await ethers.getContractAt("ProposalRegistry", PROPOSAL_REGISTRY_ADDRESS);
  
  console.log("Initiating security handshake...");
  
  // 3. Set the voting contract!
  const tx = await registry.setVotingContract(ANONYMOUS_VOTER_ADDRESS);
  await tx.wait(); // Wait for the blockchain to mine it
  
  console.log("✅ SUCCESS! The vault is locked.");
  console.log(`Only ${ANONYMOUS_VOTER_ADDRESS} can update votes now.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});