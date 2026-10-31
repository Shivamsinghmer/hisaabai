CREATE TABLE "customer_network_consents" (
	"phone" text PRIMARY KEY NOT NULL,
	"granted" boolean NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now(),
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "customers_phone_index" ON "customers" USING btree ("phone");