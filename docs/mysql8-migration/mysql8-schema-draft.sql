-- Waltajjii MySQL 8 schema conversion draft
-- SOURCE: src/db.js on waltajjii-mysql8-migration-preparation
-- STATUS: REVIEW DRAFT ONLY. NOT APPLIED OR TESTED AGAINST A MYSQL SERVER.
--
-- Safety:
--   * Apply only to a new, empty disposable MySQL 8.0.16+ database first.
--   * Never run against the live app database.
--   * This DDL is a schema target, not a data migration or cutover script.
--   * Reconcile column lengths, actual data, indexes, query semantics and timestamps
--     against a fresh, consistent export of the current live SQLite database.
--
-- Design choices requiring validation:
--   * SQLite INTEGER primary keys become BIGINT UNSIGNED AUTO_INCREMENT.
--     Validate all source IDs are >= 0 and within this range; keep JS BIGINT
--     handling safe (mysql2 supportBigNumbers/bigNumberStrings).
--   * SQLite timestamp TEXT values are represented as DATETIME(3) UTC here.
--     Data migration must parse source strings explicitly and preserve UTC meaning.
--   * username uses utf8mb4_0900_as_ci: case-insensitive, accent-sensitive.
--     Verify this matches existing SQLite NOCASE behavior and actual usernames.
--   * group_join_requests uses a generated nullable marker to emulate the
--     SQLite partial unique index for pending requests.
--   * All application writes/reads must be asynchronously refactored; this schema
--     does not make better-sqlite3 calls compatible with mysql2.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(191) COLLATE utf8mb4_0900_as_ci NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  bio VARCHAR(2000) NOT NULL DEFAULT '',
  avatar_path VARCHAR(2048) NULL,
  professional_title VARCHAR(255) NOT NULL DEFAULT '',
  organization VARCHAR(255) NOT NULL DEFAULT '',
  department VARCHAR(255) NOT NULL DEFAULT '',
  location VARCHAR(255) NOT NULL DEFAULT '',
  website VARCHAR(2048) NOT NULL DEFAULT '',
  profile_mode VARCHAR(32) NOT NULL DEFAULT 'both',
  full_name VARCHAR(255) NOT NULL DEFAULT '',
  profile_background VARCHAR(64) NOT NULL DEFAULT 'mist',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sender_id BIGINT UNSIGNED NOT NULL,
  receiver_id BIGINT UNSIGNED NOT NULL,
  body VARCHAR(2000) NOT NULL,
  media_path VARCHAR(2048) NULL,
  media_type VARCHAR(16) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  delivered_at DATETIME(3) NULL,
  read_at DATETIME(3) NULL,
  reply_to_message_id BIGINT UNSIGNED NULL,
  edited_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by BIGINT UNSIGNED NULL,
  forwarded_from_username VARCHAR(191) NULL,
  PRIMARY KEY (id),
  KEY idx_messages_conversation (sender_id, receiver_id, id),
  KEY idx_messages_receipts (receiver_id, sender_id, read_at, delivered_at),
  KEY idx_messages_reply (reply_to_message_id),
  KEY idx_messages_deleted_by (deleted_by),
  CONSTRAINT chk_messages_body CHECK (CHAR_LENGTH(body) BETWEEN 1 AND 2000),
  CONSTRAINT chk_messages_media_type CHECK (media_type IS NULL OR media_type IN ('image','video','document')),
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id),
  CONSTRAINT fk_messages_receiver FOREIGN KEY (receiver_id) REFERENCES users(id),
  CONSTRAINT fk_messages_reply FOREIGN KEY (reply_to_message_id) REFERENCES messages(id) ON DELETE SET NULL,
  CONSTRAINT fk_messages_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  description VARCHAR(2000) NOT NULL DEFAULT '',
  rules TEXT NOT NULL DEFAULT (''),
  visibility VARCHAR(16) NOT NULL DEFAULT 'private',
  approval_required TINYINT(1) NOT NULL DEFAULT 0,
  member_list_visibility VARCHAR(16) NOT NULL DEFAULT 'members',
  PRIMARY KEY (id),
  CONSTRAINT chk_groups_name CHECK (CHAR_LENGTH(name) BETWEEN 1 AND 80),
  CONSTRAINT chk_groups_visibility CHECK (visibility IN ('private','public')),
  CONSTRAINT chk_groups_approval CHECK (approval_required IN (0,1)),
  CONSTRAINT chk_groups_member_list CHECK (member_list_visibility IN ('members','admins')),
  CONSTRAINT fk_groups_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE group_members (
  group_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'member',
  joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (group_id, user_id),
  KEY idx_group_members_user (user_id, group_id),
  CONSTRAINT chk_group_members_role CHECK (role IN ('admin','member')),
  CONSTRAINT fk_group_members_group FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE group_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  body VARCHAR(2000) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  media_path VARCHAR(2048) NULL,
  media_type VARCHAR(16) NULL,
  reply_to_message_id BIGINT UNSIGNED NULL,
  edited_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  is_announcement TINYINT(1) NOT NULL DEFAULT 0,
  pinned_at DATETIME(3) NULL,
  pinned_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY idx_group_messages_group (group_id, id),
  KEY idx_group_messages_pinned (group_id, pinned_at),
  KEY idx_group_messages_reply (reply_to_message_id),
  KEY idx_group_messages_pinned_by (pinned_by),
  CONSTRAINT chk_group_messages_body CHECK (CHAR_LENGTH(body) BETWEEN 1 AND 2000),
  CONSTRAINT chk_group_messages_announcement CHECK (is_announcement IN (0,1)),
  CONSTRAINT fk_group_messages_group FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id),
  CONSTRAINT fk_group_messages_reply FOREIGN KEY (reply_to_message_id) REFERENCES group_messages(id) ON DELETE SET NULL,
  CONSTRAINT fk_group_messages_pinned_by FOREIGN KEY (pinned_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE follows (
  follower_id BIGINT UNSIGNED NOT NULL,
  following_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (follower_id, following_id),
  KEY idx_follows_following (following_id, follower_id),
  CONSTRAINT chk_follows_not_self CHECK (follower_id <> following_id),
  CONSTRAINT fk_follows_follower FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_follows_following FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE connection_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  requester_id BIGINT UNSIGNED NOT NULL,
  recipient_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(16) COLLATE utf8mb4_0900_bin NOT NULL DEFAULT 'pending',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_connection_requests_recipient (recipient_id, status, id),
  CONSTRAINT chk_connection_requests_status CHECK (status IN ('pending','accepted','declined')),
  CONSTRAINT chk_connection_requests_not_self CHECK (requester_id <> recipient_id),
  CONSTRAINT fk_connection_requests_requester FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_connection_requests_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE posts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  content VARCHAR(2000) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_posts_user (user_id, id),
  CONSTRAINT chk_posts_content CHECK (CHAR_LENGTH(content) BETWEEN 1 AND 2000),
  CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE post_likes (
  post_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_post_likes_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_post_likes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE post_comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  content VARCHAR(1000) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_post_comments_post (post_id, id),
  CONSTRAINT chk_post_comments_content CHECK (CHAR_LENGTH(content) BETWEEN 1 AND 1000),
  CONSTRAINT fk_post_comments_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_post_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  type VARCHAR(100) NOT NULL,
  entity_id BIGINT NULL,
  message VARCHAR(2000) NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id, is_read, id),
  CONSTRAINT chk_notifications_is_read CHECK (is_read IN (0,1)),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE channels (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(300) NOT NULL DEFAULT '',
  visibility VARCHAR(16) NOT NULL DEFAULT 'public',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT chk_channels_name CHECK (CHAR_LENGTH(name) BETWEEN 1 AND 80),
  CONSTRAINT chk_channels_description CHECK (CHAR_LENGTH(description) <= 300),
  CONSTRAINT chk_channels_visibility CHECK (visibility IN ('public','private')),
  CONSTRAINT fk_channels_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE channel_members (
  channel_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'member',
  joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (channel_id, user_id),
  KEY idx_channel_members_user (user_id, channel_id),
  CONSTRAINT chk_channel_members_role CHECK (role IN ('owner','admin','member')),
  CONSTRAINT fk_channel_members_channel FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  CONSTRAINT fk_channel_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE channel_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  channel_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  body VARCHAR(4000) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_channel_messages_channel (channel_id, id),
  CONSTRAINT chk_channel_messages_body CHECK (CHAR_LENGTH(body) BETWEEN 1 AND 4000),
  CONSTRAINT fk_channel_messages_channel FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  CONSTRAINT fk_channel_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE moments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  content VARCHAR(500) NOT NULL DEFAULT '',
  media_path VARCHAR(2048) NULL,
  media_type VARCHAR(16) NULL,
  audience VARCHAR(16) NOT NULL DEFAULT 'followers',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_moments_expiry (expires_at, user_id),
  KEY idx_moments_user (user_id, id),
  CONSTRAINT chk_moments_content CHECK (CHAR_LENGTH(content) <= 500),
  CONSTRAINT chk_moments_media_type CHECK (media_type IS NULL OR media_type IN ('image','video')),
  CONSTRAINT chk_moments_audience CHECK (audience IN ('everyone','followers')),
  CONSTRAINT chk_moments_content_or_media CHECK (CHAR_LENGTH(content) > 0 OR media_path IS NOT NULL),
  CONSTRAINT fk_moments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE message_reactions (
  message_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  emoji VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (message_id, user_id, emoji),
  KEY idx_message_reactions_message (message_id, emoji),
  CONSTRAINT chk_message_reactions_emoji CHECK (CHAR_LENGTH(emoji) BETWEEN 1 AND 16),
  CONSTRAINT fk_message_reactions_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_reactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE message_hidden_for (
  message_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  hidden_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (message_id, user_id),
  KEY idx_message_hidden_user (user_id, message_id),
  CONSTRAINT fk_message_hidden_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_hidden_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE group_message_reactions (
  group_message_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  emoji VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (group_message_id, user_id, emoji),
  KEY idx_group_message_reactions_message (group_message_id, emoji),
  CONSTRAINT chk_group_message_reactions_emoji CHECK (CHAR_LENGTH(emoji) BETWEEN 1 AND 16),
  CONSTRAINT fk_group_message_reactions_message FOREIGN KEY (group_message_id) REFERENCES group_messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_message_reactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE group_message_receipts (
  group_message_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  delivered_at DATETIME(3) NULL,
  read_at DATETIME(3) NULL,
  PRIMARY KEY (group_message_id, user_id),
  KEY idx_group_message_receipts_user (user_id, read_at, group_message_id),
  CONSTRAINT fk_group_message_receipts_message FOREIGN KEY (group_message_id) REFERENCES group_messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_message_receipts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE group_invitations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  use_limit INT UNSIGNED NULL,
  use_count INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_group_invitations_token_hash (token_hash),
  KEY idx_group_invitations_group (group_id, created_at),
  CONSTRAINT chk_group_invitations_use_limit CHECK (use_limit IS NULL OR use_limit BETWEEN 1 AND 1000),
  CONSTRAINT chk_group_invitations_use_count CHECK (use_count >= 0),
  CONSTRAINT fk_group_invitations_group FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_invitations_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE group_invitation_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invitation_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(16) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT chk_group_invitation_events_type CHECK (event_type IN ('joined','requested','revoked')),
  CONSTRAINT fk_group_invitation_events_invitation FOREIGN KEY (invitation_id) REFERENCES group_invitations(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_invitation_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE group_join_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  invitation_id BIGINT UNSIGNED NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reviewed_at DATETIME(3) NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  pending_unique_marker TINYINT
    GENERATED ALWAYS AS (CASE WHEN status = 'pending' THEN 1 ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_group_join_requests_pending (group_id, user_id, pending_unique_marker),
  KEY idx_group_join_requests_group (group_id, status, created_at),
  KEY idx_group_join_requests_invitation (invitation_id),
  KEY idx_group_join_requests_reviewer (reviewed_by),
  CONSTRAINT chk_group_join_requests_status CHECK (status IN ('pending','approved','rejected','cancelled')),
  CONSTRAINT fk_group_join_requests_group FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_join_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_join_requests_invitation FOREIGN KEY (invitation_id) REFERENCES group_invitations(id) ON DELETE SET NULL,
  CONSTRAINT fk_group_join_requests_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE group_activity (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  subject_user_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(100) NOT NULL,
  details TEXT NOT NULL DEFAULT (''),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_group_activity_group (group_id, id),
  KEY idx_group_activity_actor (actor_id),
  KEY idx_group_activity_subject (subject_user_id),
  CONSTRAINT fk_group_activity_group FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_activity_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_group_activity_subject FOREIGN KEY (subject_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE group_polls (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  creator_id BIGINT UNSIGNED NOT NULL,
  question VARCHAR(300) NOT NULL,
  multiple_choice TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  closed_at DATETIME(3) NULL,
  closed_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY idx_group_polls_group (group_id, id),
  KEY idx_group_polls_closed_by (closed_by),
  CONSTRAINT chk_group_polls_question CHECK (CHAR_LENGTH(question) BETWEEN 1 AND 300),
  CONSTRAINT chk_group_polls_multiple_choice CHECK (multiple_choice IN (0,1)),
  CONSTRAINT chk_group_polls_status CHECK (status IN ('open','closed')),
  CONSTRAINT fk_group_polls_group FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_polls_creator FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_polls_closed_by FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE group_poll_options (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  poll_id BIGINT UNSIGNED NOT NULL,
  option_text VARCHAR(100) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_group_poll_options_poll (poll_id, id),
  CONSTRAINT chk_group_poll_options_text CHECK (CHAR_LENGTH(option_text) BETWEEN 1 AND 100),
  CONSTRAINT fk_group_poll_options_poll FOREIGN KEY (poll_id) REFERENCES group_polls(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE group_poll_votes (
  poll_id BIGINT UNSIGNED NOT NULL,
  option_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (poll_id, option_id, user_id),
  KEY idx_group_poll_votes_option (option_id),
  KEY idx_group_poll_votes_user (user_id),
  CONSTRAINT fk_group_poll_votes_poll FOREIGN KEY (poll_id) REFERENCES group_polls(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_poll_votes_option FOREIGN KEY (option_id) REFERENCES group_poll_options(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_poll_votes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE group_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(2000) NOT NULL DEFAULT '',
  starts_at DATETIME(3) NOT NULL,
  location VARCHAR(200) NOT NULL DEFAULT '',
  reminder_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'scheduled',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  cancelled_at DATETIME(3) NULL,
  cancelled_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY idx_group_events_group_start (group_id, starts_at),
  KEY idx_group_events_creator (created_by),
  KEY idx_group_events_cancelled_by (cancelled_by),
  CONSTRAINT chk_group_events_title CHECK (CHAR_LENGTH(title) BETWEEN 1 AND 120),
  CONSTRAINT chk_group_events_description CHECK (CHAR_LENGTH(description) <= 2000),
  CONSTRAINT chk_group_events_location CHECK (CHAR_LENGTH(location) <= 200),
  CONSTRAINT chk_group_events_reminder CHECK (reminder_minutes IN (0,5,10,15,30,60,1440)),
  CONSTRAINT chk_group_events_status CHECK (status IN ('scheduled','cancelled')),
  CONSTRAINT fk_group_events_group FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_events_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_events_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE group_event_rsvps (
  event_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  response VARCHAR(16) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (event_id, user_id),
  KEY idx_group_event_rsvps_event (event_id, response),
  CONSTRAINT chk_group_event_rsvps_response CHECK (response IN ('going','maybe','not_going')),
  CONSTRAINT fk_group_event_rsvps_event FOREIGN KEY (event_id) REFERENCES group_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_event_rsvps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE group_event_reminder_deliveries (
  event_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  delivered_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (event_id, user_id),
  KEY idx_group_event_reminder_deliveries_user (user_id, delivered_at),
  CONSTRAINT fk_group_event_reminder_deliveries_event FOREIGN KEY (event_id) REFERENCES group_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_event_reminder_deliveries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Expected application tables: 29.
-- This script intentionally omits automatic data copying, ID remapping,
-- triggers, and production cutover. Those require a verified live SQLite export.
