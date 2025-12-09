# Noir Merkle Membership Proof

Privacy-preserving proof of address membership in an allowlist using Noir ZK circuits and on-chain verification.

## Overview

This project allows users to prove their Ethereum address is in a Merkle tree (allowlist) **without revealing which address** they own. The proof is verified on-chain via a Solidity verifier contract.

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Merkle Proof   │────▶│  Browser ZK      │────▶│  On-chain       │
│  API            │     │  Proof Gen       │     │  Verification   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Project Structure

```
noir-circuits/
├── client_checker/          # Noir circuit
│   ├── src/main.nr          # Merkle membership circuit (depth 21)
│   └── target/checker.json  # Compiled circuit artifact
│
├── client_checker_merkle/   # Merkle tree + API + UI
│   ├── src/
│   │   ├── build_tree.ts    # Build Merkle tree from CSV
│   │   └── api.ts           # Express API for Merkle proofs
│   ├── tree_state.json      # Persisted tree state
│   └── ui/                  # React frontend
│       └── src/
│           └── components/ProofGenerator.tsx
│
└── evm_deployer/            # Verifier contract deployment
    └── src/Verifier.sol     # HonkVerifier (deployed to Sepolia)
```

## Quick Start

### Prerequisites

- Node.js v18+
- [Nargo](https://noir-lang.org/docs/getting_started/installation/) (Noir compiler)
- Addresses CSV file at `client_checker_merkle/addresses.csv`

### 1. Build the Merkle Tree

```bash
cd client_checker_merkle
npm install
npm run build_tree
```

This reads `addresses.csv` and outputs `tree_state.json` with the Merkle root and all leaves.

### 2. Compile the Circuit (if needed)

```bash
cd client_checker
nargo compile
```

### 3. Start the API Server

```bash
cd client_checker_merkle
npm run api
```

Runs on http://localhost:3001

**Endpoints:**
- `GET /proof/:address` - Returns Merkle proof for an address
- `GET /root` - Returns current Merkle root

### 4. Start the UI

```bash
cd client_checker_merkle/ui
npm install
npm run dev
```

Opens at http://localhost:5173

## Usage Flow

1. **User enters address** (or connects wallet via MetaMask)
2. **UI fetches Merkle proof** from API (`/proof/:address`)
3. **Browser generates ZK proof** using `@noir-lang/noir_js` + `@aztec/bb.js`
4. **Proof verified on-chain** via `HonkVerifier.verify()` (view call, no gas)
5. **Result displayed**: Verified or Invalid

## Circuit Details

The Noir circuit ([client_checker/src/main.nr](client_checker/src/main.nr)) proves:

- **Private inputs**: `address`, `siblings[21]`, `indices[21]`
- **Public input**: `root`
- **Constraint**: Computed Merkle root from leaf matches public root

Tree depth is 21 (supports ~2M addresses).

## Deployed Contracts

| Network | Contract | Address |
|---------|----------|---------|
| Sepolia | HonkVerifier | `0x076f804c51785472c362Ab5fD7b3AFc1b6C1220D` |

## API Response Format

```json
GET /proof/0x1234...

{
  "siblings": ["0x...", "0x...", ...],  // 21 sibling hashes
  "indices": [0, 1, 0, ...],            // 21 path directions
  "root": "0x8a0deff11d4ec...",
  "leaf": "0x1234...",
  "index": 42
}
```

## Architecture Notes

**Privacy**: The user's address is never sent on-chain. Only the ZK proof (which proves "I know a valid leaf") and the public Merkle root are used.

**Upgrades**: To update the allowlist:
1. Modify `addresses.csv`
2. Run `npm run build_tree` to regenerate `tree_state.json`
3. Update the on-chain root (requires contract modification to store root)

## Development

```bash
# Type check
cd client_checker_merkle && npx tsc --noEmit
cd client_checker_merkle/ui && npx tsc --noEmit

# Run API with auto-reload
cd client_checker_merkle && npx tsx watch ./src/api.ts
```
