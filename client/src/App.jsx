import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Auth from './pages/Auth';
import Pos from './pages/Pos';
import Shop from './pages/Shop';

const STAFF = ['restaurant_admin', 'admin'];
const home = (u) => (!u ? '/login' : u.role === 'customer' ? '/shop' : '/pos');

function Gate({ roles, children, guest }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="boot">Loading…</div>;
  if (guest) return user ? <Navigate to={home(user)} replace /> : children;
  if (!user) return <Navigate to="/login" replace />;
  return roles.includes(user.role) ? children : <Navigate to={home(user)} replace />;
}
const Home = () => { const { user, ready } = useAuth(); return ready ? <Navigate to={home(user)} replace /> : <div className="boot">Loading…</div>; };

function Toaster() {
  const [t, setT] = useState({});
  useEffect(() => {
    let id;
    const f = (e) => { setT({ ...e.detail, show: true }); clearTimeout(id); id = setTimeout(() => setT((x) => ({ ...x, show: false })), 2600); };
    window.addEventListener('zq-toast', f);
    return () => window.removeEventListener('zq-toast', f);
  }, []);
  return <div className={'toast' + (t.show ? ' show' : '') + (t.bad ? ' bad' : '')} role="status">{t.m}</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Gate guest><Auth mode="login" /></Gate>} />
          <Route path="/signup" element={<Gate guest><Auth mode="signup" /></Gate>} />
          <Route path="/pos" element={<Gate roles={STAFF}><Pos /></Gate>} />
          <Route path="/shop/*" element={<Gate roles={['customer']}><Shop /></Gate>} />
          <Route path="*" element={<Home />} />
        </Routes>
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  );
}
