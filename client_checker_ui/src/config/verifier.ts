// ECDSA + Merkle verifier (Ethereum Sepolia)
export const VERIFIER_ADDRESS = '0x2701541D93Cb39E280b77ff3B155C301a0F40fAB' as const

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
