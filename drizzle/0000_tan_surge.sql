CREATE TABLE `guild_queues` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`voice_channel_id` text NOT NULL,
	`text_channel_id` text NOT NULL,
	`current_track` text,
	`tracks` text DEFAULT '[]' NOT NULL,
	`history` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `guild_settings` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`autoplay` integer DEFAULT false NOT NULL
);
