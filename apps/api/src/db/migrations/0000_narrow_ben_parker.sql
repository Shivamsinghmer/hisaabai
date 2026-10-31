CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" text DEFAULT 'ringing',
	"outcome" text,
	"transcript" jsonb DEFAULT '[]'::jsonb,
	"started_at" timestamp with time zone DEFAULT now(),
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"granted" boolean NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now(),
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "credit_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"factors" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "credit_scores_score_check" CHECK ("credit_scores"."score" between 300 and 900)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[],
	"phone" text,
	"upi_vpa" text,
	"language" text DEFAULT 'hi-IN',
	"trust_level" text DEFAULT 'regular',
	"pay_prediction" text,
	"udhaar_service_eligible" boolean DEFAULT false,
	"udhaar_service_limit_paise" bigint DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "customers_trust_level_check" CHECK ("customers"."trust_level" in ('new','regular','trusted','risky'))
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"note" text,
	"status" text DEFAULT 'open',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "khata_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"image_url" text NOT NULL,
	"raw_text" text,
	"ocr_provider" text,
	"status" text DEFAULT 'processing',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"customer_id" uuid,
	"type" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"items" text,
	"source" text NOT NULL,
	"scan_id" uuid,
	"transcript" text,
	"confidence" real,
	"status" text DEFAULT 'confirmed',
	"entry_date" date DEFAULT current_date NOT NULL,
	"due_date" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "ledger_entries_type_check" CHECK ("ledger_entries"."type" in ('credit','payment','sale','purchase','expense')),
	CONSTRAINT "ledger_entries_amount_check" CHECK ("ledger_entries"."amount_paise" > 0),
	CONSTRAINT "ledger_entries_source_check" CHECK ("ledger_entries"."source" in ('photo','voice','upi','manual','paytm_udhaar','loan')),
	CONSTRAINT "ledger_entries_status_check" CHECK ("ledger_entries"."status" in ('pending_confirm','confirmed','deleted'))
);
--> statement-breakpoint
CREATE TABLE "loan_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"score_id" uuid,
	"amount_paise" bigint NOT NULL,
	"tenure_months" integer NOT NULL,
	"annual_rate_pct" numeric(5, 2) NOT NULL,
	"emi_paise" bigint NOT NULL,
	"teach_back_attempts" integer DEFAULT 0,
	"teach_back_passed" boolean DEFAULT false,
	"status" text DEFAULT 'offered',
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "loan_offers_status_check" CHECK ("loan_offers"."status" in ('offered','accepted','disbursed','declined','expired'))
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_name" text NOT NULL,
	"shop_name" text NOT NULL,
	"phone" text,
	"language" text DEFAULT 'hi-IN' NOT NULL,
	"city" text,
	"paytm_linked" boolean DEFAULT false,
	"default_due_days" integer DEFAULT 15,
	"auto_gentle_reminders" boolean DEFAULT true,
	"quiet_hours" jsonb DEFAULT '{"start":"21:00","end":"09:00"}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "merchants_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"kind" text,
	"title" text,
	"body" text,
	"read" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text,
	"unit" text,
	"stock_qty" numeric,
	"reorder_level" numeric,
	"supplier" text
);
--> statement-breakpoint
CREATE TABLE "promises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount_paise" bigint,
	"promised_date" date NOT NULL,
	"source" text,
	"status" text DEFAULT 'open',
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "promises_status_check" CHECK ("promises"."status" in ('open','kept','broken'))
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"product_id" uuid,
	"qty" numeric,
	"rate_paise" bigint,
	"bill_scan_url" text,
	"purchase_date" date DEFAULT current_date
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"channel" text,
	"tone" text,
	"message" text,
	"amount_paise" bigint,
	"payment_token" text,
	"status" text DEFAULT 'sent',
	"approved_by_merchant" boolean DEFAULT false,
	"sent_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "reminders_payment_token_unique" UNIQUE("payment_token"),
	CONSTRAINT "reminders_channel_check" CHECK ("reminders"."channel" in ('in_app','whatsapp','sms','call_sim')),
	CONSTRAINT "reminders_tone_check" CHECK ("reminders"."tone" in ('gentle','firm')),
	CONSTRAINT "reminders_status_check" CHECK ("reminders"."status" in ('queued','sent','paid','ignored'))
);
--> statement-breakpoint
CREATE TABLE "udhaar_service_txns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"fee_paise" bigint DEFAULT 0,
	"status" text DEFAULT 'offered',
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "udhaar_service_txns_status_check" CHECK ("udhaar_service_txns"."status" in ('offered','funded','repaying','closed','defaulted'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid,
	"auth_user_id" uuid,
	"email" text,
	"phone" text,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('owner','helper'))
);
--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_scores" ADD CONSTRAINT "credit_scores_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "khata_scans" ADD CONSTRAINT "khata_scans_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_scan_id_khata_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."khata_scans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_offers" ADD CONSTRAINT "loan_offers_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_offers" ADD CONSTRAINT "loan_offers_score_id_credit_scores_id_fk" FOREIGN KEY ("score_id") REFERENCES "public"."credit_scores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promises" ADD CONSTRAINT "promises_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promises" ADD CONSTRAINT "promises_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "udhaar_service_txns" ADD CONSTRAINT "udhaar_service_txns_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "udhaar_service_txns" ADD CONSTRAINT "udhaar_service_txns_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calls_merchant_id_customer_id_index" ON "calls" USING btree ("merchant_id","customer_id");--> statement-breakpoint
CREATE INDEX "consents_merchant_id_index" ON "consents" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "credit_scores_merchant_id_computed_at_index" ON "credit_scores" USING btree ("merchant_id","computed_at");--> statement-breakpoint
CREATE INDEX "customers_merchant_id_index" ON "customers" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "disputes_merchant_id_customer_id_index" ON "disputes" USING btree ("merchant_id","customer_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_merchant_id_customer_id_entry_date_index" ON "ledger_entries" USING btree ("merchant_id","customer_id","entry_date");--> statement-breakpoint
CREATE INDEX "loan_offers_merchant_id_index" ON "loan_offers" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "notifications_merchant_id_read_index" ON "notifications" USING btree ("merchant_id","read");--> statement-breakpoint
CREATE INDEX "promises_merchant_id_status_promised_date_index" ON "promises" USING btree ("merchant_id","status","promised_date");--> statement-breakpoint
CREATE INDEX "reminders_merchant_id_customer_id_index" ON "reminders" USING btree ("merchant_id","customer_id");--> statement-breakpoint
CREATE INDEX "udhaar_service_txns_merchant_id_index" ON "udhaar_service_txns" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "users_merchant_id_index" ON "users" USING btree ("merchant_id");--> statement-breakpoint
CREATE VIEW "public"."customer_balances" AS (
  select c.id as customer_id, c.merchant_id, c.name,
    (coalesce(sum(case when e.type = 'credit' then e.amount_paise end), 0)
     - coalesce(sum(case when e.type = 'payment' then e.amount_paise end), 0))::bigint as balance_paise,
    min(e.due_date) filter (where e.type = 'credit') as earliest_due
  from customers c
  left join ledger_entries e on e.customer_id = c.id and e.status = 'confirmed'
  group by c.id
);