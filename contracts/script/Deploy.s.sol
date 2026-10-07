// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "../src/MeshRegistry.sol";
import "../src/EpochLedger.sol";
import "../src/MeshToken.sol";
import "../src/MeshRewards.sol";

/// @notice forge script — deploys the full RelayMesh set to BOT testnet (chain 968).
/// Usage: forge script script/Deploy.s.sol --rpc-url $BOT_RPC_URL --broadcast
/// First deploy (registry+ledger) must stay at their existing addresses — this
/// script now ALSO deploys token+rewards. To avoid redeploying registry/ledger,
/// run DeployRewards below for follow-up deployments.
interface DeployVm {
    function envUint(string calldata) external view returns (uint256);
    function startBroadcast(uint256) external;
    function stopBroadcast() external;
}

contract Deploy {
    DeployVm constant vm = DeployVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (MeshRegistry, EpochLedger, MeshToken, MeshRewards) {
        uint256 key = vm.envUint("OPERATOR_PRIVATE_KEY");
        vm.startBroadcast(key);
        MeshRegistry registry = new MeshRegistry();
        EpochLedger ledger = new EpochLedger();
        MeshToken token = new MeshToken(1_000_000 ether);
        MeshRewards rewards = new MeshRewards(address(token));
        vm.stopBroadcast();
        return (registry, ledger, token, rewards);
    }
}

/// @notice Follow-up: deploy ONLY token+rewards (registry+ledger already live).
contract DeployRewards {
    DeployVm constant vm = DeployVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (MeshToken, MeshRewards) {
        uint256 key = vm.envUint("OPERATOR_PRIVATE_KEY");
        vm.startBroadcast(key);
        MeshToken token = new MeshToken(1_000_000 ether);
        MeshRewards rewards = new MeshRewards(address(token));
        vm.stopBroadcast();
        return (token, rewards);
    }
}
