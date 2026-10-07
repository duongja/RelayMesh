// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal node registry. Eligibility is decided off-chain
/// (residential ASN / IP checks) and recorded here. No funds held.
contract MeshRegistry {
    address public operator;
    mapping(bytes32 => bool) public eligible;
    mapping(bytes32 => address) public walletOf;

    event Registered(bytes32 indexed nodeId, address wallet);
    event EligibilitySet(bytes32 indexed nodeId, bool ok);

    constructor() { operator = msg.sender; }
    modifier onlyOperator() { require(msg.sender == operator, "Only operator"); _; }

    function register(bytes32 nodeId, address wallet) external onlyOperator {
        require(nodeId != bytes32(0) && wallet != address(0), "Bad input");
        require(walletOf[nodeId] == address(0), "Exists");
        walletOf[nodeId] = wallet;
        eligible[nodeId] = true;
        emit Registered(nodeId, wallet);
    }

    function setEligible(bytes32 nodeId, bool ok) external onlyOperator {
        require(walletOf[nodeId] != address(0), "Unknown node");
        eligible[nodeId] = ok;
        emit EligibilitySet(nodeId, ok);
    }
}
