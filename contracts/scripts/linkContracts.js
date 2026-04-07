const { ethers } = require("hardhat");

async function main() {
  // 1. PASTE YOUR BRAND NEW ADDRESSES HERE (If you just redeployed)
  const PROPOSAL_REGISTRY_ADDRESS = "0x890c4696889172E6A8895390489F0b7f6cA51128"; // Update if needed
  const ANONYMOUS_VOTER_ADDRESS = "0x6ABA8442972cCDbc4FF6e59cA2fC482f8e520974"; // Update if needed
  
  // 2. Setup the Oracle Wallet (Hardhat Account #1)
  const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY;
  const provider = ethers.provider;
  const oracleWallet = new ethers.Wallet(ORACLE_PRIVATE_KEY, provider);
  
  // 3. Connect to the Registry USING THE ORACLE WALLET
  const registry = await ethers.getContractAt("ProposalRegistry", PROPOSAL_REGISTRY_ADDRESS, oracleWallet);
  
  console.log(`Initiating security handshake as Oracle (${oracleWallet.address})...`);
  
  // 4. Set the voting contract!
  const tx = await registry.setVotingContract(ANONYMOUS_VOTER_ADDRESS);
  await tx.wait(); // Wait for the blockchain to mine it
  
  console.log(" SUCCESS! The vault is locked.");
  console.log(`Only ${ANONYMOUS_VOTER_ADDRESS} can update votes now.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});