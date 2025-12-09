export const VERIFIER_ADDRESS = '0x6607F1EF7892c5BB46789591b2c540266300B891' as const

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
