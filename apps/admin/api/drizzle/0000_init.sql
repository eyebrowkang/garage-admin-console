CREATE TABLE IF NOT EXISTS `AppSettings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Cluster` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`endpoint` text NOT NULL,
	`adminToken` text NOT NULL,
	`metricToken` text,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` text NOT NULL
);
