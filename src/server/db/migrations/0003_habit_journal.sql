CREATE TABLE `habit_entries` (
	`habit_id` text NOT NULL,
	`date` text NOT NULL,
	`value` real NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`habit_id`, `date`)
);
--> statement-breakpoint
CREATE INDEX `habit_entries_date` ON `habit_entries` (`date`);--> statement-breakpoint
CREATE TABLE `habits` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`unit` text,
	`min` real,
	`max` real,
	`step` real,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL
);
