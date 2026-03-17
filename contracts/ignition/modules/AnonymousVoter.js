const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("AnonymousVoterModule", (m) => {
  // 1. Deploy the official Semaphore Verifier to your local network first
  const semaphoreVerifier = m.contract("SemaphoreVerifier");

  // 2. PASTE YOUR EXISTING CONTRACT ADDRESSES HERE
  const ZK_VOTING_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // The Merkle Tree contract
  const PROPOSAL_REGISTRY_ADDRESS = "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e"; // The one from the previous step
  
  // 3. Deploy AnonymousVoter with the three required addresses
  const anonymousVoter = m.contract("AnonymousVoter", [
    semaphoreVerifier, 
    ZK_VOTING_ADDRESS,
    PROPOSAL_REGISTRY_ADDRESS
  ]);

  return { semaphoreVerifier, anonymousVoter };
});