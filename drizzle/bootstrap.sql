CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`restaurant_id` integer NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE cascade
);

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

CREATE UNIQUE INDEX `commission_settlements_idempotency_unique` ON `commission_settlements` (`idempotency_key`);
CREATE UNIQUE INDEX `commission_settlements_reference_unique` ON `commission_settlements` (`restaurant_id`,`payment_reference`);
CREATE TABLE `menu_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`restaurant_id` integer NOT NULL,
	`category_id` integer,
	`name` text NOT NULL,
	`description` text,
	`price` real NOT NULL,
	`image_url` text,
	`is_available` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`menu_item_id` integer NOT NULL,
	`item_name` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` real NOT NULL,
	`note` text,
	`total` real NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_number` text NOT NULL,
	`restaurant_id` integer NOT NULL,
	`customer_name` text,
	`customer_phone` text NOT NULL,
	`delivery_address` text NOT NULL,
	`customer_note` text,
	`subtotal` real NOT NULL,
	`delivery_fee` real DEFAULT 0 NOT NULL,
	`customer_platform_fee` real DEFAULT 0 NOT NULL,
	`platform_fee` real DEFAULT 0 NOT NULL,
	`fee_model` text DEFAULT 'LEGACY' NOT NULL,
	`total` real NOT NULL,
	`payment_method` text DEFAULT 'COD_OR_UPI' NOT NULL,
	`status` text DEFAULT 'NEW' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);
CREATE TABLE `processed_whatsapp_messages` (
	`message_id` text PRIMARY KEY NOT NULL,
	`processed_at` integer NOT NULL,
	`status` text DEFAULT 'COMPLETED' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`claim_token` text,
	`lease_expires_at` integer,
	`completed_at` integer,
	`last_error` text
);

CREATE TABLE `restaurant_daily_order_counters` (
	`restaurant_id` integer NOT NULL,
	`order_date` text NOT NULL,
	`order_count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`restaurant_id`, `order_date`),
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE `restaurants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`phone` text NOT NULL,
	`whatsapp` text,
	`address` text,
	`area` text NOT NULL,
	`image_url` text,
	`username` text,
	`password_hash` text,
	`is_open` integer DEFAULT true NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);

CREATE UNIQUE INDEX `restaurants_username_unique` ON `restaurants` (`username`);
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

CREATE UNIQUE INDEX `whatsapp_outbox_idempotency_unique` ON `whatsapp_outbox` (`idempotency_key`);
CREATE INDEX `whatsapp_outbox_delivery_idx` ON `whatsapp_outbox` (`status`,`next_attempt_at`,`lease_expires_at`);
CREATE TABLE `whatsapp_sessions` (
	`phone` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'START' NOT NULL,
	`restaurant_id` integer,
	`cart` text DEFAULT '[]' NOT NULL,
	`customer_note` text,
	`delivery_address` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE set null
);
