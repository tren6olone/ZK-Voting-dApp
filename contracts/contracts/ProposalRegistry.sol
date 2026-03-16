// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// We use OpenZeppelin to securely verify the server's cryptographic ticket
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract ProposalRegistry {
    using ECDSA for bytes32;

    // The public key of your Next.js API (used to verify the ticket, not to manage the contract)
    address public oracleSigner; 
    
    // The address of your future ZKVoting contract (the only thing allowed to change votes)
    address public votingContract; 

    struct Proposal {
        uint256 id;
        address creator;
        string title;
        string description;
        uint256 yesVotes;
        uint256 noVotes;
        bool isActive;
    }

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;

    event ProposalCreated(uint256 indexed id, address indexed creator, string title);
    event VotesUpdated(uint256 indexed id, uint256 yesVotes, uint256 noVotes);

    modifier onlyVotingContract() {
        require(msg.sender == votingContract, "Unauthorized: Only the ZK Voting contract can update votes");
        _;
    }

    // Set the oracle server when deploying
    constructor(address _oracleSigner) {
        oracleSigner = _oracleSigner;
    }

    // Connect this to your ZKVoting contract later
    function setVotingContract(address _votingContract) external {
        require(votingContract == address(0), "Voting contract already set permanently");
        votingContract = _votingContract;
    }

    // --- PROPOSAL CREATION (NO ADMIN REQUIRED) ---

    function createProposal(
        string calldata _title, 
        string calldata _description, 
        bytes calldata _serverTicket // The cryptographic proof from Next.js
    ) external {
        
        // 1. Recreate the exact hash the server signed (Title + Description + User's Wallet)
        bytes32 messageHash = keccak256(abi.encodePacked(msg.sender, _title, _description));
        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        
        // 2. Recover the address that signed the ticket
        address recoveredSigner = ECDSA.recover(ethSignedMessageHash, _serverTicket);
        
        // 3. Verify it matches the authorized Next.js API
        require(recoveredSigner == oracleSigner, "Invalid or forged authorization ticket");

        // 4. Create the Proposal
        proposalCount++;
        proposals[proposalCount] = Proposal({
            id: proposalCount,
            creator: msg.sender,
            title: _title,
            description: _description,
            yesVotes: 0,
            noVotes: 0,
            isActive: true
        });

        emit ProposalCreated(proposalCount, msg.sender, _title);
    }

    // --- VOTING (CALLED ONLY BY THE ZK CONTRACT) ---

    // The ZKVoting contract will call this AFTER it verifies the complex zk-SNARK proof
    function recordVote(uint256 proposalId, bool support) external onlyVotingContract {
        require(proposalId > 0 && proposalId <= proposalCount, "Proposal does not exist");
        require(proposals[proposalId].isActive, "Voting is closed for this proposal");
        
        if (support) {
            proposals[proposalId].yesVotes++;
        } else {
            proposals[proposalId].noVotes++;
        }
        
        emit VotesUpdated(proposalId, proposals[proposalId].yesVotes, proposals[proposalId].noVotes);
    }
}