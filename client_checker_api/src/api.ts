import express, { Request, Response, NextFunction } from 'express';
import { buildPoseidonOpt } from 'circomlibjs';
import * as fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import { Storage } from '@google-cloud/storage';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamArray } from 'stream-json/streamers/StreamArray';
import { chain } from 'stream-chain';

dotenv.config()

const TREE_DEPTH = 21;
const OWNER_API_KEY = process.env.OWNER_API_KEY;

async function downloadTreeState(localPath: string): Promise<void> {
  const gcsBucket = process.env.GCS_BUCKET;
  const gcsObjectKey = process.env.GCS_OBJECT_KEY || 'tree_state.json';

  if (!gcsBucket) {
    console.log('GCS_BUCKET not set, using local tree state file');
    return;
  }

  console.log(`Downloading tree state from GCS: gs://${gcsBucket}/${gcsObjectKey}`);
  const startTime = Date.now();

  let storage: Storage;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    storage = new Storage({ credentials });
  } else {
    storage = new Storage();
  }

  const bucket = storage.bucket(gcsBucket);
  const file = bucket.file(gcsObjectKey);

  await file.download({ destination: localPath });

  console.log(`Downloaded tree state in ${Date.now() - startTime}ms`);
}

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

    console.log('Loading tree state with streaming parser...');
    const startTime = Date.now();

    // Initialize level 0
    this.nodesByLevel = [];
    this.nodesByLevel[0] = new Map();

    // Stream JSON
    await this.streamParseTreeState(statePath);

    // Build levels 1 to TREE_DEPTH
    console.log('Building tree levels...');
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
    console.log(`Ready! ${this.addressToIndex.size} addresses indexed`);
  }

  // Stream parse the tree state JSON file
  private streamParseTreeState(statePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let leafCount = 0;
      let currentKey = '';

      const jsonParser = parser();
      const fileStream = fs.createReadStream(statePath);

      fileStream.pipe(jsonParser);

      jsonParser.on('data', (data: { name: string; value: any }) => {
        const { name, value } = data;

        if (name === 'keyValue') {
          currentKey = value;
        } else if (name === 'stringValue' || name === 'numberValue') {
          if (currentKey === 'root') {
            this.root = BigInt(value);
          } else if (currentKey === 'nextIndex') {
            this.nextIndex = value;
          }
        } else if (name === 'startArray' && currentKey === 'zeroHashes') {
          this.zeroHashes = [];
        } else if (name === 'startArray' && currentKey === 'filledSubtrees') {
          this.filledSubtrees = [];
        } else if (name === 'stringValue' && currentKey === 'zeroHashes') {
          this.zeroHashes.push(BigInt(value));
        } else if (name === 'stringValue' && currentKey === 'filledSubtrees') {
          this.filledSubtrees.push(BigInt(value));
        }
      });

      // Use pick to target the "leaves" array specifically
      const pipeline = chain([
        fs.createReadStream(statePath),
        parser(),
        pick({ filter: 'leaves' }),
        streamArray(),
      ]);

      pipeline.on('data', ({ value }: { value: any }) => {
        // Each value is a leaf entry: [index, leafHex]
        const [index, leafHex] = value as [number, string];
        const leaf = BigInt(leafHex);
        this.nodesByLevel[0]!.set(index, leaf);
        const addressHex = '0x' + leaf.toString(16).padStart(40, '0');
        this.addressToIndex.set(addressHex.toLowerCase(), index);
        leafCount++;
        if (leafCount % 100000 === 0) {
          console.log(`Loaded ${leafCount} leaves...`);
        }
      });

      pipeline.on('end', () => {
        console.log(`Streamed ${leafCount} leaves`);
        resolve();
      });

      pipeline.on('error', reject);
    });
  }

  hash(left: bigint, right: bigint): bigint {
    return this.poseidon.F.toObject(this.poseidon([left, right]));
  }

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
    const totalAddresses = addresses.length;
    const startTime = Date.now();

    console.log(`[insertAddresses] Starting insertion of ${totalAddresses} addresses...`);
    console.log(`[insertAddresses] Current tree index: ${startCount}`);

    for (let i = 0; i < addresses.length; i++) {
      this.insertAddress(addresses[i]!);

      // Log progress every 100 addresses or at the end
      if ((i + 1) % 100 === 0 || i === addresses.length - 1) {
        const elapsed = Date.now() - startTime;
        const rate = ((i + 1) / elapsed * 1000).toFixed(1);
        console.log(`[insertAddresses] Progress: ${i + 1}/${totalAddresses} (${rate} addr/sec)`);
      }
    }

    const insertionTime = Date.now() - startTime;
    console.log(`[insertAddresses] Tree updates completed in ${insertionTime}ms`);

    // Save updated state
    console.log(`[insertAddresses] Saving tree state to disk...`);
    const saveStartTime = Date.now();
    this.saveState();
    const saveTime = Date.now() - saveStartTime;
    console.log(`[insertAddresses] State saved in ${saveTime}ms`);

    const totalTime = Date.now() - startTime;
    console.log(`[insertAddresses] Complete: ${this.nextIndex - startCount} addresses inserted in ${totalTime}ms`);

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
  hasAddress(address: string): boolean {
    return this.addressToIndex.has(address.toLowerCase());
  }
}

async function main() {
  const tree = new MerkleTreeWithProofs();
  const statePath = process.env.TREE_STATE_PATH || './data/tree_state.json';

  // Track initialization state
  let isReady = false;

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health check endpoint - responds immediately even during init
  app.get('/health', (_req, res) => {
    res.json({ status: isReady ? 'ready' : 'initializing' });
  });

  app.get('/proof/:address', (req, res) => {
    if (!isReady) {
      return res.status(503).json({ error: 'Server initializing, please wait' });
    }

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
    if (!isReady) {
      return res.status(503).json({ error: 'Server initializing, please wait' });
    }
    res.json({ root: tree.getRoot() });
  });

  // Start server BEFORE tree initialization so Render sees the port open
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}, initializing tree...`);
  });

  // Now initialize the tree (this takes a while)
  await downloadTreeState(statePath);
  await tree.init(statePath);
  isReady = true;
  console.log('Tree initialization complete, server ready!');

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
    const requestStartTime = Date.now();
    console.log(`[POST /addresses] Received request with ${Array.isArray(addresses) ? addresses.length : 'invalid'} addresses`);

    if (!Array.isArray(addresses)) {
      return res.status(400).json({ error: 'addresses must be an array' });
    }

    // Validate all addresses
    console.log(`[POST /addresses] Validating ${addresses.length} addresses...`);
    const validationStartTime = Date.now();
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

    const validationTime = Date.now() - validationStartTime;
    console.log(`[POST /addresses] Validation completed in ${validationTime}ms: ${validAddresses.length} valid, ${duplicateAddresses.length} duplicates, ${invalidAddresses.length} invalid`);

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
      console.log(`[POST /addresses] Inserting ${validAddresses.length} addresses into merkle tree...`);
      const insertStartTime = Date.now();
      const result = tree.insertAddresses(validAddresses);
      const insertTime = Date.now() - insertStartTime;

      const totalTime = Date.now() - requestStartTime;
      console.log(`[POST /addresses] Request completed in ${totalTime}ms (validation: ${validationTime}ms, insertion: ${insertTime}ms)`);

      res.json({
        success: true,
        inserted: result.inserted,
        newRoot: result.newRoot,
        totalLeaves: tree.getLeafCount(),
        skippedDuplicates: duplicateAddresses.length
      });
    } catch (error) {
      console.error('[POST /addresses] Error inserting addresses:', error);
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
}

main().catch(console.error);
