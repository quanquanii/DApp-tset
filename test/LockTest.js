const { expect } = require("chai");
const { ethers } = require("hardhat"); // ethers v6 接入
const { parseEther } = require("ethers"); // 直接从 ethers 包导入 parseEther
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("Event Testing", function () {
  it("Should emit Withdrawal event", async function () {
    const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
    const lockedAmount = parseEther("1"); // 使用从 v6 ethers 包中导入的 parseEther
    const unlockTime = (await time.latest()) + ONE_YEAR_IN_SECS;

    const [owner] = await ethers.getSigners();
    const Lock = await ethers.getContractFactory("Lock");
    const lock = await Lock.deploy(unlockTime, { value: lockedAmount });

    await time.increaseTo(unlockTime);

    await expect(lock.withdraw())
      .to.emit(lock, "Withdrawal")
      .withArgs(lockedAmount, anyValue);
  });
});
