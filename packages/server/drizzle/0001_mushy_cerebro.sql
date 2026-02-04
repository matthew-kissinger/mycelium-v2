CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`host` text NOT NULL,
	`port` integer,
	`protocol` text DEFAULT 'http',
	`status` text DEFAULT 'unknown',
	`last_seen` text,
	`last_error` text,
	`response_time_ms` integer,
	`config` text,
	`description` text,
	`created_at` text NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_name_unique` ON `devices` (`name`);
