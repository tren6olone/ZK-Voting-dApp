// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract ZKVoting is EIP712 {
    using ECDSA for bytes32;

    // --- STATE VARIABLES ---
    mapping(address => bool) public isManager;
    uint256 public totalManagers;

    uint256 public currentMerkleRoot;
    
    uint256 public nonce;

    // --- TYPEHASHES (with deadline) ---
    bytes32 public constant ADD_MANAGER_TYPEHASH =
        keccak256("AddManager(address newManager,uint256 nonce,uint256 deadline)");

    bytes32 public constant REMOVE_MANAGER_TYPEHASH =
        keccak256("RemoveManager(address manager,uint256 nonce,uint256 deadline)");

    bytes32 public constant UPDATE_ROOT_TYPEHASH =
        keccak256("UpdateRoot(uint256 newRoot,uint256 nonce,uint256 deadline)");

    // --- EVENTS ---
    event ManagerAdded(address indexed manager);
    event ManagerRemoved(address indexed manager);
    event MerkleRootUpdated(uint256 oldRoot, uint256 newRoot);

    // --- MODIFIER ---
    modifier onlyManager() {
        require(isManager[msg.sender], "Not an authorized manager");
        _;
    }

    // --- CONSTRUCTOR ---
    constructor() EIP712("ZKVoting", "1") {
        isManager[msg.sender] = true;
        totalManagers = 1;
        emit ManagerAdded(msg.sender);
    }

    // --- CORE MULTISIG VERIFIER ---
    function _verifyUnanimousConsent(
        bytes32 digest,
        bytes[] calldata signatures
    ) internal view {
        require(
            signatures.length == totalManagers,
            "All managers must approve"
        );

        address lastSigner = address(0);

        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = digest.recover(signatures[i]);

            require(isManager[signer], "Unauthorized signer");

            require(
                uint160(signer) > uint160(lastSigner),
                "Signatures not unique/sorted"
            );

            lastSigner = signer;
        }
    }

    // --- MANAGER ACTIONS ---

    function addManager(
        address newManager,
        uint256 deadline,
        bytes[] calldata signatures
    ) external onlyManager {
        require(!isManager[newManager], "Already manager");
        require(block.timestamp <= deadline, "Signature expired");

        bytes32 structHash = keccak256(
            abi.encode(
                ADD_MANAGER_TYPEHASH,
                newManager,
                nonce,
                deadline
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);

        _verifyUnanimousConsent(digest, signatures);

        isManager[newManager] = true;
        totalManagers++;
        nonce++;

        emit ManagerAdded(newManager);
    }

    function removeManager(
        address manager,
        uint256 deadline,
        bytes[] calldata signatures
    ) external onlyManager {
        require(isManager[manager], "Not a manager");
        require(totalManagers > 1, "Cannot remove last manager");
        require(block.timestamp <= deadline, "Signature expired");

        bytes32 structHash = keccak256(
            abi.encode(
                REMOVE_MANAGER_TYPEHASH,
                manager,
                nonce,
                deadline
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);

        _verifyUnanimousConsent(digest, signatures);
        
        isManager[manager] = false;
        totalManagers--;
        nonce++;

        emit ManagerRemoved(manager);
    }

    // --- MERKLE ROOT UPDATE ---

    function updateMerkleRoot(
        uint256 newRoot,
        uint256 deadline,
        bytes[] calldata signatures
    ) external onlyManager {
        require(block.timestamp <= deadline, "Signature expired");

        bytes32 structHash = keccak256(
            abi.encode(
                UPDATE_ROOT_TYPEHASH,
                newRoot,
                nonce,
                deadline
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);

        _verifyUnanimousConsent(digest, signatures);

        uint256 oldRoot = currentMerkleRoot;
        currentMerkleRoot = newRoot;
        nonce++;

        emit MerkleRootUpdated(oldRoot, newRoot);
    }
}