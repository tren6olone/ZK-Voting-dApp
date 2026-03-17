const { ethers } = require("hardhat");

async function main() {
  // 1. PASTE YOUR TWO ADDRESSES HERE
  const PROPOSAL_REGISTRY_ADDRESS = "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e";
  const ANONYMOUS_VOTER_ADDRESS = "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82";
  
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