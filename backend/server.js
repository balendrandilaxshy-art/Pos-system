const express = require('express');
const cors = require('cors');
const db = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────
app.get('/', (req, res) => {
    res.send('Task 01 API — POS Order & Inventory System');
});

// ─────────────────────────────────────────────
// PING (for debugging)
// ─────────────────────────────────────────────
app.get('/ping', (req, res) => {
    res.json({ status: 'alive', time: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// PRODUCTS — Full CRUD
// ─────────────────────────────────────────────

// List all products
app.get('/api/products', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM products ORDER BY id');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get one
app.get('/api/products/:id', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create (admin)
app.post('/api/products', async (req, res) => {
    try {
        const { name, description, price, category, stock } = req.body;
        if (!name || price === undefined) {
            return res.status(400).json({ error: 'name and price required' });
        }
        const [result] = await db.query(
            'INSERT INTO products (name, description, price, category, stock) VALUES (?, ?, ?, ?, ?)',
            [name, description || '', price, category || 'General', stock || 0]
        );
        const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update (admin)
app.put('/api/products/:id', async (req, res) => {
    try {
        const { name, description, price, category, stock } = req.body;
        const [result] = await db.query(
            'UPDATE products SET name = ?, description = ?, price = ?, category = ?, stock = ? WHERE id = ?',
            [name, description, price, category, stock, req.params.id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Product not found' });
        const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete (admin)
app.delete('/api/products/:id', async (req, res) => {
    try {
        const [result] = await db.query('DELETE FROM products WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Product not found' });
        res.json({ success: true, message: 'Product deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// RESERVE STOCK (atomic — prevents overselling)
// ─────────────────────────────────────────────
async function reserveStock(connection, productId, quantity) {
    const [result] = await connection.query(
        `UPDATE products
         SET stock = stock - ?, reserved_stock = reserved_stock + ?
         WHERE id = ? AND stock >= ?`,
        [quantity, quantity, productId, quantity]
    );
    if (result.affectedRows === 0) {
        throw new Error(`Insufficient stock for product ${productId}`);
    }
    return true;
}

// ─────────────────────────────────────────────
// CHECKOUT — Reserve stock + create order
// ─────────────────────────────────────────────
app.post('/api/checkout', async (req, res) => {
    const { items, idempotencyKey } = req.body;
    if (!items || items.length === 0 || !idempotencyKey) {
        return res.status(400).json({ error: 'items and idempotencyKey required' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Duplicate order check
        const [existing] = await conn.query(
            'SELECT * FROM orders WHERE idempotency_key = ?',
            [idempotencyKey]
        );
        if (existing.length > 0) {
            await conn.rollback();
            return res.json({
                orderId: existing[0].id,
                total: existing[0].total,
                note: 'Duplicate — returning existing order'
            });
        }

        // Reserve stock
        let total = 0;
        for (const item of items) {
            await reserveStock(conn, item.productId, item.quantity);
            const [prod] = await conn.query('SELECT price FROM products WHERE id = ?', [item.productId]);
            total += parseFloat(prod[0].price) * item.quantity;
        }

        // Create order with 2-minute expiration
        const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
        const [orderResult] = await conn.query(
            `INSERT INTO orders (status, total, idempotency_key, expires_at)
             VALUES ('RESERVED', ?, ?, ?)`,
            [total, idempotencyKey, expiresAt]
        );
        const orderId = orderResult.insertId;

        // Order items
        for (const item of items) {
            const [prod] = await conn.query('SELECT price FROM products WHERE id = ?', [item.productId]);
            await conn.query(
                'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                [orderId, item.productId, item.quantity, prod[0].price]
            );
        }

        await conn.commit();
        res.status(201).json({ orderId, total, message: 'Stock reserved for 2 min' });
    } catch (err) {
        await conn.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        conn.release();
    }
});

// ─────────────────────────────────────────────
// PAYMENTS — Mock gateway
// ─────────────────────────────────────────────
app.post('/api/payments', async (req, res) => {
    const { orderId, outcome, idempotencyKey } = req.body;
    if (!orderId || !outcome || !idempotencyKey) {
        return res.status(400).json({ error: 'orderId, outcome, idempotencyKey required' });
    }
    if (!['success', 'failure', 'timeout'].includes(outcome)) {
        return res.status(400).json({ error: 'outcome must be success | failure | timeout' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Duplicate payment check
        const [existing] = await conn.query(
            'SELECT * FROM payments WHERE order_id = ? OR idempotency_key = ?',
            [orderId, idempotencyKey]
        );
        if (existing.length > 0) {
            await conn.rollback();
            return res.json({ message: 'Payment already processed', payment: existing[0] });
        }

        const [orders] = await conn.query('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (orders.length === 0) throw new Error('Order not found');
        if (orders[0].status !== 'RESERVED') {
            throw new Error(`Order not awaiting payment (status: ${orders[0].status})`);
        }

        if (outcome === 'success') {
            await conn.query('INSERT INTO payments (order_id, status, idempotency_key) VALUES (?, "SUCCESS", ?)', [orderId, idempotencyKey]);
            await conn.query('UPDATE orders SET status = "PAID" WHERE id = ?', [orderId]);
            await conn.query(
                `UPDATE products p JOIN order_items oi ON p.id = oi.product_id
                 SET p.reserved_stock = p.reserved_stock - oi.quantity
                 WHERE oi.order_id = ?`,
                [orderId]
            );
        } else if (outcome === 'failure') {
            await conn.query('INSERT INTO payments (order_id, status, idempotency_key) VALUES (?, "FAILED", ?)', [orderId, idempotencyKey]);
            await conn.query('UPDATE orders SET status = "FAILED" WHERE id = ?', [orderId]);
            await conn.query(
                `UPDATE products p JOIN order_items oi ON p.id = oi.product_id
                 SET p.stock = p.stock + oi.quantity, p.reserved_stock = p.reserved_stock - oi.quantity
                 WHERE oi.order_id = ?`,
                [orderId]
            );
        } else if (outcome === 'timeout') {
            await conn.query('INSERT INTO payments (order_id, status, idempotency_key) VALUES (?, "TIMEOUT", ?)', [orderId, idempotencyKey]);
            await conn.query('UPDATE orders SET status = "EXPIRED" WHERE id = ?', [orderId]);
            await conn.query(
                `UPDATE products p JOIN order_items oi ON p.id = oi.product_id
                 SET p.stock = p.stock + oi.quantity, p.reserved_stock = p.reserved_stock - oi.quantity
                 WHERE oi.order_id = ?`,
                [orderId]
            );
        }

        await conn.commit();
        res.json({ success: true, orderId, outcome });
    } catch (err) {
        await conn.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        conn.release();
    }
});

// ─────────────────────────────────────────────
// ORDERS — List
// ─────────────────────────────────────────────
app.get('/api/orders', async (req, res) => {
    try {
        const [orders] = await db.query('SELECT * FROM orders ORDER BY created_at DESC');
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ORDERS — Get one (with lazy expiry)
app.get('/api/orders/:id', async (req, res) => {
    try {
        const [orders] = await db.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
        if (orders.length === 0) return res.status(404).json({ error: 'Order not found' });

        let order = orders[0];

        if (order.status === 'RESERVED' && new Date(order.expires_at).getTime() <= Date.now()) {
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                await conn.query(
                    `UPDATE products p JOIN order_items oi ON p.id = oi.product_id
                     SET p.stock = p.stock + oi.quantity, p.reserved_stock = GREATEST(p.reserved_stock - oi.quantity, 0)
                     WHERE oi.order_id = ?`,
                    [order.id]
                );
                await conn.query("UPDATE orders SET status = 'EXPIRED' WHERE id = ?", [order.id]);
                await conn.commit();
                order = { ...order, status: 'EXPIRED' };
            } catch (err) {
                await conn.rollback();
            } finally {
                conn.release();
            }
        }

        const [items] = await db.query(
            `SELECT oi.*, p.name AS product_name
             FROM order_items oi JOIN products p ON p.id = oi.product_id
             WHERE oi.order_id = ?`,
            [req.params.id]
        );
        res.json({ ...order, items });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ORDERS — Cancel / Refund
app.post('/api/orders/:id/cancel', async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [orders] = await conn.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
        if (orders.length === 0) throw new Error('Order not found');

        const order = orders[0];
        if (!['RESERVED', 'PAID'].includes(order.status)) {
            throw new Error(`Cannot cancel order with status: ${order.status}`);
        }

        await conn.query(
            `UPDATE products p JOIN order_items oi ON p.id = oi.product_id
             SET p.stock = p.stock + oi.quantity, p.reserved_stock = GREATEST(p.reserved_stock - oi.quantity, 0)
             WHERE oi.order_id = ?`,
            [req.params.id]
        );

        if (order.status === 'PAID') {
            await conn.query('UPDATE orders SET status = "REFUNDED" WHERE id = ?', [req.params.id]);
            await conn.query('UPDATE payments SET status = "REFUNDED" WHERE order_id = ?', [req.params.id]);
        } else {
            await conn.query('UPDATE orders SET status = "CANCELLED" WHERE id = ?', [req.params.id]);
        }

        await conn.commit();
        res.json({ success: true, orderId: req.params.id, refunded: order.status === 'PAID' });
    } catch (err) {
        await conn.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        conn.release();
    }
});

// ─────────────────────────────────────────────
// AUTO-EXPIRE RESERVED ORDERS (every 30 sec)
// ─────────────────────────────────────────────
setInterval(async () => {
    try {
        const [expired] = await db.query(
            "SELECT * FROM orders WHERE status = 'RESERVED' AND expires_at < NOW()"
        );
        for (const order of expired) {
            await db.query(
                `UPDATE products p JOIN order_items oi ON p.id = oi.product_id
                 SET p.stock = p.stock + oi.quantity, p.reserved_stock = p.reserved_stock - oi.quantity
                 WHERE oi.order_id = ?`,
                [order.id]
            );
            await db.query("UPDATE orders SET status = 'EXPIRED' WHERE id = ?", [order.id]);
        }
        if (expired.length > 0) console.log(`Expired ${expired.length} reservation(s)`);
    } catch (err) {
        console.error('Expiry job error:', err.message);
    }
}, 30000);

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Task 01 Server running on port ${PORT}`);
});