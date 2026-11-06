import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: [
    'https://solo-lab-pos-rho.vercel.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ],
  credentials: true
}));

app.use(express.json());

const db = mysql.createPool({
  host: process.env.DB_HOST || 'mysql-1e194bcc-royalsteps007-f9c7f.aivencloud.com',
  port: process.env.DB_PORT || 25866,
  user: process.env.DB_USER || 'avnadmin',
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'defaultdb',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false }
});

// Auto-create ALL new tables
async function initDatabase() {
  try {
    const conn = await db.getConnection();
    console.log('✅ Connected to database');

    // Products table (enhanced)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(100) UNIQUE,
        barcode VARCHAR(100),
        price DECIMAL(10,2) NOT NULL,
        cost_price DECIMAL(10,2) DEFAULT 0,
        stock INT DEFAULT 0,
        category VARCHAR(100),
        supplier VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sales table (enhanced)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_no VARCHAR(50) UNIQUE NOT NULL,
        items TEXT,
        subtotal DECIMAL(10,2),
        discount DECIMAL(10,2) DEFAULT 0,
        grand_total DECIMAL(10,2),
        payment_method VARCHAR(50),
        cash_given DECIMAL(10,2),
        change_amount DECIMAL(10,2),
        customer_id INT DEFAULT NULL,
        cashier VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Customers
    await conn.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        email VARCHAR(255),
        loyalty_points INT DEFAULT 0,
        total_spent DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Suppliers
    await conn.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact_person VARCHAR(255),
        phone VARCHAR(20),
        email VARCHAR(255),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Purchases
    await conn.query(`
      CREATE TABLE IF NOT EXISTS purchases (
        id INT AUTO_INCREMENT PRIMARY KEY,
        reference_no VARCHAR(100),
        supplier_id INT,
        items TEXT,
        total_amount DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Staff/Users
    await conn.query(`
      CREATE TABLE IF NOT EXISTS staff (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin','cashier','manager') DEFAULT 'cashier',
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Expenses
    await conn.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        description VARCHAR(255),
        amount DECIMAL(10,2),
        category VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert sample products if empty
    const [prods] = await conn.query('SELECT COUNT(*) as c FROM products');
    if (prods[0].c === 0) {
      await conn.query(`
        INSERT INTO products (name, code, price, cost_price, stock, category) VALUES
        ('Samsung Galaxy A54', 'SAM-A54', 75000.00, 62000.00, 10, 'Phones'),
        ('iPhone 15', 'IP-15', 280000.00, 245000.00, 5, 'Phones'),
        ('Screen Protector', 'ACC-SP', 850.00, 350.00, 100, 'Accessories'),
        ('Phone Case', 'ACC-PC', 1200.00, 500.00, 50, 'Accessories')
      `);
    }

    // Insert default admin
    const [admins] = await conn.query("SELECT COUNT(*) as c FROM staff WHERE username='admin'");
    if (admins[0].c === 0) {
      await conn.query(`
        INSERT INTO staff (name, username, password, role) VALUES
        ('Admin User', 'admin', 'admin123', 'admin')
      `);
    }

    conn.release();
    console.log('✅ All tables ready!');
  } catch (err) {
    console.error('❌ DB Setup Error:', err.message);
  }
}
initDatabase();

// ========== API ROUTES ==========

// Products
app.get('/api/products', async (req, res) => {
  const search = req.query.search || '';
  try {
    const [rows] = await db.query(
      'SELECT * FROM products WHERE name LIKE ? OR code LIKE ? ORDER BY name',
      [`%${search}%`, `%${search}%`]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({error: e.message}); }
});

// Create Sale
app.post('/api/sales', async (req, res) => {
  const { items, subtotal, discount, grand_total, payment_method, cash_given, change_amount, customer_id, cashier } = req.body;
  const invoice_no = 'SL-' + Date.now();
  try {
    const [result] = await db.query(
      `INSERT INTO sales (invoice_no, items, subtotal, discount, grand_total, payment_method, cash_given, change_amount, customer_id, cashier) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [invoice_no, JSON.stringify(items), subtotal, discount, grand_total, payment_method, cash_given, change_amount, customer_id, cashier || 'Admin']
    );
    res.json({ success: true, invoice_no, id: result.insertId });
  } catch (e) { res.status(500).json({error: e.message}); }
});

// Sales History
app.get('/api/sales', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM sales ORDER BY created_at DESC LIMIT 200');
    res.json(rows);
  } catch (e) { res.status(500).json({error: e.message}); }
});

// Dashboard Stats
app.get('/api/dashboard', async (req, res) => {
  try {
    // Today's sales
    const [today] = await db.query(`
      SELECT COUNT(*) as invoices, COALESCE(SUM(grand_total),0) as revenue 
      FROM sales WHERE DATE(created_at) = CURDATE()
    `);
    
    // 7-day stats
    const [week] = await db.query(`
      SELECT 
        COALESCE(SUM(grand_total),0) as revenue,
        COUNT(*) as total_invoices
      FROM sales 
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    `);

    // Total customers
    const [custs] = await db.query('SELECT COUNT(*) as count FROM customers');
    
    // Low stock alert
    const [lowStock] = await db.query('SELECT COUNT(*) as count FROM products WHERE stock < 5');

    res.json({
      todayInvoices: today[0].invoices || 0,
      todayRevenue: parseFloat(today[0].revenue) || 0,
      weekRevenue: parseFloat(week[0].revenue) || 0,
      weekInvoices: week[0].total_invoices || 0,
      totalCustomers: custs[0].count || 0,
      lowStockItems: lowStock[0].count || 0
    });
  } catch (e) { res.status(500).json({error: e.message}); }
});

// Customers
app.get('/api/customers', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM customers ORDER BY name');
    res.json(rows);
  } catch (e) { res.status(500).json({error: e.message}); }
});

app.post('/api/customers', async (req, res) => {
  const { name, phone, email } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO customers (name, phone, email) VALUES (?,?,?)',
      [name, phone, email]
    );
    res.json({ success: true, id: result.insertId });
  } catch (e) { res.status(500).json({error: e.message}); }
});

app.listen(PORT, () => console.log(`🚀 POS Backend running on port ${PORT}`));
