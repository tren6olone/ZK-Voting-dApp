// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract ProposalRegistry {
    using ECDSA for bytes32;

    address public oracleSigner; 
    address public votingContract; 

    struct Proposal {
        uint256 id;
        address creator;
        bytes32 contentHash; 
        uint256 yesVotes;    
        uint256 noVotes;
        uint256 abstainVotes;
        uint256 endTime;
        bool isTallied;
        bytes32 ballotsHash; 
    }

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;

    // Prevent replay of server tickets
    mapping(bytes32 => bool) public usedTickets;

    event ProposalCreated(uint256 indexed id, address indexed creator, bytes32 contentHash, uint256 endTime);
    event EncryptedVoteRecorded(uint256 indexed id, bytes encryptedVote);
    event TallyFinalized(uint256 indexed id, uint256 yesVotes, uint256 noVotes, uint256 abstainVotes, bool quorumMet);

    modifier onlyVotingContract() {
        require(msg.sender == votingContract, "Unauthorized: Only voting contract");
        _;
    }

    constructor(address _oracleSigner) {
        oracleSigner = _oracleSigner;
    }

    function setVotingContract(address _votingContract) external {
        require(msg.sender == oracleSigner, "Only oracle");
        require(votingContract == address(0), "Already set");
        votingContract = _votingContract;
    }

    // --- 1. PROPOSAL CREATION (3-Day FIXED WINDOW) ---

    function createProposal(
        bytes32 _contentHash, 
        bytes calldata _serverTicket 
    ) external {
        bytes32 messageHash = keccak256(
            abi.encodePacked(msg.sender, _contentHash)
        );

        require(!usedTickets[messageHash], "Ticket already used");
        usedTickets[messageHash] = true;

        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        address recoveredSigner = ECDSA.recover(ethSignedMessageHash, _serverTicket);

        require(recoveredSigner == oracleSigner, "Invalid ticket");

        proposalCount++;

        uint256 deadline = block.timestamp + 3 days;

        proposals[proposalCount] = Proposal({
            id: proposalCount,
            creator: msg.sender,
            contentHash: _contentHash,
            yesVotes: 0,
            noVotes: 0,
            abstainVotes: 0,
            endTime: deadline,
            isTallied: false,
            ballotsHash: bytes32(0)
        });

        emit ProposalCreated(proposalCount, msg.sender, _contentHash, deadline);
    }

    // --- 2. ENCRYPTED VOTING ---

    function recordEncryptedVote(
        uint256 proposalId, 
        bytes calldata encryptedVote
    ) external onlyVotingContract {
        require(proposalId > 0 && proposalId <= proposalCount, "Invalid proposal");

        Proposal storage p = proposals[proposalId];

        require(block.timestamp <= p.endTime, "Voting ended");
        require(!p.isTallied, "Already tallied");

        // Stronger hash binding
        p.ballotsHash = keccak256(
            abi.encode(p.ballotsHash, encryptedVote, proposalId)
        );

        emit EncryptedVoteRecorded(proposalId, encryptedVote);
    }

    // --- 3. FINALIZE TALLY + QUORUM ---

    function finalizeTally(
        uint256 proposalId, 
        uint256 _yesVotes, 
        uint256 _noVotes, 
        uint256 _abstainVotes,
        uint256 _totalEligibleVoters,
        bytes32 _finalBallotsHash
    ) external {
        require(msg.sender == oracleSigner, "Only oracle");
        require(proposalId > 0 && proposalId <= proposalCount, "Invalid proposal");

        Proposal storage p = proposals[proposalId];

        // 1. Calculate the total votes cast
        uint256 totalVotesCast = _yesVotes + _noVotes + _abstainVotes;

        // 2. THE FIX: Allow early tally if 100% of eligible voters have cast their votes
        require(block.timestamp > p.endTime || totalVotesCast >= _totalEligibleVoters, "Voting still active");
        require(!p.isTallied, "Already finalized");

        require(p.ballotsHash == _finalBallotsHash, "Ballot hash mismatch");

        p.isTallied = true;
        p.yesVotes = _yesVotes;
        p.noVotes = _noVotes;
        p.abstainVotes = _abstainVotes;

        bool quorumMet = false;

        if (_totalEligibleVoters > 0) {
            uint256 participationRate = (totalVotesCast * 100) / _totalEligibleVoters;
            if (participationRate >= 70) {
                quorumMet = true;
            }
        }

        emit TallyFinalized(
            proposalId,
            _yesVotes,
            _noVotes,
            _abstainVotes,
            quorumMet
        );
    }

    function isProposalActive(uint256 proposalId) external view returns (bool) {
        if (proposalId == 0 || proposalId > proposalCount) return false;
        Proposal storage p = proposals[proposalId];
        // Active IF the 3-day timer hasn't expired AND it hasn't been tallied yet
        return (block.timestamp <= p.endTime) && (!p.isTallied);
    }
}