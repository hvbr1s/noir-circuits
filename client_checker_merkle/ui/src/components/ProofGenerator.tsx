import { useState } from 'react'

const API_URL = 'http://localhost:3001'

interface MerkleProof {
  siblings: string[]
  indices: number[]
  root: string
  leaf: string
  index: number
}

type Status = 'idle' | 'fetching' | 'proving' | 'done' | 'error'

export function ProofGenerator() {
  const [address, setAddress] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [proofHex, setProofHex] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleProve = async () => {
    const inputAddress = address.trim()

    if (!inputAddress || !/^0x[a-fA-F0-9]{40}$/.test(inputAddress)) {
      setError('Enter a valid Ethereum address')
      return
    }

    setError(null)
    setProofHex(null)
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

      setProofHex(proofHexStr)
      setStatus('done')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const copyToClipboard = async () => {
    if (proofHex) {
      await navigator.clipboard.writeText(proofHex)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const isLoading = status === 'fetching' || status === 'proving'

  const statusText: Record<Status, string> = {
    idle: 'Generate Proof',
    fetching: 'Fetching merkle proof...',
    proving: 'Generating ZK proof...',
    done: 'Generate Proof',
    error: 'Generate Proof'
  }

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '6px', color: '#888', fontSize: '13px' }}>
        Your address (private)
      </label>
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
        {statusText[status]}
      </button>

      {status === 'error' && error && (
        <div style={{
          marginTop: '16px',
          padding: '14px 16px',
          background: '#111',
          borderRadius: '8px',
          borderLeft: '3px solid #ef4444'
        }}>
          <span style={{ color: '#ef4444', fontWeight: 500 }}>Error</span>
          <p style={{ margin: '8px 0 0 0', color: '#888', fontSize: '13px' }}>{error}</p>
        </div>
      )}

      {proofHex && (
        <div style={{ marginTop: '20px' }}>
          <div style={{
            padding: '14px 16px',
            background: '#111',
            borderRadius: '8px',
            borderLeft: '3px solid #22c55e',
            marginBottom: '12px'
          }}>
            <span style={{ color: '#22c55e', fontWeight: 500 }}>Proof generated</span>
            <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '13px' }}>
              Share this with the verifier
            </p>
          </div>

          <div style={{ position: 'relative' }}>
            <textarea
              readOnly
              value={proofHex}
              style={{
                width: '100%',
                height: '100px',
                padding: '12px',
                paddingRight: '70px',
                background: '#111',
                border: '1px solid #333',
                borderRadius: '8px',
                color: '#fff',
                fontFamily: 'monospace',
                fontSize: '12px',
                outline: 'none',
                boxSizing: 'border-box',
                resize: 'none'
              }}
            />
            <button
              onClick={copyToClipboard}
              style={{
                position: 'absolute',
                right: '8px',
                top: '8px',
                padding: '6px 12px',
                background: '#222',
                color: copied ? '#22c55e' : '#888',
                border: '1px solid #333',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
