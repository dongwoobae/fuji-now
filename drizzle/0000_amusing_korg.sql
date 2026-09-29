CREATE TABLE `observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`observed_at` text NOT NULL,
	`location` text NOT NULL,
	`label` text NOT NULL,
	`summit_visible` integer NOT NULL,
	`confidence` real,
	`note` text NOT NULL
);
