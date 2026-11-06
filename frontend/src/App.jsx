import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE = import.meta.env.DEV
  ? 'http://localhost:5000/api'
  : 'https://ctdz-your-link.vercel.app/api'; 
async function fetchJson(url, options) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

function App() {
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [cashGiven, setCashGiven] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash Payment');
  const [activeTab, setActiveTab] = useState('pos');
  const [sales, setSales] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingSales, setLoadingSales] = useState(false);
  const [savingSale, setSavingSale] = useState(false);
  const [error, setError] = useState('');

  const searchInput = useRef(null);
  const savingSaleRef = useRef(false);

  const subtotal = cart.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * item.qty,
    0
  );
  const grandTotal = Math.max(0, subtotal - discount);
  const numericCash = Number(cashGiven);
  const change = Math.max(0, numericCash - grandTotal);

  // Abort old requests when the tab or search term changes.
  useEffect(() => {
    if (activeTab !== 'pos' && activeTab !== 'products') return undefined;

    const controller = new AbortController();

    async function loadProducts() {
      setLoadingProducts(true);
      setError('');

      try {
        const query = encodeURIComponent(searchTerm.trim());
        const data = await fetchJson(
          `${API_BASE}/products?search=${query}`,
          { signal: controller.signal }
        );

        setProducts(Array.isArray(data) ? data : data.products ?? []);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setProducts([]);
          setError('Could not load products. Check that the backend is running.');
        }
      } finally {
        if (!controller.signal.aborted) setLoadingProducts(false);
      }
    }

    loadProducts();
    return () => controller.abort();
  }, [activeTab, searchTerm]);

  const loadSales = useCallback(async (signal) => {
    setLoadingSales(true);
    setError('');

    try {
      const data = await fetchJson(`${API_BASE}/sales`, { signal });
      setSales(Array.isArray(data) ? data : data.sales ?? []);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setSales([]);
        setError('Could not load sales. Check that the backend is running.');
      }
    } finally {
      if (!signal?.aborted) setLoadingSales(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'sales') return undefined;

    const controller = new AbortController();
    loadSales(controller.signal);
    return () => controller.abort();
  }, [activeTab, loadSales]);

  function addToCart(product) {
    if (product.id == null) {
      setError('This product cannot be added because it has no ID.');
      return;
    }

    setError('');
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);

      if (existing) {
        return current.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }

      return [...current, { ...product, qty: 1 }];
    });

    setSearchTerm('');
    setTimeout(() => searchInput.current?.focus(), 0);
  }

  function removeFromCart(productId) {
    setCart((current) => current.filter((item) => item.id !== productId));
  }

  function updateQty(productId, delta) {
    setCart((current) =>
      current.map((item) =>
        item.id === productId
          ? { ...item, qty: Math.max(1, item.qty + delta) }
          : item
      )
    );
  }

  function clearCart() {
    setCart([]);
    setDiscount(0);
    setCashGiven('');
    setError('');
  }

  async function completeSale() {
    if (savingSaleRef.current) return;

    if (cart.length === 0) {
      setError('The cart is empty.');
      return;
    }

    if (
      paymentMethod === 'Cash Payment' &&
      (!Number.isFinite(numericCash) || numericCash < grandTotal)
    ) {
      setError('Enter a valid cash amount that covers the total.');
      return;
    }

    savingSaleRef.current = true;
    setSavingSale(true);
    setError('');

    try {
      const data = await fetchJson(`${API_BASE}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart,
          subtotal,
          discount,
          grand_total: grandTotal,
          payment_method: paymentMethod,
          cash_given: paymentMethod === 'Cash Payment' ? numericCash : 0,
          change_amount: paymentMethod === 'Cash Payment' ? change : 0,
          cashier: 'Shop Owner',
        }),
      });

      if (!data.success) {
        throw new Error(data.message || 'The sale was not accepted.');
      }

      window.alert(
        `Sale complete!\nInvoice: ${data.invoice_no ?? '—'}\nTotal: LKR ${grandTotal.toFixed(2)}${
          paymentMethod === 'Cash Payment'
            ? `\nChange: LKR ${change.toFixed(2)}`
            : ''
        }`
      );

      clearCart();
      await loadSales();
      searchInput.current?.focus();
    } catch (err) {
      setError(err.message || 'Failed to save the sale. Check the backend.');
    } finally {
      savingSaleRef.current = false;
      setSavingSale(false);
    }
  }

  const buttonStyle = {
    padding: '10px 14px',
    border: 0,
    borderRadius: 6,
    cursor: 'pointer',
  };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        fontFamily: "'Segoe UI', sans-serif",
        background: '#f0f4f8',
      }}
    >
      <aside
        style={{
          width: 220,
          padding: 20,
          background: '#0f172a',
          color: 'white',
        }}
      >
        <h2 style={{ color: '#fbbf24', fontSize: 18 }}>SOLO LAB MOBILES</h2>
        <p style={{ color: '#94a3b8', fontSize: 12 }}>POS Billing System</p>

        <nav>
          {[
            ['pos', '🛒 POS Billing'],
            ['sales', '📊 Sales History'],
            ['products', '📦 Products'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              style={{
                ...buttonStyle,
                display: 'block',
                width: '100%',
                marginBottom: 6,
                textAlign: 'left',
                color: 'white',
                background: activeTab === id ? '#1e40af' : 'transparent',
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: 24, overflowY: 'auto' }}>
        {error && (
          <p role="alert" style={{ color: '#b91c1c' }}>
            {error}
          </p>
        )}

        {activeTab === 'pos' && (
          <>
            <header
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
              }}
            >
              <h1 style={{ margin: 0 }}>POS Billing</h1>
              <button type="button" onClick={clearCart} style={buttonStyle}>
                Clear cart
              </button>
            </header>

            <input
              ref={searchInput}
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Scan barcode or search product name..."
              aria-label="Search products"
              style={{
                boxSizing: 'border-box',
                width: '100%',
                padding: 14,
                marginBottom: 20,
                border: '2px solid #3b82f6',
                borderRadius: 8,
                fontSize: 16,
              }}
              autoFocus
            />

            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <section style={{ flex: 1, minWidth: 280 }}>
                {loadingProducts && <p>Loading products…</p>}

                {searchTerm.trim() && !loadingProducts && (
                  products.length ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                        gap: 12,
                      }}
                    >
                      {products.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => addToCart(product)}
                          style={{
                            padding: 16,
                            textAlign: 'left',
                            background: 'white',
                            border: 0,
                            borderRadius: 10,
                            cursor: 'pointer',
                          }}
                        >
                          <small>{product.code || '—'}</small>
                          <h3>{product.name}</h3>
                          <strong>
                            LKR {Number(product.price || 0).toFixed(2)}
                          </strong>
                          <p>Stock: {product.stock ?? 0}</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p>No products found.</p>
                  )
                )}
              </section>

              <section
                style={{
                  boxSizing: 'border-box',
                  width: 380,
                  maxWidth: '100%',
                  padding: 20,
                  background: 'white',
                  borderRadius: 12,
                }}
              >
                <h2>Invoice Summary</h2>

                {cart.length === 0 ? (
                  <p>Empty cart</p>
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 0',
                        borderBottom: '1px solid #e2e8f0',
                      }}
                    >
                      <div>
                        <strong>{item.name}</strong>
                        <div>
                          LKR {Number(item.price || 0).toFixed(2)} × {item.qty}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          aria-label={`Decrease quantity of ${item.name}`}
                          onClick={() => updateQty(item.id, -1)}
                        >
                          −
                        </button>
                        <span>{item.qty}</span>
                        <button
                          type="button"
                          aria-label={`Increase quantity of ${item.name}`}
                          onClick={() => updateQty(item.id, 1)}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${item.name}`}
                          onClick={() => removeFromCart(item.id)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))
                )}

                <p>Subtotal: LKR {subtotal.toFixed(2)}</p>

                <label>
                  Discount
                  <input
                    type="number"
                    min="0"
                    max={subtotal}
                    step="0.01"
                    value={discount}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setDiscount(
                        Number.isFinite(value)
                          ? Math.min(subtotal, Math.max(0, value))
                          : 0
                      );
                    }}
                    style={{ display: 'block', width: '100%', padding: 8 }}
                  />
                </label>

                <h3>Grand total: LKR {grandTotal.toFixed(2)}</h3>

                <label>
                  Payment method
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    style={{ display: 'block', width: '100%', padding: 8 }}
                  >
                    <option>Cash Payment</option>
                    <option>Card Payment</option>
                  </select>
                </label>

                {paymentMethod === 'Cash Payment' && (
                  <label>
                    Cash given
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={cashGiven}
                      onChange={(event) => setCashGiven(event.target.value)}
                      style={{ display: 'block', width: '100%', padding: 8 }}
                    />
                    {numericCash >= grandTotal && grandTotal > 0 && (
                      <span>Change: LKR {change.toFixed(2)}</span>
                    )}
                  </label>
                )}

                <button
                  type="button"
                  onClick={completeSale}
                  disabled={savingSale || grandTotal <= 0}
                  style={{
                    ...buttonStyle,
                    width: '100%',
                    marginTop: 16,
                    color: 'white',
                    background: savingSale || grandTotal <= 0 ? '#94a3b8' : '#16a34a',
                  }}
                >
                  {savingSale ? 'Saving…' : 'Complete sale'}
                </button>
              </section>
            </div>
          </>
        )}

        {activeTab === 'products' && (
          <section>
            <h1>Products</h1>
            {loadingProducts ? (
              <p>Loading products…</p>
            ) : products.length === 0 ? (
              <p>No products found.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', background: 'white', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: 10, textAlign: 'left' }}>Code</th>
                      <th style={{ padding: 10, textAlign: 'left' }}>Name</th>
                      <th style={{ padding: 10, textAlign: 'right' }}>Price</th>
                      <th style={{ padding: 10, textAlign: 'right' }}>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id}>
                        <td style={{ padding: 10 }}>{product.code || '—'}</td>
                        <td style={{ padding: 10 }}>{product.name}</td>
                        <td style={{ padding: 10, textAlign: 'right' }}>
                          LKR {Number(product.price || 0).toFixed(2)}
                        </td>
                        <td style={{ padding: 10, textAlign: 'right' }}>
                          {product.stock ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeTab === 'sales' && (
          <section>
            <h1>Sales History</h1>
            {loadingSales ? (
              <p>Loading sales…</p>
            ) : sales.length === 0 ? (
              <p>No sales recorded yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', background: 'white', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: 10, textAlign: 'left' }}>Invoice #</th>
                      <th style={{ padding: 10, textAlign: 'left' }}>Date/Time</th>
                      <th style={{ padding: 10, textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale, index) => (
                      <tr key={sale.id ?? sale.invoice_no ?? index}>
                        <td style={{ padding: 10 }}>
                          {sale.invoice_no ?? '—'}
                        </td>
                        <td style={{ padding: 10 }}>
                          {sale.created_at
                            ? new Date(sale.created_at).toLocaleString()
                            : '—'}
                        </td>
                        <td style={{ padding: 10, textAlign: 'right' }}>
                          LKR {Number(sale.grand_total ?? sale.total ?? 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
