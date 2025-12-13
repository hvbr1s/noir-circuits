import { useState } from 'react'
import { ProofGenerator } from './components/ProofGenerator'
import { ProofVerifier } from './components/ProofVerifier'

type Tab = 'prove' | 'verify'

function App() {
  const [tab, setTab] = useState<Tab>('prove')

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px'
    }}>
      <div style={{ maxWidth: '520px', width: '100%' }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: 600,
          marginBottom: '8px',
          letterSpacing: '-0.5px'
        }}>
          ZK Merkle Membership
        </h1>
        <p style={{
          color: '#666',
          marginTop: 0,
          marginBottom: '16px',
          fontSize: '15px'
        }}>
          Prove you're a Fordefi client without revealing your address
        </p>

        <div style={{
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: '6px',
          padding: '12px 14px',
          marginBottom: '20px',
          fontSize: '13px',
          color: '#888',
          lineHeight: '1.5'
        }}>
          <strong style={{ color: '#aaa' }}>How it works:</strong> Your address is hashed into a Merkle tree of verified clients.
          A zero-knowledge proof confirms your address is in the tree without revealing which one.
          The verifier only sees the proof—never your address.
        </div>

        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px'
        }}>
          <button
            onClick={() => setTab('prove')}
            style={{
              flex: 1,
              padding: '10px',
              background: tab === 'prove' ? '#fff' : '#111',
              color: tab === 'prove' ? '#000' : '#666',
              border: '1px solid #333',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              transition: 'all 0.15s ease'
            }}
          >
            Generate ZK Proof
          </button>
          <button
            onClick={() => setTab('verify')}
            style={{
              flex: 1,
              padding: '10px',
              background: tab === 'verify' ? '#fff' : '#111',
              color: tab === 'verify' ? '#000' : '#666',
              border: '1px solid #333',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              transition: 'all 0.15s ease'
            }}
          >
            Verify ZK Proof
          </button>
        </div>

        {tab === 'prove' ? <ProofGenerator /> : <ProofVerifier />}
      </div>
    </div>
  )
}

export default App
