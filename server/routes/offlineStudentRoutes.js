import express from 'express';
import { db } from '../db.js';
import { optimizeStoreProducts } from '../services/storeImages.js';

const mapProduct = (row) => ({
  id: Number(row.id),
  name: row.name,
  imageData: row.imageData,
  pointsPrice: Number(row.pointsPrice || 0),
  stock: row.stock === null ? null : Number(row.stock),
  isActive: Boolean(row.isActive),
});

const addDays = (date, days) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export function createOfflineStudentRouter({ loadSettings, getToday }) {
  const router = express.Router();
  router.use((req, res, next) => req.auth?.role === 'student'
    ? next()
    : res.status(403).json({ message: 'التجهيز المحلي متاح للطلاب فقط.' }));

  router.post('/bootstrap', async (req, res, next) => {
    const connection = await db().getConnection();
    let payload;
    try {
      const settings = await loadSettings();
      const date = getToday();
      await connection.beginTransaction();

      let store = { enabled: false, products: [], storeBalance: 0, purchasedToday: false };
      if (settings.storeEnabled) {
        const [[[student]], [products], [recentOrders]] = await Promise.all([
          connection.query('SELECT store_balance AS storeBalance FROM students WHERE id = ?', [req.auth.id]),
          connection.query(
            `SELECT id, name, image_data AS imageData, points_price AS pointsPrice,
              stock, is_active AS isActive
             FROM store_products
             WHERE deleted_at IS NULL AND is_active = 1 AND (stock IS NULL OR stock > 0)
             ORDER BY created_at DESC, id DESC`,
          ),
          connection.query(
            `SELECT DATE_FORMAT(order_date, '%Y-%m-%d') AS orderDate FROM store_orders
             WHERE student_id = ? AND order_date BETWEEN ? AND ?`,
            [req.auth.id, addDays(date, -14), addDays(date, 14)],
          ),
        ]);
        store = {
          enabled: true,
          products: products.map(mapProduct),
          storeBalance: Number(student?.storeBalance || 0),
          purchasedDates: recentOrders.map((order) => String(order.orderDate)),
          purchasedToday: recentOrders.some((order) => String(order.orderDate) === date),
        };
      }

      await connection.commit();
      payload = {
        date,
        serverTime: new Date().toISOString(),
        cacheDays: 14,
        preparedAt: new Date().toISOString(),
        store,
      };
    } catch (error) {
      await connection.rollback();
      return next(error);
    } finally {
      connection.release();
    }
    // Compression must not keep a database connection or transaction occupied.
    payload.store.products = await optimizeStoreProducts(payload.store.products);
    return res.json(payload);
  });

  return router;
}
