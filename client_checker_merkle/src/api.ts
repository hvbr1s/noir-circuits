import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import * as fs from 'fs';
import { buildPoseidonOpt } from 'circomlibjs';

const TREE_DEPTH = 21;
const OWNER_API_KEY = process.env.OWNER_API_KEY || 'change-me-in-production';

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
  private filledSubtrees: bigint[] = [];
  private root: bigint = 0n;
  private nextIndex: number = 0;
  private nodesByLevel: Map<number, bigint>[] = [];
  private addressToIndex: Map<string, number> = new Map(); // address -> leaf index (lightweight lookup)
  private statePath: string = '';

  async init(statePath: string) {
    this.statePath = statePath;
    console.log('Initializing Poseidon...');
    this.poseidon = await buildPoseidonOpt();

    console.log('Loading tree state...');
    const state: TreeState = JSON.parse(fs.readFileSync(statePath, 'utf8'));

    this.root = BigInt(state.root);
    this.zeroHashes = state.zeroHashes.map(h => BigInt(h));
    this.filledSubtrees = state.filledSubtrees.map(h => BigInt(h));
    this.nextIndex = state.nextIndex;

    // Build all nodes level by level (bottom-up)
    console.log(`Building tree with ${state.leaves.length} leaves...`);
    const startTime = Date.now();

    // Level 0: leaves
    this.nodesByLevel = [];
    this.nodesByLevel[0] = new Map();
    for (const [index, leafHex] of state.leaves) {
      const leaf = BigInt(leafHex);
      this.nodesByLevel[0].set(index, leaf);
      // Build address -> index lookup (lightweight: just stores index, not full proof)
      const addressHex = '0x' + leaf.toString(16).padStart(40, '0');
      this.addressToIndex.set(addressHex.toLowerCase(), index);
    }

    // Build levels 1 to TREE_DEPTH
    for (let level = 1; level <= TREE_DEPTH; level++) {
      this.nodesByLevel[level] = new Map();
      const prevLevel = this.nodesByLevel[level - 1]!;

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
        this.nodesByLevel[level]!.set(parentIndex, nodeValue);
      }
    }

    console.log(`Tree built in ${Date.now() - startTime}ms`);
    console.log(`Ready! ${this.addressToIndex.size} addresses indexed. Proofs computed on-demand.`);
  }

  hash(left: bigint, right: bigint): bigint {
    return this.poseidon.F.toObject(this.poseidon([left, right]));
  }

  // Compute proof on-demand (avoids storing 1.4M proofs in memory)
  getProof(address: string): ProofData | null {
    const leafIndex = this.addressToIndex.get(address.toLowerCase());
    if (leafIndex === undefined) {
      return null;
    }

    const leaf = this.nodesByLevel[0]!.get(leafIndex)!;
    const siblings: bigint[] = [];
    const indices: number[] = [];
    let currentIndex = leafIndex;

    for (let level = 0; level < TREE_DEPTH; level++) {
      const isRight = currentIndex % 2;
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

      const sibling = this.nodesByLevel[level]!.get(siblingIndex) ?? this.zeroHashes[level]!;
      siblings.push(sibling);
      indices.push(isRight ? 1 : 0);

      currentIndex = Math.floor(currentIndex / 2);
    }

    return {
      siblings: siblings.map(s => '0x' + s.toString(16)),
      indices,
      root: '0x' + this.root.toString(16),
      leaf: '0x' + leaf.toString(16),
      index: leafIndex
    };
  }

  getRoot(): string {
    return '0x' + this.root.toString(16);
  }

  getLeafCount(): number {
    return this.nextIndex;
  }

  // Insert a single address and update the tree
  insertAddress(address: string): number {
    const leaf = BigInt(address.toLowerCase());
    const index = this.nextIndex;

    if (index >= 2 ** TREE_DEPTH) {
      throw new Error('Tree is full');
    }

    // Store the leaf
    this.nodesByLevel[0]!.set(index, leaf);
    const addressHex = '0x' + leaf.toString(16).padStart(40, '0');
    this.addressToIndex.set(addressHex.toLowerCase(), index);

    // Update path to root
    let currentHash = leaf;
    let currentIndex = index;

    for (let level = 0; level < TREE_DEPTH; level++) {
      const isRight = currentIndex % 2;

      if (isRight) {
        currentHash = this.hash(this.filledSubtrees[level]!, currentHash);
      } else {
        this.filledSubtrees[level] = currentHash;
        currentHash = this.hash(currentHash, this.zeroHashes[level]!);
      }

      // Update nodesByLevel for this level+1
      const parentIndex = Math.floor(currentIndex / 2);
      if (!this.nodesByLevel[level + 1]) {
        this.nodesByLevel[level + 1] = new Map();
      }
      this.nodesByLevel[level + 1]!.set(parentIndex, currentHash);

      currentIndex = parentIndex;
    }

    this.root = currentHash;
    this.nextIndex++;

    return index;
  }

  // Insert multiple addresses
  insertAddresses(addresses: string[]): { inserted: number; newRoot: string } {
    const startCount = this.nextIndex;

    for (const address of addresses) {
      this.insertAddress(address);
    }

    // Save updated state
    this.saveState();

    return {
      inserted: this.nextIndex - startCount,
      newRoot: this.getRoot()
    };
  }

  // Save tree state to file
  private saveState() {
    // Build leaves array from nodesByLevel[0]
    const leaves: [number, string][] = [];
    for (const [index, leaf] of this.nodesByLevel[0]!) {
      leaves.push([index, '0x' + leaf.toString(16)]);
    }

    const state: TreeState = {
      root: '0x' + this.root.toString(16),
      nextIndex: this.nextIndex,
      zeroHashes: this.zeroHashes.map(h => '0x' + h.toString(16)),
      filledSubtrees: this.filledSubtrees.map(h => '0x' + h.toString(16)),
      leaves
    };
    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2));
    console.log(`Saved tree state to ${this.statePath}`);
  }

  // Check if address exists in tree
  hasAddress(address: string): boolean {
    return this.addressToIndex.has(address.toLowerCase());
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

  // Owner-only middleware
  const requireOwner = (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== OWNER_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };

  // Owner-only: Add addresses to the tree
  app.post('/addresses', requireOwner, (req, res) => {
    const { addresses } = req.body;

    if (!Array.isArray(addresses)) {
      return res.status(400).json({ error: 'addresses must be an array' });
    }

    // Validate all addresses
    const invalidAddresses: string[] = [];
    const validAddresses: string[] = [];
    const duplicateAddresses: string[] = [];

    for (const addr of addresses) {
      if (typeof addr !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        invalidAddresses.push(addr);
      } else if (tree.hasAddress(addr)) {
        duplicateAddresses.push(addr);
      } else {
        validAddresses.push(addr);
      }
    }

    if (invalidAddresses.length > 0) {
      return res.status(400).json({
        error: 'Invalid address format',
        invalidAddresses: invalidAddresses.slice(0, 10) // Show first 10
      });
    }

    if (validAddresses.length === 0) {
      return res.status(400).json({
        error: 'No new addresses to add',
        duplicateAddresses: duplicateAddresses.slice(0, 10)
      });
    }

    try {
      console.log(`Adding ${validAddresses.length} new addresses...`);
      const result = tree.insertAddresses(validAddresses);

      res.json({
        success: true,
        inserted: result.inserted,
        newRoot: result.newRoot,
        totalLeaves: tree.getLeafCount(),
        skippedDuplicates: duplicateAddresses.length
      });
    } catch (error) {
      console.error('Error inserting addresses:', error);
      res.status(500).json({ error: 'Failed to insert addresses' });
    }
  });

  // Owner-only: Get tree stats
  app.get('/stats', requireOwner, (_req, res) => {
    res.json({
      root: tree.getRoot(),
      leafCount: tree.getLeafCount(),
      maxLeaves: 2 ** TREE_DEPTH
    });
  });

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Merkle proof API running on http://localhost:${PORT}`);
  });
}

main().catch(console.error);
