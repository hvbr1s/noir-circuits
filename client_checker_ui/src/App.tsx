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
          marginBottom: '24px',
          fontSize: '15px'
        }}>
          Prove membership without revealing your address
        </p>

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
