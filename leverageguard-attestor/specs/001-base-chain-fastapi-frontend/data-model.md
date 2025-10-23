# Data Model for Base Network On-chain Logic, FastAPI Verification, Frontend & Payout

## Entities

### Transaction Data
- **Description**: Raw data related to user transactions.
- **Attributes**: 
    - `transactionId`: Unique identifier for the transaction.
    - `userId`: Identifier for the user initiating the transaction.
    - `details`: JSON object containing transaction specifics (e.g., amount, type, timestamp).
    - `hash`: Cryptographic hash of the transaction data.

### Evidence
- **Description**: Supporting information for transactions.
- **Attributes**: 
    - `evidenceId`: Unique identifier for the evidence.
    - `transactionId`: Reference to the associated transaction.
    - `type`: Type of evidence (e.g., API response, log entry).
    - `content`: JSON object containing the evidence details.
    - `hash`: Cryptographic hash of the evidence content.

### Merkle Root
- **Description**: Cryptographic hash representing a set of hashed transaction data and evidence.
- **Attributes**: 
    - `merkleRootId`: Unique identifier for the Merkle root.
    - `rootHash`: The computed Merkle root hash.
    - `blockNumber`: The block number on the Base network where the Merkle root was recorded.
    - `timestamp`: Timestamp of when the Merkle root was recorded.
    - `transactionHashes`: Array of hashes of transactions included in this Merkle tree.
    - `evidenceHashes`: Array of hashes of evidence included in this Merkle tree.
