// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@semaphore-protocol/contracts/interfaces/ISemaphoreVerifier.sol";

// 1. Interface for the Tree Manager
interface ITreeManager {
    function currentMerkleRoot() external view returns (uint256);
}

// 2. Interface for the Proposal Registry
interface IProposalRegistry {
    function recordEncryptedVote(uint256 proposalId, bytes calldata encryptedVote) external;
    function isProposalActive(uint256 proposalId) external view returns (bool);
}

contract AnonymousVoter {
    ISemaphoreVerifier public verifier;
    ITreeManager public treeManager;
    IProposalRegistry public proposalRegistry;

    // FIX: Scoped nullifiers per proposal
    mapping(uint256 => mapping(uint256 => bool)) public nullifierHashes;

    event VoteRelayed(uint256 indexed proposalId, uint256 nullifierHash);

    constructor(
        address _verifier,
        address _treeManager,
        address _proposalRegistry
    ) {
        verifier = ISemaphoreVerifier(_verifier);
        treeManager = ITreeManager(_treeManager);
        proposalRegistry = IProposalRegistry(_proposalRegistry);
    }

    // Semaphore V4 hashing utility
    function _hash(uint256 message) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(message))) >> 8;
    }

    // --- ENCRYPTED VOTING ENGINE ---

    function castVote(
        uint256 proposalId,
        uint256 nullifierHash,
        bytes calldata encryptedVote,
        uint256[8] calldata proof,
        uint256 merkleTreeDepth
    ) external {
        // 1. Ensure proposal is valid and active
        require(
            proposalRegistry.isProposalActive(proposalId),
            "Invalid or inactive proposal"
        );

        // 2. Prevent double voting per proposal
        require(
            !nullifierHashes[proposalId][nullifierHash],
            "Proof already used"
        );

        // 3. Get current Merkle root
        uint256 currentRoot = treeManager.currentMerkleRoot();

        // 4. Bind encrypted vote to proof
        uint256 signal = uint256(
            keccak256(abi.encodePacked(encryptedVote, proposalId))
        );

        // 5. Construct public signals
        uint256[4] memory pubSignals = [
            currentRoot,
            nullifierHash,
            _hash(signal),
            _hash(proposalId)
        ];

        // 6. Verify ZK proof
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

        // 7. Mark nullifier used
        nullifierHashes[proposalId][nullifierHash] = true;

        // 8. Forward encrypted vote
        proposalRegistry.recordEncryptedVote(proposalId, encryptedVote);

        emit VoteRelayed(proposalId, nullifierHash);
    }
}