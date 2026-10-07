// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "../src/MeshToken.sol";
import "../src/MeshRewards.sol";

interface Vm2 { function prank(address) external; function expectRevert(bytes calldata) external; }

contract MeshRewardsTest {
    Vm2 constant vm = Vm2(address(uint160(uint256(keccak256("hevm cheat code")))));
    MeshToken token;
    MeshRewards rewards;
    address constant OPERATOR = address(0xAAAA);
    address constant ALICE = address(0xBEEF);
    address constant BOB = address(0xCAFE);
    bytes32 constant NODE_A = keccak256("node-a");
    bytes32 constant NODE_B = keccak256("node-b");

    function leaf(uint256 epoch, bytes32 node, address w, uint256 net_, uint256 up, uint256 by, uint256 amt) internal pure returns (bytes32) {
        return keccak256(abi.encode(epoch, node, w, net_, up, by, amt));
    }
    function pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a <= b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    function setUp() public {
        vm.prank(OPERATOR);
        token = new MeshToken(1_000_000 ether);
        vm.prank(OPERATOR);
        rewards = new MeshRewards(address(token));
        vm.prank(OPERATOR);
        token.approve(address(rewards), type(uint256).max);
    }

    function testSingleLeafClaim() public {
        bytes32 l = leaf(1, NODE_A, ALICE, 10, 5, 1000, 100 ether);
        vm.prank(OPERATOR);
        rewards.fund(1, l, 100 ether);
        vm.prank(ALICE);
        bytes32[] memory proof;
        rewards.claim(1, NODE_A, ALICE, 10, 5, 1000, 100 ether, proof);
        require(token.balanceOf(ALICE) == 100 ether, "no payout");
    }

    function testTwoLeafClaimWithProof() public {
        bytes32 a = leaf(2, NODE_A, ALICE, 10, 5, 1000, 60 ether);
        bytes32 b = leaf(2, NODE_B, BOB, 6, 4, 500, 40 ether);
        bytes32 root = pair(a, b);
        vm.prank(OPERATOR);
        rewards.fund(2, root, 100 ether);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = b;
        vm.prank(ALICE);
        rewards.claim(2, NODE_A, ALICE, 10, 5, 1000, 60 ether, proof);
        require(token.balanceOf(ALICE) == 60 ether, "no payout");
    }

    function testDoubleClaimRejected() public {
        bytes32 l = leaf(3, NODE_A, ALICE, 1, 1, 10, 5 ether);
        vm.prank(OPERATOR);
        rewards.fund(3, l, 5 ether);
        bytes32[] memory proof;
        vm.prank(ALICE);
        rewards.claim(3, NODE_A, ALICE, 1, 1, 10, 5 ether, proof);
        vm.prank(ALICE);
        vm.expectRevert(bytes("Claimed"));
        rewards.claim(3, NODE_A, ALICE, 1, 1, 10, 5 ether, proof);
    }

    function testWrongWalletAndReplayRejected() public {
        bytes32 l = leaf(4, NODE_A, ALICE, 1, 1, 10, 5 ether);
        vm.prank(OPERATOR);
        rewards.fund(4, l, 5 ether);
        bytes32[] memory proof;
        vm.prank(BOB);
        vm.expectRevert(bytes("Not wallet"));
        rewards.claim(4, NODE_A, ALICE, 1, 1, 10, 5 ether, proof);
        // Same leaf replayed on another epoch fails: leaf binds epochId.
        vm.prank(OPERATOR);
        rewards.fund(5, l, 5 ether);
        vm.prank(ALICE);
        vm.expectRevert(bytes("Bad proof"));
        rewards.claim(5, NODE_A, ALICE, 1, 1, 10, 5 ether, proof);
    }

    function testDoubleFundRejected() public {
        bytes32 l = leaf(6, NODE_A, ALICE, 1, 1, 10, 5 ether);
        vm.prank(OPERATOR);
        rewards.fund(6, l, 5 ether);
        vm.prank(OPERATOR);
        vm.expectRevert(bytes("Funded"));
        rewards.fund(6, l, 5 ether);
    }
}
