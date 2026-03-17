// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@semaphore-protocol/contracts/interfaces/ISemaphoreVerifier.sol";

interface ITreeManager {
    function currentMerkleRoot() external view returns (uint256);
}

interface IProposalRegistry {
    function recordVote(uint256 proposalId, bool support) external;
}

contract AnonymousVoter {
    ISemaphoreVerifier public verifier;
    ITreeManager public treeManager;
    IProposalRegistry public proposalRegistry;

    mapping(uint256 => bool) public nullifierHashes;

    event VoteCast(uint256 indexed proposalId, bool support);

    constructor(
        address _verifier,
        address _treeManager,
        address _proposalRegistry
    ) {
        verifier = ISemaphoreVerifier(_verifier);
        treeManager = ITreeManager(_treeManager);
        proposalRegistry = IProposalRegistry(_proposalRegistry);
    }

    // Semaphore V4 hashes the message and scope to fit into the SNARK scalar field
    function _hash(uint256 message) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(message))) >> 8;
    }

    function castVote(
            bool support,
            uint256 proposalId,
            uint256 nullifierHash,
            uint256[8] calldata proof,
            uint256 merkleTreeDepth
        ) external {
            // The contract doesn't check msg.sender! 
            // It only checks if the ZK Proof is mathematically tied to the Merkle Root.
            
            require(!nullifierHashes[nullifierHash], "Proof already used");
    
            uint256 currentRoot = treeManager.currentMerkleRoot();
            
            uint256[4] memory pubSignals = [
                currentRoot,
                nullifierHash,
                _hash(support ? 1 : 0), 
                _hash(proposalId)
            ];
    
            require(
                verifier.verifyProof(
                    [proof[0], proof[1]], 
                    [[proof[2], proof[3]], [proof[4], proof[5]]], 
                    [proof[6], proof[7]], 
                    pubSignals, 
                    merkleTreeDepth
                ), 
                "Invalid ZK Proof"
            );
    
            nullifierHashes[nullifierHash] = true;
            proposalRegistry.recordVote(proposalId, support);
        }
}