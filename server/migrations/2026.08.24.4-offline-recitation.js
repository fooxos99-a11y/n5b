export const version = '2026.08.24.4';

async function addPlanVersion(connection) {
  const [[column]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'student_quran_plans' AND column_name = 'plan_version'`,
  );
  if (Number(column.count) === 0) {
    await connection.query('ALTER TABLE student_quran_plans ADD COLUMN plan_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER status');
  }
}

export async function up(connection) {
  await addPlanVersion(connection);
  await connection.query(`CREATE TABLE IF NOT EXISTS recitation_devices (
    device_id CHAR(36) NOT NULL PRIMARY KEY,
    actor_role VARCHAR(40) NOT NULL,
    actor_id BIGINT UNSIGNED NOT NULL,
    boot_id CHAR(36) NULL,
    anchor_server_at DATETIME(3) NULL,
    anchor_device_epoch_ms BIGINT NULL,
    anchor_monotonic_ms DECIMAL(18,3) NULL,
    time_untrusted TINYINT(1) NOT NULL DEFAULT 0,
    revoked_at DATETIME(3) NULL,
    first_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX recitation_devices_actor_lookup (actor_role, actor_id, revoked_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await connection.query(`CREATE TABLE IF NOT EXISTS student_quran_recitation_submissions (
    session_id CHAR(36) NOT NULL PRIMARY KEY,
    student_id BIGINT UNSIGNED NOT NULL,
    evaluator_id BIGINT UNSIGNED NULL,
    evaluator_role VARCHAR(40) NOT NULL,
    device_id CHAR(36) NOT NULL,
    session_date DATE NOT NULL,
    session_type VARCHAR(40) NOT NULL DEFAULT 'general',
    status ENUM('pending','accepted','rejected_duplicate','rejected_permission','invalid_sequence','invalid_plan_version','failed','conflict') NOT NULL DEFAULT 'pending',
    event_at DATETIME(3) NULL,
    event_time_trusted TINYINT(1) NOT NULL DEFAULT 0,
    created_at_local VARCHAR(40) NULL,
    committed_at_local VARCHAR(40) NULL,
    plan_id BIGINT UNSIGNED NULL,
    plan_version INT UNSIGNED NULL,
    plan_snapshot_json JSON NULL,
    payload_json JSON NULL,
    rejection_code VARCHAR(80) NULL,
    rejection_message VARCHAR(500) NULL,
    received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    resolved_at DATETIME(3) NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT offline_submission_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT offline_submission_evaluator_fk FOREIGN KEY (evaluator_id) REFERENCES supervisors(id) ON DELETE SET NULL,
    CONSTRAINT offline_submission_device_fk FOREIGN KEY (device_id) REFERENCES recitation_devices(device_id) ON DELETE RESTRICT,
    INDEX offline_submission_slot_lookup (student_id, session_date, status),
    INDEX offline_submission_evaluator_lookup (evaluator_id, status, session_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await connection.query(`CREATE TABLE IF NOT EXISTS student_quran_recitation_daily_slots (
    student_id BIGINT UNSIGNED NOT NULL,
    session_date DATE NOT NULL,
    session_type VARCHAR(40) NOT NULL DEFAULT 'general',
    session_id CHAR(36) NOT NULL,
    evaluator_id BIGINT UNSIGNED NULL,
    accepted_event_at DATETIME(3) NULL,
    event_time_trusted TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (student_id, session_date, session_type),
    UNIQUE KEY offline_daily_slot_session_unique (session_id),
    CONSTRAINT offline_daily_slot_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT offline_daily_slot_session_fk FOREIGN KEY (session_id) REFERENCES student_quran_recitation_submissions(session_id) ON DELETE RESTRICT,
    CONSTRAINT offline_daily_slot_evaluator_fk FOREIGN KEY (evaluator_id) REFERENCES supervisors(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await connection.query(`CREATE TABLE IF NOT EXISTS student_quran_recitation_session_parts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id CHAR(36) NOT NULL,
    task_id BIGINT UNSIGNED NOT NULL,
    task_type VARCHAR(40) NOT NULL,
    payload_json JSON NOT NULL,
    result_json JSON NULL,
    status ENUM('pending','accepted','rejected','failed') NOT NULL DEFAULT 'pending',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY offline_session_part_unique (session_id, task_id),
    CONSTRAINT offline_session_part_session_fk FOREIGN KEY (session_id) REFERENCES student_quran_recitation_submissions(session_id) ON DELETE CASCADE,
    CONSTRAINT offline_session_part_task_fk FOREIGN KEY (task_id) REFERENCES student_quran_tasks(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await connection.query(`CREATE TABLE IF NOT EXISTS student_quran_recitation_audit_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id CHAR(36) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    actor_role VARCHAR(40) NOT NULL,
    actor_id BIGINT UNSIGNED NULL,
    device_id CHAR(36) NULL,
    details_json JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX offline_recitation_audit_session_lookup (session_id, created_at),
    INDEX offline_recitation_audit_event_lookup (event_type, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  const legacyDeviceId = '00000000-0000-4000-a000-000000000001';
  await connection.query(
    `INSERT IGNORE INTO recitation_devices (device_id, actor_role, actor_id, time_untrusted)
     VALUES (?, 'system', 0, 0)`,
    [legacyDeviceId],
  );
  const legacySessionIdSql = `LOWER(CONCAT(
    SUBSTR(MD5(CONCAT('legacy-recitation:', attempts.student_id, ':', attempts.session_date)), 1, 8), '-',
    SUBSTR(MD5(CONCAT('legacy-recitation:', attempts.student_id, ':', attempts.session_date)), 9, 4), '-4',
    SUBSTR(MD5(CONCAT('legacy-recitation:', attempts.student_id, ':', attempts.session_date)), 14, 3), '-a',
    SUBSTR(MD5(CONCAT('legacy-recitation:', attempts.student_id, ':', attempts.session_date)), 18, 3), '-',
    SUBSTR(MD5(CONCAT('legacy-recitation:', attempts.student_id, ':', attempts.session_date)), 21, 12)
  ))`;
  await connection.query(
    `INSERT IGNORE INTO student_quran_recitation_submissions
      (session_id, student_id, evaluator_id, evaluator_role, device_id, session_date,
       status, event_at, event_time_trusted, plan_id, plan_version, payload_json, resolved_at)
     SELECT ${legacySessionIdSql}, attempts.student_id, MIN(attempts.evaluator_id), 'supervisor', ?,
       attempts.session_date, 'accepted', MIN(attempts.evaluated_at), 1, MIN(tasks.plan_id),
       MAX(COALESCE(plans.plan_version, 1)), JSON_OBJECT('source', 'legacy_recitation_attempts'), NOW(3)
     FROM student_quran_recitation_attempts attempts
     JOIN student_quran_tasks tasks ON tasks.id = attempts.task_id
     JOIN student_quran_plans plans ON plans.id = tasks.plan_id
     GROUP BY attempts.student_id, attempts.session_date`,
    [legacyDeviceId],
  );
  await connection.query(
    `INSERT IGNORE INTO student_quran_recitation_daily_slots
      (student_id, session_date, session_id, evaluator_id, accepted_event_at, event_time_trusted)
     SELECT submissions.student_id, submissions.session_date, submissions.session_id,
       submissions.evaluator_id, submissions.event_at, submissions.event_time_trusted
     FROM student_quran_recitation_submissions submissions WHERE submissions.status = 'accepted'`,
  );
}
