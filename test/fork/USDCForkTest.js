const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("USDC Mainnet Fork Integration Test", function () {
  let usdc, owner, snapshotId;

  before(async () => {
    [owner] = await ethers.getSigners();
    usdc = await ethers.getContractAt(
      "IERC20",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" // USDC mainnet address
    );
  });

  beforeEach(async () => {
    snapshotId = await network.provider.send("evm_snapshot");
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
  });

  it("should read the USDC balance of a real mainnet address", async () => {
    const balance = await usdc.balanceOf("0x55fe002aeff02f77364de339a1292923a15844b8");
    console.log("USDC Balance:", ethers.formatUnits(balance, 6));
    expect(balance).to.be.gt(0);
  });

  it("should transfer USDC from a mainnet whale to the local test account", async () => {
    const whale = "0x55fe002aeff02f77364de339a1292923a15844b8"; // A mainnet address with large USDC balance
    await network.provider.send("hardhat_impersonateAccount", [whale]);
    const whaleSigner = await ethers.getSigner(whale);
    const amount = ethers.parseUnits("1", 6);

    await usdc.connect(whaleSigner).transfer(owner.address, amount);

    const ownerBal = await usdc.balanceOf(owner.address);
    console.log("Test Account USDC Balance:", ethers.formatUnits(ownerBal, 6));
    expect(ownerBal).to.equal(amount);
  });
});
