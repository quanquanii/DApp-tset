const { expect } = require("chai");
const { ethers } = require("hardhat");
const { parseEther } = require("ethers");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("State Management with Snapshot", function () {
  let lock, lockedAmount, snapshotId;

  before(async function () {
    const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
    lockedAmount = parseEther("1");
    const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;

    const Lock = await ethers.getContractFactory("Lock");
    lock = await Lock.deploy(unlockTime, { value: lockedAmount });
  });

  beforeEach(async function () {
    // 在每个测试前拍下快照
    snapshotId = await ethers.provider.send("evm_snapshot");
  });

  afterEach(async function () {
    // 测试后回滚到拍下的状态
    await ethers.provider.send("evm_revert", [snapshotId]);
  });

  it("Test 1 - withdraw should change balance", async function () {
    const unlockTime = await lock.unlockTime();
    await time.increaseTo(unlockTime);
    await lock.withdraw();

    const balance = await ethers.provider.getBalance(lock.target);
    expect(balance).to.equal(0);
  });

  it("Test 2 - clean state restored", async function () {
    // 不需要再次调用 withdraw，状态应为初始状态
    const balance = await ethers.provider.getBalance(lock.target);
    expect(balance).to.equal(lockedAmount);
  });
});
