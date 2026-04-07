import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import EthCrypto from "eth-crypto";
import { keccak256, Signer } from "ethers";
import { VoteType, ZKProofData } from "../types";
import { JsonRpcSigner } from "ethers";

// This is the public key derived from your oracle private key. 
// It is safe to be public.
// FIXED: Added the '04' prefix required for uncompressed secp256k1 public keys
const ORACLE_PUBLIC_KEY = "049908687ecbc598db593fc35d4d3914c142934f6b54cf5d17ebd750f515ae3fefeea8458afb2a45325a62556e32bdb1b1601e3f7461ef458bf7ec14fab953e04e";

export const generateZKVoteProof = async (
  signer: JsonRpcSigner,
  proposalId: number,
  voteType: 'YES' | 'NO' | 'ABSTAIN'
) => {
  const signature = await signer.signMessage(
    "Associating this social account to this Web3 wallet."
  );

  const identity = new Identity(signature);

  // 2. Group Fetching
  const groupRes = await fetch('/api/get-group');
  const { commitments } = await groupRes.json();
  const group = new Group(commitments.map((c: string) => BigInt(c)));

  // 3. Vote Encryption
  const encryptedObject = await EthCrypto.encryptWithPublicKey(ORACLE_PUBLIC_KEY, voteType);
  const encryptedVoteHex = EthCrypto.cipher.stringify(encryptedObject);
  const formattedEncryptedVote = encryptedVoteHex.startsWith('0x') ? encryptedVoteHex : `0x${encryptedVoteHex}`;

  // 4. Signal and Proof
  const signalHash = BigInt(keccak256(formattedEncryptedVote));
  const fullProof = await generateProof(identity, group, signalHash, BigInt(proposalId));

  return {
      nullifierHash: fullProof.nullifier.toString(),
      encryptedVote: formattedEncryptedVote,
      proof: JSON.stringify(fullProof.points), 
      merkleTreeDepth: fullProof.merkleTreeDepth
    };
};