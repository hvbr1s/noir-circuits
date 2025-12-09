import { useState } from 'react'
import { usePublicClient } from 'wagmi'
import { VERIFIER_ADDRESS, VERIFIER_ABI } from '../config/verifier'

const API_URL = 'http://localhost:3001'

type Status = 'idle' | 'verifying' | 'verified' | 'invalid' | 'error'

export function ProofVerifier() {
  const [proof, setProof] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  const publicClient = usePublicClient()

  const handleVerify = async () => {
    const proofHex = proof.trim()

    if (!proofHex || !proofHex.startsWith('0x')) {
      setError('Enter a valid proof (hex string starting with 0x)')
      return
    }

    setError(null)
    setStatus('verifying')

    try {
      // Fetch current root from API
      const rootRes = await fetch(`${API_URL}/root`)
      if (!rootRes.ok) {
        throw new Error('Failed to fetch merkle root')
      }
      const { root } = await rootRes.json()

      // Pad root to 32 bytes
      const clean = root.startsWith('0x') ? root.slice(2) : root
      const rootHex = ('0x' + clean.padStart(64, '0')) as `0x${string}`

      if (!publicClient) {
        throw new Error('No RPC client available')
      }

      const isValid = await publicClient.readContract({
        address: VERIFIER_ADDRESS,
        abi: VERIFIER_ABI,
        functionName: 'verify',
        args: [proofHex as `0x${string}`, [rootHex]]
      })

      setStatus(isValid ? 'verified' : 'invalid')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const isLoading = status === 'verifying'

  const statusConfig: Record<Status, { text: string; color: string }> = {
    idle: { text: '', color: '#666' },
    verifying: { text: 'Verifying...', color: '#888' },
    verified: { text: 'Valid proof', color: '#22c55e' },
    invalid: { text: 'Invalid proof', color: '#ef4444' },
    error: { text: 'Error', color: '#ef4444' }
  }

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '6px', color: '#888', fontSize: '13px' }}>
        Proof
      </label>
      <textarea
        placeholder="0x..."
        value={proof}
        onChange={(e) => setProof(e.target.value)}
        spellCheck={false}
        style={{
          width: '100%',
          height: '120px',
          padding: '14px 16px',
          background: '#111',
          border: '1px solid #333',
          borderRadius: '8px',
          color: '#fff',
          fontFamily: 'monospace',
          fontSize: '13px',
          outline: 'none',
          boxSizing: 'border-box',
          marginBottom: '12px',
          resize: 'none'
        }}
      />

      <button
        onClick={handleVerify}
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
        {isLoading ? 'Verifying...' : 'Verify'}
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
          {status === 'verified' && (
            <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '13px' }}>
              The prover is a member of the allowlist
            </p>
          )}
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
