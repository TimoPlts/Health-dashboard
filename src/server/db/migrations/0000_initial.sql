CREATE TABLE `daily_metrics` (
	`metric` text NOT NULL,
	`date` text NOT NULL,
	`source_id` integer NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`attrs` text,
	`raw_page_id` integer,
	PRIMARY KEY(`metric`, `date`, `source_id`)
);
--> statement-breakpoint
CREATE TABLE `exercise_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` integer NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`start_offset_s` integer,
	`exercise_type` text NOT NULL,
	`display_name` text,
	`active_duration_s` real,
	`metrics` text,
	`raw_page_id` integer
);
--> statement-breakpoint
CREATE INDEX `exercise_start` ON `exercise_sessions` (`start_ms`);--> statement-breakpoint
CREATE TABLE `heart_rate_samples` (
	`source_id` integer NOT NULL,
	`t_ms` integer NOT NULL,
	`utc_offset_s` integer,
	`bpm` integer NOT NULL,
	`motion` text,
	`raw_page_id` integer,
	PRIMARY KEY(`source_id`, `t_ms`)
);
--> statement-breakpoint
CREATE INDEX `hr_t` ON `heart_rate_samples` (`t_ms`);--> statement-breakpoint
CREATE TABLE `hevy_exercise_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`type` text,
	`primary_muscle` text,
	`secondary_muscles` text,
	`equipment` text,
	`is_custom` integer
);
--> statement-breakpoint
CREATE TABLE `hevy_exercises` (
	`workout_id` text NOT NULL,
	`idx` integer NOT NULL,
	`template_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`superset_id` integer,
	PRIMARY KEY(`workout_id`, `idx`)
);
--> statement-breakpoint
CREATE INDEX `hevy_ex_template` ON `hevy_exercises` (`template_id`);--> statement-breakpoint
CREATE TABLE `hevy_sets` (
	`workout_id` text NOT NULL,
	`exercise_idx` integer NOT NULL,
	`idx` integer NOT NULL,
	`set_type` text NOT NULL,
	`weight_kg` real,
	`reps` real,
	`distance_m` real,
	`duration_s` real,
	`rpe` real,
	`custom_metric` real,
	PRIMARY KEY(`workout_id`, `exercise_idx`, `idx`)
);
--> statement-breakpoint
CREATE TABLE `hevy_workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`routine_id` text,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`created_at` text,
	`updated_at` text,
	`deleted_at` text,
	`raw_page_id` integer
);
--> statement-breakpoint
CREATE INDEX `hevy_start` ON `hevy_workouts` (`start_ms`);--> statement-breakpoint
CREATE TABLE `observations` (
	`data_type` text NOT NULL,
	`source_id` integer NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`variant` text DEFAULT '' NOT NULL,
	`utc_offset_s` integer,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`attrs` text,
	`record_name` text,
	`raw_page_id` integer,
	PRIMARY KEY(`data_type`, `source_id`, `start_ms`, `end_ms`, `variant`)
);
--> statement-breakpoint
CREATE INDEX `obs_type_time` ON `observations` (`data_type`,`start_ms`);--> statement-breakpoint
CREATE TABLE `provider_connections` (
	`provider` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`external_user_id` text,
	`scopes` text,
	`enc_access_token` text,
	`enc_refresh_token` text,
	`access_expires_at` integer,
	`enc_api_key` text,
	`connected_at` integer,
	`last_error` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `raw_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`resource` text NOT NULL,
	`request_key` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`http_status` integer NOT NULL,
	`body_sha256` text NOT NULL,
	`body_gz` blob NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raw_pages_dedupe` ON `raw_pages` (`provider`,`resource`,`body_sha256`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sleep_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` integer NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`start_offset_s` integer,
	`end_offset_s` integer,
	`sleep_type` text,
	`is_main` integer,
	`is_nap` integer,
	`stages_status` text,
	`summary` text,
	`updated_at` integer,
	`raw_page_id` integer
);
--> statement-breakpoint
CREATE INDEX `sleep_end` ON `sleep_sessions` (`end_ms`);--> statement-breakpoint
CREATE TABLE `sleep_stages` (
	`session_id` text NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`stage` text NOT NULL,
	`is_short_awakening` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`session_id`, `start_ms`, `is_short_awakening`)
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`key` text NOT NULL,
	`platform` text,
	`recording_method` text,
	`device_form_factor` text,
	`device_manufacturer` text,
	`device_name` text,
	`app_package` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_key` ON `sources` (`provider`,`key`);--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`trigger` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`stats` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`provider` text NOT NULL,
	`stream` text NOT NULL,
	`synced_through_ms` integer,
	`backfilled_from_ms` integer,
	`cursor` text,
	`last_success_at` integer,
	`last_attempt_at` integer,
	`last_error` text,
	`rows_total` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`provider`, `stream`)
);
