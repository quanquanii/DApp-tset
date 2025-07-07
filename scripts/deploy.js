const hre = require("hardhat");

async function main() {
  const ONE_YEAR = 365 * 24 * 60 * 60;
  const unlockTime = Math.floor(Date.now() / 1000) + ONE_YEAR;
  const lockedAmount = hre.ethers.parseEther("1");

  const Lock = await hre.ethers.getContractFactory("Lock");
  const lock = await Lock.deploy(unlockTime, { value: lockedAmount });

  await lock.waitForDeployment();
  console.log(`✅ Lock deployed to: ${lock.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
// const { ethers } = require("hardhat");

// async function main() {
//   const ONE_MINUTE_IN_SECS = 60;
//   const lockedAmount = ethers.parseEther("1");

//   const latestBlock = await ethers.provider.getBlock("latest");
//   const unlockTime = latestBlock.timestamp + ONE_MINUTE_IN_SECS;

//   const Lock = await ethers.getContractFactory("Lock");
//   const lock = await Lock.deploy(unlockTime, { value: lockedAmount });
//   await lock.waitForDeployment();

//   console.log(`✅ Lock deployed to: ${lock.target}`);
//   console.log(`🔒 Unlock time: ${unlockTime}`);

//   // ⏩ 快进时间以满足 unlockTime 条件
//   await ethers.provider.send("evm_increaseTime", [ONE_MINUTE_IN_SECS + 10]);
//   await ethers.provider.send("evm_mine");

//   // ✅ 调用 withdraw
//   const tx = await lock.withdraw();
//   const receipt = await tx.wait();

//   console.log("✅ Withdraw executed.");
//   console.log("📄 Transaction hash:", receipt.hash);
// }

// main().catch((error) => {
//   console.error(error);
//   process.exitCode = 1;
// });
