const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("ProposalRegistryModule", (m) => {
  // The PUBLIC address of your Account #1 (The Next.js Server / Oracle)
  // Double-check your terminal to make sure this matches Account #1!
  const ORACLE_PUBLIC_ADDRESS = "0xbBbdB93D3Fe2275e272CcE154e11eE66C07A5a65";
  
  // Deploy the contract and inject the Oracle address into the constructor
  const proposalRegistry = m.contract("ProposalRegistry", [ORACLE_PUBLIC_ADDRESS]);
  
  return { proposalRegistry };
});