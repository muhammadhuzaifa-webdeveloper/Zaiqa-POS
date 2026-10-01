import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ico, money, toast, unit } from '../api';
import { useAuth } from '../auth';

const NAV = [['counter', '🧾', 'Counter'], ['orders', '🍳', 'Orders'], ['menu', '📋', 'Menu'], ['sales', '📈', 'Sales']];
const TITLES = { counter: 'Counter', orders: 'Kitchen & orders', menu: 'Menu', sales: 'Today' };

function Page({ title, head, extra, children }) {
  return (
    <main>
      <div className="top"><h2>{title}</h2>
        {head.rests.length > 1 && <select aria-label="Restaurant" value={head.rid} onChange={(e) => head.setRid(e.target.value)}>{head.rests.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
        {extra}</div>
      {children}
    </main>
  );
}

export default function Pos() {
  const { logout } = useAuth();
  const [rests, setRests] = useState(null);
  const [rid, setRid] = useState(localStorage.getItem('zq_rid'));
  const [view, setView] = useState('counter');
  const [cats, setCats] = useState([]);
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    const r = (await api('/users/me/restaurants')).data;
    setRests(r); setRid((x) => (r.some((a) => a.id === x) ? x : r[0]?.id));
  }, []);
  useEffect(() => { load().catch((e) => toast(e.message, 1)); }, [load]);
  const loadMenu = useCallback(async () => {
    if (!rid) return;
    const [c, m] = await Promise.all([api(`/restaurants/${rid}/categories`), api(`/restaurants/${rid}/menu?limit=100`)]);
    setCats(c.data); setItems(m.data);
  }, [rid]);
  useEffect(() => { loadMenu().catch((e) => toast(e.message, 1)); if (rid) localStorage.setItem('zq_rid', rid); }, [loadMenu, rid]);

  if (!rests) return <div className="boot">Loading…</div>;
  if (!rests.length) return <Onboard onDone={load} logout={logout} />;
  const rest = rests.find((r) => r.id === rid) || rests[0];
  const head = { rests, rid: rest.id, setRid };
  const common = { head, rest, cats, items };

  return (
    <div className={'app' + (view === 'counter' ? '' : ' wide')}>
      <nav className="rail"><div className="logo">Z</div>
        {NAV.map(([k, e, t]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}><b>{e}</b>{t}</button>)}
        <button className="out" onClick={logout}><b>↩</b>Sign out</button></nav>
      {view === 'counter' && <Counter {...common} />}
      {view === 'orders' && <Orders {...common} />}
      {view === 'menu' && <MenuMgr {...common} setItems={setItems} reload={loadMenu} />}
      {view === 'sales' && <Sales {...common} />}
    </div>
  );
}

