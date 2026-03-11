CREATE TABLE `Connection` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`endpoint` text NOT NULL,
	`region` text,
	`accessKeyId` text NOT NULL,
	`secretAccessKey` text NOT NULL,
	`bucket` text,
	`pathStyle` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updatedAt` text NOT NULL
);
