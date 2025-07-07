const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("E2E Test", function () {
  let owner, seller, buyer;
  let cUSDT, myNFT, market;
  const TOKEN_URI = "ipfs://QmTest";               // 任意 URI 占位
  const TOKEN_ID  = 0;
  const PRICE     = ethers.parseUnits("10", 18);   // 10 cUSDT (18 decimals)

  before(async () => {
    [owner, seller, buyer] = await ethers.getSigners();


    const CUSDT = await ethers.getContractFactory("cUSDT", owner);
    cUSDT = await CUSDT.deploy();
    await cUSDT.waitForDeployment();

    // 给 buyer 铸造一些 cUSDT 用于支付
    await cUSDT.connect(owner).mint(buyer.address, ethers.parseUnits("100", 18));


    const MYNFT = await ethers.getContractFactory("MyNFT", owner);
    myNFT = await MYNFT.deploy();
    await myNFT.waitForDeployment();


    const MARKET = await ethers.getContractFactory("Market", owner);
    market = await MARKET.deploy(cUSDT.target, myNFT.target);
    await market.waitForDeployment();
  });

  beforeEach(async () => {
    // 每个用例前拍快照，保持链上状态隔离
    this.snapshotId = await network.provider.send("evm_snapshot");
  });

  afterEach(async () => {
    // 用例结束后回滚到快照
    await network.provider.send("evm_revert", [this.snapshotId]);
  });

  it("should run full E2E flow: mint → list → buy and assert all state changes", async () => {
    //
    // 1️⃣ owner 铸造 NFT 给 seller
    //
    await myNFT.connect(owner).safeMint(seller.address, TOKEN_URI);
    expect(await myNFT.ownerOf(TOKEN_ID)).to.equal(seller.address);

    //
    // 2️⃣ seller 授权并上架 NFT 到 Market
    //
    await myNFT.connect(seller).approve(market.target, TOKEN_ID);
    const abiCoder  = new ethers.AbiCoder();
    const priceData = abiCoder.encode(["uint256"], [PRICE]);
    await expect(
      myNFT.connect(seller)[
        "safeTransferFrom(address,address,uint256,bytes)"
      ](seller.address, market.target, TOKEN_ID, priceData)
    )
      .to.emit(market, "NewOrder")
      .withArgs(seller.address, TOKEN_ID, PRICE);

    // NFT 应在 Market 合约里，且订单正确
    expect(await myNFT.ownerOf(TOKEN_ID)).to.equal(market.target);
    const all = await market.getAllNFTs();
    expect(all.length).to.equal(1);
    expect(all[0].seller).to.equal(seller.address);
    expect(all[0].tokenId).to.equal(TOKEN_ID);
    expect(all[0].price).to.equal(PRICE);

    //
    // 3️⃣ buyer 授权 Market 消费 cUSDT
    //
    const buyerBal0 = await cUSDT.balanceOf(buyer.address);
    expect(buyerBal0).to.be.gte(PRICE);

    await cUSDT.connect(buyer).approve(market.target, PRICE);
    expect(
      await cUSDT.allowance(buyer.address, market.target)
    ).to.equal(PRICE);

    //
    // 4️⃣ buyer 调用 buy()
    //
    await expect(market.connect(buyer).buy(TOKEN_ID))
      .to.emit(market, "Deal")
      .withArgs(buyer.address, seller.address, TOKEN_ID, PRICE);

    //
    // 5️⃣ 断言最终状态
    //

    // — NFT 所有权已转移给 buyer
    expect(await myNFT.ownerOf(TOKEN_ID)).to.equal(buyer.address);

    // — seller cUSDT 增加 PRICE
    const sellerBal = await cUSDT.balanceOf(seller.address);
    expect(sellerBal).to.equal(PRICE);

    // — buyer cUSDT 减少 PRICE（用 BigInt 原生减法）
    const buyerBalAfter = await cUSDT.balanceOf(buyer.address);
    expect(buyerBalAfter).to.equal(buyerBal0 - PRICE);

    // — 订单已从 Market 中移除
    expect(await market.isListed(TOKEN_ID)).to.equal(false);
    expect((await market.getAllNFTs()).length).to.equal(0);
  });
});
