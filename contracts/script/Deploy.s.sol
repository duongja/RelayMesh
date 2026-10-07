// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "../src/MeshRegistry.sol";
import "../src/EpochLedger.sol";

/// @notice forge script — deploys both contracts to BOT testnet (chain 968) only.
/// Usage: forge script script/Deploy.s.sol --rpc-url $BOT_RPC_URL --broadcast
interface DeployVm {
    function envUint(string calldata) external view returns (uint256);
    function startBroadcast(uint256) external;
    function stopBroadcast() external;
}

contract Deploy {
    DeployVm constant vm = DeployVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (MeshRegistry, EpochLedger) {
        uint256 key = vm.envUint("OPERATOR_PRIVATE_KEY");
        vm.startBroadcast(key);
        MeshRegistry registry = new MeshRegistry();
        EpochLedger ledger = new EpochLedger();
        vm.stopBroadcast();
        return (registry, ledger);
    }
}
