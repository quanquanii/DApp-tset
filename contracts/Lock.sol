// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract Lock {
    uint public unlockTime;
    address payable public owner;

    event Withdrawal(uint amount, uint when);

    constructor(uint _unlockTime) payable {
        require(
            block.timestamp < _unlockTime,
            "Unlock time should be in the future"
        );

        unlockTime = _unlockTime;
        owner = payable(msg.sender);
    }

    function withdraw() public {
        // Uncomment this line, and the import of "hardhat/console.sol", to print a log in your terminal
        // console.log("Unlock time is %o and block timestamp is %o", unlockTime, block.timestamp);

        require(block.timestamp >= unlockTime, "You can't withdraw yet");
        require(msg.sender == owner, "You aren't the owner");

        emit Withdrawal(address(this).balance, block.timestamp);

        owner.transfer(address(this).balance);
    }
}

// pragma solidity ^0.8.28;

// // ✅ 仅用于 Hardhat 本地环境的调试日志
// import "hardhat/console.sol";

// contract Lock {
//     // 解锁时间（Unix 时间戳）
//     uint public unlockTime;

//     // 合约创建者，也就是锁仓拥有者
//     address payable public owner;

//     // 提现事件日志
//     event Withdrawal(uint amount, uint when);

//     // 构造函数：设定解锁时间并存入资金
//     constructor(uint _unlockTime) payable {
//         require(_unlockTime > block.timestamp, "Unlock time should be in the future");
//         unlockTime = _unlockTime;
//         owner = payable(msg.sender);
//     }

//     // 提现函数：到期才能调用，必须由 owner 执行
//     function withdraw() public {
//         // ✅ 调试输出，打印调用者与时间状态
//         console.log("Withdraw called by:", msg.sender);
//         console.log("Current time:", block.timestamp);
//         console.log("Unlock time:", unlockTime);

//         // ✅ 检查时间条件
//         require(block.timestamp >= unlockTime, "You can't withdraw yet");

//         // ✅ 检查权限
//         require(msg.sender == owner, "You aren't the owner");

//         // ✅ 触发事件，转账
//         emit Withdrawal(address(this).balance, block.timestamp);
//         owner.transfer(address(this).balance);
//     }
// }
