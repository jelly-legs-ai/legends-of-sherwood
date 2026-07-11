// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  $Shilling — the reward token of Legends of Sherwood
/// @notice Minimal, dependency-free ERC-20 with a game-treasury mint/burn role.
///
///         NOT DEPLOYED by this repository. In the current build $Shilling is a
///         custodial off-chain ledger (server/game/economy.js) with a full audit
///         log. This contract is the on-chain mirror for a future bridge:
///         the game treasury replays ledger events as mint (earn), burn (sinks:
///         GE listing fees, Colosseum rake) and transfer (player withdrawals).
///
///         Emission sources in-game: very rare mob drops, boss bounties,
///         dungeon floor clears, world events, and skill milestones
///         (levels 5/10/20/25/50/75/99 — 99 pays a generous lump sum).
contract Shilling {
    string public constant name = "Sherwood Shilling";
    string public constant symbol = "SHL";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    /// Hard cap keeps the grind meaningful: 21m shillings, like a proper legend.
    uint256 public constant MAX_SUPPLY = 21_000_000e18;

    address public treasury;      // the game server's custodial bridge
    address public pendingTreasury;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Earned(address indexed player, uint256 amount, string reason);
    event Burned(uint256 amount, string reason);

    modifier onlyTreasury() {
        require(msg.sender == treasury, "SHL: not treasury");
        _;
    }

    constructor() {
        treasury = msg.sender;
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
        require(a >= value, "SHL: allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - value;
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "SHL: zero to");
        uint256 b = balanceOf[from];
        require(b >= value, "SHL: balance");
        unchecked {
            balanceOf[from] = b - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }

    // ---- game bridge ------------------------------------------------------
    /// @notice Mint earned shillings to a player wallet (ledger replay).
    function gameMint(address player, uint256 amount, string calldata reason) external onlyTreasury {
        require(totalSupply + amount <= MAX_SUPPLY, "SHL: cap");
        totalSupply += amount;
        unchecked { balanceOf[player] += amount; }
        emit Transfer(address(0), player, amount);
        emit Earned(player, amount, reason);
    }

    /// @notice Burn sunk shillings (GE listing fees, Colosseum rake).
    function gameBurn(uint256 amount, string calldata reason) external onlyTreasury {
        uint256 b = balanceOf[treasury];
        require(b >= amount, "SHL: balance");
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
        require(b >= amount, "SHL: balance");
        unchecked {
            balanceOf[msg.sender] = b - amount;
            totalSupply -= amount;
        }
        emit Transfer(msg.sender, address(0), amount);
    }

    // ---- two-step treasury handover ----------------------------------------
    function setTreasury(address next) external onlyTreasury {
        pendingTreasury = next;
    }

    function acceptTreasury() external {
        require(msg.sender == pendingTreasury, "SHL: not pending");
        treasury = pendingTreasury;
        pendingTreasury = address(0);
    }
}
