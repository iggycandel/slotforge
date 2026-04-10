import Link from 'next/link'
export default function HomePage() {
  return (
    <main style={{ minHeight:'100vh', background:'#13131e', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'sans-serif' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ color:'#c9a84c', fontWeight:700, marginBottom:16 }}>SLOTFORGE</div>
        <h1 style={{ fontSize:40, color:'#e8e6e1', marginBottom:32 }}>The ultimate tool for slot game studios</h1>
        <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
          <Link href="/sign-up" style={{ padding:'12px 28px', borderRadius:8, background:'#c9a84c', color:'#1a1200', fontWeight:700, textDecoration:'none' }}>Get started</Link>
          <Link href="/sign-in" style={{ padding:'12px 28px', borderRadius:8, border:'1px solid #3a3a52', color:'#c0c0d0', textDecoration:'none' }}>Sign in</Link>
        </div>
      </div>
    </main>
  )
}