function Onboard({ onDone, logout }) {
  const [f, setF] = useState({ name: '', address: '', city: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const go = async (e) => {
    e.preventDefault();
    try { await api('/restaurants', { method: 'POST', body: f }); toast('Restaurant created'); onDone(); } catch (x) { toast(x.message, 1); }
  };
  return (
    <form className="onb" onSubmit={go}>
      <h2>Set up your restaurant</h2><p className="hint">You can add categories and dishes on the next screen.</p>
      <input placeholder="Restaurant name" value={f.name} onChange={set('name')} required />
      <input placeholder="Address" value={f.address} onChange={set('address')} required />
      <input placeholder="City" value={f.city} onChange={set('city')} required />
      <button className="primary">Create restaurant</button><button type="button" className="ghost" onClick={logout}>Sign out</button>
    </form>
  );
}

function Counter({ head, rest, cats, items }) {
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState({});
  const [type, setType] = useState('dine_in');
  const [pay, setPay] = useState('cash');
  const [f, setF] = useState({ table: '', name: '', disc: '' });
  const [flash, setFlash] = useState(null);
  const [rec, setRec] = useState(null);
  const [busy, setBusy] = useState(false);
  const cn = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c.name])), [cats]);
  useEffect(() => { setCart({}); setCat('all'); }, [rest.id]);

  const list = items.filter((i) => (cat === 'all' || i.category === cat) && i.name.toLowerCase().includes(q.toLowerCase()));
  const lines = Object.values(cart);
  const sub = lines.reduce((s, l) => s + unit(l.it) * l.q, 0);
  const disc = Math.min(+f.disc || 0, sub);
  const add = (it) => {
    if (!it.isAvailable) return toast('That dish is sold out', 1);
    setCart((c) => ({ ...c, [it.id]: { it, q: (c[it.id]?.q || 0) + 1 } })); setFlash(it.id);
  };
  const chg = (id, d) => setCart((c) => { const l = c[id]; const n = { ...c }; if (l.q + d <= 0) delete n[id]; else n[id] = { ...l, q: l.q + d }; return n; });
  const charge = async () => {
    setBusy(true);
    try {
      const { data } = await api(`/restaurants/${rest.id}/pos-orders`, { method: 'POST', body: {
        orderType: type, table: (type === 'dine_in' && f.table) || undefined, customerName: f.name || undefined,
        items: lines.map((l) => ({ menuItemId: l.it.id, quantity: l.q })), paymentMethod: pay, discount: disc } });
      setRec(data); setCart({}); setF({ table: '', name: '', disc: '' });
    } catch (e) { toast(e.message, 1); } finally { setBusy(false); }
  };

  return (<>
    <main>
      <div className="top"><h2>Counter</h2>
        {head.rests.length > 1 && <select aria-label="Restaurant" value={head.rid} onChange={(e) => head.setRid(e.target.value)}>{head.rests.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
        <input type="search" placeholder="Search dishes" aria-label="Search dishes" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="chips">{[{ id: 'all', name: 'All' }, ...cats].map((c) => <button key={c.id} className={'chip' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>{c.name}</button>)}</div>
      <div className="grid">
        {list.map((i) => (
          <button key={i.id} className={'tile' + (i.isAvailable ? '' : ' out')} onClick={() => add(i)}>
            <span className="e">{ico((cn[i.category] || '') + ' ' + i.name)}</span><b>{i.name}</b>
            <span className="p">{i.discountPrice && i.discountPrice < i.price && <s>{money(i.price)}</s>}{money(unit(i))}</span>
          </button>))}
      </div>
      {!list.length && <p className="empty">{items.length ? 'No dishes match your search.' : 'No dishes yet. Add categories and dishes in Menu.'}</p>}
    </main>
    <aside className="ticket">
      <h3>Current order</h3>
      <div className="seg">{[['dine_in', 'Dine in'], ['takeaway', 'Takeaway'], ['delivery', 'Delivery']].map(([v, t]) => <button key={v} className={type === v ? 'on' : ''} onClick={() => setType(v)}>{t}</button>)}</div>
      <div className="row2" style={type === 'dine_in' ? {} : { gridTemplateColumns: '1fr' }}>
        <input placeholder="Customer name (optional)" aria-label="Customer name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        {type === 'dine_in' && <input placeholder="Table" aria-label="Table" value={f.table} onChange={(e) => setF({ ...f, table: e.target.value })} />}
      </div>
      <div className="lines">
        {lines.length ? lines.map((l) => (
          <div key={l.it.id} className={'ln' + (flash === l.it.id ? ' new' : '')} onAnimationEnd={() => setFlash(null)}>
            <div><b>{l.it.name}</b><br /><small>{money(unit(l.it))} each</small></div>
            <div className="qty"><button onClick={() => chg(l.it.id, -1)} aria-label="Remove one">−</button><b>{l.q}</b><button onClick={() => chg(l.it.id, 1)} aria-label="Add one">+</button></div>
            <b>{money(unit(l.it) * l.q)}</b>
          </div>)) : <p className="empty">Tap a dish to start an order.</p>}
      </div>
      <div className="tot">
        <div><span>Subtotal</span><span>{money(sub)}</span></div>
        <div><span>Discount (Rs)</span><input type="number" min="0" style={{ width: 100, padding: '6px 8px', textAlign: 'right' }} value={f.disc} onChange={(e) => setF({ ...f, disc: e.target.value })} /></div>
        <div className="g"><span>Total</span><span>{money(sub - disc)}</span></div>
      </div>
      <div className="pay">{['cash', 'card'].map((p) => <button key={p} className={pay === p ? 'on' : ''} onClick={() => setPay(p)}>{p === 'cash' ? 'Cash' : 'Card'}</button>)}</div>
      <button className="primary charge" disabled={!sub || busy} onClick={charge}>{sub ? `Charge ${money(sub - disc)}` : 'Charge'}</button>
    </aside>
    {rec && <Receipt o={rec} name={rest.name} close={() => setRec(null)} />}
  </>);
}

function Receipt({ o, name, close }) {
  return (
    <div className="modal" onClick={close}>
      <div className="receipt" onClick={(e) => e.stopPropagation()}>
        <h3>ZAIQA</h3>
        <div className="c">{name}<br />{o.orderNumber} · {o.orderType.replace('_', ' ')}{o.table ? ' · table ' + o.table : ''}</div><hr />
        {o.items.map((i) => <div className="r" key={i.name}><span>{i.quantity} × {i.name}</span><span>{money(i.subtotal)}</span></div>)}<hr />
        {!!o.discount && <div className="r"><span>Discount</span><span>− {money(o.discount)}</span></div>}
        <div className="r"><b>Total</b><b>{money(o.total)}</b></div>
        <div className="c">{o.paymentStatus === 'paid' ? 'Paid by ' + o.paymentMethod : 'Payment pending'}</div>
        <button className="primary" autoFocus onClick={close} style={{ marginTop: 8 }}>New order</button>
      </div>
    </div>
  );
}

const ACT = {
  pending: () => [['confirmed', 'Confirm']], confirmed: () => [['preparing', 'Start cooking']], preparing: () => [['ready', 'Mark ready']],
  ready: (o) => [o.orderType === 'delivery' ? ['out_for_delivery', 'Dispatch'] : ['delivered', 'Hand over']], out_for_delivery: () => [['delivered', 'Mark delivered']],
};
const DONE = ['delivered', 'cancelled', 'rejected'];

function Orders({ head, rest }) {
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('active');
  const load = useCallback(() => api(`/restaurants/${rest.id}/orders?limit=60`).then((r) => setOrders(r.data)).catch((e) => toast(e.message, 1)), [rest.id]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  const adv = async (id, s) => {
    try { await api(`/orders/${id}/status`, { method: 'PATCH', body: { status: s } }); toast('Order ' + s.replace(/_/g, ' ')); load(); } catch (e) { toast(e.message, 1); }
  };
  const list = orders.filter((o) => DONE.includes(o.orderStatus) === (tab === 'done'));
  return (
    <Page title="Kitchen & orders" head={head}>
      <div className="tabs">{[['active', 'In progress'], ['done', 'Finished']].map(([v, t]) => <button key={v} className={'chip' + (tab === v ? ' on' : '')} onClick={() => setTab(v)}>{t}</button>)}</div>
      <div className="cards">
        {list.map((o) => (
          <article className="oc" key={o.id}>
            <header><b>{o.orderNumber}</b><span className={'pill s-' + o.orderStatus}>{o.orderStatus.replace(/_/g, ' ')}</span></header>
            <small>{new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {o.orderType.replace('_', ' ')}{o.table ? ' · table ' + o.table : ''}{o.customerName ? ' · ' + o.customerName : ''}</small>
            <div>{o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</div>
            <b>{money(o.total)} <small>{o.paymentStatus}</small></b>
            <div className="acts">
              {(ACT[o.orderStatus]?.(o) || []).map(([s, t]) => <button key={s} className="primary" onClick={() => adv(o.id, s)}>{t}</button>)}
              {o.orderStatus === 'pending' && <button className="rej" onClick={() => adv(o.id, 'rejected')}>Reject</button>}
            </div>
          </article>))}
      </div>
      {!list.length && <p className="empty">{tab === 'active' ? 'No orders in progress.' : 'Nothing finished yet.'}</p>}
    </Page>
  );
}

function MenuMgr({ head, rest, cats, items, setItems, reload }) {
  const [n, setN] = useState({ name: '', category: '', price: '', time: '' });
  const [cname, setCname] = useState('');
  const cn = Object.fromEntries(cats.map((c) => [c.id, c.name]));
  const tog = async (i) => {
    try { const { data } = await api(`/menu/${i.id}/availability`, { method: 'PATCH', body: { isAvailable: !i.isAvailable } }); setItems((l) => l.map((x) => (x.id === i.id ? data : x))); toast(i.name + (data.isAvailable ? ' is back' : ' marked sold out')); } catch (e) { toast(e.message, 1); }
  };
  const addCat = async () => {
    try { await api(`/restaurants/${rest.id}/categories`, { method: 'POST', body: { name: cname, sortOrder: cats.length + 1 } }); setCname(''); reload(); toast('Category added'); } catch (e) { toast(e.message, 1); }
  };
  const addItem = async () => {
    try {
      const { data } = await api(`/restaurants/${rest.id}/menu`, { method: 'POST', body: { category: n.category || cats[0]?.id, name: n.name, price: +n.price, preparationTime: +n.time || 15 } });
      setItems((l) => [...l, data]); setN({ name: '', category: n.category, price: '', time: '' }); toast('Dish added');
    } catch (e) { toast(e.message, 1); }
  };
  return (
    <Page title="Menu" head={head}>
      <div className="panel"><h3 style={{ marginBottom: 10 }}>Add a category</h3>
        <div className="row2" style={{ gridTemplateColumns: '1fr auto' }}><input placeholder="e.g. Burgers" value={cname} onChange={(e) => setCname(e.target.value)} /><button className="primary" onClick={addCat} disabled={!cname}>Add category</button></div></div>
      <div className="panel"><h3 style={{ marginBottom: 10 }}>Add a dish</h3>
        <div className="form4">
          <input placeholder="Dish name" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
          <select value={n.category || cats[0]?.id || ''} onChange={(e) => setN({ ...n, category: e.target.value })}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input type="number" min="0" placeholder="Price" value={n.price} onChange={(e) => setN({ ...n, price: e.target.value })} />
          <input type="number" min="1" placeholder="Minutes" value={n.time} onChange={(e) => setN({ ...n, time: e.target.value })} />
          <button className="primary" onClick={addItem} disabled={!cats.length || !n.name || !n.price}>Add dish</button>
        </div></div>
      <div className="panel">
        {items.map((i) => (
          <div className="mrow" key={i.id}><span>{ico((cn[i.category] || '') + ' ' + i.name)}</span><span><b>{i.name}</b><br /><small>{cn[i.category]}</small></span><b>{money(unit(i))}</b>
            <button className={'sw' + (i.isAvailable ? ' on' : '')} role="switch" aria-checked={i.isAvailable} aria-label={'Available: ' + i.name} onClick={() => tog(i)} /></div>))}
        {!items.length && <p className="empty">Your menu is empty. Add a category, then your first dish.</p>}
      </div>
    </Page>
  );
}

function Sales({ head, rest }) {
  const [d, setD] = useState(null);
  const [go, setGo] = useState(false);
  useEffect(() => {
    setGo(false);
    api(`/restaurants/${rest.id}/stats`).then((r) => { setD(r.data); setTimeout(() => setGo(true), 60); }).catch((e) => toast(e.message, 1));
  }, [rest.id]);
  if (!d) return <Page title="Today" head={head}><p className="empty">Loading…</p></Page>;
  const mx = Math.max(1, ...d.topItems.map((t) => t.qty));
  return (
    <Page title="Today" head={head}>
      <div className="stats">{[['Sales today', money(d.salesToday)], ['Orders', d.ordersToday], ['Average order', money(d.avgTicket)], ['In the kitchen', d.inKitchen]].map(([a, b]) => <div className="stat" key={a}><span>{a}</span><b>{b}</b></div>)}</div>
      <div className="panel"><h3>Best sellers today</h3>
        {d.topItems.map((t) => <div className="bar" key={t.name}><span>{t.name}</span><div><i style={{ width: go ? (t.qty / mx) * 100 + '%' : 0 }} /></div><b>{t.qty}</b></div>)}
        {!d.topItems.length && <p className="empty">No sales yet today. Your first order will show up here.</p>}</div>
    </Page>
  );
}
