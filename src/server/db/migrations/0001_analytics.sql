CREATE TABLE `derived_daily` (
	`metric` text NOT NULL,
	`date` text NOT NULL,
	`value` real NOT NULL,
	`version` text NOT NULL,
	`attrs` text,
	`computed_at` integer NOT NULL,
	PRIMARY KEY(`metric`, `date`)
);
--> statement-breakpoint
CREATE INDEX `derived_daily_date` ON `derived_daily` (`date`);--> statement-breakpoint
CREATE TABLE `exercise_exclusions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`reason` text,
	`excluded_at` integer NOT NULL
);
