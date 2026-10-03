import { decideStoreOrder } from '../services/storeOrderDecision.js';
import express from 'express';
import { db } from '../db.js';
import { hasSupervisorDashboardPermission, requirePermission } from '../services/dashboardPermissions.js';
import { isUuid } from '../../shared/offline-recitation.js';
import { countTrailingCharacter } from '../../shared/string-suffix.js';
import { optimizeStoreImage, optimizeStoreProducts } from '../services/storeImages.js';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_DATA_PATTERN = /^data:image\/(?:png|jpe?g|webp);base64,[a-zA-Z0-9+/=]+$/;

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);
const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const daysBetween = (from, to) => Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

const imageByteLength = (imageData) => {
  const base64 = String(imageData || '').split(',')[1] || '';
  const padding = countTrailingCharacter(base64, '=');
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
};

export function normalizeProductPayload(body = {}, current = null) {
  const name = cleanText(body.name ?? current?.name, 180);
  const imageData = String(body.imageData ?? current?.imageData ?? '').trim();
  const pointsPrice = Number(body.pointsPrice ?? current?.pointsPrice ?? 0);
  const rawStock = body.stock ?? current?.stock;
  const stock = rawStock === '' || rawStock === null || rawStock === undefined
    ? null
    : Math.trunc(Number(rawStock));
  const isActive = body.isActive === undefined ? current?.isActive !== false : body.isActive === true;

  if (!name) throw Object.assign(new Error('اسم المنتج مطلوب.'), { statusCode: 422 });
  if (imageData && (!IMAGE_DATA_PATTERN.test(imageData) || imageByteLength(imageData) > MAX_IMAGE_BYTES)) {
    throw Object.assign(new Error('صورة المنتج غير صالحة أو يتجاوز حجمها 10 ميجابايت.'), { statusCode: 422 });
  }
  if (!Number.isSafeInteger(pointsPrice) || pointsPrice < 1) {
    throw Object.assign(new Error('سعر المنتج يجب أن يكون عددًا صحيحًا من النقاط، نقطة واحدة أو أكثر.'), { statusCode: 422 });
  }
  if (stock !== null && (!Number.isFinite(stock) || stock < 0)) {
    throw Object.assign(new Error('كمية المخزون غير صحيحة.'), { statusCode: 422 });
  }
  return { name, imageData, pointsPrice, stock, isActive };
}

const mapProduct = (row) => ({
  id: Number(row.id),
  name: row.name,
  imageData: row.imageData,
  pointsPrice: Number(row.pointsPrice || 0),
  stock: row.stock === null ? null : Number(row.stock),
  isActive: Boolean(row.isActive),
});

