const { ethers } = require("hardhat");

async function main() {
  // 1. PASTE YOUR BRAND NEW ADDRESSES HERE (If you just redeployed)
  const PROPOSAL_REGISTRY_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"; // Update if needed
  const ANONYMOUS_VOTER_ADDRESS = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"; // Update if needed
  
  // 2. Setup the Oracle Wallet (Hardhat Account #1)
  const ORACLE_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
  const provider = ethers.provider;
  const oracleWallet = new ethers.Wallet(ORACLE_PRIVATE_KEY, provider);

  // 3. Connect to the Registry USING THE ORACLE WALLET
  const registry = await ethers.getContractAt("ProposalRegistry", PROPOSAL_REGISTRY_ADDRESS, oracleWallet);
  
  console.log(`Initiating security handshake as Oracle (${oracleWallet.address})...`);
  
  // 4. Set the voting contract!
  const tx = await registry.setVotingContract(ANONYMOUS_VOTER_ADDRESS);
  await tx.wait(); // Wait for the blockchain to mine it
  
  console.log("✅ SUCCESS! The vault is locked.");
  console.log(`Only ${ANONYMOUS_VOTER_ADDRESS} can update votes now.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});