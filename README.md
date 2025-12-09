# Noir Merkle Membership Proof

Prove your Ethereum address is in an allowlist without revealing which address you own.

## How It Works

```
Prover                                    Verifier
──────                                    ────────
1. Enter address (private)
2. Get merkle proof from API
3. Generate ZK proof in browser
4. Share proof ──────────────────────────▶ 5. Paste proof
                                          6. Verify on-chain
                                          7. Result: valid/invalid
```

The verifier learns nothing except "this person owns an address in the allowlist".

### Privacy Model

This uses `UltraHonkBackend` + `BaseHonkVerifier`:

- Your address is a **private circuit input** (never included in the proof)
- The verifier only sees: proof bytes + merkle root

## Quick Start

```bash
# 1. Build merkle tree from addresses.csv
cd client_checker_merkle
npm install
npm run build_tree

# 2. Start API server (localhost:3001)
npm run api

# 3. Start UI (localhost:5173)
cd ui
npm install
npm run dev
```

## Project Structure

```
client_checker/              # Noir circuit
├── src/main.nr              # Merkle membership proof (depth 21)
└── target/
    ├── checker.json         # Compiled circuit
    └── Verifier.sol         # Solidity verifier (BaseZKHonkVerifier)

client_checker_merkle/       # Backend + Frontend
├── addresses.csv            # Allowlist (one address per line)
├── tree_state.json          # Generated merkle tree
├── src/
│   ├── build_tree.ts        # CSV → merkle tree
│   └── api.ts               # Express API
└── ui/                      # React app
```

## API

```
GET /proof/:address    # Merkle proof for address
GET /root              # Current merkle root
```

## Circuit

**Private inputs:** address, siblings[21], indices[21]
**Public input:** root

Proves: "I know an address that hashes to a leaf in this merkle tree"

## Deployed Contracts

| Network | Address |
|---------|---------|
| Sepolia | [`0xBBf5C392029E8e7651b0eFD5C2B36B7e01072583`](https://sepolia.blockscout.com/address/0xBBf5C392029E8e7651b0eFD5C2B36B7e01072583) |

## Updating the Allowlist

1. Edit `addresses.csv`
2. Run `npm run build_tree`
3. Restart API

Note: Proofs generated with the old root will fail verification.
