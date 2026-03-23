const { network } = require("hardhat");

async function main() {
  console.log("Fast-forwarding blockchain time by 3 days and 1 hour...");
  
  // 3 days + 1 hour in seconds
  const timeToAdvance = (3 * 24 * 60 * 60) + 3600; 
  
  await network.provider.send("evm_increaseTime", [timeToAdvance]);
  await network.provider.send("evm_mine"); // Mine a new block to solidify the time
  
  console.log("🕰️ Time travel complete! The voting period is now closed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});