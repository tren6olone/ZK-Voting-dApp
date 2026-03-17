const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("ProposalRegistryModule", (m) => {
  // The PUBLIC address of your Account #1 (The Next.js Server / Oracle)
  // Double-check your terminal to make sure this matches Account #1!
  const ORACLE_PUBLIC_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  // Deploy the contract and inject the Oracle address into the constructor
  const proposalRegistry = m.contract("ProposalRegistry", [ORACLE_PUBLIC_ADDRESS]);

  return { proposalRegistry };
});