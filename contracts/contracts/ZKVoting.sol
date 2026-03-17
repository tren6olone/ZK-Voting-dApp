// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ZKVoting {
    // 1. The On-Chain Roster of Managers
    mapping(address => bool) public isManager;
    
    // 2. The Current Official Merkle Root
    uint256 public currentMerkleRoot;

    // Events so the frontend can listen for changes
    event ManagerAdded(address indexed manager);
    event ManagerRemoved(address indexed manager);
    event MerkleRootUpdated(uint256 oldRoot, uint256 newRoot);

    // Modifier to restrict access to managers only
    modifier onlyManager() {
        require(isManager[msg.sender], "Not an authorized manager");
        _;
    }

    // When you deploy this, your wallet becomes the first Master Manager
    constructor() {
        isManager[msg.sender] = true;
        emit ManagerAdded(msg.sender);
    }

    // --- MANAGER CONTROL ---
    
    function addManager(address newManager) external onlyManager {
        require(!isManager[newManager], "Already a manager");
        isManager[newManager] = true;
        emit ManagerAdded(newManager);
    }

    function removeManager(address manager) external onlyManager {
        require(manager != msg.sender, "Cannot remove yourself"); 
        isManager[manager] = false;
        emit ManagerRemoved(manager);
    }

    // --- MERKLE TREE UPDATES ---

    // Your Next.js backend will call this after doing the multi-sig math
    function updateMerkleRoot(uint256 newRoot) external onlyManager {
        uint256 oldRoot = currentMerkleRoot;
        currentMerkleRoot = newRoot;
        emit MerkleRootUpdated(oldRoot, newRoot);
    }

    // (We will add the actual ZK vote verification logic here in Phase 3)
}