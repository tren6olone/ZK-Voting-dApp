// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract ZKVoting {
    using ECDSA for bytes32;

    mapping(address => bool) public isManager;
    uint256 public totalManagers;
    uint256 public threshold; // NEW: Dynamic majority threshold
    
    uint256 public currentMerkleRoot;
    uint256 public nonce;

    bytes32 private constant UPDATE_ROOT_TYPEHASH = keccak256("UpdateRoot(uint256 newRoot,uint256 nonce,uint256 deadline)");
    bytes32 private constant ADD_MANAGER_TYPEHASH = keccak256("AddManager(address newManager,uint256 nonce,uint256 deadline)");
    bytes32 private constant REMOVE_MANAGER_TYPEHASH = keccak256("RemoveManager(address manager,uint256 nonce,uint256 deadline)");

    bytes32 public DOMAIN_SEPARATOR;

    event ManagerAdded(address indexed manager);
    event ManagerRemoved(address indexed manager);
    event RootUpdated(uint256 newRoot);

    constructor(address[] memory initialManagers) {
        require(initialManagers.length > 0, "At least one manager required");
        for (uint i = 0; i < initialManagers.length; i++) {
            require(initialManagers[i] != address(0), "Invalid manager address");
            if (!isManager[initialManagers[i]]) {
                isManager[initialManagers[i]] = true;
                totalManagers++;
                emit ManagerAdded(initialManagers[i]);
            }
        }
        
        // Initial Threshold Setup
        _updateThreshold();

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("ZKVoting"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    // INTERNAL: Auto-adjust threshold logic
    function _updateThreshold() internal {
        // Simple Majority: (N/2) + 1
        threshold = (totalManagers / 2) + 1;
    }

    // --- GOVERNANCE FUNCTIONS ---

    function addManager(address newManager, uint256 deadline, bytes[] calldata signatures) external {
        require(newManager != address(0), "Cannot add zero address");
        require(!isManager[newManager], "Already manager");
        
        bytes32 structHash = keccak256(abi.encode(ADD_MANAGER_TYPEHASH, newManager, nonce, deadline));
        _verifyConsensus(structHash, deadline, signatures);

        isManager[newManager] = true;
        totalManagers++;
        _updateThreshold(); // Update threshold after adding
        nonce++;
        emit ManagerAdded(newManager);
    }

    function removeManager(address manager, uint256 deadline, bytes[] calldata signatures) external {
        require(isManager[manager], "Not a manager");
        require(totalManagers > 1, "Cannot remove last manager");

        bytes32 structHash = keccak256(abi.encode(REMOVE_MANAGER_TYPEHASH, manager, nonce, deadline));
        _verifyConsensus(structHash, deadline, signatures);

        isManager[manager] = false;
        totalManagers--;
        _updateThreshold(); // Update threshold after removing
        nonce++;
        emit ManagerRemoved(manager);
    }

    function updateMerkleRoot(uint256 newRoot, uint256 deadline, bytes[] calldata signatures) external {
        require(newRoot != currentMerkleRoot, "Root unchanged"); // Gas optimization & Logic check
        
        bytes32 structHash = keccak256(abi.encode(UPDATE_ROOT_TYPEHASH, newRoot, nonce, deadline));
        _verifyConsensus(structHash, deadline, signatures);

        currentMerkleRoot = newRoot;
        nonce++;
        emit RootUpdated(newRoot);
    }

    // --- HELPER: CONSENSUS VERIFICATION ---

    function _verifyConsensus(bytes32 structHash, uint256 deadline, bytes[] calldata signatures) internal view {
        require(block.timestamp <= deadline, "Signature expired");
        require(signatures.length >= threshold, "Insufficient signatures"); // DEADLOCK
        require(signatures.length <= totalManagers, "Too many signatures");

        bytes32 digest = MessageHashUtils.toTypedDataHash(DOMAIN_SEPARATOR, structHash);
        address lastSigner = address(0);

        for (uint i = 0; i < signatures.length; i++) {
            require(signatures[i].length == 65, "Invalid signature");
            address signer = digest.recover(signatures[i]);
            require(isManager[signer], "Unauthorized signer");
            require(signer > lastSigner, "Duplicate or unsorted signatures"); // Essential for safety
            lastSigner = signer;
        }
    }
}