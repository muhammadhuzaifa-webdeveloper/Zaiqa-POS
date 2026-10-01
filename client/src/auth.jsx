import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';

const Ctx = createContext();
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const out = () => { setToken(null); setUser(null); };
    window.addEventListener('zq-logout', out);
    if (getToken()) api('/users/me').then((r) => setUser(r.data)).catch(() => setToken(null)).finally(() => setReady(true));
    else setReady(true);
    return () => window.removeEventListener('zq-logout', out);
  }, []);
  const enter = async (path, body) => {
    const { data } = await api(path, { method: 'POST', body });
    setToken(data.accessToken); setUser(data.user); return data.user;
  };
  const value = {
    user, ready,
    login: (b) => enter('/auth/login', b),
    register: (b) => enter('/auth/register', b),
    logout: () => { setToken(null); setUser(null); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
