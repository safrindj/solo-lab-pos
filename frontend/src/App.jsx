import { useCallback, useEffect, useRef, useState } from 'react';

// Set VITE_API_BASE_URL when the API is hosted separately.
// Otherwise, use localhost during development and same-origin /api in production.
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api')
).replace(/\/+$/, '');

async function apiRequest(path, options) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const text = await response.text();

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('The server returned an invalid response.');
    }
  }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Request failed (${response.status}).`);
  }

  return data;
}

function getList(data, key) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  return [];
}

const cardStyle = {
  background: 'white',
  padding: '25px',
  borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};

const cardHeadingStyle = {
  color: '#64748b',
  fontSize: '14px',
  margin: 0,
};

const metricStyle = {
  fontSize: '30px',
  fontWeight: 'bold',
  margin: '10px 0',
};

const rowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  padding: '12px',
  marginBottom: '8px',
  background: 'white',
  borderRadius: '8px',
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState({});
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('Cash Payment');
  const [cashGiven, setCashGiven] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submittingSale, setSubmittingSale] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  // Ignore stale product-search responses when the user types quickly.
  const productRequestId = useRef(0);

  const loadDashboard = useCallback(async () => {
    try {
      setError('');
      setDashboard((await apiRequest('/dashboard')) || {});
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    const requestId = ++productRequestId.current;

    try {
      setError('');
      setLoading(true);
      const query = new URLSearchParams({ search: searchTerm });
      const data = await apiRequest(`/products?${query}`);

      if (requestId === productRequestId.current) {
        setProducts(getList(data, 'products'));
      }
    } catch (err) {
      if (requestId === productRequestId.current) {
        setError(err.message);
        setProducts([]);
      }
    } finally {
      if (requestId === productRequestId.current) {
        setLoading(false);
      }
    }
  }, [searchTerm]);

  const loadSales = useCallback(async () => {
    try {
      setError('');
      setLoading(true);
      setSales(getList(await apiRequest('/sales'), 'sales'));
    } catch (err) {
      setError(err.message);
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      setError('');
      setLoading(true);
      setCustomers(getList(await apiRequest('/customers'), 'customers'));
    } catch (err) {
      setError(err.message);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'dashboard') loadDashboard();
    if (activeTab === 'pos' || activeTab === 'stock') loadProducts();
    if (activeTab === 'sales') loadSales();
    if (activeTab === 'customers') loadCustomers();
  }, [
    activeTab,
    searchTerm,
    loadDashboard,
    loadProducts,
    loadSales,
    loadCustomers,
  ]);

  const addToCart = (product) => {
    const productId = product.id ?? product.product_id;

    if (productId == null) {
      setError('This product has no ID and cannot be added to the cart.');
      return;
    }

    setError('');

    setCart((previousCart) => {
      const existing = previousCart.find(
        (item) => (item.id ?? item.product_id) === productId
      );

      if (existing) {
        return previousCart.map((item) =>
          (item.id ?? item.product_id) === productId
            ? { ...item, qty: item.qty + 1 }
            : item
        );
      }

      return [...previousCart, { ...product, qty: 1 }];
    });
  };

  const removeFromCart = (productId) => {
    setCart((previousCart) =>
      previousCart.filter(
        (item) => (item.id ?? item.product_id) !== productId
      )
    );
  };

  const subtotal = cart.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * item.qty,
    0
  );

  const discountAmount = Math.min(
    subtotal,
    Math.max(0, Number(discount) || 0)
  );

  const grandTotal = Math.max(0, subtotal - discountAmount);
  const cashAmount = Math.max(0, Number(cashGiven) || 0);
  const change = cashAmount - grandTotal;

  const completeSale = async () => {
    setError('');
    setSuccessMessage('');

    if (cart.length === 0) {
      setError('Add at least one product before completing a sale.');
      return;
    }

    if (paymentMethod === 'Cash Payment' && cashAmount < grandTotal) {
      setError('Cash received must be at least the total amount due.');
      return;
    }

    try {
      setSubmittingSale(true);

      await apiRequest('/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart,
          subtotal,
          discount: discountAmount,
          grand_total: grandTotal,
          payment_method: paymentMethod,
          cash_given: paymentMethod === 'Cash Payment' ? cashAmount : 0,
          change_amount: paymentMethod === 'Cash Payment' ? change : 0,
          cashier: 'Admin',
        }),
      });

      setSuccessMessage('Sale completed successfully.');
      setCart([]);
      setDiscount('0');
      setCashGiven('');

      // Keep the dashboard figures up to date after a sale.
      await loadDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingSale(false);
    }
  };

  const addProduct = async (event) => {
    event.preventDefault();

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    setError('');
    setSuccessMessage('');
    setSavingProduct(true);

    try {
      await apiRequest('/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          code: form.get('code'),
          price: Number(form.get('price')),
          cost_price: Number(form.get('cost_price')) || 0,
          stock: Number(form.get('stock')) || 0,
          category: form.get('category') || 'General',
        }),
      });

      formElement.reset();
      await loadProducts();
      setSuccessMessage('Product added successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingProduct(false);
    }
  };

  const money = (value) =>
    `Rs. ${(Number(value) || 0).toLocaleString()}`;

  const buttonStyle = (selected = false) => ({
    width: '100%',
    textAlign: 'left',
    padding: '14px 24px',
    border: 'none',
    background: selected ? '#1e40af' : 'transparent',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
  });

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <aside
        style={{
          width: '260px',
          flexShrink: 0,
          background: '#0f172a',
          color: 'white',
          padding: '20px 0',
        }}
      >
        <div
          style={{
            padding: '0 20px 30px',
            borderBottom: '1px solid #334155',
            marginBottom: '20px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px' }}>SOLO LAB MOBILES</h2>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>
            POS Management System
          </p>
        </div>

        {[
          { id: 'dashboard', label: 'Dashboard', icon: '📊' },
          { id: 'pos', label: 'POS Billing', icon: '🛒' },
          { id: 'sales', label: 'Sales History', icon: '📋' },
          { id: 'customers', label: 'Customer Management', icon: '👥' },
          { id: 'stock', label: 'Inventory', icon: '📦' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveTab(item.id)}
            style={buttonStyle(activeTab === item.id)}
          >
            <span aria-hidden="true">{item.icon}</span> {item.label}
          </button>
        ))}
      </aside>

      <main
        style={{
          flex: 1,
          minWidth: 0,
          padding: '30px',
          background: '#f8fafc',
        }}
      >
        {error && (
          <div
            role="alert"
            style={{
              padding: '12px 16px',
              marginBottom: '20px',
              color: '#991b1b',
              background: '#fee2e2',
              borderRadius: '8px',
            }}
          >
            {error}
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            style={{
              padding: '12px 16px',
              marginBottom: '20px',
              color: '#166534',
              background: '#dcfce7',
              borderRadius: '8px',
            }}
          >
            {successMessage}
          </div>
        )}

        {loading && <p role="status">Loading…</p>}

        {activeTab === 'dashboard' && (
          <section>
            <h1 style={{ fontSize: '28px', marginBottom: '5px' }}>
              Dashboard
            </h1>
            <p style={{ color: '#64748b', marginBottom: '30px' }}>
              Business overview
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '20px',
              }}
            >
              <div style={cardStyle}>
                <h3 style={cardHeadingStyle}>TODAY&apos;S INVOICES</h3>
                <p style={metricStyle}>
                  {dashboard.todayInvoices ?? dashboard.today_invoices ?? 0}
                </p>
              </div>
              <div style={cardStyle}>
                <h3 style={cardHeadingStyle}>GROSS EARNINGS</h3>
                <p style={metricStyle}>
                  {money(dashboard.todayRevenue ?? dashboard.today_revenue)}
                </p>
              </div>
              <div style={cardStyle}>
                <h3 style={cardHeadingStyle}>TOTAL CUSTOMERS</h3>
                <p style={metricStyle}>
                  {dashboard.totalCustomers ?? dashboard.total_customers ?? 0}
                </p>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'pos' && (
          <section>
            <h1>POS Billing</h1>
            <label>
              Search products{' '}
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by product name"
              />
            </label>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '24px',
                marginTop: '20px',
              }}
            >
              <div>
                <h2>Products</h2>
                {products.map((product) => (
                  <div
                    key={product.id ?? product.product_id}
                    style={rowStyle}
                  >
                    <span>
                      {product.name ??
                        product.product_name ??
                        'Unnamed product'}
                      {' — '}
                      {money(product.price)}
                    </span>
                    <button type="button" onClick={() => addToCart(product)}>
                      Add
                    </button>
                  </div>
                ))}
                {!loading && products.length === 0 && <p>No products found.</p>}
              </div>

              <div>
                <h2>Cart</h2>
                {cart.map((item) => {
                  const id = item.id ?? item.product_id;

                  return (
                    <div key={id} style={rowStyle}>
                      <span>
                        {item.name ?? item.product_name ?? 'Product'} ×{' '}
                        {item.qty}
                      </span>
                      <span>{money((Number(item.price) || 0) * item.qty)}</span>
                      <button type="button" onClick={() => removeFromCart(id)}>
                        Remove
                      </button>
                    </div>
                  );
                })}

                <p>Subtotal: {money(subtotal)}</p>
                <label>
                  Discount amount:{' '}
                  <input
                    type="number"
                    min="0"
                    max={subtotal}
                    step="0.01"
                    value={discount}
                    onChange={(event) => setDiscount(event.target.value)}
                  />
                </label>
                <p>Total: {money(grandTotal)}</p>

                <label>
                  Payment method:{' '}
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                  >
                    <option>Cash Payment</option>
                    <option>Card Payment</option>
                    <option>Other</option>
                  </select>
                </label>

                {paymentMethod === 'Cash Payment' && (
                  <>
                    <div>
                      <label>
                        Cash received:{' '}
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={cashGiven}
                          onChange={(event) =>
                            setCashGiven(event.target.value)
                          }
                        />
                      </label>
                    </div>
                    <p>Change: {money(Math.max(0, change))}</p>
                  </>
                )}

                <button
                  type="button"
                  disabled={submittingSale || cart.length === 0}
                  onClick={completeSale}
                >
                  {submittingSale ? 'Processing…' : 'Complete Sale'}
                </button>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'sales' && (
          <section>
            <h1>Sales History</h1>
            {sales.map((sale, index) => (
              <div
                key={sale.id ?? sale.sale_id ?? index}
                style={rowStyle}
              >
                <span>Sale #{sale.id ?? sale.sale_id ?? index + 1}</span>
                <span>
                  {money(sale.grand_total ?? sale.total ?? sale.amount)}
                </span>
                <span>{sale.payment_method ?? ''}</span>
              </div>
            ))}
            {!loading && sales.length === 0 && <p>No sales found.</p>}
          </section>
        )}

        {activeTab === 'customers' && (
          <section>
            <h1>Customers</h1>
            {customers.map((customer, index) => (
              <div
                key={customer.id ?? customer.customer_id ?? index}
                style={rowStyle}
              >
                <span>
                  {customer.name ??
                    customer.customer_name ??
                    'Unnamed customer'}
                </span>
                <span>{customer.phone ?? customer.email ?? ''}</span>
              </div>
            ))}
            {!loading && customers.length === 0 && <p>No customers found.</p>}
          </section>
        )}

        {activeTab === 'stock' && (
          <section style={{ padding: '20px' }}>
            <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>
              Inventory
            </h1>

            <div
              style={{
                background: 'white',
                padding: '25px',
                borderRadius: '10px',
                marginBottom: '30px',
                maxWidth: '600px',
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              <h3 style={{ marginTop: 0, color: '#1e40af' }}>
                ➕ Add New Product
              </h3>

              <form onSubmit={addProduct}>
                <div style={{ marginBottom: '12px' }}>
                  <label
                    htmlFor="product-name"
                    style={{
                      display: 'block',
                      fontWeight: 500,
                      marginBottom: '4px',
                    }}
                  >
                    Product Name
                  </label>
                  <input
                    id="product-name"
                    name="name"
                    required
                    style={formInputStyle}
                    placeholder="e.g. Samsung Galaxy S24"
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label
                    htmlFor="product-code"
                    style={{
                      display: 'block',
                      fontWeight: 500,
                      marginBottom: '4px',
                    }}
                  >
                    Product Code
                  </label>
                  <input
                    id="product-code"
                    name="code"
                    required
                    style={formInputStyle}
                    placeholder="e.g. SAM-S24 (no spaces)"
                  />
                </div>

                <div style={formGridStyle}>
                  <div>
                    <label
                      htmlFor="product-price"
                      style={formLabelStyle}
                    >
                      Selling Price (Rs)
                    </label>
                    <input
                      id="product-price"
                      name="price"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      style={formInputStyle}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="product-cost-price"
                      style={formLabelStyle}
                    >
                      Cost Price (Rs)
                    </label>
                    <input
                      id="product-cost-price"
                      name="cost_price"
                      type="number"
                      min="0"
                      step="0.01"
                      style={formInputStyle}
                    />
                  </div>
                </div>

                <div style={formGridStyle}>
                  <div>
                    <label
                      htmlFor="product-stock"
                      style={formLabelStyle}
                    >
                      Stock Quantity
                    </label>
                    <input
                      id="product-stock"
                      name="stock"
                      type="number"
                      min="0"
                      step="1"
                      required
                      style={formInputStyle}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="product-category"
                      style={formLabelStyle}
                    >
                      Category
                    </label>
                    <input
                      id="product-category"
                      name="category"
                      style={formInputStyle}
                      placeholder="e.g. Phones / Chargers"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingProduct}
                  style={{
                    background: '#16a34a',
                    color: 'white',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '6px',
                    fontSize: '15px',
                    cursor: savingProduct ? 'wait' : 'pointer',
                    width: '100%',
                  }}
                >
                  {savingProduct ? 'Saving…' : '✅ Save Product'}
                </button>
              </form>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '15px',
              }}
            >
              {products.map((product, index) => {
                const stock = Number(
                  product.stock ?? product.quantity ?? 0
                );

                return (
                  <div
                    key={product.id ?? product.product_id ?? index}
                    style={{
                      padding: '20px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      background: 'white',
                    }}
                  >
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>
                      {product.name ??
                        product.product_name ??
                        'Unnamed product'}
                    </h4>
                    <p
                      style={{
                        margin: '4px 0',
                        color: '#64748b',
                        fontSize: '13px',
                      }}
                    >
                      Code: {product.code ?? product.product_code ?? '—'}
                    </p>
                    <p
                      style={{
                        margin: '8px 0',
                        fontSize: '18px',
                        fontWeight: 'bold',
                        color: '#1e40af',
                      }}
                    >
                      {money(product.price)}
                    </p>
                    <p
                      style={{
                        margin: '4px 0',
                        color: stock <= 5 ? '#dc2626' : '#16a34a',
                      }}
                    >
                      Stock: {stock} {stock <= 5 && '⚠️ Low Stock'}
                    </p>
                  </div>
                );
              })}
              {!loading && products.length === 0 && <p>No products found.</p>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

const formInputStyle = {
  width: '100%',
  padding: '10px',
  borderRadius: '5px',
  border: '1px solid #cbd5e1',
  boxSizing: 'border-box',
};

const formLabelStyle = {
  display: 'block',
  fontWeight: 500,
  marginBottom: '4px',
};

const formGridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '12px',
  marginBottom: '12px',
};

export default App;
