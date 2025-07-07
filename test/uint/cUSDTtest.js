const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ERC20 合约功能综合测试", function () {
  let Token, token;
  let owner, addr1, addr2;
  const INITIAL_SUPPLY = ethers.parseUnits("100000000", 18); // 1亿 TTK

  beforeEach(async () => {
    // 部署合约，并获取测试账户 owner, addr1, addr2
    Token = await ethers.getContractFactory("cUSDT");
    [owner, addr1, addr2] = await ethers.getSigners();
    token = await Token.deploy();
    await token.waitForDeployment();
    // 验证 owner 初始余额等于 totalSupply
    expect(await token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
  });

  // 2.1 transfer 功能测试
  describe("2.1 ERC20 Transfer 功能及异常测试", function () {
    it("should transfer 100 tokens to addr1 and emit Transfer", async () => {
      const amount = ethers.parseUnits("100", 18);
      await expect(token.transfer(addr1.address, amount))
        .to.emit(token, "Transfer")
        .withArgs(owner.address, addr1.address, amount);

      const ownerBal = await token.balanceOf(owner.address);
      const addr1Bal = await token.balanceOf(addr1.address);

      const expectedOwnerBalance = INITIAL_SUPPLY - amount;
      expect(ownerBal).to.equal(expectedOwnerBalance);
      expect(addr1Bal).to.equal(amount);
    });

    it("should revert when sending to zero address", async () => {
      const amount = ethers.parseUnits("100", 18);
      await expect(
        token.transfer(ethers.ZeroAddress, amount)
      ).to.be.revertedWithCustomError(token, "ERC20InvalidReceiver");
    });

    it("should revert on insufficient balance", async () => {
      const bigAmount = ethers.parseUnits("2000", 18);
      await expect(
        token.connect(addr1).transfer(addr2.address, bigAmount)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });
  });

  // 2.2 approve和transferFrom 授权转账功能测试
  describe("2.2 ERC20 Approval & transferFrom 授权转账功能测试", function () {
    it("should correctly approve allowance", async () => {
      const allowanceAmount = ethers.parseUnits("500", 18);
      await expect(token.approve(addr1.address, allowanceAmount))
        .to.emit(token, "Approval")
        .withArgs(owner.address, addr1.address, allowanceAmount);

      const allowance = await token.allowance(owner.address, addr1.address);
      expect(allowance).to.equal(allowanceAmount);
    });

    it("should overwrite old allowance with new approval", async () => {
      const firstAllowance = ethers.parseUnits("100", 18);
      const secondAllowance = ethers.parseUnits("300", 18);
      await token.approve(addr1.address, firstAllowance);
      await token.approve(addr1.address, secondAllowance);
      const allowance = await token.allowance(owner.address, addr1.address);
      expect(allowance).to.equal(secondAllowance);
    });

    it("should revert transferFrom if allowance is insufficient", async () => {
      const approveAmount = ethers.parseUnits("100", 18);
      const transferAmount = ethers.parseUnits("200", 18);
      await token.approve(addr1.address, approveAmount);
      await expect(
        token.connect(addr1).transferFrom(owner.address, addr2.address, transferAmount)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    });

    it("should allow transferFrom within approved limit", async () => {
      const approveAmount = ethers.parseUnits("500", 18);
      const transferAmount = ethers.parseUnits("200", 18);
      await token.approve(addr1.address, approveAmount);

      await expect(
        token.connect(addr1).transferFrom(owner.address, addr2.address, transferAmount)
      ).to.emit(token, "Transfer")
        .withArgs(owner.address, addr2.address, transferAmount);

      const expectedOwnerBalance = INITIAL_SUPPLY - transferAmount;
      const ownerBal = await token.balanceOf(owner.address);
      const addr2Bal = await token.balanceOf(addr2.address);
      const remainingAllowance = await token.allowance(owner.address, addr1.address);

      expect(ownerBal).to.equal(expectedOwnerBalance);
      expect(addr2Bal).to.equal(transferAmount);
      expect(remainingAllowance).to.equal(approveAmount - transferAmount);
    });

    it("should revert transferFrom if allowance not set", async () => {
      const transferAmount = ethers.parseUnits("100", 18);
      await expect(
        token.connect(addr1).transferFrom(owner.address, addr2.address, transferAmount)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    });
  });

  // 2.3 余额一致性测试
  describe("2.3 ERC20 Total Supply 余额一致性测试", function () {
    it("should match totalSupply with owner balance at deployment", async () => {
      const totalSupply = await token.totalSupply();
      const ownerBalance = await token.balanceOf(owner.address);
      expect(ownerBalance).to.equal(totalSupply);
    });

    it("should maintain totalSupply after multiple transfers", async () => {
      const amount1 = ethers.parseUnits("1000", 18);
      const amount2 = ethers.parseUnits("2000", 18);
      const amount3 = ethers.parseUnits("500", 18);

      await token.transfer(addr1.address, amount1);
      await token.transfer(addr2.address, amount2);
      await token.connect(addr1).transfer(addr2.address, amount3);

      const balances = await Promise.all([
        token.balanceOf(owner.address),
        token.balanceOf(addr1.address),
        token.balanceOf(addr2.address),
      ]);

      const sum = balances.reduce((acc, b) => acc + b, 0n);
      expect(await token.totalSupply()).to.equal(sum);
    });

    it("should reflect correct totalSupply after mint and burn", async () => {
      const mintAmount = ethers.parseUnits("5000", 18);
      const burnAmount = ethers.parseUnits("2000", 18);

      await token.mint(addr1.address, mintAmount);
      await token.connect(addr1).burn(burnAmount);

      const balances = await Promise.all([
        token.balanceOf(owner.address),
        token.balanceOf(addr1.address),
        token.balanceOf(addr2.address),
      ]);

      const sum = balances.reduce((acc, b) => acc + b, 0n);
      expect(await token.totalSupply()).to.equal(sum);
    });
  });
  // 2.4 权限控制功能测试
  describe("2.4 ERC20 权限控制测试", function () {
    it("should revert mint if called by non-owner", async () => {
      const mintAmount = ethers.parseUnits("1000", 18);
      await expect(
        token.connect(addr1).mint(addr1.address, mintAmount)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

  });

});
