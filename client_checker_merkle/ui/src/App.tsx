import { ProofGenerator } from './components/ProofGenerator'

function App() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px'
    }}>
      <div style={{ maxWidth: '480px', width: '100%' }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: 600,
          marginBottom: '8px',
          letterSpacing: '-0.5px'
        }}>
          Merkle Membership
        </h1>
        <p style={{
          color: '#666',
          marginTop: 0,
          marginBottom: '32px',
          fontSize: '15px'
        }}>
          Prove your address is in the allowlist without revealing which one
        </p>

        <ProofGenerator />
      </div>
    </div>
  )
}

export default App
