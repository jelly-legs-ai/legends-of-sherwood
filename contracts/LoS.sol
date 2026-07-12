// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  $LoS — the reward token of Legends of Sherwood
/// @notice Minimal, dependency-free ERC-20 with a game-treasury mint/burn role
///         and a protocol treasury that receives the Grand Exchange trade tax,
///         buybacks and creator-wallet transfers.
///
///         NOT DEPLOYED by this repository. In the current build $LoS is a
///         custodial off-chain ledger (server/game/economy.js) with a full audit
///         log. This contract is the on-chain mirror the PDA vault bridges to:
///         the game treasury replays ledger events as gameMint (earn), gameBurn
///         (sinks) and transfer (player withdrawals). The admin studio's token
///         migration wires this address (or a mint authority) into the vault so
///         releases below the review threshold settle automatically on-chain.
///
///         Emission sources in-game: very rare mob drops, boss bounties,
///         dungeon floor clears, world events, and skill milestones.
///         Treasury inflows: 5% GE trade tax, buybacks, creator transfers.
contract LoS {
    string public constant name = "Legends of Sherwood";
    string public constant symbol = "LoS";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    /// Hard cap keeps the grind meaningful: 21m tokens, like a proper legend.
    uint256 public constant MAX_SUPPLY = 21_000_000e18;

    address public treasury;          // the game server's custodial bridge / mint authority
    address public pendingTreasury;
    address public protocolTreasury;  // receives GE tax, buybacks, creator transfers

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Earned(address indexed player, uint256 amount, string reason);
    event Burned(uint256 amount, string reason);
    event TreasuryFunded(address indexed from, uint256 amount, string source);

    modifier onlyTreasury() {
        require(msg.sender == treasury, "LoS: not treasury");
        _;
    }

    constructor() {
        treasury = msg.sender;
        protocolTreasury = msg.sender;
    }

    // ---- ERC-20 -----------------------------------------------------------
    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= value, "LoS: allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - value;
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "LoS: zero to");
        uint256 b = balanceOf[from];
        require(b >= value, "LoS: balance");
        unchecked {
            balanceOf[from] = b - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }

    // ---- game bridge ------------------------------------------------------
    /// @notice Mint earned $LoS to a player wallet (ledger replay).
    function gameMint(address player, uint256 amount, string calldata reason) external onlyTreasury {
        require(totalSupply + amount <= MAX_SUPPLY, "LoS: cap");
        totalSupply += amount;
        unchecked { balanceOf[player] += amount; }
        emit Transfer(address(0), player, amount);
        emit Earned(player, amount, reason);
    }

    /// @notice Burn sunk $LoS (GE listing fees, Colosseum rake).
    function gameBurn(uint256 amount, string calldata reason) external onlyTreasury {
        uint256 b = balanceOf[treasury];
        require(b >= amount, "LoS: balance");
        unchecked {
            balanceOf[treasury] = b - amount;
            totalSupply -= amount;
        }
        emit Transfer(treasury, address(0), amount);
        emit Burned(amount, reason);
    }

    /// @notice Players may burn their own tokens (e.g. bridging back in-game).
    function burn(uint256 amount) external {
        uint256 b = balanceOf[msg.sender];
        require(b >= amount, "LoS: balance");
        unchecked {
            balanceOf[msg.sender] = b - amount;
            totalSupply -= amount;
        }
        emit Transfer(msg.sender, address(0), amount);
    }

    // ---- protocol treasury ------------------------------------------------
    /// @notice Route a contribution (GE trade tax, buyback, creator transfer)
    ///         into the protocol treasury. Callable by anyone holding balance;
    ///         the game bridge uses it to settle the 5% GE tax on-chain.
    function fundTreasury(uint256 amount, string calldata source) external {
        _transfer(msg.sender, protocolTreasury, amount);
        emit TreasuryFunded(msg.sender, amount, source);
    }

    function setProtocolTreasury(address next) external onlyTreasury {
        require(next != address(0), "LoS: zero");
        protocolTreasury = next;
    }

    // ---- two-step treasury handover ----------------------------------------
    function setTreasury(address next) external onlyTreasury {
        pendingTreasury = next;
    }

    function acceptTreasury() external {
        require(msg.sender == pendingTreasury, "LoS: not pending");
        treasury = pendingTreasury;
        pendingTreasury = address(0);
    }
}
