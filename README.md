# Noir Merkle Membership Proof

Prove your Ethereum address is in an allowlist without revealing which address you own.

## How It Works

```
Prover                                    Verifier
──────                                    ────────
1. Enter address (private)
2. Get merkle proof from API
3. Generate ZK proof in browser
4. Share proof ─────────────────────────▶ 5. Paste proof
                                          6. Verify on-chain
                                          7. Result: valid/invalid
```

The verifier learns nothing except "this person owns an address in the membership list".

### Privacy Model

This uses `UltraHonkBackend` with `keccakZK` + `BaseZKHonkVerifier`:

- **Zero-knowledge proofs** hide all private inputs (address, merkle path)
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
verifier_contract_factory/   # Noir circuit
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

### Public Endpoints

```
GET /proof/:address    # Merkle proof for address
GET /root              # Current merkle root
```

### Owner Endpoints

These endpoints require authentication via the `X-API-Key` header. Set the `OWNER_API_KEY` environment variable when starting the server.

```bash
# Start server with custom API key
OWNER_API_KEY=your-secret-key npm run api
```

#### Add Addresses

```bash
POST /addresses
```

Add new addresses to the merkle tree dynamically without rebuilding from CSV.

```bash
curl -X POST http://localhost:3001/addresses \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"addresses": ["0x1234567890abcdef1234567890abcdef12345678"]}'
```

**Response:**
```json
{
  "success": true,
  "inserted": 1,
  "newRoot": "0x...",
  "totalLeaves": 10001,
  "skippedDuplicates": 0
}
```

#### Get Stats

```bash
GET /stats
```

Returns tree statistics (owner-only).

```bash
curl http://localhost:3001/stats -H "X-API-Key: your-secret-key"
```

**Response:**
```json
{
  "root": "0x...",
  "leafCount": 10000,
  "maxLeaves": 2097152
}
```

## Circuit

**Private inputs:** address, siblings[21], indices[21]
**Public input:** root

Proves: "I know an address that hashes to a leaf in this merkle tree"

## Deployed Contracts

| Network | Contract | Address |
|---------|----------|---------|
| Sepolia | ZK HonkVerifier | [`0x3ad1a34ffd433c8c591B6F5fde690196E9C05c6B`](https://sepolia.etherscan.io/address/0x3ad1a34ffd433c8c591B6F5fde690196E9C05c6B#code) |

## Updating the Allowlist

1. Edit `addresses.csv`
2. Run `npm run build_tree`
3. Restart API

Note: Proofs generated with the old root will fail verification.
