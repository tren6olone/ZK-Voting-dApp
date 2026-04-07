const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("ZKVotingModule", (m) => {
  // 1. Grab the default deployer account from the local Hardhat node
  const deployerAddress = m.getAccount(0);

  // 2. Pass an array of addresses as the second argument to the constructor
  // Notice the double brackets [[ ]]: The outer bracket is for Ignition's argument list, 
  // the inner bracket is because the Solidity constructor expects an array (address[])
  const zkVoting = m.contract("ZKVoting", [[deployerAddress]]);

  // Return the deployed contract instance
  return { zkVoting };
});