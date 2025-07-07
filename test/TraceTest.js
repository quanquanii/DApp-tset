const { expect } = require("chai");
const { ethers } = require("hardhat");
const { parseEther } = require("ethers");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Transaction Tracing", function () {
  let lock;
  let deployer;

  beforeEach(async function () {
    const ONE_YEAR = 365 * 24 * 60 * 60;
    const unlockTime = (await time.latest()) + ONE_YEAR;
    const lockedAmount = parseEther("1");

    [deployer] = await ethers.getSigners();
    const Lock = await ethers.getContractFactory("Lock");
    lock = await Lock.deploy(unlockTime, { value: lockedAmount });

    await time.increaseTo(unlockTime);
  });

  it("Should trace transaction execution", async function () {
    // 发起交易
    const tx = await lock.withdraw();
    const receipt = await tx.wait();

    console.log("\n=== 调试信息 ===");
    console.log(`Tx Hash: ${receipt.hash}`);
    console.log(`Gas Used: ${receipt.gasUsed}`);

    // 调用 Hardhat 内置 trace API
    const trace = await ethers.provider.send("debug_traceTransaction", [receipt.hash]);

    console.log("\n=== 执行轨迹（structLogs） ===");
    console.dir(trace.structLogs.slice(0, 10), { depth: 2 }); // 只显示前 10 步
  });
});
