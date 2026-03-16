const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("ZKVotingModule", (m) => {
  // Tell Ignition to deploy the "ZKVoting" contract
  const zkVoting = m.contract("ZKVoting");

  // Return the deployed contract instance
  return { zkVoting };
});