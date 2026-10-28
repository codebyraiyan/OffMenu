ALTER TABLE `orders`
ADD `fee_model` text DEFAULT 'LEGACY' NOT NULL;
--> statement-breakpoint
CREATE TABLE `commission_settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`restaurant_id` integer NOT NULL,
	`amount_paise` integer NOT NULL,
	`paid_at` integer NOT NULL,
	`payment_reference` text,
	`notes` text,
	`period_start` integer,
	`period_end` integer,
	`idempotency_key` text NOT NULL,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commission_settlements_idempotency_unique` ON `commission_settlements` (`idempotency_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `commission_settlements_reference_unique` ON `commission_settlements` (`restaurant_id`, `payment_reference`);
