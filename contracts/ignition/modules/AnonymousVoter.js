const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("AnonymousVoterModule", (m) => {
  // 1. Deploy the official Semaphore Verifier to your local network first
  const semaphoreVerifier = m.contract("SemaphoreVerifier");

  // 2. PASTE YOUR EXISTING CONTRACT ADDRESSES HERE
  const ZK_VOTING_ADDRESS = "0xa5713A2a775bbA91C942487C686C5546a459F3e4"; // The Merkle Tree contract
  const PROPOSAL_REGISTRY_ADDRESS = "0x890c4696889172E6A8895390489F0b7f6cA51128"; // The one from the previous step
  
  // 3. Deploy AnonymousVoter with the three required addresses
  const anonymousVoter = m.contract("AnonymousVoter", [
    semaphoreVerifier, 
    ZK_VOTING_ADDRESS,
    PROPOSAL_REGISTRY_ADDRESS
  ]);

  return { semaphoreVerifier, anonymousVoter };
});