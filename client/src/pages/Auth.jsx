import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Auth({ mode }) {
  const signup = mode === 'signup';
  const { login, register } = useAuth();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', accountType: 'customer' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { signup ? await register(f) : await login({ email: f.email, password: f.password }); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <section className="login">
      <div className="hero">
        <div className="steam"><i /><i /><i /></div><div className="bowl" />
        <h1 className="brand">ZAIQA</h1><div className="ur" lang="ur">ذائقہ</div>
        <p>Order food. Run your restaurant.</p>
      </div>
      <div className="formside">
        <form onSubmit={submit}>
          <h2>{signup ? 'Create your account' : 'Sign in'}</h2>
          {signup && <>
            <div className="seg" role="radiogroup" aria-label="Account type">
              {[['customer', 'I want to order'], ['restaurant_admin', 'I own a restaurant']].map(([v, t]) =>
                <button type="button" key={v} className={f.accountType === v ? 'on' : ''} onClick={() => setF({ ...f, accountType: v })}>{t}</button>)}
            </div>
            <label>Full name<input value={f.name} onChange={set('name')} required autoComplete="name" /></label>
            <label>Phone<input value={f.phone} onChange={set('phone')} required placeholder="+923001234567" autoComplete="tel" /></label>
          </>}
          <label>Email<input type="email" value={f.email} onChange={set('email')} required autoComplete="username" /></label>
          <label>Password<input type="password" value={f.password} onChange={set('password')} required autoComplete={signup ? 'new-password' : 'current-password'} /></label>
          {signup && <p className="hint">At least 8 characters with upper case, lower case and a number.</p>}
          <div className="err" role="alert">{err}</div>
          <button className="primary" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</button>
          <p className="hint">{signup ? 'Already have an account?' : 'New to Zaiqa?'} <Link className="alt" to={signup ? '/login' : '/signup'}>{signup ? 'Sign in' : 'Create an account'}</Link></p>
          {!signup && <p className="hint">Demo: owner1@zaiqa.pk / Owner@123 · customer1@zaiqa.pk / Customer@123</p>}
        </form>
      </div>
    </section>
  );
}
