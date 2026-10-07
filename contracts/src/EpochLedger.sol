// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Hourly epoch roots. Operator posts Merkle root + evidence hash.
/// No funds held. Points live off-chain in MVP.
contract EpochLedger {
    address public operator;
    mapping(uint256 => bytes32) public merkleRoot;
    mapping(uint256 => bytes32) public evidenceHash;
    mapping(uint256 => bool) public closed;

    event EpochClosed(uint256 indexed epochId, bytes32 root, bytes32 evidence);

    constructor() { operator = msg.sender; }
    modifier onlyOperator() { require(msg.sender == operator, "Only operator"); _; }

    function closeEpoch(uint256 epochId, bytes32 root, bytes32 evidence) external onlyOperator {
        require(!closed[epochId], "Closed");
        require(root != bytes32(0) && evidence != bytes32(0), "Bad input");
        merkleRoot[epochId] = root;
        evidenceHash[epochId] = evidence;
        closed[epochId] = true;
        emit EpochClosed(epochId, root, evidence);
    }
}
