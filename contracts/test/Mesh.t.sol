// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "../src/MeshRegistry.sol";
import "../src/EpochLedger.sol";

interface Vm { function prank(address) external; function expectRevert(bytes calldata) external; }

contract MeshTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MeshRegistry registry;
    EpochLedger ledger;
    bytes32 constant NODE = keccak256("node-1");

    function setUp() public {
        registry = new MeshRegistry();
        ledger = new EpochLedger();
        registry.register(NODE, address(this));
    }
    function testEligibilityToggle() public {
        registry.setEligible(NODE, false);
        require(!registry.eligible(NODE), "should be ineligible");
    }
    function testOnlyOperator() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(bytes("Only operator"));
        registry.setEligible(NODE, false);
    }
    function testCloseEpochOnce() public {
        ledger.closeEpoch(1, keccak256("root"), keccak256("evidence"));
        require(ledger.closed(1), "not closed");
    }
    function testDoubleRegisterRejected() public {
        vm.expectRevert(bytes("Exists"));
        registry.register(NODE, address(this));
    }
    function testDoubleCloseRejected() public {
        ledger.closeEpoch(2, keccak256("root"), keccak256("evidence"));
        vm.expectRevert(bytes("Closed"));
        ledger.closeEpoch(2, keccak256("root"), keccak256("evidence"));
    }
    function testZeroHashRejected() public {
        vm.expectRevert(bytes("Bad input"));
        ledger.closeEpoch(3, bytes32(0), keccak256("evidence"));
        vm.expectRevert(bytes("Bad input"));
        ledger.closeEpoch(3, keccak256("root"), bytes32(0));
    }
}
