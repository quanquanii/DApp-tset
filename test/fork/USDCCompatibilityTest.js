const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("USDC Asset Compatibility E2E Test", function () {
  let owner, seller, buyer;
  let usdc, nft, market;
  const USDC_WHALE = "0x55fe002aeff02f77364de339a1292923a15844b8";
  const USDC_ADDR = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const TOKEN_URI = "ipfs://QmTest";
  const TOKEN_ID = 0;
  const PRICE = ethers.parseUnits("10", 6); // 10 USDC (6位精度)

  before(async () => {
    [owner, seller, buyer] = await ethers.getSigners();

    // 连接主网 USDC 合约
    usdc = await ethers.getContractAt("IERC20", USDC_ADDR);

    // 模拟主网 USDC 巨鲸账户，为 buyer 分配 USDC
    await network.provider.send("hardhat_impersonateAccount", [USDC_WHALE]);
    const whaleSigner = await ethers.getSigner(USDC_WHALE);
    await usdc.connect(whaleSigner).transfer(buyer.address, ethers.parseUnits("100", 6));

    // 部署 NFT 合约
    const NFT = await ethers.getContractFactory("MyNFT", owner);
    nft = await NFT.deploy();
    await nft.waitForDeployment();

    // 部署 Market 合约，并将 USDC 合约地址作为支付资产
    const Market = await ethers.getContractFactory("Market", owner);
    market = await Market.deploy(usdc.target, nft.target);
    await market.waitForDeployment();
  });

  beforeEach(async () => {
    this.snapshotId = await network.provider.send("evm_snapshot");
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [this.snapshotId]);
  });

  it("should complete E2E flow with mainnet USDC: transfer, approve, buy", async () => {
    //
    // 1️⃣ 买家 USDC 余额验证
    //
    const buyerBal0 = await usdc.balanceOf(buyer.address);
    expect(buyerBal0).to.be.gte(PRICE);

    //
    // 2️⃣ 买家授权 Market 合约消费 USDC
    //
    await usdc.connect(buyer).approve(market.target, PRICE);
    expect(await usdc.allowance(buyer.address, market.target)).to.equal(PRICE);

    //
    // 3️⃣ owner mint NFT 给 seller
    //
    await nft.connect(owner).safeMint(seller.address, TOKEN_URI);
    expect(await nft.ownerOf(TOKEN_ID)).to.equal(seller.address);

    //
    // 4️⃣ seller 授权 NFT 并上架到 Market
    //
    await nft.connect(seller).approve(market.target, TOKEN_ID);
    const abiCoder = new ethers.AbiCoder();
    const priceData = abiCoder.encode(["uint256"], [PRICE]);

    await expect(
      nft.connect(seller)[
        "safeTransferFrom(address,address,uint256,bytes)"
      ](seller.address, market.target, TOKEN_ID, priceData)
    )
      .to.emit(market, "NewOrder")
      .withArgs(seller.address, TOKEN_ID, PRICE);

    expect(await nft.ownerOf(TOKEN_ID)).to.equal(market.target);

    //
    // 5️⃣ buyer 调用 buy() 完成购买
    //
    await expect(market.connect(buyer).buy(TOKEN_ID))
      .to.emit(market, "Deal")
      .withArgs(buyer.address, seller.address, TOKEN_ID, PRICE);

    //
    // 6️⃣ 最终状态断言
    //
    expect(await nft.ownerOf(TOKEN_ID)).to.equal(buyer.address);

    const sellerBal = await usdc.balanceOf(seller.address);
    expect(sellerBal).to.equal(PRICE);

    const buyerBalAfter = await usdc.balanceOf(buyer.address);
    expect(buyerBalAfter).to.equal(buyerBal0 - PRICE);

    expect(await market.isListed(TOKEN_ID)).to.equal(false);
    expect((await market.getAllNFTs()).length).to.equal(0);
  });
});
