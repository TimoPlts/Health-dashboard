CREATE TABLE `weight_day_choice` (
	`date` text PRIMARY KEY NOT NULL,
	`t_ms` integer NOT NULL,
	`source_id` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weight_phases` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`start_kg` real NOT NULL,
	`end_date` text,
	`goal_kg` real,
	`target_rate_kg_week` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `weight_phases_start` ON `weight_phases` (`start_date`);