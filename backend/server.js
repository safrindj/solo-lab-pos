const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Database connection
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'solo_lab_pos'
});

db.connect(err => {
  if (err) console.error('❌ DB connection failed:', err);
  else console.log('✅ Connected to database');
});

// Get all products
app.get('/api/products', (req, res) => {
  const search = req.query.search || '';
  const q = `
    SELECT * FROM products 
    WHERE name LIKE ? OR code LIKE ? 
    ORDER BY name
  `;
  db.query(q, [`%${search}%`, `%${search}%`], (err, results) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(results);
  });
});

// Create sale
app.post('/api/sales', (req, res) => {
  const { items, subtotal, discount, grand_total, payment_method, cash_given, change_amount, cashier } = req.body;
  const invoice_no = 'SL-' + Date.now();
  const q = `
    INSERT INTO sales 
    (invoice_no, items, subtotal, discount, grand_total, payment_method, cash_given, change_amount, cashier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  db.query(q, [invoice_no, JSON.stringify(items), subtotal, discount, grand_total, payment_method, cash_given, change_amount, cashier], (err, result) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json({ success: true, invoice_no, id: result.insertId });
  });
});

// Get sales history
app.get('/api/sales', (req, res) => {
  db.query('SELECT * FROM sales ORDER BY created_at DESC LIMIT 100', (err, results) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(results);
  });
});

app.listen(PORT, () => console.log(`🚀 POS Server running on port ${PORT}`));
