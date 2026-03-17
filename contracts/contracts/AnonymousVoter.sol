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
        require(!nullifierHashes[nullifierHash], "Zero-Knowledge Proof used: You have already voted on this proposal.");

        uint256 currentRoot = treeManager.currentMerkleRoot();
        require(currentRoot > 0, "Merkle tree is empty");

        uint256 message = support ? 1 : 0;
        uint256 scope = proposalId;
        
        // 1. Unpack the proof points for the Groth16 Verifier
        uint256[2] memory pA = [proof[0], proof[1]];
        uint256[2][2] memory pB = [[proof[2], proof[3]], [proof[4], proof[5]]];
        uint256[2] memory pC = [proof[6], proof[7]];

        // 2. Format the Public Signals exactly as the V4 circuit expects them
        uint256[4] memory pubSignals = [
            currentRoot,
            nullifierHash,
            _hash(message), 
            _hash(scope)
        ];

        // 3. Verify the mathematical proof! 
        // Signature: verifyProof(pA, pB, pC, pubSignals, merkleTreeDepth)
        require(verifier.verifyProof(pA, pB, pC, pubSignals, merkleTreeDepth), "Invalid Zero-Knowledge Proof");

        nullifierHashes[nullifierHash] = true;
        proposalRegistry.recordVote(proposalId, support);

        emit VoteCast(proposalId, support);
    }
}