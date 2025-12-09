import { useState } from 'react'
import { usePublicClient } from 'wagmi'
import { VERIFIER_ADDRESS, VERIFIER_ABI } from '../config/verifier'

const API_URL = 'http://localhost:3001'

interface MerkleProof {
  siblings: string[]
  indices: number[]
  root: string
  leaf: string
  index: number
}

type Status = 'idle' | 'fetching' | 'proving' | 'verifying' | 'verified' | 'invalid' | 'error'

export function ProofGenerator() {
  const [address, setAddress] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  const publicClient = usePublicClient()

  const handleProve = async () => {
    const inputAddress = address.trim()

    if (!inputAddress || !/^0x[a-fA-F0-9]{40}$/.test(inputAddress)) {
      setError('Enter a valid Ethereum address')
      return
    }

    setError(null)
    setStatus('fetching')

    try {
      // Fetch Merkle proof from API
      const res = await fetch(`${API_URL}/proof/${inputAddress}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Address not in tree')
      }
      const merkleProof: MerkleProof = await res.json()

      // Generate ZK proof
      setStatus('proving')

      const [{ Noir }, { UltraHonkBackend }] = await Promise.all([
        import('@noir-lang/noir_js'),
        import('@aztec/bb.js')
      ])

      const circuitRes = await fetch('/checker.json')
      const circuit = await circuitRes.json()

      const noir = new Noir(circuit)

      const padHex = (hex: string) => {
        const clean = hex.startsWith('0x') ? hex.slice(2) : hex
        return '0x' + clean.padStart(64, '0')
      }

      const inputs = {
        address: padHex(inputAddress),
        siblings: merkleProof.siblings.map(padHex),
        indices: merkleProof.indices.map(String),
        root: padHex(merkleProof.root)
      }

      const { witness } = await noir.execute(inputs)

      const backend = new UltraHonkBackend(circuit.bytecode)
      const proofData = await backend.generateProof(witness, { keccak: true })

      const proofBytes = proofData.proof
      const proofHexStr = '0x' + Array.from(proofBytes).map(b => b.toString(16).padStart(2, '0')).join('')

      // Verify on-chain
      setStatus('verifying')

      if (!publicClient) {
        throw new Error('No RPC client available')
      }

      const rootBytes32 = padHex(merkleProof.root) as `0x${string}`

      const isValid = await publicClient.readContract({
        address: VERIFIER_ADDRESS,
        abi: VERIFIER_ABI,
        functionName: 'verify',
        args: [proofHexStr as `0x${string}`, [rootBytes32]]
      })

      setStatus(isValid ? 'verified' : 'invalid')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const isLoading = status === 'fetching' || status === 'proving' || status === 'verifying'

  const statusConfig: Record<Status, { text: string; color: string }> = {
    idle: { text: '', color: '#666' },
    fetching: { text: 'Fetching merkle proof...', color: '#888' },
    proving: { text: 'Generating ZK proof...', color: '#888' },
    verifying: { text: 'Verifying on-chain...', color: '#888' },
    verified: { text: 'Verified', color: '#22c55e' },
    invalid: { text: 'Invalid proof', color: '#ef4444' },
    error: { text: 'Error', color: '#ef4444' }
  }

  return (
    <div>
      <input
        type="text"
        placeholder="0x..."
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        spellCheck={false}
        style={{
          width: '100%',
          padding: '14px 16px',
          background: '#111',
          border: '1px solid #333',
          borderRadius: '8px',
          color: '#fff',
          fontFamily: 'monospace',
          fontSize: '15px',
          outline: 'none',
          boxSizing: 'border-box',
          marginBottom: '12px'
        }}
      />

      <button
        onClick={handleProve}
        disabled={isLoading}
        style={{
          width: '100%',
          padding: '14px',
          background: isLoading ? '#222' : '#fff',
          color: isLoading ? '#666' : '#000',
          border: 'none',
          borderRadius: '8px',
          cursor: isLoading ? 'default' : 'pointer',
          fontSize: '15px',
          fontWeight: 500,
          transition: 'all 0.15s ease'
        }}
      >
        {isLoading ? statusConfig[status].text : 'Prove'}
      </button>

      {(status === 'verified' || status === 'invalid' || status === 'error') && (
        <div style={{
          marginTop: '16px',
          padding: '14px 16px',
          background: '#111',
          borderRadius: '8px',
          borderLeft: `3px solid ${statusConfig[status].color}`
        }}>
          <span style={{ color: statusConfig[status].color, fontWeight: 500 }}>
            {statusConfig[status].text}
          </span>
          {error && (
            <p style={{ margin: '8px 0 0 0', color: '#888', fontSize: '13px' }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
