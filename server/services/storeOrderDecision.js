const failure = (message, statusCode) => Object.assign(new Error(message), { statusCode });

/** Caller owns the transaction. Lock in purchase order (student, order, product). */
export async function decideStoreOrder(connection, { id, status, actor, settings, date, applyStudentPointDelta, logStudentPointTransaction }) {
  if (!['accepted', 'rejected'].includes(status)) throw failure('قرار الطلب غير صالح.', 422);
  const [[identity]] = await connection.query('SELECT student_id AS studentId FROM store_orders WHERE id = ?', [id]);
  if (!identity) throw failure('الطلب غير موجود.', 404);
  await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [identity.studentId]);
  const [[order]] = await connection.query(`SELECT student_id AS studentId, product_id AS productId,
    product_name AS productName, points_price AS pointsPrice, fulfilled_at AS fulfilledAt,
    rejected_at AS rejectedAt, stock_reserved AS stockReserved FROM store_orders WHERE id = ? FOR UPDATE`, [id]);
  if (!order) throw failure('الطلب غير موجود.', 404);
  const fulfillmentStatus = order.fulfilledAt ? 'accepted' : 'pending';
  const current = order.rejectedAt ? 'rejected' : fulfillmentStatus;
  if (current === status) return { ok: true, status, alreadyProcessed: true };
  if (current !== 'pending') throw failure('سبق اتخاذ قرار لهذا الطلب؛ حدّث القائمة.', 409);
  if (status === 'rejected') {
    await connection.query('UPDATE students SET store_balance = store_balance + ? WHERE id = ?', [order.pointsPrice, order.studentId]);
    // Legacy orders have no stock snapshot; never invent a previously reserved unit.
    if (Number(order.stockReserved) === 1) {
      await connection.query('UPDATE store_products SET stock = stock + 1 WHERE id = ? AND stock IS NOT NULL', [order.productId]);
    }
    const [[deduction]] = await connection.query(`SELECT COALESCE(SUM(IF(transaction_type = 'deduction', points, -points)), 0) AS points
      FROM student_point_transactions WHERE student_id = ? AND source_type = 'store_purchase' AND source_id = ?`, [order.studentId, id]);
    const points = Math.max(0, Number(deduction.points));
    if (points) {
      await applyStudentPointDelta(connection, order.studentId, points, settings, { date, updateStoreBalance: false });
      await logStudentPointTransaction(connection, { studentId: order.studentId, actorRole: actor.role,
        actorName: actor.name, type: 'increase', points, reason: `رفض طلب ${order.productName}`,
        date, sourceType: 'store_purchase', sourceId: id, dedupeKey: `store_refund:${id}` });
    }
  }
  await connection.query(`UPDATE store_orders SET ${status === 'accepted' ? 'fulfilled_at' : 'rejected_at'} = NOW(),
    fulfilled_by_role = ?, fulfilled_by_id = ? WHERE id = ?`, [actor.role, actor.id, id]);
  return { ok: true, status };
}
