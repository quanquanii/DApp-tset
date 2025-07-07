const { ethers } = require("hardhat");        // Hardhat ethers
const ethersJs = require("ethers");           // 独立 ethers.js
const { expect } = require("chai");



describe("Market Unit Test", function () {
  let market;
  let erc20;
  let erc721;
  let owner;
  let seller;
  let buyer;
  let other;
  
  const TOKEN_ID = 0;
  const PRICE = ethers.parseEther("100");
  const INITIAL_ERC20_SUPPLY = ethers.parseEther("1000000");

  beforeEach(async function () {
    [owner, seller, buyer, other] = await ethers.getSigners();

    // Deploy ERC20 token (cUSDT)
    const ERC20Factory = await ethers.getContractFactory("cUSDT");
    erc20 = await ERC20Factory.deploy();
    await erc20.waitForDeployment();

    // Deploy ERC721 token (MyNFT)
    const ERC721Factory = await ethers.getContractFactory("MyNFT");
    erc721 = await ERC721Factory.deploy();
    await erc721.waitForDeployment();

    // Deploy Market contract
    const MarketFactory = await ethers.getContractFactory("Market");
    market = await MarketFactory.deploy(await erc20.getAddress(), await erc721.getAddress());
    await market.waitForDeployment();

    // Mint tokens to seller and buyer
    await erc20.mint(seller.address, INITIAL_ERC20_SUPPLY);
    await erc20.mint(buyer.address, INITIAL_ERC20_SUPPLY);
    
    // Mint NFT to seller
    await erc721.safeMint(seller.address, "https://example.com/token/0");
  });

  describe("测试用例1: NFT上架功能测试", function () {
    it("should list NFT successfully", async function () {
      await erc721.connect(seller).approve(await market.getAddress(), TOKEN_ID);
      const priceData = ethers.solidityPacked(["uint256"], [PRICE]);
      await expect(
        erc721.connect(seller)["safeTransferFrom(address,address,uint256,bytes)"](
          seller.address,
          await market.getAddress(),
          TOKEN_ID,
          priceData
        )
      ).to.emit(market, "NewOrder")
        .withArgs(seller.address, TOKEN_ID, PRICE);
      const order = await market.orderOfId(TOKEN_ID);
      expect(order.seller).to.equal(seller.address);
      expect(order.tokenId).to.equal(TOKEN_ID);
      expect(order.price).to.equal(PRICE);
      expect(await erc721.ownerOf(TOKEN_ID)).to.equal(await market.getAddress());
      const orders = await market.getAllNFTs();
      expect(orders.length).to.equal(1);
      expect(orders[0].seller).to.equal(seller.address);
    });

    it("should reject listing with zero price", async function () {
      await erc721.connect(seller).approve(await market.getAddress(), TOKEN_ID);
      
      const zeroPriceData = ethers.solidityPacked(["uint256"], [0]);
      
      await expect(
        erc721.connect(seller)["safeTransferFrom(address,address,uint256,bytes)"](
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
      await erc721.connect(seller)["safeTransferFrom(address,address,uint256,bytes)"](
        seller.address,
        await market.getAddress(),
        TOKEN_ID,
        priceData
      );

      // 尝试重复上架应该失败，因为NFT已经在Market合约中
      await expect(
        erc721.connect(seller)["safeTransferFrom(address,address,uint256,bytes)"](
          seller.address,
          await market.getAddress(),
          TOKEN_ID,
          priceData
        )
      ).to.be.reverted; // NFT不再属于seller
    });

    it("should reject NFT listing by unauthorized operator", async function () {
    const validData = ethers.solidityPacked(["uint256"], [PRICE]);

    await expect(
        market.onERC721Received(other.address, seller.address, TOKEN_ID, validData)
    ).to.be.revertedWith("Market: Seller must be operator");

    await erc721.connect(seller).approve(await market.getAddress(), TOKEN_ID);
    await expect(
        erc721.connect(other)["safeTransferFrom(address,address,uint256,bytes)"](
        seller.address,
        await market.getAddress(),
        TOKEN_ID,
        validData
        )
    ).to.be.reverted;
    });



  });

  describe("测试用例2: NFT下架和购买功能测试", function () {
    beforeEach(async function () {
      // 预先上架一个NFT
      await erc721.connect(seller).approve(await market.getAddress(), TOKEN_ID);
      const priceData = ethers.solidityPacked(["uint256"], [PRICE]);
      await erc721.connect(seller)["safeTransferFrom(address,address,uint256,bytes)"](
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
      const orders = await market.getAllNFTs();
      expect(orders.length).to.equal(0);
    });

    it("should not allow non-seller to cancel the order", async function () {
      await expect(market.connect(buyer).cancelOrder(TOKEN_ID))
        .to.be.revertedWith("Market: Sender is not seller");
    });

    it("should not allow canceling a non-listed NFT", async function () {
      const NONEXISTENT_TOKEN_ID = 999;
      await expect(market.connect(seller).cancelOrder(NONEXISTENT_TOKEN_ID))
        .to.be.revertedWith("Market: Token ID is not listed");
    });

    it("should allow the buyer to successfully purchase the NFT", async function () {
      await erc20.connect(buyer).approve(await market.getAddress(), PRICE);
      const sellerBalanceBefore = await erc20.balanceOf(seller.address);
      const buyerBalanceBefore = await erc20.balanceOf(buyer.address);
      await expect(market.connect(buyer).buy(TOKEN_ID))
        .to.emit(market, "Deal")
        .withArgs(buyer.address, seller.address, TOKEN_ID, PRICE);
      expect(await erc721.ownerOf(TOKEN_ID)).to.equal(buyer.address);
      expect(await erc20.balanceOf(seller.address)).to.equal(sellerBalanceBefore + PRICE);
      expect(await erc20.balanceOf(buyer.address)).to.equal(buyerBalanceBefore - PRICE);
      expect(await market.isListed(TOKEN_ID)).to.be.false;
    });

    it("should fail to purchase if buyer's ERC20 balance is insufficient", async function () {
      await erc20.connect(buyer).approve(await market.getAddress(), PRICE / 2n);
      await expect(market.connect(buyer).buy(TOKEN_ID)).to.be.reverted;
    });

    it("should fail to purchase a non-listed NFT", async function () {
      const NONEXISTENT_TOKEN_ID = 999;
      await expect(market.connect(buyer).buy(NONEXISTENT_TOKEN_ID))
        .to.be.revertedWith("Market: Token ID is not listed");
    });
  });

  describe("测试用例3: 价格变更和数据验证测试", function () {
    beforeEach(async function () {
      // 预先上架一个NFT
      await erc721.connect(seller).approve(await market.getAddress(), TOKEN_ID);
      const priceData = ethers.solidityPacked(["uint256"], [PRICE]);
      await erc721.connect(seller)["safeTransferFrom(address,address,uint256,bytes)"](
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
      const orders = await market.getAllNFTs();
      expect(orders[0].price).to.equal(newPrice);
    });

    it("should not allow non-seller to change the price", async function () {
      const newPrice = ethers.parseEther("200");
      
      await expect(market.connect(buyer).changePrice(TOKEN_ID, newPrice))
        .to.be.revertedWith("Market: Sender is not seller");
    });

    it("should not allow changing the price of a non-listed NFT", async function () {
      const NONEXISTENT_TOKEN_ID = 999;
      const newPrice = ethers.parseEther("200");
      await expect(market.connect(seller).changePrice(NONEXISTENT_TOKEN_ID, newPrice))
        .to.be.revertedWith("Market: Token ID is not listed");
    });

    it("should correctly handle order status updates", async function () {
      let myOrders = await market.connect(seller).getMyNFTs();
      expect(myOrders.length).to.equal(1);
      expect(myOrders[0].tokenId).to.equal(TOKEN_ID);
      let otherOrders = await market.connect(buyer).getMyNFTs();
      expect(otherOrders.length).to.equal(0);
      await market.connect(seller).cancelOrder(TOKEN_ID);
      myOrders = await market.connect(seller).getMyNFTs();
      expect(myOrders.length).to.equal(0);
    });



    it("should correctly handle toUint256 with valid, out-of-bounds, and overflow scenarios", async function () {
  // 1. 正确转换 bytes 到 uint256
    const testValue = ethers.parseEther("123");
    const testBytes = ethers.solidityPacked(["uint256"], [testValue]);
    const result = await market.toUint256(testBytes, 0);
    expect(result).to.equal(testValue);

    // 2. bytes 长度不足触发越界 revert
    const shortBytes = "0x1234"; // 太短
    await expect(market.toUint256(shortBytes, 0))
        .to.be.revertedWith("Market: toUint256_outOfBounds");

    // 3. 起始位置溢出应触发 EVM panic
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const encoded = abiCoder.encode(["uint256"], [testValue]);
    await expect(market.toUint256(encoded, ethers.MaxUint256))
        .to.be.revertedWithPanic(0x11); // panic code: overflow
    });


  });

  describe("边界情况和安全测试", function () {
    it("should correctly handle listing and deleting multiple orders", async function () {
      await erc721.safeMint(seller.address, "https://example.com/token/1");
      await erc721.safeMint(seller.address, "https://example.com/token/2");
      const TOKEN_ID_1 = 1;
      const TOKEN_ID_2 = 2;
      await erc721.connect(seller).approve(await market.getAddress(), TOKEN_ID_1);
      await erc721.connect(seller).approve(await market.getAddress(), TOKEN_ID_2);
      const priceData = ethers.solidityPacked(["uint256"], [PRICE]);
      await erc721.connect(seller)["safeTransferFrom(address,address,uint256,bytes)"](
        seller.address,
        await market.getAddress(),
        TOKEN_ID_1,
        priceData
      );  
      await erc721.connect(seller)["safeTransferFrom(address,address,uint256,bytes)"](
        seller.address,
        await market.getAddress(),
        TOKEN_ID_2,
        priceData
      );
      expect(await market.getOrderLength()).to.equal(2);
      await market.connect(seller).cancelOrder(TOKEN_ID_1);
      
      expect(await market.getOrderLength()).to.equal(1);
      expect(await market.isListed(TOKEN_ID_1)).to.be.false;
      expect(await market.isListed(TOKEN_ID_2)).to.be.true;
    });


    it("should reject zero address during contract deployment", async function () {
      const MarketFactory = await ethers.getContractFactory("Market");
      
      await expect(MarketFactory.deploy(ethers.ZeroAddress, await erc721.getAddress()))
        .to.be.revertedWith("Market: IERC20 contract address must be non-null");
        
      await expect(MarketFactory.deploy(await erc20.getAddress(), ethers.ZeroAddress))
        .to.be.revertedWith("Market: IERC721 contract address must be non-null");
    });

    it("should handle safeTransferFrom and emit NewOrder", async function () {
    await erc721.connect(seller).approve(market.target, TOKEN_ID); // ⬅ 这里也要用 .target
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const validData = abiCoder.encode(["uint256"], [PRICE]);
    await expect(
        erc721.connect(seller)["safeTransferFrom(address,address,uint256,bytes)"](
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