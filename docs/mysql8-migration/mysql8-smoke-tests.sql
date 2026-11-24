-- Waltajjii MySQL 8 disposable schema smoke tests.
-- Runs in a transaction and rolls back all test rows.

SELECT VERSION() AS mysql_version;
SELECT COUNT(*) AS application_table_count
FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE';

DROP PROCEDURE IF EXISTS waltajjii_run_schema_smoke_tests;
DELIMITER //
CREATE PROCEDURE waltajjii_run_schema_smoke_tests()
BEGIN
  DECLARE v_user1 BIGINT UNSIGNED;
  DECLARE v_user2 BIGINT UNSIGNED;
  DECLARE v_group BIGINT UNSIGNED;
  DECLARE v_duplicate_rejected INT DEFAULT 0;
  DECLARE v_fk_rejected INT DEFAULT 0;
  DECLARE v_check_rejected INT DEFAULT 0;
  DECLARE v_nonpending_count INT DEFAULT 0;

  START TRANSACTION;

  INSERT INTO users (username, password_hash) VALUES ('__waltajjii_schema_test_user_1__', 'test-only-hash');
  SET v_user1 = LAST_INSERT_ID();
  INSERT INTO users (username, password_hash) VALUES ('__waltajjii_schema_test_user_2__', 'test-only-hash');
  SET v_user2 = LAST_INSERT_ID();

  INSERT INTO `groups` (name, created_by) VALUES ('Schema test group', v_user1);
  SET v_group = LAST_INSERT_ID();

  INSERT INTO group_join_requests (group_id, user_id, status)
  VALUES (v_group, v_user2, 'pending');

  BEGIN
    DECLARE CONTINUE HANDLER FOR 1062 SET v_duplicate_rejected = 1;
    INSERT INTO group_join_requests (group_id, user_id, status)
    VALUES (v_group, v_user2, 'pending');
  END;

  IF v_duplicate_rejected <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FAIL: duplicate pending group request was not rejected';
  END IF;

  -- Multiple non-pending historical requests for the same group/user must remain allowed.
  INSERT INTO group_join_requests (group_id, user_id, status)
  VALUES (v_group, v_user2, 'rejected'), (v_group, v_user2, 'cancelled');
  SELECT COUNT(*) INTO v_nonpending_count
  FROM group_join_requests
  WHERE group_id = v_group AND user_id = v_user2 AND status <> 'pending';
  IF v_nonpending_count <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FAIL: non-pending request history uniqueness behavior is wrong';
  END IF;

  BEGIN
    DECLARE CONTINUE HANDLER FOR 1452 SET v_fk_rejected = 1;
    INSERT INTO group_members (group_id, user_id) VALUES (18446744073709550000, v_user1);
  END;
  IF v_fk_rejected <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FAIL: invalid foreign key was not rejected';
  END IF;

  BEGIN
    DECLARE CONTINUE HANDLER FOR 3819 SET v_check_rejected = 1;
    INSERT INTO messages (sender_id, receiver_id, body) VALUES (v_user1, v_user2, '');
  END;
  IF v_check_rejected <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'FAIL: message body CHECK constraint was not enforced';
  END IF;

  ROLLBACK;
  SELECT 'PASS' AS schema_smoke_test,
         'pending uniqueness, historical requests, foreign keys, CHECK constraints' AS verified;
END//
DELIMITER ;

CALL waltajjii_run_schema_smoke_tests();
DROP PROCEDURE waltajjii_run_schema_smoke_tests;
