const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("Market Unit Test（优化版：状态隔离 + 并行兼容）", function () {
  let market, erc20, erc721;
  let owner, seller, buyer, other;
  const TOKEN_ID = 0;
  const PRICE = ethers.parseEther("100");
  const INITIAL_ERC20_SUPPLY = ethers.parseEther("1000000");
  let snapshotId; // 快照 ID，用于每个用例的状态隔离

  before(async function () {
    // ===== 全局部署：每个文件仅执行一次 =====
    [owner, seller, buyer, other] = await ethers.getSigners();

    // 部署 ERC20
    const ERC20Factory = await ethers.getContractFactory("cUSDT");
    erc20 = await ERC20Factory.deploy();
    await erc20.waitForDeployment();

    // 部署 ERC721
    const ERC721Factory = await ethers.getContractFactory("MyNFT");
    erc721 = await ERC721Factory.deploy();
    await erc721.waitForDeployment();

    // 部署 Market
    const MarketFactory = await ethers.getContractFactory("Market");
    market = await MarketFactory.deploy(
      await erc20.getAddress(),
      await erc721.getAddress()
    );
    await market.waitForDeployment();

    // 给 seller 和 buyer mint ERC20
    await erc20.mint(seller.address, INITIAL_ERC20_SUPPLY);
    await erc20.mint(buyer.address, INITIAL_ERC20_SUPPLY);

    // 给 seller mint 一个 NFT
    await erc721.safeMint(seller.address, "https://example.com/token/0");
  });

  beforeEach(async function () {
    // ===== 状态隔离：每个用例前拍快照 =====
    snapshotId = await network.provider.send("evm_snapshot");
  });

  afterEach(async function () {
    // ===== 状态隔离：每个用例后回滚到快照 =====
    await network.provider.send("evm_revert", [snapshotId]);
  });

  // ——————————————————————————
  // 测试用例1: NFT上架功能测试
  // ——————————————————————————
  describe("测试用例1: NFT上架功能测试", function () {
    it("should list NFT successfully", async function () {
      // 授权并上架
      await erc721.connect(seller).approve(await market.getAddress(), TOKEN_ID);
      const priceData = ethers.solidityPacked(["uint256"], [PRICE]);
      await expect(
        erc721
          .connect(seller)
          ["safeTransferFrom(address,address,uint256,bytes)"](
            seller.address,
            await market.getAddress(),
            TOKEN_ID,
            priceData
          )
      )
        .to.emit(market, "NewOrder")
        .withArgs(seller.address, TOKEN_ID, PRICE);

      // 校验 order 结构 & NFT 所有权
      const order = await market.orderOfId(TOKEN_ID);
      expect(order.seller).to.equal(seller.address);
      expect(order.tokenId).to.equal(TOKEN_ID);
      expect(order.price).to.equal(PRICE);
      expect(await erc721.ownerOf(TOKEN_ID)).to.equal(
        await market.getAddress()
      );
      const orders = await market.getAllNFTs();
      expect(orders.length).to.equal(1);
      expect(orders[0].seller).to.equal(seller.address);
    });

    it("should reject listing with zero price", async function () {
      await erc721.connect(seller).approve(await market.getAddress(), TOKEN_ID);
      const zeroPriceData = ethers.solidityPacked(["uint256"], [0]);
      await expect(
        erc721
          .connect(seller)
          ["safeTransferFrom(address,address,uint256,bytes)"](
            seller.address,
            await market.getAddress(),
            TOKEN_ID,
            zeroPriceData
          )
      ).to.be.revertedWith("Market: Price must be greater than zero");
    });

    it("should reject duplicate listing of the same NFT", async function () {
      await erc721.connect(seller).approve(await market.getAddress(), TOKEN_ID);
      const priceData = ethers.solidityPacked(["uint256"], [PRICE]);
      // 第一次上架
      await erc721
        .connect(seller)
        ["safeTransferFrom(address,address,uint256,bytes)"](
          seller.address,
          await market.getAddress(),
          TOKEN_ID,
          priceData
        );
      // 再次上架应失败
      await expect(
        erc721
          .connect(seller)
          ["safeTransferFrom(address,address,uint256,bytes)"](
            seller.address,
            await market.getAddress(),
            TOKEN_ID,
            priceData
          )
      ).to.be.reverted;
    });

    it("should reject NFT listing by unauthorized operator", async function () {
      const validData = ethers.solidityPacked(["uint256"], [PRICE]);
      // 直接调用 onERC721Received 应当被拒绝
      await expect(
        market.onERC721Received(other.address, seller.address, TOKEN_ID, validData)
      ).to.be.revertedWith("Market: Seller must be operator");
      // 未授权 address 也不能 safeTransferFrom
      await erc721.connect(seller).approve(await market.getAddress(), TOKEN_ID);
      await expect(
        erc721
          .connect(other)
          ["safeTransferFrom(address,address,uint256,bytes)"](
            seller.address,
            await market.getAddress(),
            TOKEN_ID,
            validData
          )
      ).to.be.reverted;
    });
  });

  // ——————————————————————————
  // 测试用例2: NFT下架和购买功能测试
  // ——————————————————————————
  describe("测试用例2: NFT下架和购买功能测试", function () {
    beforeEach(async function () {
      // 先上架一个 NFT
      await erc721.connect(seller).approve(await market.getAddress(), TOKEN_ID);
      const priceData = ethers.solidityPacked(["uint256"], [PRICE]);
      await erc721
        .connect(seller)
        ["safeTransferFrom(address,address,uint256,bytes)"](
          seller.address,
          await market.getAddress(),
          TOKEN_ID,
          priceData
        );
    });

    it("should allow the seller to cancel the order", async function () {
      await expect(market.connect(seller).cancelOrder(TOKEN_ID))
        .to.emit(market, "CancelOrder")
        .withArgs(seller.address, TOKEN_ID);
      expect(await erc721.ownerOf(TOKEN_ID)).to.equal(seller.address);
      expect(await market.isListed(TOKEN_ID)).to.be.false;
      expect((await market.getAllNFTs()).length).to.equal(0);
    });

    it("should not allow non-seller to cancel the order", async function () {
      await expect(
        market.connect(buyer).cancelOrder(TOKEN_ID)
      ).to.be.revertedWith("Market: Sender is not seller");
    });

    it("should not allow canceling a non-listed NFT", async function () {
      const NONEXISTENT_TOKEN_ID = 999;
      await expect(
        market.connect(seller).cancelOrder(NONEXISTENT_TOKEN_ID)
      ).to.be.revertedWith("Market: Token ID is not listed");
    });

    it("should allow the buyer to successfully purchase the NFT", async function () {
      await erc20.connect(buyer).approve(await market.getAddress(), PRICE);
      const sellerBal0 = await erc20.balanceOf(seller.address);
      const buyerBal0 = await erc20.balanceOf(buyer.address);

      await expect(market.connect(buyer).buy(TOKEN_ID))
        .to.emit(market, "Deal")
        .withArgs(buyer.address, seller.address, TOKEN_ID, PRICE);

      expect(await erc721.ownerOf(TOKEN_ID)).to.equal(buyer.address);
      expect(await erc20.balanceOf(seller.address)).to.equal(
        sellerBal0 + PRICE
      );
      expect(await erc20.balanceOf(buyer.address)).to.equal(
        buyerBal0 - PRICE
      );
      expect(await market.isListed(TOKEN_ID)).to.be.false;
    });

    it("should fail to purchase if buyer's ERC20 balance is insufficient", async function () {
      await erc20.connect(buyer).approve(await market.getAddress(), PRICE / 2n);
      await expect(market.connect(buyer).buy(TOKEN_ID)).to.be.reverted;
    });

    it("should fail to purchase a non-listed NFT", async function () {
      const NONEXISTENT_TOKEN_ID = 999;
      await expect(
        market.connect(buyer).buy(NONEXISTENT_TOKEN_ID)
      ).to.be.revertedWith("Market: Token ID is not listed");
    });
  });

  // ——————————————————————————
  // 测试用例3: 价格变更和数据验证测试
  // ——————————————————————————
  describe("测试用例3: 价格变更和数据验证测试", function () {
    beforeEach(async function () {
      // 先上架一个 NFT
      await erc721.connect(seller).approve(await market.getAddress(), TOKEN_ID);
      const priceData = ethers.solidityPacked(["uint256"], [PRICE]);
      await erc721
        .connect(seller)
        ["safeTransferFrom(address,address,uint256,bytes)"](
          seller.address,
          await market.getAddress(),
          TOKEN_ID,
          priceData
        );
    });

    it("should allow the seller to change the price", async function () {
      const newPrice = ethers.parseEther("200");
      await expect(market.connect(seller).changePrice(TOKEN_ID, newPrice))
        .to.emit(market, "ChangePrice")
        .withArgs(seller.address, TOKEN_ID, PRICE, newPrice);

      const order = await market.orderOfId(TOKEN_ID);
      expect(order.price).to.equal(newPrice);
      expect((await market.getAllNFTs())[0].price).to.equal(newPrice);
    });

    it("should not allow non-seller to change the price", async function () {
      const newPrice = ethers.parseEther("200");
      await expect(
        market.connect(buyer).changePrice(TOKEN_ID, newPrice)
      ).to.be.revertedWith("Market: Sender is not seller");
    });

    it("should not allow changing the price of a non-listed NFT", async function () {
      const NONEXISTENT_TOKEN_ID = 999;
      const newPrice = ethers.parseEther("200");
      await expect(
        market.connect(seller).changePrice(NONEXISTENT_TOKEN_ID, newPrice)
      ).to.be.revertedWith("Market: Token ID is not listed");
    });

    it("should correctly handle order status updates", async function () {
      let myOrders = await market.connect(seller).getMyNFTs();
      expect(myOrders.length).to.equal(1);
      expect(myOrders[0].tokenId).to.equal(TOKEN_ID);

      await market.connect(seller).cancelOrder(TOKEN_ID);
      myOrders = await market.connect(seller).getMyNFTs();
      expect(myOrders.length).to.equal(0);
    });

    it("should correctly handle toUint256 with valid, out-of-bounds, and overflow scenarios", async function () {
      // 1. 正常转换
      const testValue = ethers.parseEther("123");
      const data = ethers.solidityPacked(["uint256"], [testValue]);
      expect(await market.toUint256(data, 0)).to.equal(testValue);

      // 2. 长度不足越界
      const shortBytes = "0x1234";
      await expect(market.toUint256(shortBytes, 0)).to.be.revertedWith(
        "Market: toUint256_outOfBounds"
      );

      // 3. 溢出 Panic
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const encoded = abiCoder.encode(["uint256"], [testValue]);
      await expect(
        market.toUint256(encoded, ethers.MaxUint256)
      ).to.be.revertedWithPanic(0x11);
    });
  });

  // ——————————————————————————
  // 边界情况和安全测试
  // ——————————————————————————
  describe("边界情况和安全测试", function () {
    it("should correctly handle listing and deleting multiple orders", async function () {
      // mint 更多 NFT
      await erc721.safeMint(seller.address, "https://example.com/token/1");
      await erc721.safeMint(seller.address, "https://example.com/token/2");
      const TOKEN_ID_1 = 1;
      const TOKEN_ID_2 = 2;

      // 上架两件
      await erc721
        .connect(seller)
        ["safeTransferFrom(address,address,uint256,bytes)"](
          seller.address,
          await market.getAddress(),
          TOKEN_ID_1,
          ethers.solidityPacked(["uint256"], [PRICE])
        );
      await erc721
        .connect(seller)
        ["safeTransferFrom(address,address,uint256,bytes)"](
          seller.address,
          await market.getAddress(),
          TOKEN_ID_2,
          ethers.solidityPacked(["uint256"], [PRICE])
        );
      expect(await market.getOrderLength()).to.equal(2);

      // 取消第一个
      await market.connect(seller).cancelOrder(TOKEN_ID_1);
      expect(await market.getOrderLength()).to.equal(1);
      expect(await market.isListed(TOKEN_ID_1)).to.be.false;
      expect(await market.isListed(TOKEN_ID_2)).to.be.true;
    });

    it("should reject zero address during contract deployment", async function () {
      const MarketFactory = await ethers.getContractFactory("Market");
      await expect(
        MarketFactory.deploy(ethers.ZeroAddress, await erc721.getAddress())
      ).to.be.revertedWith("Market: IERC20 contract address must be non-null");
      await expect(
        MarketFactory.deploy(await erc20.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWith("Market: IERC721 contract address must be non-null");
    });

    it("should handle safeTransferFrom and emit NewOrder", async function () {
      // 测试 safeTransferFrom 也能触发 NewOrder
      await erc721.connect(seller).approve(await market.target, TOKEN_ID);
      const validData = ethers.solidityPacked(["uint256"], [PRICE]);
      await expect(
        erc721
          .connect(seller)
          ["safeTransferFrom(address,address,uint256,bytes)"](
            seller.address,
            market.target,
            TOKEN_ID,
            validData
          )
      )
        .to.emit(market, "NewOrder")
        .withArgs(seller.address, TOKEN_ID, PRICE);
      expect(await erc721.ownerOf(TOKEN_ID)).to.equal(market.target);
      expect(await market.isListed(TOKEN_ID)).to.equal(true);
    });
  });
});
