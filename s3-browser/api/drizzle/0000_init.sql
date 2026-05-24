CREATE TABLE `AppSettings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `Connection` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`endpoint` text NOT NULL,
	`region` text DEFAULT 'us-east-1' NOT NULL,
	`forcePathStyle` text DEFAULT 'true' NOT NULL,
	`accessKeyId` text NOT NULL,
	`secretAccessKey` text NOT NULL,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` text NOT NULL
);
