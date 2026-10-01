import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api, ico, money, toast, unit } from '../api';
import { useAuth } from '../auth';

const CartCtx = createContext();

export default function Shop() {
  const { user, logout } = useAuth();
  const [cart, setCart] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { api('/cart').then((r) => setCart(r.data)).catch(() => {}); }, []);
  const count = cart?.items?.reduce((s, i) => s + i.quantity, 0) || 0;
  const addToCart = async (id) => {
    try { const r = await api('/cart/items', { method: 'POST', body: { menuItemId: id, quantity: 1 } }); setCart(r.data); toast('Added to cart'); }
    catch (e) { toast(e.message, 1); }
  };
  return (
    <CartCtx.Provider value={{ cart, setCart, addToCart, open, setOpen }}>
      <div className="shop">
        <header className="snav">
          <Link className="brand" to="/shop">ZAIQA</Link>
          <NavLink end to="/shop">Restaurants</NavLink><NavLink to="/shop/orders">My orders</NavLink>
          <button className="cartbtn" onClick={() => setOpen(true)}>Cart{count ? ` · ${count}` : ''}</button>
          <button className="ghost" onClick={logout} title={user.email}>Sign out</button>
        </header>
        <Routes>
          <Route index element={<Restaurants />} />
          <Route path="r/:id" element={<Restaurant />} />
          <Route path="orders" element={<MyOrders />} />
        </Routes>
        <Drawer />
      </div>
    </CartCtx.Provider>
  );
}

function Restaurants() {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => api(`/restaurants?limit=30&search=${encodeURIComponent(q)}`).then((r) => setList(r.data)).catch((e) => toast(e.message, 1)), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="page">
      <h2>What are you craving?</h2>
      <input type="search" placeholder="Search restaurants" aria-label="Search restaurants" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360, marginBottom: 16 }} />
      <div className="rgrid">
        {(list || []).map((r) => (
          <Link className="rc" key={r.id} to={`/shop/r/${r.id}`}>
            <div className="cover">{r.name[0]}</div>
            <div className="b"><b>{r.name}</b><small>{r.city} · {r.openingTime}–{r.closingTime}</small><small>{r.description}</small>
              <span className={'pill ' + (r.isOpen ? 's-delivered' : 's-pending')} style={{ justifySelf: 'start' }}>{r.isOpen ? 'Open' : 'Closed'}</span></div>
          </Link>))}
      </div>
      {list && !list.length && <p className="empty">No restaurants match “{q}”.</p>}
    </div>
  );
}

