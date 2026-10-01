const KEY = 'zq_token';
export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

export async function api(path, { method = 'GET', body } = {}) {
  const t = getToken();
  const r = await fetch('/api' + path, {
    method, body: body && JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && t && !path.startsWith('/auth')) window.dispatchEvent(new Event('zq-logout'));
    const e = new Error(j.errors?.[0]?.message || j.message || 'Request failed');
    e.status = r.status; throw e;
  }
  return j;
}
export const toast = (m, bad) => window.dispatchEvent(new CustomEvent('zq-toast', { detail: { m, bad } }));
export const money = (n) => 'Rs ' + Number(n || 0).toLocaleString('en-PK');
export const unit = (m) => (m.discountPrice && m.discountPrice < m.price ? m.discountPrice : m.price);
const ICO = [[/bbq|tikka|kabab/i, '🍢'], [/karahi/i, '🍲'], [/rice|biryani|pulao/i, '🍚'], [/bread|naan/i, '🫓'], [/burger/i, '🍔'], [/fries/i, '🍟'], [/wrap/i, '🌯'], [/shake|lassi/i, '🥛'], [/deal|box|combo/i, '🎁'], [/pizza/i, '🍕'], [/pasta|penne/i, '🍝'], [/starter|wing|garlic/i, '🍗'], [/dessert|cake|tiramisu/i, '🍰'], [/drink|tea|margarita/i, '🥤']];
export const ico = (t) => (ICO.find(([r]) => r.test(t)) || [0, '🍽️'])[1];
