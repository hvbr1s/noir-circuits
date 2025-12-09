export const VERIFIER_ADDRESS = '0xBBf5C392029E8e7651b0eFD5C2B36B7e01072583' as const

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