function Restaurant() {
  const { id } = useParams();
  const { addToCart } = useContext(CartCtx);
  const [r, setR] = useState(null);
  const [cat, setCat] = useState('all');
  useEffect(() => { api('/restaurants/' + id).then((x) => setR(x.data)).catch((e) => toast(e.message, 1)); }, [id]);
  if (!r) return <div className="page"><p className="empty">Loading…</p></div>;
  const cn = Object.fromEntries(r.categories.map((c) => [c.id, c.name]));
  const items = r.menuItems.filter((i) => cat === 'all' || i.category === cat);
  return (
    <div className="page">
      <Link className="alt" to="/shop">← All restaurants</Link>
      <h2 style={{ marginTop: 8 }}>{r.name}</h2><p className="hint" style={{ marginBottom: 14 }}>{r.address}, {r.city} · Delivery {money(r.deliveryFee)}</p>
      <div className="chips">{[{ id: 'all', name: 'All' }, ...r.categories].map((c) => <button key={c.id} className={'chip' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>{c.name}</button>)}</div>
      <div className="grid">
        {items.map((i) => (
          <button key={i.id} className={'tile' + (i.isAvailable ? '' : ' out')} disabled={!i.isAvailable} onClick={() => addToCart(i.id)}>
            <span className="e">{ico((cn[i.category] || '') + ' ' + i.name)}</span><b>{i.name}</b><small>{i.description}</small>
            <span className="p">{i.discountPrice && i.discountPrice < i.price && <s>{money(i.price)}</s>}{money(unit(i))}</span>
          </button>))}
      </div>
    </div>
  );
}

function Drawer() {
  const { cart, setCart, open, setOpen } = useContext(CartCtx);
  const { user } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ address: '', city: '', postalCode: '', phone: user.phone || '', paymentMethod: 'cash', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const call = async (path, opt) => { try { setCart((await api(path, opt)).data); } catch (e) { toast(e.message, 1); } };
  const qty = (id, q) => (q < 1 ? call('/cart/items/' + id, { method: 'DELETE' }) : call('/cart/items/' + id, { method: 'PATCH', body: { quantity: q } }));
  const place = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await api('/orders', { method: 'POST', body: { deliveryAddress: { address: f.address, city: f.city, postalCode: f.postalCode }, phone: f.phone, paymentMethod: f.paymentMethod, notes: f.notes } });
      setCart((c) => ({ ...c, items: [], subtotal: 0, deliveryFee: 0, total: 0 })); setOpen(false); toast('Order placed. The kitchen has it.'); nav('/shop/orders');
    } catch (x) { toast(x.message, 1); } finally { setBusy(false); }
  };
  const items = cart?.items || [];
  return (<>
    <div className={'scrim' + (open ? ' on' : '')} onClick={() => setOpen(false)} />
    <aside className={'drawer' + (open ? ' on' : '')} aria-hidden={!open}>
      <div className="top" style={{ margin: 0 }}><h2>Your cart</h2><button className="ghost" onClick={() => setOpen(false)}>Close</button></div>
      {!!cart?.removed?.length && <div className="note">No longer available and removed: {cart.removed.join(', ')}</div>}
      {items.length ? <>
        {items.map((i) => (
          <div className="ln" key={i.menuItem}><div><b>{i.name}</b><br /><small>{money(i.price)} each</small></div>
            <div className="qty"><button onClick={() => qty(i.menuItem, i.quantity - 1)} aria-label="Remove one">−</button><b>{i.quantity}</b><button onClick={() => qty(i.menuItem, i.quantity + 1)} aria-label="Add one">+</button></div><b>{money(i.price * i.quantity)}</b></div>))}
        <div className="tot"><div><span>Subtotal</span><span>{money(cart.subtotal)}</span></div><div><span>Delivery</span><span>{cart.deliveryFee ? money(cart.deliveryFee) : 'Free'}</span></div><div className="g"><span>Total</span><span>{money(cart.total)}</span></div></div>
        <form onSubmit={place}>
          <input placeholder="Delivery address" value={f.address} onChange={set('address')} required />
          <div className="row2"><input placeholder="City" value={f.city} onChange={set('city')} required /><input placeholder="Postal code" value={f.postalCode} onChange={set('postalCode')} /></div>
          <input placeholder="Phone" value={f.phone} onChange={set('phone')} required />
          <input placeholder="Note for the kitchen (optional)" value={f.notes} onChange={set('notes')} />
          <div className="pay">{['cash', 'card'].map((p) => <button type="button" key={p} className={f.paymentMethod === p ? 'on' : ''} onClick={() => setF({ ...f, paymentMethod: p })}>{p === 'cash' ? 'Cash on delivery' : 'Card on delivery'}</button>)}</div>
          <button className="primary" disabled={busy}>Place order · {money(cart.total)}</button>
          <button type="button" className="ghost" onClick={() => call('/cart', { method: 'DELETE' })}>Clear cart</button>
        </form></> : <p className="empty">Your cart is empty. Pick a restaurant and add a dish.</p>}
    </aside>
  </>);
}

function MyOrders() {
  const [orders, setOrders] = useState(null);
  const load = useCallback(() => api('/orders/my-orders?limit=30').then((r) => setOrders(r.data)).catch((e) => toast(e.message, 1)), []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  const cancel = async (id) => { try { await api(`/orders/${id}/cancel`, { method: 'PATCH' }); toast('Order cancelled'); load(); } catch (e) { toast(e.message, 1); } };
  return (
    <div className="page"><h2>My orders</h2>
      <div className="cards">
        {(orders || []).map((o) => (
          <article className="oc" key={o.id}>
            <header><b>{o.orderNumber}</b><span className={'pill s-' + o.orderStatus}>{o.orderStatus.replace(/_/g, ' ')}</span></header>
            <small>{o.restaurant?.name} · {new Date(o.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small>
            <div>{o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</div>
            <b>{money(o.total)} <small>{o.paymentMethod}</small></b>
            {['pending', 'confirmed'].includes(o.orderStatus) && <div className="acts"><button className="rej" onClick={() => cancel(o.id)}>Cancel order</button></div>}
          </article>))}
      </div>
      {orders && !orders.length && <p className="empty">No orders yet. Your first one will appear here.</p>}
    </div>
  );
}
