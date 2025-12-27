import { useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi';
import { recoverPublicKey, toBytes, hashMessage } from 'viem';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface MerkleProof {
  siblings: string[]
  indices: number[]
  root: string
  leaf: string
  index: number
}

type Status = 'idle' | 'signing' | 'fetching' | 'proving' | 'done' | 'error'

export function ProofGenerator() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()

  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [proofHex, setProofHex] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleProve = async () => {
    if (!address) {
      setError('Connect your wallet first')
      return
    }

    setError(null)
    setProofHex(null)
    setStatus('signing')

    try {
      // Step 1: Create timestamped challenge message
      const timestamp = Math.floor(Date.now() / 1000)
      const challengeMessage = `Prove Fordefi membership: ${timestamp}`

      // Step 2: Sign the challenge message
      const signature = await signMessageAsync({ message: challengeMessage })

      // Step 3: Hash the message (Ethereum personal_sign format)
      const messageHash = hashMessage(challengeMessage)
      const hashedMessageBytes = toBytes(messageHash)

      // Step 4: Recover public key from signature
      const publicKey = await recoverPublicKey({
        hash: messageHash,
        signature
      })

      // publicKey is 65 bytes: 0x04 + x (32 bytes) + y (32 bytes)
      const pubKeyBytes = toBytes(publicKey)
      const pubKeyX = Array.from(pubKeyBytes.slice(1, 33))
      const pubKeyY = Array.from(pubKeyBytes.slice(33, 65))

      // Step 5: Extract r and s from signature (drop v)
      const sigBytes = toBytes(signature)
      const sigRS = Array.from(sigBytes.slice(0, 64))

      // Step 6: Fetch Merkle proof from API
      setStatus('fetching')
      const res = await fetch(`${API_URL}/proof/${address}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Address not in tree')
      }
      const merkleProof: MerkleProof = await res.json()

      // Step 7: Generate proof
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

      // Input order must match circuit: siblings, indices, pub_key_x, pub_key_y, signature, hashed_message, root
      const inputs = {
        siblings: merkleProof.siblings.map(padHex),
        indices: merkleProof.indices.map(String),
        pub_key_x: pubKeyX,
        pub_key_y: pubKeyY,
        signature: sigRS,
        hashed_message: Array.from(hashedMessageBytes),
        root: padHex(merkleProof.root)
      }

      const { witness } = await noir.execute(inputs)

      const backend = new UltraHonkBackend(circuit.bytecode)
      const proofData = await backend.generateProof(witness, { keccakZK: true })

      const proofBytes = proofData.proof
      const proofHexStr = '0x' + Array.from(proofBytes).map(b => b.toString(16).padStart(2, '0')).join('')

      // Public inputs from circuit: hashed_message[32] + root + recovered_address
      const publicInputsHex = proofData.publicInputs.map((pi: string) => {
        const clean = pi.startsWith('0x') ? pi.slice(2) : pi
        return '0x' + clean.padStart(64, '0')
      }).join(',')

      // Combine proof and public inputs for sharing
      const combinedOutput = `${proofHexStr}:${publicInputsHex}`

      setProofHex(combinedOutput)
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

  const isLoading = status === 'signing' || status === 'fetching' || status === 'proving'

  const statusText: Record<Status, string> = {
    idle: 'Generate Proof',
    signing: 'Sign message in wallet...',
    fetching: 'Fetching merkle proof...',
    proving: 'Generating proof...',
    done: 'Generate Proof',
    error: 'Generate Proof'
  }

  return (
    <div>
      {/* Wallet Connection */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '6px', color: '#888', fontSize: '13px' }}>
          Your Wallet
        </label>
        {isConnected ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 16px',
            background: '#111',
            border: '1px solid #333',
            borderRadius: '8px'
          }}>
            <div style={{ flex: 1 }}>
              <div style={{
                color: '#fff',
                fontFamily: 'monospace',
                fontSize: '14px',
                wordBreak: 'break-all'
              }}>
                {address}
              </div>
              <div style={{ color: '#22c55e', fontSize: '12px', marginTop: '4px' }}>
                Connected
              </div>
            </div>
            <button
              onClick={() => disconnect()}
              style={{
                padding: '8px 14px',
                background: '#222',
                color: '#888',
                border: '1px solid #333',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => connect({ connector: connectors[0] })}
            style={{
              width: '100%',
              padding: '14px',
              background: '#fff',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: 500
            }}
          >
            Connect Wallet
          </button>
        )}
      </div>

      {/* Generate Proof Button */}
      <button
        onClick={handleProve}
        disabled={isLoading || !isConnected}
        style={{
          width: '100%',
          padding: '14px',
          background: isLoading || !isConnected ? '#222' : '#fff',
          color: isLoading || !isConnected ? '#666' : '#000',
          border: 'none',
          borderRadius: '8px',
          cursor: isLoading || !isConnected ? 'default' : 'pointer',
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
