export const version = '2026.08.30.1';

export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS staff_recitation_preferences (
    staff_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    memorization_mode ENUM('mushaf', 'count') NOT NULL DEFAULT 'mushaf',
    mastery_mode ENUM('mushaf', 'count') NOT NULL DEFAULT 'mushaf',
    review_mode ENUM('mushaf', 'count') NOT NULL DEFAULT 'mushaf',
    link_mode ENUM('mushaf', 'count') NOT NULL DEFAULT 'mushaf',
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT staff_recitation_preferences_staff_fk
      FOREIGN KEY (staff_id) REFERENCES supervisors(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await connection.query(`INSERT INTO staff_recitation_preferences
      (staff_id, memorization_mode, mastery_mode, review_mode, link_mode)
    SELECT staff.id,
      CASE WHEN COALESCE(memorization.setting_value, 'mushaf') = 'count' THEN 'count' ELSE 'mushaf' END,
      CASE WHEN COALESCE(memorization.setting_value, 'mushaf') = 'count' THEN 'count' ELSE 'mushaf' END,
      CASE WHEN COALESCE(review.setting_value, 'mushaf') = 'count' THEN 'count' ELSE 'mushaf' END,
      CASE WHEN COALESCE(link_mode.setting_value, 'mushaf') = 'count' THEN 'count' ELSE 'mushaf' END
    FROM supervisors staff
    LEFT JOIN app_settings memorization
      ON memorization.setting_key = CASE
        WHEN staff.role = 'reciter' THEN 'reciterMemorizationRecitationMode'
        ELSE 'teacherMemorizationRecitationMode'
      END
    LEFT JOIN app_settings review
      ON review.setting_key = CASE
        WHEN staff.role = 'reciter' THEN 'reciterReviewRecitationMode'
        ELSE 'teacherReviewRecitationMode'
      END
    LEFT JOIN app_settings link_mode
      ON link_mode.setting_key = CASE
        WHEN staff.role = 'reciter' THEN 'reciterLinkRecitationMode'
        ELSE 'teacherLinkRecitationMode'
      END
    WHERE staff.role IN ('supervisor', 'reciter')
    ON DUPLICATE KEY UPDATE staff_id = VALUES(staff_id)`);
}

export async function down(connection) {
  await connection.query('DROP TABLE IF EXISTS staff_recitation_preferences');
}
