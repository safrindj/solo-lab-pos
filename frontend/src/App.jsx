import { useState, useEffect, useRef } from 'react';

function App() {
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [cashGiven, setCashGiven] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash Payment');
  const [activeTab, setActiveTab] = useState('pos');
  const [sales, setSales] = useState([]);
  const searchInput = useRef(null);

  useEffect(() => {
    if (activeTab === 'pos') fetchProducts();
  }, [searchTerm, activeTab]);

  const fetchProducts = () => {
    fetch(`http://localhost:5000/api/products?search=${encodeURIComponent(searchTerm)}`)
      .then(res => res.json())
      .then(data => setProducts(data))
      .catch(err => console.log('Server not running — start backend first'));
  };

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...product, qty: 1 }];
    });
    setSearchTerm('');
    setTimeout(() => searchInput.current?.focus(), 50);
  };

  const removeFromCart = (index) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const updateQty = (index, delta) => {
    setCart(prev => {
      const updated = [...prev];
      updated[index].qty = Math.max(1, updated[index].qty + delta);
      return updated;
    });
  };

  const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * item.qty, 0);
  const grandTotal = Math.max(0, subtotal - discount);
  const change = Number(cashGiven) - grandTotal;

  const completeSale = async () => {
    if (cart.length === 0) return alert('⚠️ Cart is empty!');
    if (paymentMethod === 'Cash Payment' && (!cashGiven || Number(cashGiven) < grandTotal)) {
      return alert('⚠️ Insufficient cash amount!');
    }
    try {
      const res = await fetch('http://localhost:5000/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart,
          subtotal,
          discount,
          grand_total: grandTotal,
          payment_method: paymentMethod,
          cash_given: paymentMethod === 'Cash Payment' ? Number(cashGiven) : 0,
          change_amount: paymentMethod === 'Cash Payment' ? change : 0,
          cashier: 'Shop Owner'
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Sale Complete!\nInvoice: ${data.invoice_no}\nTotal: LKR ${grandTotal.toFixed(2)}${paymentMethod === 'Cash Payment' ? `\nChange: LKR ${change.toFixed(2)}` : ''}`);
        setCart([]);
        setDiscount(0);
        setCashGiven('');
        fetchSales();
        searchInput.current?.focus();
      }
    } catch (e) {
      alert('❌ Failed to save sale — check if backend is running');
    }
  };

  const fetchSales = () => {
    fetch('http://localhost:5000/api/sales')
      .then(res => res.json())
      .then(data => setSales(data))
      .catch(err => console.log('Server not running'));
  };

  useEffect(() => {
    if (activeTab === 'sales') fetchSales();
  }, [activeTab]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Segoe UI', sans-serif", background: '#f0f4f8' }}>
      <div style={{ width: '240px', background: '#0f172a', color: 'white', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #1e293b' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: '#fbbf24' }}>SOLO LAB MOBILES</h2>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>POS Billing System</p>
        </div>
        <nav style={{ flex: 1, padding: '20px 10px' }}>
          {[
            { id: 'pos', label: 'POS Billing', icon: '🛒' },
            { id: 'sales', label: 'Sales History', icon: '📊' },
            { id: 'products', label: 'Products', icon: '📦' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                width: '100%', textAlign: 'left', padding: '12px 16px', marginBottom: '4px',
                background: activeTab === tab.id ? '#1e40af' : 'transparent',
                color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        {activeTab === 'pos' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '22px', color: '#1e293b', margin: 0 }}>POS Billing</h1>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setCart([]); setDiscount(0); setCashGiven(''); }} style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', background: '#e2e8f0', cursor: 'pointer' }}>🔄 Clear</button>
                <button style={{ padding: '8px 16px', border: 'none', borderRadius: '6px', background: '#ef4444', color: 'white', cursor: 'pointer' }}>Logout</button>
              </div>
            </div>

            <input
              ref={searchInput}
              type="text"
              placeholder="🔍 Scan barcode or search product name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%', padding: '14px 20px', fontSize: '16px', borderRadius: '10px', border: '2px solid #3b82f6',
                outline: 'none', marginBottom: '24px', boxSizing: 'border-box'
              }}
              autoFocus
            />

            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              <div style={{ flex: 2, minWidth: '400px' }}>
                {searchTerm ? (
                  products.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
                      {products.map(p => (
                        <div key={p.id} onClick={() => addToCart(p)} style={{
                          background: 'white', padding: '16px', borderRadius: '12px', cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.08)', transition: 'transform 0.2s'
                        }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.02)'}
                           onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
                          <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 4px' }}>{p.code || '—'}</p>
                          <h3 style={{ margin: '0 0 8px', fontSize: '15px', color: '#1e293b' }}>{p.name}</h3>
                          <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#dc2626' }}>LKR {Number(p.price).toFixed(2)}</p>
                          <p style={{ fontSize: '12px', color: '#64748b', margin: '8px 0 0' }}>Stock: {p.stock || 0}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                      <p style={{ fontSize: '40px' }}>🔍</p>
                      <p>No products found matching "{searchTerm}"</p>
                    </div>
                  )
                ) : (
                  <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                    <p style={{ fontSize: '48px' }}>📱</p>
                    <p style={{ fontSize: '18px', marginTop: '16px' }}>Ready for Scan or Search</p>
                    <p style={{ fontSize: '14px' }}>Scan a product barcode or type the name/code above</p>
                  </div>
                )}
              </div>

              <div style={{ width: '380px', minWidth: '340px', background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '18px', color: '#1e293b' }}>🛍️ Invoice Summary</h3>
                {cart.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#94a3b8', padding: '30px 0' }}>Empty Cart</p>
                ) : (
                  <div style={{ maxHeight: '240px', overflowY: 'auto', marginBottom: '16px' }}>
                    {cart.map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>{item.name}</p>
                          <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>LKR {Number(item.price).toFixed(2)} × {item.qty}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button onClick={() => updateQty(i, -1)} style={{ width: '24px', height: '24px', border: 'none', borderRadius: '50%', background: '#e2e8f0', cursor: 'pointer' }}>−</button>
                          <span style={{ width: '24px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold' }}>{item.qty}</span>
                          <button onClick={() => updateQty(i, 1)} style={{ width: '24px', height: '24px', border: 'none', borderRadius: '50%', background: '#e2e8f0', cursor: 'pointer' }}>+</button>
                          <button onClick={() => removeFromCart(i)} style={{ marginLeft: '8px', border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '18px' }}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '16px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span>Subtotal</span>
                    <span style={{ fontWeight: 500 }}>LKR {subtotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                    <span>Discount</span>
                    <input
                      type="number"
                      value={discount}
                      onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                      style={{ width: '100px', textAlign: 'right', padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                      min="0"
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '18px', fontWeight: 'bold', color: '#dc2626' }}>
                    <span>Grand Total</span>
                    <span>LKR {grandTotal.toFixed(2)}</span>
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', marginBottom: '12px' }}
                  >
                    <option>Cash Payment</option>
                    <option>Card Payment</option>
                  </select>
                  {paymentMethod === 'Cash Payment' && (
                    <>
                      <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Cash Given</label>
                      <input
                        type="number"
                        value={cashGiven}
                        onChange={(e) => setCashGiven(e.target.value)}
                        placeholder="Enter cash amount..."
                        style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', marginBottom: '8px' }}
                      />
                      {Number(cashGiven) >= grandTotal && grandTotal > 0 && (
                        <p style={{ color: '#16a34a', fontWeight: 'bold', margin: 0 }}>Change: LKR {change.toFixed(2)}</p>
                      )}
                    </>
                  )}
                </div>

                <button
                  onClick={completeSale}
                  style={{
                    width: '100%', padding: '14px', fontSize: '16px', fontWeight: 'bold',
                    background: grandTotal > 0 ? '#16a34a' : '#cbd5e1',
                    color: 'white', border: 'none', borderRadius: '10px', cursor: grandTotal > 0 ? 'pointer' : 'not-allowed'
                  }}
                  disabled={grandTotal <= 0}
                >
                  ✅ Complete Sale
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'sales' && (
          <div>
            <h2 style={{ fontSize: '22px', marginBottom: '20px' }}>📊 Sales History</h2>
            {sales.length === 0 ? (
              <p style={{ color: '#94a3b8' }}>No sales recorded yet</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: '12px', overflow: 'hidden' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th style={{ padding: '1
