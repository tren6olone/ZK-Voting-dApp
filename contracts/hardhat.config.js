require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.24",
  settings: {
      evmVersion: "cancun", // <-- THIS IS THE MAGIC FIX
    },
};
