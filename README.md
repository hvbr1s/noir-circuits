# Noir Merkle Membership Proof with ECDSA Verification

Prove your EVM address is in an allowlist without revealing which address you own — using ECDSA signature verification.

## How It Works

```
Prover                                    Verifier
──────                                    ────────
1. Connect wallet
2. Sign timestamped challenge
3. Get merkle proof from API
4. Generate ZK proof in browser
5. Share proof + hashed message ────────▶ 6. Paste combined string
                                          7. Verify on-chain
                                          8. Result: valid/invalid + recovered address
```

The verifier learns nothing except "this person owns an address in the membership list" and sees the recovered address from the signature.

### Privacy Model

This uses `UltraHonkBackend` with `keccakZK` + `BaseZKHonkVerifier`:

- **Zero-knowledge proofs** hide all private inputs (public key, signature, merkle path)
- The circuit recovers the address from the signature inside the proof
- The verifier only sees: proof bytes + hashed message + merkle root

### ECDSA Signature Flow

1. Prover signs a timestamped challenge: `"Prove Fordefi membership: {timestamp}"`
2. The circuit uses `ecrecover` to recover the address from:
   - Public key (x, y coordinates)
   - Signature (r, s)
   - Hashed message
3. The recovered address is verified against the merkle tree
4. The address is returned as a public output

## Quick Start

```bash
# 1. Start API server (localhost:3001)
cd client_checker_api
npm install
npm run api

# 2. Start UI (localhost:5173)
cd client_checker_ui
npm install
npm run start
```

## Project Structure

```
verifier_contract_factory/   # Noir circuit
├── src/main.nr              # ECDSA + Merkle membership proof (depth 21)
├── Nargo.toml               # Dependencies (ecrecover, poseidon)
└── target/
    ├── checker.json         # Compiled circuit
    ├── vk                   # Verification key
    └── Verifier.sol         # Solidity verifier (ZK Honk)

client_checker_api/          # Backend API
├── src/api.ts               # Express server (merkle proofs)
└── data/
    ├── addresses.csv        # Allowlist
    └── tree_state.json      # Merkle tree state

client_checker_ui/           # React frontend
├── src/
│   ├── components/
│   │   ├── ProofGenerator.tsx   # Wallet connect + sign + prove
│   │   └── ProofVerifier.tsx    # Verify on-chain
│   └── config/
│       ├── wagmi.ts             # Wallet config (Ethereum mainnet)
│       └── verifier.ts          # Contract address + ABI
└── public/
    └── checker.json             # Circuit (copied from target/)
```

## Circuit

**Private inputs:**
- `pub_key_x: [u8; 32]` - Public key X coordinate
- `pub_key_y: [u8; 32]` - Public key Y coordinate
- `signature: [u8; 64]` - ECDSA signature (r || s)
- `siblings: [Field; 21]` - Merkle proof path
- `indices: [Field; 21]` - Merkle proof indices

**Public inputs:**
- `hashed_message: [u8; 32]` - Keccak hash of signed message
- `root: Field` - Merkle tree root

**Public output:**
- `address: Field` - Recovered Ethereum address

Proves: "I signed this message with a private key whose address is in the merkle tree"

## API

### Public Endpoints

```
GET /proof/:address    # Merkle proof for address
GET /root              # Current merkle root
```

### Owner Endpoints

Require `X-API-Key` header (set via `OWNER_API_KEY` env var).

```bash
# Add addresses
POST /addresses
curl -X POST http://localhost:3001/addresses \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"addresses": ["0x..."]}'

# Get stats
GET /stats
curl http://localhost:3001/stats -H "X-API-Key: your-secret-key"
```

## Deployed Contracts

| Network  | Contract                         | Address |
|----------|----------------------------------|---------|
| Sepolia  | ZK HonkVerifier (ECDSA + Merkle) | [`0x2701541D93Cb39E280b77ff3B155C301a0F40fAB`](https://sepolia.etherscan.io/address/0x2701541D93Cb39E280b77ff3B155C301a0F40fAB#code) |
| Ethereum | ZK HonkVerifier (ECDSA only)     | [`0x26ea6615d4Cfe23E932BDfB3304C4E8d1afB71F3`](https://etherscan.io/address/0x26ea6615d4Cfe23E932BDfB3304C4E8d1afB71F3#code) |

## Building the Circuit

```bash
cd verifier_contract_factory

# Compile circuit
nargo compile

# Generate verification key and Solidity verifier
bb write_vk -b ./target/checker.json -o ./target --oracle_hash keccak
bb write_solidity_verifier -k ./target/vk -o ./target/Verifier.sol

# Copy circuit to UI
cp target/checker.json ../client_checker_ui/public/
```

## Updating the Membership List

### Dynamic (Recommended)

```bash
curl -X POST http://localhost:3001/addresses \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"addresses": ["0x..."]}'
```

### From CSV (Full Rebuild)

1. Edit `client_checker_api/data/addresses.csv`
2. Run `npm run build_tree`
3. Restart API

Note: Proofs generated with the old root will fail verification.

## Troubleshooting

### Clearing Vite Cache

If you encounter issues with the UI after updating the circuit, clear the Vite cache:

```bash
cd client_checker_ui

# Remove Vite cache and node_modules cache
rm -rf node_modules/.vite

# Or for a full clean
rm -rf node_modules/.vite dist
```

Then restart the dev server with `npm run start`.
