import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: [
    'https://solo-lab-pos.vercel.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ],
  credentials: true
}));

app.use(express.json());

// Database connection — your Aiven details
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

// ✅ Auto-create tables & sample products
async function initDatabase() {
  try {
    const connection = await db.getConnection();
    console.log('✅ Connected to Aiven MySQL');

    // Create products table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(100),
        price DECIMAL(10,2) NOT NULL,
        stock INT DEFAULT 0
      )
    `);
    console.log('✅ Products table ready');

    // Create sales table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_no VARCHAR(50) UNIQUE NOT NULL,
        items TEXT,
        subtotal DECIMAL(10,2),
        discount DECIMAL(10,2),
        grand_total DECIMAL(10,2),
        payment_method VARCHAR(50),
        cash_given DECIMAL(10,2),
        change_amount DECIMAL(10,2),
        cashier VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Sales table ready');

    // Insert sample products if empty
    const [existing] = await connection.query('SELECT COUNT(*) as count FROM products');
    if (existing[0].count === 0) {
      await connection.query(`
        INSERT INTO products (name, code, price, stock) VALUES
        ('Samsung Galaxy A54', 'SAM-A54', 75000.00, 10),
        ('iPhone 15', 'IP-15', 280000.00, 5),
        ('Screen Protector', 'ACC-SP', 850.00, 100),
        ('Phone Case', 'ACC-PC', 1200.00, 50)
      `);
      console.log('✅ Sample products added');
    }

    connection.release();
  } catch (err) {
    console.error('❌ DB setup error:', err.message);
  }
}
initDatabase();

// Products API
app.get('/api/products', async (req, res) => {
  const search = req.query.search || '';
  try {
    const [results] = await db.query(
      'SELECT * FROM products WHERE name LIKE ? OR code LIKE ? ORDER BY name',
      [`%${search}%`, `%${search}%`]
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Sale API
app.post('/api/sales', async (req, res) => {
  const { items, subtotal, discount, grand_total, payment_method, cash_given, change_amount, cashier } = req.body;
  const invoice_no = 'SL-' + Date.now();
  try {
    const [result] = await db.query(
      `INSERT INTO sales 
       (invoice_no, items, subtotal, discount, grand_total, payment_method, cash_given, change_amount, cashier)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoice_no, JSON.stringify(items), subtotal, discount, grand_total, payment_method, cash_given, change_amount, cashier]
    );
    res.json({ success: true, invoice_no, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sales History API
app.get('/api/sales', async (req, res) => {
  try {
    const [results] = await db.query(
      'SELECT * FROM sales ORDER BY created_at DESC LIMIT 100'
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 POS Backend running on port ${PORT}`));
