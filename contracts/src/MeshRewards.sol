// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @notice Merkle-distributed epoch rewards for RelayMesh testnet.
/// Operator funds each epoch and posts its root; node wallets claim with proofs.
/// Leaf: keccak256(abi.encode(epochId, nodeId, wallet, netPts, upPts, bytes, amount)).
/// Epoch binding kills cross-epoch replays; wallet binding kills claim theft.
contract MeshRewards {
    address public immutable operator;
    IERC20 public immutable token;

    struct Epoch {
        bytes32 root;
        uint256 funded;
        uint256 claimed;
        bool exists;
    }
    mapping(uint256 => Epoch) public epochs;
    mapping(uint256 => mapping(bytes32 => bool)) public claimed;

    event Funded(uint256 indexed epochId, bytes32 root, uint256 amount);
    event Claimed(uint256 indexed epochId, bytes32 indexed nodeId, address wallet, uint256 amount);

    constructor(address token_) {
        operator = msg.sender;
        token = IERC20(token_);
    }
    modifier onlyOperator() { require(msg.sender == operator, "Only operator"); _; }

    function fund(uint256 epochId, bytes32 root, uint256 amount) external onlyOperator {
        require(!epochs[epochId].exists, "Funded");
        require(root != bytes32(0), "Bad root");
        require(token.transferFrom(msg.sender, address(this), amount), "Fund transfer");
        epochs[epochId] = Epoch(root, amount, 0, true);
        emit Funded(epochId, root, amount);
    }

    function claim(
        uint256 epochId,
        bytes32 nodeId,
        address wallet,
        uint256 netPts,
        uint256 upPts,
        uint256 bytes_,
        uint256 amount,
        bytes32[] calldata proof
    ) external {
        Epoch storage e = epochs[epochId];
        require(e.exists, "No epoch");
        require(msg.sender == wallet, "Not wallet");
        require(!claimed[epochId][nodeId], "Claimed");
        bytes32 leaf = keccak256(abi.encode(epochId, nodeId, wallet, netPts, upPts, bytes_, amount));
        require(verifyProof(proof, e.root, leaf), "Bad proof");
        claimed[epochId][nodeId] = true;
        e.claimed += amount;
        require(e.claimed <= e.funded, "Overfunded");
        require(token.transfer(wallet, amount), "Payout");
        emit Claimed(epochId, nodeId, wallet, amount);
    }

    function verifyProof(bytes32[] calldata proof, bytes32 root, bytes32 leaf) public pure returns (bool) {
        bytes32 h = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            h = h <= p ? keccak256(abi.encode(h, p)) : keccak256(abi.encode(p, h));
        }
        return h == root;
    }
}
