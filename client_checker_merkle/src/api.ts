import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import { buildPoseidonOpt } from 'circomlibjs';

const TREE_DEPTH = 21;

interface TreeState {
  root: string;
  nextIndex: number;
  zeroHashes: string[];
  filledSubtrees: string[];
  leaves: [number, string][];
}

interface ProofData {
  siblings: string[];
  indices: number[];
  root: string;
  leaf: string;
  index: number;
}

class MerkleTreeWithProofs {
  private poseidon: any;
  private zeroHashes: bigint[] = [];
  private root: bigint = 0n;
  private proofsByAddress: Map<string, ProofData> = new Map();

  async init(statePath: string) {
    console.log('Initializing Poseidon...');
    this.poseidon = await buildPoseidonOpt();

    console.log('Loading tree state...');
    const state: TreeState = JSON.parse(fs.readFileSync(statePath, 'utf8'));

    this.root = BigInt(state.root);
    this.zeroHashes = state.zeroHashes.map(h => BigInt(h));

    // Build all nodes level by level (bottom-up)
    console.log(`Building tree with ${state.leaves.length} leaves...`);
    const startTime = Date.now();

    // Level 0: leaves
    const nodesByLevel: Map<number, bigint>[] = [];
    nodesByLevel[0] = new Map();
    for (const [index, leafHex] of state.leaves) {
      nodesByLevel[0].set(index, BigInt(leafHex));
    }

    // Build levels 1 to TREE_DEPTH
    for (let level = 1; level <= TREE_DEPTH; level++) {
      nodesByLevel[level] = new Map();
      const prevLevel = nodesByLevel[level - 1]!;

      // Find all parent indices that have at least one non-zero child
      const parentIndices = new Set<number>();
      for (const childIndex of prevLevel.keys()) {
        parentIndices.add(Math.floor(childIndex / 2));
      }

      for (const parentIndex of parentIndices) {
        const leftIndex = parentIndex * 2;
        const rightIndex = parentIndex * 2 + 1;
        const left = prevLevel.get(leftIndex) ?? 0n;
        const right = prevLevel.get(rightIndex) ?? 0n;

        let nodeValue: bigint;
        if (left === 0n && right === 0n) {
          nodeValue = this.zeroHashes[level]!;
        } else if (left === 0n) {
          nodeValue = this.hash(this.zeroHashes[level - 1]!, right);
        } else if (right === 0n) {
          nodeValue = this.hash(left, this.zeroHashes[level - 1]!);
        } else {
          nodeValue = this.hash(left, right);
        }
        nodesByLevel[level]!.set(parentIndex, nodeValue);
      }
    }

    console.log(`Tree built in ${Date.now() - startTime}ms`);

    // Pre-compute proofs for all addresses
    console.log('Pre-computing proofs...');
    const proofStart = Date.now();

    for (const [leafIndex, leafHex] of state.leaves) {
      const siblings: bigint[] = [];
      const indices: number[] = [];
      let currentIndex = leafIndex;

      for (let level = 0; level < TREE_DEPTH; level++) {
        const isRight = currentIndex % 2;
        const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

        // Get sibling from precomputed nodes, or use zero hash
        const sibling = nodesByLevel[level]!.get(siblingIndex) ?? this.zeroHashes[level]!;
        siblings.push(sibling);
        indices.push(isRight ? 1 : 0);

        currentIndex = Math.floor(currentIndex / 2);
      }

      // Store proof keyed by address (lowercase hex)
      const addressHex = '0x' + BigInt(leafHex).toString(16).padStart(40, '0');
      this.proofsByAddress.set(addressHex.toLowerCase(), {
        siblings: siblings.map(s => '0x' + s.toString(16)),
        indices,
        root: '0x' + this.root.toString(16),
        leaf: leafHex,
        index: leafIndex
      });
    }

    console.log(`Proofs computed in ${Date.now() - proofStart}ms`);
    console.log(`Ready! ${this.proofsByAddress.size} addresses indexed.`);
  }

  hash(left: bigint, right: bigint): bigint {
    return this.poseidon.F.toObject(this.poseidon([left, right]));
  }

  getProof(address: string): ProofData | null {
    return this.proofsByAddress.get(address.toLowerCase()) ?? null;
  }

  getRoot(): string {
    return '0x' + this.root.toString(16);
  }
}

async function main() {
  const tree = new MerkleTreeWithProofs();
  await tree.init('./tree_state.json');

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/proof/:address', (req, res) => {
    const address = req.params.address;

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: 'Invalid address format' });
    }

    const proof = tree.getProof(address);
    if (!proof) {
      return res.status(404).json({ error: 'Address not in tree' });
    }

    res.json(proof);
  });

  app.get('/root', (_req, res) => {
    res.json({ root: tree.getRoot() });
  });

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Merkle proof API running on http://localhost:${PORT}`);
  });
}

main().catch(console.error);
