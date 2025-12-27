import { useState } from 'react'
import { usePublicClient } from 'wagmi'
import { VERIFIER_ADDRESS, VERIFIER_ABI } from '../config/verifier'

type Status = 'idle' | 'verifying' | 'verified' | 'invalid' | 'error'

export function ProofVerifier() {
  const [proofInput, setProofInput] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [recoveredAddress, setRecoveredAddress] = useState<string | null>(null)

  const publicClient = usePublicClient()

  const handleVerify = async () => {
    const input = proofInput.trim()

    // Parse combined format: proof:publicInput1,publicInput2,...
    const colonIndex = input.indexOf(':')
    if (colonIndex === -1) {
      setError('Invalid format. Expected proof:publicInputs')
      return
    }

    const proofHex = input.slice(0, colonIndex)
    const publicInputsStr = input.slice(colonIndex + 1)

    if (!proofHex.startsWith('0x')) {
      setError('Invalid format. Proof should start with 0x')
      return
    }

    // Parse public inputs (comma-separated hex values)
    const publicInputs = publicInputsStr.split(',').map(pi => pi.trim()) as `0x${string}`[]

    if (publicInputs.length === 0 || !publicInputs[0].startsWith('0x')) {
      setError('Invalid format. Public inputs should be comma-separated hex values')
      return
    }

    setError(null)
    setRecoveredAddress(null)
    setStatus('verifying')

    try {
      if (!publicClient) {
        throw new Error('No RPC client available')
      }

      // The public inputs come directly from the proof generation
      // They include: hashed_message (32 fields) + root (1 field) + returned address (1 field)
      // The verifier contract expects exactly these public inputs

      const result = await publicClient.readContract({
        address: VERIFIER_ADDRESS,
        abi: VERIFIER_ABI,
        functionName: 'verify',
        args: [proofHex as `0x${string}`, publicInputs]
      })

      if (result) {
        // Extract the recovered address from the public inputs
        // The last public input is the returned address (after 32 bytes of hashed_message + root)
        // Public inputs order: hashed_message[32] + root + address
        const addressField = publicInputs[publicInputs.length - 1]
        // Convert from field to ethereum address (take last 40 hex chars = 20 bytes)
        const cleanAddress = addressField.startsWith('0x') ? addressField.slice(2) : addressField
        const ethAddress = '0x' + cleanAddress.slice(-40)
        setRecoveredAddress(ethAddress)
        setStatus('verified')
      } else {
        setStatus('invalid')
      }
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const isLoading = status === 'verifying'

  const statusConfig: Record<Status, { text: string; color: string }> = {
    idle: { text: '', color: '#666' },
    verifying: { text: 'Verifying...', color: '#888' },
    verified: { text: 'Valid', color: '#22c55e' },
    invalid: { text: 'Invalid proof', color: '#ef4444' },
    error: { text: 'Error', color: '#ef4444' }
  }

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '6px', color: '#888', fontSize: '13px' }}>
        Proof (paste the combined proof:publicInputs string)
      </label>
      <textarea
        placeholder="0x...proof...:0x...input1,0x...input2,..."
        value={proofInput}
        onChange={(e) => setProofInput(e.target.value)}
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
            <div>
              <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '13px' }}>
                This address is managed by Fordefi
              </p>
              {recoveredAddress && (
                <p style={{
                  margin: '8px 0 0 0',
                  color: '#fff',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all'
                }}>
                  Address: {recoveredAddress}
                </p>
              )}
            </div>
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
