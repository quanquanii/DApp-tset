const { expect } = require("chai");
const { ethers } = require("hardhat");
const { parseEther } = require("ethers");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Error Handling", function () {
  let lock;
  let owner, otherAccount;
  const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
  const lockedAmount = parseEther("1");

  beforeEach(async function () {
    const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;
    [owner, otherAccount] = await ethers.getSigners();
    const Lock = await ethers.getContractFactory("Lock");
    lock = await Lock.deploy(unlockTime, { value: lockedAmount });
  });

  it("Should revert when unlock time not reached", async function () {
    await expect(lock.withdraw()).to.be.revertedWith("You can't withdraw yet");
  });

  it("Should revert when called by non-owner", async function () {
    // 先把时间推进到 unlockTime，确保不因时间失败
    const unlockTime = await lock.unlockTime();
    await time.increaseTo(unlockTime);

    // 非 owner 调用，应该被拒绝
    await expect(lock.connect(otherAccount).withdraw())
      .to.be.revertedWith("You aren't the owner");
  });
});