export function createStoreRouter({
  loadSettings,
  applyStudentPointDelta,
  logStudentPointTransaction,
  getToday,
}) {
  const router = express.Router();
  const requireStoreManagement = (req, res, next) => {
    return requirePermission('store')(req, res, next);
  };

  router.get('/configuration', requireStoreManagement, async (_req, res, next) => {
    try {
      const settings = await loadSettings();
      return res.json({
        pointsSystemEnabled: true,
        storeEnabled: Boolean(settings.storeEnabled),
        storePurchaseDeductsRanking: Boolean(settings.storePurchaseDeductsRanking),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/configuration', requireStoreManagement, async (req, res, next) => {
    try {
      const current = await loadSettings();
      const requestedEnabled = req.body.storeEnabled === undefined
        ? Boolean(current.storeEnabled)
        : req.body.storeEnabled === true;
      const storeEnabled = requestedEnabled;
      const storePurchaseDeductsRanking = storeEnabled && (req.body.storePurchaseDeductsRanking === undefined
        ? Boolean(current.storePurchaseDeductsRanking)
        : req.body.storePurchaseDeductsRanking === true);
      await db().query(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES
          ('storeEnabled', ?),
          ('storePurchaseDeductsRanking', ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [String(storeEnabled), String(storePurchaseDeductsRanking)],
      );
      return res.json({
        pointsSystemEnabled: true,
        storeEnabled,
        storePurchaseDeductsRanking,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/products', async (req, res, next) => {
    try {
      const settings = await loadSettings();
      if (!settings.storeEnabled) {
        return res.status(404).json({ message: 'المتجر غير مفعل.' });
      }
      if (!['student', 'manager', 'admin', 'supervisor'].includes(req.auth?.role)) {
        return res.status(403).json({ message: 'لا يمكنك الوصول إلى المتجر.' });
      }
      const management = req.auth?.role !== 'student';
      if (management && req.auth.role !== 'manager') {
        if (!await hasSupervisorDashboardPermission(req.auth.id, 'store')) return res.status(403).json({ message: 'ليست لديك صلاحية لإدارة المتجر.' });
      }
      const [rows] = await db().query(
        `
        SELECT
          id,
          name,
          image_data AS imageData,
          points_price AS pointsPrice,
          stock,
          is_active AS isActive
        FROM store_products
        WHERE deleted_at IS NULL
          ${management ? '' : 'AND is_active = 1 AND (stock IS NULL OR stock > 0)'}
        ORDER BY is_active DESC, created_at DESC, id DESC
        `,
      );
      const products = await optimizeStoreProducts(rows.map(mapProduct));
      if (req.auth?.role !== 'student') return res.json({ products });
      const [[student]] = await db().query(
        'SELECT store_balance AS storeBalance FROM students WHERE id = ?',
        [req.auth.id],
      );
      return res.json({
        products,
        storeBalance: Number(student?.storeBalance || 0),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/products', requireStoreManagement, async (req, res, next) => {
    try {
      const product = normalizeProductPayload(req.body);
      const [result] = await db().query(
        `
        INSERT INTO store_products (name, description, image_data, points_price, stock, is_active)
        VALUES (?, NULL, ?, ?, ?, ?)
        `,
        [product.name, product.imageData, product.pointsPrice, product.stock, product.isActive ? 1 : 0],
      );
      return res.status(201).json({ ...product, imageData: await optimizeStoreImage(product.imageData), id: Number(result.insertId) });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/products/:id', requireStoreManagement, async (req, res, next) => {
    try {
      const [[row]] = await db().query(
        `SELECT id, name, image_data AS imageData, points_price AS pointsPrice, stock, is_active AS isActive
         FROM store_products WHERE id = ? AND deleted_at IS NULL`,
        [req.params.id],
      );
      if (!row) return res.status(404).json({ message: 'المنتج غير موجود.' });
      // Editing a name or price must not replace the original with its display copy.
      const current = mapProduct(row);
      const imageData = req.body.imageData === await optimizeStoreImage(current.imageData)
        ? current.imageData : req.body.imageData;
      const product = normalizeProductPayload({ ...req.body, imageData }, current);
      await db().query(
        `UPDATE store_products
         SET name = ?, description = NULL, image_data = ?, points_price = ?, stock = ?, is_active = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [product.name, product.imageData, product.pointsPrice, product.stock, product.isActive ? 1 : 0, req.params.id],
      );
      return res.json({ ...product, imageData: await optimizeStoreImage(product.imageData), id: Number(req.params.id) });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/products/:id', requireStoreManagement, async (req, res, next) => {
    try {
      const [result] = await db().query(
        'UPDATE store_products SET is_active = 0, deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
        [req.params.id],
      );
      if (!result.affectedRows) return res.status(404).json({ message: 'المنتج غير موجود.' });
      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/products/:id/active', requireStoreManagement, async (req, res, next) => {
    try {
      const isActive = req.body.isActive === true;
      const [result] = await db().query(
        'UPDATE store_products SET is_active = ? WHERE id = ? AND deleted_at IS NULL',
        [isActive ? 1 : 0, req.params.id],
      );
      if (!result.affectedRows) return res.status(404).json({ message: 'المنتج غير موجود.' });
      return res.json({ ok: true, isActive });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/orders', requireStoreManagement, async (_req, res, next) => {
    try {
      const [rows] = await db().query(
        `
        SELECT
          o.id,
          o.product_name AS productName,
          o.points_price AS pointsPrice,
          o.fulfilled_at AS fulfilledAt,
          o.rejected_at AS rejectedAt,
          DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i') AS createdAt,
          s.name AS studentName,
          c.name AS committeeName
        FROM store_orders o
        JOIN students s ON s.id = o.student_id
        LEFT JOIN committees c ON c.id = s.committee_id
        ORDER BY o.fulfilled_at IS NULL DESC, o.created_at DESC, o.id DESC
        `,
      );
      return res.json(rows.map((row) => ({
        ...row,
        id: Number(row.id),
        pointsPrice: Number(row.pointsPrice || 0),
        fulfilled: Boolean(row.fulfilledAt),
        status: resolveStoreOrderStatus(row),
      })));
    } catch (error) {
      return next(error);
    }
  });

  const decideOrder = async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const settings = await loadSettings();
      await connection.beginTransaction();
      const result = await decideStoreOrder(connection, {
        id: Number(req.params.id), status: req.body.status,
        actor: req.auth, settings, date: getToday(), applyStudentPointDelta, logStudentPointTransaction,
      });
      await connection.commit();
      return res.json(result);
    } catch (error) {
      await connection.rollback();
      return next(error);
    } finally {
      connection.release();
    }
  };
  router.patch('/orders/:id/decision', requireStoreManagement, decideOrder);
  router.patch('/orders/:id/fulfilled', requireStoreManagement, (req, res, next) => {
    req.body.status = req.body.fulfilled === true ? 'accepted' : '';
    return decideOrder(req, res, next);
  });
  router.delete('/orders/:id', requireStoreManagement, (_req, res) => (
    res.status(409).json({ message: 'استخدم رفض الطلب لإعادة النقاط مع حفظ سجله.' })
  ));

  router.post('/purchase', async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      if (req.auth?.role !== 'student') {
        return res.status(403).json({ message: 'الشراء متاح للطالب فقط.' });
      }
      const productId = Number(req.body.productId || 0);
      const today = getToday();
      const purchaseDate = String(req.body.purchaseDate || today);
      const requestId = isUuid(req.body.requestId) ? String(req.body.requestId).toLowerCase() : null;
      if (!productId) return res.status(422).json({ message: 'اختر منتجاً.' });
      if (!isDateOnly(purchaseDate) || daysBetween(purchaseDate, today) < 0 || daysBetween(purchaseDate, today) > 14) {
        return res.status(422).json({ message: 'تاريخ الشراء غير صالح للمزامنة.' });
      }
      const settings = await loadSettings();
      if (!settings.storeEnabled) {
        return res.status(409).json({ message: 'المتجر غير مفعل.' });
      }

      await connection.beginTransaction();
      const [[student]] = await connection.query(
        'SELECT id, name, points, store_balance AS storeBalance FROM students WHERE id = ? FOR UPDATE',
        [req.auth.id],
      );
      if (requestId) {
        const [[existingRequest]] = await connection.query(
          `SELECT id FROM store_orders
           WHERE student_id = ? AND request_id = ? LIMIT 1 FOR UPDATE`,
          [req.auth.id, requestId],
        );
        if (existingRequest) {
          const [[currentStudent]] = await connection.query(
            'SELECT store_balance AS storeBalance FROM students WHERE id = ?',
            [req.auth.id],
          );
          await connection.commit();
          return res.json({
            ok: true,
            message: 'تمت مزامنة الشراء سابقًا.',
            orderId: Number(existingRequest.id),
            purchaseDate,
            storeBalance: Number(currentStudent?.storeBalance || 0),
            alreadySynced: true,
          });
        }
      }
      const [[product]] = await connection.query(
        `SELECT id, name, points_price AS pointsPrice, stock
         FROM store_products
         WHERE id = ? AND is_active = 1 AND deleted_at IS NULL
         FOR UPDATE`,
        [productId],
      );
      if (!product || (product.stock !== null && Number(product.stock) < 1)) {
        await connection.rollback();
        return res.status(409).json({ message: 'المنتج غير متاح حالياً.' });
      }
      const price = Number(product.pointsPrice || 0);
      if (!student || Number(student.storeBalance || 0) < price) {
        await connection.rollback();
        return res.status(422).json({ message: 'رصيد المتجر غير كافٍ.' });
      }

      const [orderResult] = await connection.query(
        `INSERT INTO store_orders
          (student_id, product_id, product_name, points_price, order_date, request_id, stock_reserved)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [student.id, product.id, product.name, price, purchaseDate, requestId, product.stock !== null ? 1 : 0],
      );
      await connection.query(
        'UPDATE students SET store_balance = store_balance - ? WHERE id = ?',
        [price, student.id],
      );
      if (product.stock !== null) {
        await connection.query('UPDATE store_products SET stock = stock - 1 WHERE id = ?', [product.id]);
      }

      await applyStoreRankingDeduction({ settings, applyStudentPointDelta, connection, student, price, purchaseDate, logStudentPointTransaction, req, product, orderResult });

      await connection.commit();
      return res.status(201).json({
        ok: true,
        message: 'تم الشراء.',
        orderId: Number(orderResult.insertId),
        purchaseDate,
        storeBalance: Number(student.storeBalance || 0) - price,
      });
    } catch (error) {
      await connection.rollback();
      return next(error);
    } finally {
      connection.release();
    }
  });

  return router;
}

/** Apply the optional ranking deduction with the purchase deduplication key in the same transaction. */
async function applyStoreRankingDeduction({ settings, applyStudentPointDelta, connection, student, price, purchaseDate, logStudentPointTransaction, req, product, orderResult }) {
  if (settings.storePurchaseDeductsRanking) {
    const effectiveDelta = await applyStudentPointDelta(connection, student.id, -price, settings, {
      date: purchaseDate,
      updateStoreBalance: false,
    });
    if (effectiveDelta) {
      await logStudentPointTransaction(connection, {
        studentId: student.id,
        actorRole: 'student',
        actorName: req.auth?.name || 'الطالب',
        type: 'deduction',
        points: Math.abs(effectiveDelta),
        reason: `شراء ${product.name}`,
        date: purchaseDate,
        sourceType: 'store_purchase',
        sourceId: orderResult.insertId,
        dedupeKey: `store_purchase:${orderResult.insertId}`,
      });
    }
  }
}

function resolveStoreOrderStatus(row) {
  if (row.rejectedAt) return 'rejected';
  return row.fulfilledAt ? 'accepted' : 'pending';
}
