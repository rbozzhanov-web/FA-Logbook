CREATE TABLE `log_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`kind` text DEFAULT 'operating' NOT NULL,
	`flight_number` text,
	`departure_airport` text NOT NULL,
	`arrival_airport` text NOT NULL,
	`aircraft_type` text,
	`time_out` text,
	`time_in` text,
	`arrival_date` text,
	`block_minutes` integer DEFAULT 0 NOT NULL,
	`deadhead_minutes` integer DEFAULT 0 NOT NULL,
	`ground_duty_minutes` integer DEFAULT 0 NOT NULL,
	`day_minutes` integer DEFAULT 0 NOT NULL,
	`night_minutes` integer DEFAULT 0 NOT NULL,
	`position` text,
	`duty_code` text,
	`duty_start` text,
	`duty_end` text,
	`duty_sector_index` integer,
	`duty_sector_count` integer,
	`captain_name` text,
	`purser_name` text,
	`other_crew_names` text,
	`remarks` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`import_batch_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_log_entries_date` ON `log_entries` (`date`);--> statement-breakpoint
CREATE INDEX `idx_log_entries_import_batch` ON `log_entries` (`import_batch_id`);--> statement-breakpoint
CREATE TABLE `preferences` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
