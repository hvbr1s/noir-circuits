import { buildPoseidonOpt } from '../node_modules/@types/circomlibjs';
import * as fs from 'fs';
import * as readline from 'readline';

const TREE_DEPTH = 21; // 2^21 = 2M+ leaves

class IncrementalMerkleTree {
  private poseidon: any;
  private zeroHashes: bigint[] = []; // Precomputed hashes of empty subtrees
  private filledSubtrees: bigint[] = []; // Current "frontier" at each level
  private leaves: Map<number, bigint> = new Map(); // Sparse storage of non-zero leaves
  private nextIndex = 0;
  private _root: bigint = 0n;

  async init() {
    this.poseidon = await buildPoseidonOpt();
    this.precomputeZeroHashes();
    this.filledSubtrees = [...this.zeroHashes];
    this._root = this.zeroHashes[TREE_DEPTH]!;
  }

  // Poseidon hash (field-native, ZK-efficient)
  hash(left: bigint, right: bigint): bigint {
    return this.poseidon.F.toObject(this.poseidon([left, right]));
  }

  // Precompute hashes of empty subtrees at each level
  private precomputeZeroHashes() {
    console.log('Precomputing zero hashes...');
    this.zeroHashes = new Array(TREE_DEPTH + 1);
    this.zeroHashes[0] = 0n; // Empty leaf

    for (let i = 1; i <= TREE_DEPTH; i++) {
      this.zeroHashes[i] = this.hash(this.zeroHashes[i - 1]!, this.zeroHashes[i - 1]!);
    }
    console.log(`Precomputed ${TREE_DEPTH + 1} zero hashes`);
  }

  hashLeaf(address: string): bigint {
    return BigInt(address.toLowerCase());
  }

  // Insert a single leaf - only computes 21 hashes!
  insert(leaf: bigint): number {
    const index = this.nextIndex;
    if (index >= 2 ** TREE_DEPTH) {
      throw new Error('Tree is full');
    }

    this.leaves.set(index, leaf);
    let currentHash = leaf;
    let currentIndex = index;

    for (let level = 0; level < TREE_DEPTH; level++) {
      const isRight = currentIndex % 2;

      if (isRight) {
        // We're the right child, left sibling is in filledSubtrees
        currentHash = this.hash(this.filledSubtrees[level]!, currentHash);
      } else {
        // We're the left child, update filledSubtrees and use zero hash for right
        this.filledSubtrees[level] = currentHash;
        currentHash = this.hash(currentHash, this.zeroHashes[level]!);
      }

      currentIndex = Math.floor(currentIndex / 2);
    }

    this._root = currentHash;
    this.nextIndex++;
    return index;
  }

  // Batch insert from CSV
  async loadFromCSV(path: string) {
    const stream = fs.createReadStream(path);
    const rl = readline.createInterface({ input: stream });

    const startTime = Date.now();
    let count = 0;
    let lastLog = startTime;

    for await (const line of rl) {
      const address = line.trim();
      if (address.startsWith('0x')) {
        this.insert(this.hashLeaf(address));
        count++;

        // Progress every 10k inserts or every 2 seconds
        const now = Date.now();
        if (count % 10000 === 0 || now - lastLog > 2000) {
          const elapsed = ((now - startTime) / 1000).toFixed(1);
          const rate = Math.round(count / ((now - startTime) / 1000));
          console.log(`  Inserted ${count.toLocaleString()} addresses (${elapsed}s, ${rate}/s)`);
          lastLog = now;
        }
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Inserted ${count.toLocaleString()} addresses in ${totalTime}s`);
  }

  getRoot(): bigint {
    return this._root;
  }

  getLeafCount(): number {
    return this.nextIndex;
  }

  // Generate proof for a leaf at given index
  getProof(index: number): { path: bigint[]; indices: number[] } {
    if (index >= this.nextIndex) {
      throw new Error('Index out of bounds');
    }

    const path: bigint[] = [];
    const indices: number[] = [];
    let currentIndex = index;

    for (let level = 0; level < TREE_DEPTH; level++) {
      const isRight = currentIndex % 2;
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

      // Get sibling - either from stored leaves/computed nodes or zero hash
      const sibling = this.getSiblingAt(level, siblingIndex);
      path.push(sibling);
      indices.push(isRight ? 1 : 0);

      currentIndex = Math.floor(currentIndex / 2);
    }

    return { path, indices };
  }

  // Get sibling node at a specific level and index
  private getSiblingAt(level: number, index: number): bigint {
    // For level 0, check if we have the leaf
    if (level === 0) {
      return this.leaves.get(index) ?? 0n;
    }

    // For higher levels, we need to compute or use zero hash
    // This is a simplified version - for full proof generation,
    // we'd need to store or recompute intermediate nodes
    return this.computeNodeAt(level, index);
  }

  // Compute node at a given level and index
  private computeNodeAt(level: number, index: number): bigint {
    if (level === 0) {
      return this.leaves.get(index) ?? 0n;
    }

    const leftChild = this.computeNodeAt(level - 1, index * 2);
    const rightChild = this.computeNodeAt(level - 1, index * 2 + 1);

    // Optimization: if both children are zero, use precomputed zero hash
    if (leftChild === 0n && rightChild === 0n) {
      return this.zeroHashes[level]!;
    }
    if (leftChild === 0n) {
      return this.hash(this.zeroHashes[level - 1]!, rightChild);
    }
    if (rightChild === 0n) {
      return this.hash(leftChild, this.zeroHashes[level - 1]!);
    }

    return this.hash(leftChild, rightChild);
  }

  // Export proof for Noir
  exportProofForNoir(address: string): string {
    const leaf = this.hashLeaf(address);

    // Find index by searching leaves
    let index = -1;
    for (const [i, l] of this.leaves) {
      if (l === leaf) {
        index = i;
        break;
      }
    }

    if (index === -1) throw new Error('Address not in tree');

    const { path, indices } = this.getProof(index);

    return JSON.stringify(
      {
        leaf: `0x${leaf.toString(16)}`,
        index,
        path: path.map((p) => `0x${p.toString(16)}`),
        indices,
        root: `0x${this.getRoot().toString(16)}`,
      },
      null,
      2
    );
  }

  // Save tree state for later use
  saveState(path: string) {
    const state = {
      root: `0x${this._root.toString(16)}`,
      nextIndex: this.nextIndex,
      zeroHashes: this.zeroHashes.map((h) => `0x${h.toString(16)}`),
      filledSubtrees: this.filledSubtrees.map((h) => `0x${h.toString(16)}`),
      leaves: Array.from(this.leaves.entries()).map(([i, l]) => [i, `0x${l.toString(16)}`]),
    };
    fs.writeFileSync(path, JSON.stringify(state, null, 2));
  }
}

// Usage
async function main() {
  const tree = new IncrementalMerkleTree();
  await tree.init();

  console.log('Loading addresses from CSV...');
  await tree.loadFromCSV('./data/addresses.csv');

  console.log(`\nTree built with ${tree.getLeafCount().toLocaleString()} leaves`);
  console.log('Root:', `0x${tree.getRoot().toString(16)}`);

  // Save tree state
  tree.saveState('tree_state.json');
  console.log('Saved tree state to tree_state.json');
}

main().catch(console.error);
