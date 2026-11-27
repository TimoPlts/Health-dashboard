CREATE TABLE `workout_annotations` (
	`session_id` text PRIMARY KEY NOT NULL,
	`name` text,
	`category` text,
	`effort` integer,
	`updated_at` integer NOT NULL
);
