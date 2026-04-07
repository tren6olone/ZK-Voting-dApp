require("@nomicfoundation/hardhat-toolbox");
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.24",
  networks: {
      sepolia: {
        url: process.env.SEPOLIA_RPC_URL, // Your Alchemy URL
        accounts: [process.env.ORACLE_PRIVATE_KEY] // deployer
      }
    },
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY
    },
  settings: {
      evmVersion: "cancun", // <-- THIS IS THE MAGIC FIX
    },
};

