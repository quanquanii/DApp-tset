// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract cUSDT is ERC20, Ownable {
    constructor() ERC20("fake USDT", "cUSDT") Ownable(msg.sender) {
        _mint(msg.sender, 1 * 10 ** 8 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}




// pragma solidity ^0.8.20;

// import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// contract cUSDT is ERC20 {
//     constructor() ERC20("fake USDT", "cUSDT") {
//         _mint(msg.sender, 1 * 10 ** 8 * 10 ** decimals());
//     }
// }





