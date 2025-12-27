// Old verifiers (address-only circuit):
// export const VERIFIER_ADDRESS = '0xBBf5C392029E8e7651b0eFD5C2B36B7e01072583' as const // Non-ZK HonkVerifier
// export const VERIFIER_ADDRESS = '0x3ad1a34ffd433c8c591B6F5fde690196E9C05c6B' as const // ZK Honk Verifier
// export const VERIFIER_ADDRESS = '0x26ea6615d4Cfe23E932BDfB3304C4E8d1afB71F3' as const // Mainnet - old ECDSA circuit

// ECDSA + Merkle verifier (Ethereum Sepolia)
export const VERIFIER_ADDRESS = '0xA9C052e88d03eEd4ccfC6C4D12846829C25Ac907' as const

export const VERIFIER_ABI = [
  {
    inputs: [
      { name: '_proof', type: 'bytes' },
      { name: '_publicInputs', type: 'bytes32[]' }
    ],
    name: 'verify',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const
