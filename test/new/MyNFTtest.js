const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("MyNFT Safe Unit test（优化版：状态隔离 + 并行兼容）", function () {
  let nft, owner, addr1, addr2, dummy;
  let snapshotId; // 每个用例的快照ID

  before(async () => {
    // 【全局部署】每个测试文件只做一次合约部署
    const NFT   = await ethers.getContractFactory("MyNFT");
    const Dummy = await ethers.getContractFactory("DummyContract");
    [owner, addr1, addr2] = await ethers.getSigners();
    nft   = await NFT.deploy();
    dummy = await Dummy.deploy();
    await nft.waitForDeployment();
  });

  beforeEach(async () => {
    // 【状态隔离】每个用例前拍快照
    snapshotId = await network.provider.send("evm_snapshot");
  });

  afterEach(async () => {
    // 【状态隔离】每个用例后回滚到快照
    await network.provider.send("evm_revert", [snapshotId]);
  });

  // 1. 合约初始化 & ERC165 接口测试
  describe("1. 初始化 & 接口支持", function () {
    it("should return correct name, symbol, owner, and totalSupply", async () => {
      expect(await nft.name()).to.equal("MyNFT");
      expect(await nft.symbol()).to.equal("NFT");
      expect(await nft.owner()).to.equal(owner.address);
      expect(await nft.totalSupply()).to.equal(0);
    });
    it("should support required ERC interfaces", async () => {
      const ids = {
        ERC165:           "0x01ffc9a7",
        ERC721:           "0x80ac58cd",
        ERC721Enumerable: "0x780e9d63",
        ERC721Metadata:   "0x5b5e139f",
        ERC721URIStorage: "0x49064906"
      };
      for (const id of Object.values(ids)) {
        expect(await nft.supportsInterface(id)).to.equal(true);
      }
      expect(await nft.supportsInterface("0x12345678")).to.equal(false);
    });
  });

  // 2. Mint & Burn
  describe("2. Mint & Burn", function () {
    it("should mint NFTs sequentially and correctly update parameters", async () => {
      await nft.safeMint(owner.address, "ipfs://A");
      await nft.safeMint(addr1.address, "ipfs://B");
      expect(await nft.ownerOf(0)).to.equal(owner.address);
      expect(await nft.tokenURI(0)).to.equal("ipfs://A");
      expect(await nft.ownerOf(1)).to.equal(addr1.address);
      expect(await nft.tokenURI(1)).to.equal("ipfs://B");
      expect(await nft.totalSupply()).to.equal(2);
      expect(await nft.balanceOf(owner.address)).to.equal(1);
      expect(await nft.balanceOf(addr1.address)).to.equal(1);
    });

    it("should allow only owner, approved, or operator to burn NFTs and clean up state after", async () => {
      await nft.safeMint(owner.address, "ipfs://A");  // tokenId 0
      // owner burn
      await expect(nft.burn(0))
        .to.emit(nft, "Transfer")
        .withArgs(owner.address, ethers.ZeroAddress, 0);
      await expect(nft.ownerOf(0)).to.be.reverted;

      // mint + approve + burn by approved
      await nft.safeMint(owner.address, "ipfs://B");  // tokenId 1
      await nft.approve(addr1.address, 1);
      await expect(nft.connect(addr1).burn(1))
        .to.emit(nft, "Transfer")
        .withArgs(owner.address, ethers.ZeroAddress, 1);

      // mint + operator burn
      await nft.safeMint(owner.address, "ipfs://C");  // tokenId 2
      await nft.setApprovalForAll(addr2.address, true);
      await expect(nft.connect(addr2).burn(2))
        .to.emit(nft, "Transfer")
        .withArgs(owner.address, ethers.ZeroAddress, 2);

      // 非授权者不能 burn
      await nft.safeMint(owner.address, "ipfs://D");  // tokenId 3
      await expect(nft.connect(addr1).burn(3)).to.be.reverted;
    });
  });

  // 3. Approve & setApprovalForAll
  describe("3. Approve & setApprovalForAll", function () {
    beforeEach(async () => {
      await nft.safeMint(owner.address, "ipfs://A");  // tokenId 0
    });
    it("should correctly update approved address and emit Approval event", async () => {
      await nft.approve(addr1.address, 0);
      expect(await nft.getApproved(0)).to.equal(addr1.address);
      await expect(nft.approve(addr2.address, 0))
        .to.emit(nft, "Approval")
        .withArgs(owner.address, addr2.address, 0);
    });
    it("should clear existing approval when approving zero address", async () => {
      await nft.approve(addr1.address, 0);
      await nft.approve(ethers.ZeroAddress, 0);
      expect(await nft.getApproved(0)).to.equal(ethers.ZeroAddress);
    });
    it("should correctly set and unset operator approval and emit ApprovalForAll event", async () => {
      await nft.setApprovalForAll(addr1.address, true);
      expect(await nft.isApprovedForAll(owner.address, addr1.address)).to.equal(true);
      await expect(nft.setApprovalForAll(addr1.address, false))
        .to.emit(nft, "ApprovalForAll")
        .withArgs(owner.address, addr1.address, false);
    });
  });

  // 4. Transfer & SafeTransfer
  describe("4. Transfer & SafeTransfer", function () {
    beforeEach(async () => {
      await nft.safeMint(owner.address, "ipfs://A");  // tokenId 0
    });
    it("should allow authorized transferFrom and revert if unauthorized", async () => {
      await nft.approve(addr1.address, 0);
      await expect(nft.connect(addr1).transferFrom(owner.address, addr2.address, 0))
        .to.emit(nft, "Transfer")
        .withArgs(owner.address, addr2.address, 0);
      await expect(nft.connect(addr1).transferFrom(owner.address, owner.address, 0)).to.be.reverted;
    });
    it("should allow safeTransferFrom to EOA with and without data", async () => {
      await nft["safeTransferFrom(address,address,uint256)"](owner.address, addr1.address, 0);
      expect(await nft.ownerOf(0)).to.equal(addr1.address);
      await nft.safeMint(owner.address, "ipfs://B"); // tokenId 1
      const data = ethers.toUtf8Bytes("hi");
      await nft["safeTransferFrom(address,address,uint256,bytes)"](owner.address, addr2.address, 1, data);
      expect(await nft.ownerOf(1)).to.equal(addr2.address);
    });
    it("should revert safeTransferFrom to incompatible contract", async () => {
      await expect(
        nft["safeTransferFrom(address,address,uint256)"](owner.address, dummy.target, 0)
      ).to.be.reverted;
    });
  });

  // 5. Enumeration & Ownership
  describe("5. Enumeration & Ownership", function () {
    it("should return correct results for enumeration and revert at bounds", async () => {
      await nft.safeMint(owner.address, "ipfs://A");
      await nft.safeMint(owner.address, "ipfs://B");
      expect(await nft.tokenByIndex(0)).to.equal(0);
      expect(await nft.tokenByIndex(1)).to.equal(1);
      expect(await nft.tokenOfOwnerByIndex(owner.address, 0)).to.equal(0);
      expect(await nft.tokenOfOwnerByIndex(owner.address, 1)).to.equal(1);
      await expect(nft.tokenByIndex(2)).to.be.reverted;
      await expect(nft.tokenOfOwnerByIndex(addr1.address, 0)).to.be.reverted;
    });

    it("should handle ownership transfer and block minting after renounce", async () => {
      await nft.transferOwnership(addr1.address);
      expect(await nft.owner()).to.equal(addr1.address);
      await expect(
        nft.safeMint(owner.address, "ipfs://X")
      ).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
      await nft.connect(addr1).safeMint(addr1.address, "ipfs://Y");
      expect(await nft.ownerOf(0)).to.equal(addr1.address);
      await nft.connect(addr1).renounceOwnership();
      expect(await nft.owner()).to.equal(ethers.ZeroAddress);
      await expect(
        nft.safeMint(addr1.address, "ipfs://Z")
      ).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
    });
  });
});
