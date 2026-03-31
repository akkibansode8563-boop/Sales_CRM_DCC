import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { createUser } from '../utils/supabaseDB'

const Register = () => {
    const navigate = useNavigate()
    const [form, setForm] = useState({ username: '', password: '', full_name: '', email: '', phone: '', territory: '', role: 'Sales Manager' })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault(); setError(''); setSuccess(''); setLoading(true)
        try {
            await createUser(form)
            setSuccess(`User "${form.full_name}" created successfully!`)
            setForm({ username: '', password: '', full_name: '', email: '', phone: '', territory: '', role: 'Sales Manager' })
        } catch (err) { setError(err.message || 'Failed to create user') }
        finally { setLoading(false) }
    }

    return (
        <div style={{ minHeight: '100vh', background: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: 'white', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '480px', boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
                <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', marginBottom: '16px', fontSize: '0.9rem', padding: 0 }}>← Back to Dashboard</button>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '4px', fontFamily: 'Outfit,sans-serif' }}>Create User</h1>
                <p style={{ color: '#6B7280', marginBottom: '24px', fontSize: '0.9rem' }}>Admin only — add sales managers or admins</p>
                {error && <div style={{ background: '#FEE2E2', color: '#DC2626', padding: '12px', borderRadius: '10px', marginBottom: '16px', fontSize: '0.88rem' }}>{error}</div>}
                {success && <div style={{ background: '#D1FAE5', color: '#065F46', padding: '12px', borderRadius: '10px', marginBottom: '16px', fontSize: '0.88rem' }}>✅ {success}</div>}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {[['Full Name', 'full_name', 'text', 'John Doe', true], ['Username', 'username', 'text', 'john_doe', true], ['Password', 'password', 'password', 'Min 6 chars', true], ['Email', 'email', 'email', 'john@company.com', false], ['Phone', 'phone', 'tel', '+91 9999999999', false], ['Territory', 'territory', 'text', 'e.g. Mumbai West', false]].map(([lbl, key, type, ph, req]) => (
                        <div key={key}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>{lbl}{req && ' *'}</label>
                            <input type={type} required={req} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} placeholder={ph}
                                style={{ width: '100%', border: '1.5px solid #E5E7EB', borderRadius: '10px', padding: '10px 14px', fontSize: '0.9rem', background: '#F9FAFB', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                        </div>
                    ))}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Role</label>
                        <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} style={{ width: '100%', border: '1.5px solid #E5E7EB', borderRadius: '10px', padding: '10px 14px', fontSize: '0.9rem', background: '#F9FAFB', fontFamily: 'inherit' }}>
                            <option>Sales Manager</option><option>Admin</option>
                        </select>
                    </div>
                    <button type="submit" disabled={loading} style={{ background: 'linear-gradient(135deg,#1E3A8A,#0D9488)', color: 'white', border: 'none', borderRadius: '12px', padding: '14px', fontWeight: 700, fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: '8px', fontFamily: 'inherit' }}>
                        {loading ? 'Creating...' : 'Create User'}
                    </button>
                </form>
            </div>
        </div>
    )
}
export default Register
