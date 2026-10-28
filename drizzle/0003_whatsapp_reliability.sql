CREATE TABLE `whatsapp_outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`idempotency_key` text NOT NULL,
	`recipient` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`claim_token` text,
	`lease_expires_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`sent_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_outbox_idempotency_unique` ON `whatsapp_outbox` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `whatsapp_outbox_delivery_idx` ON `whatsapp_outbox` (`status`,`next_attempt_at`,`lease_expires_at`);--> statement-breakpoint
ALTER TABLE `processed_whatsapp_messages` ADD `status` text DEFAULT 'COMPLETED' NOT NULL;--> statement-breakpoint
ALTER TABLE `processed_whatsapp_messages` ADD `attempt_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `processed_whatsapp_messages` ADD `claim_token` text;--> statement-breakpoint
ALTER TABLE `processed_whatsapp_messages` ADD `lease_expires_at` integer;--> statement-breakpoint
ALTER TABLE `processed_whatsapp_messages` ADD `completed_at` integer;--> statement-breakpoint
ALTER TABLE `processed_whatsapp_messages` ADD `last_error` text;