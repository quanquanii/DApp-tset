require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("dotenv").config();



module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {},
  },
  networks: {
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_KEY}`,
        blockNumber: 18800000, // 可选：固定 fork 区块保证测试可重现
      },
      gas: "auto",
      gasPrice: 60_000_000_000, // 设置足够高的 gasPrice，保证 fork 模式下交易不失败
    },
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY || "", 
    outputFile: "gas-report.txt",
    noColors: true,
    ethGasStation: false, // 避免 Etherscan 报错
  },
};
