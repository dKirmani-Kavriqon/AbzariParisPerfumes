CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"image_ref" text,
	"status" text DEFAULT 'active' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "categories_store_slug_unique" UNIQUE("store_id","slug"),
	CONSTRAINT "categories_store_id_unique" UNIQUE("store_id","id"),
	CONSTRAINT "categories_name_length" CHECK (char_length("categories"."name") between 1 and 120),
	CONSTRAINT "categories_slug_format" CHECK ("categories"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("categories"."slug") <= 120),
	CONSTRAINT "categories_not_own_parent" CHECK ("categories"."parent_id" is null or "categories"."parent_id" <> "categories"."id"),
	CONSTRAINT "categories_status_values" CHECK ("categories"."status" in ('active', 'hidden', 'archived')),
	CONSTRAINT "categories_archived_consistent" CHECK (("categories"."status" = 'archived') = ("categories"."archived_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"available_quantity" integer DEFAULT 0 NOT NULL,
	"reserved_quantity" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_variant_id_unique" UNIQUE("variant_id"),
	CONSTRAINT "inventory_available_non_negative" CHECK ("inventory"."available_quantity" >= 0),
	CONSTRAINT "inventory_reserved_non_negative" CHECK ("inventory"."reserved_quantity" >= 0),
	CONSTRAINT "inventory_threshold_non_negative" CHECK ("inventory"."low_stock_threshold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"movement_type" text NOT NULL,
	"quantity_change" integer NOT NULL,
	"previous_quantity" integer NOT NULL,
	"resulting_quantity" integer NOT NULL,
	"reason" text,
	"reference" text,
	"actor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_movements_type_values" CHECK ("inventory_movements"."movement_type" in ('initial', 'restock', 'return', 'damage', 'correction', 'sale', 'reservation', 'release')),
	CONSTRAINT "inventory_movements_quantities_non_negative" CHECK ("inventory_movements"."previous_quantity" >= 0 and "inventory_movements"."resulting_quantity" >= 0),
	CONSTRAINT "inventory_movements_arithmetic" CHECK ("inventory_movements"."resulting_quantity" = "inventory_movements"."previous_quantity" + "inventory_movements"."quantity_change")
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_categories_pk" PRIMARY KEY("product_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"source" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text,
	"byte_size" integer,
	"width" integer,
	"height" integer,
	"alt_text" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_images_store_key_unique" UNIQUE("store_id","storage_key"),
	CONSTRAINT "product_images_source_values" CHECK ("product_images"."source" in ('static', 'object')),
	CONSTRAINT "product_images_alt_length" CHECK (char_length("product_images"."alt_text") <= 250),
	CONSTRAINT "product_images_size_positive" CHECK ("product_images"."byte_size" is null or "product_images"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"barcode" text,
	"title" text DEFAULT '' NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_minor" integer NOT NULL,
	"sale_price_minor" integer,
	"currency" char(3) NOT NULL,
	"weight_grams" integer,
	"length_mm" integer,
	"width_mm" integer,
	"height_mm" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "product_variants_store_sku_unique" UNIQUE("store_id","sku"),
	CONSTRAINT "product_variants_store_id_unique" UNIQUE("store_id","id"),
	CONSTRAINT "product_variants_store_product_id_unique" UNIQUE("store_id","product_id","id"),
	CONSTRAINT "product_variants_sku_format" CHECK ("product_variants"."sku" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
	CONSTRAINT "product_variants_price_non_negative" CHECK ("product_variants"."price_minor" >= 0),
	CONSTRAINT "product_variants_sale_below_price" CHECK ("product_variants"."sale_price_minor" is null or ("product_variants"."sale_price_minor" >= 0 and "product_variants"."sale_price_minor" < "product_variants"."price_minor")),
	CONSTRAINT "product_variants_currency_format" CHECK ("product_variants"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "product_variants_weight_non_negative" CHECK ("product_variants"."weight_grams" is null or "product_variants"."weight_grams" >= 0),
	CONSTRAINT "product_variants_dimensions_positive" CHECK (coalesce("product_variants"."length_mm", 1) > 0 and coalesce("product_variants"."width_mm", 1) > 0 and coalesce("product_variants"."height_mm", 1) > 0),
	CONSTRAINT "product_variants_status_values" CHECK ("product_variants"."status" in ('active', 'inactive', 'archived')),
	CONSTRAINT "product_variants_archived_consistent" CHECK (("product_variants"."status" = 'archived') = ("product_variants"."archived_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"short_description" text,
	"full_description" text,
	"brand" text,
	"product_type" text DEFAULT 'standard' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "products_store_slug_unique" UNIQUE("store_id","slug"),
	CONSTRAINT "products_store_id_unique" UNIQUE("store_id","id"),
	CONSTRAINT "products_name_length" CHECK (char_length("products"."name") between 1 and 200),
	CONSTRAINT "products_slug_format" CHECK ("products"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("products"."slug") <= 120),
	CONSTRAINT "products_status_values" CHECK ("products"."status" in ('draft', 'active', 'archived')),
	CONSTRAINT "products_archived_consistent" CHECK (("products"."status" = 'archived') = ("products"."archived_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"default_currency" char(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stores_code_unique" UNIQUE("code"),
	CONSTRAINT "stores_code_format" CHECK ("stores"."code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "stores_currency_format" CHECK ("stores"."default_currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_same_store_fk" FOREIGN KEY ("store_id","parent_id") REFERENCES "public"."categories"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_variant_fk" FOREIGN KEY ("store_id","variant_id") REFERENCES "public"."product_variants"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_fk" FOREIGN KEY ("store_id","variant_id") REFERENCES "public"."product_variants"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_fk" FOREIGN KEY ("store_id","category_id") REFERENCES "public"."categories"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_fk" FOREIGN KEY ("store_id","product_id","variant_id") REFERENCES "public"."product_variants"("store_id","product_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_store_parent_idx" ON "categories" USING btree ("store_id","parent_id");--> statement-breakpoint
CREATE INDEX "inventory_store_idx" ON "inventory" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_variant_created_idx" ON "inventory_movements" USING btree ("variant_id","created_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_store_created_idx" ON "inventory_movements" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "product_categories_store_category_idx" ON "product_categories" USING btree ("store_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_one_primary" ON "product_images" USING btree ("product_id") WHERE "product_images"."is_primary";--> statement-breakpoint
CREATE INDEX "product_images_product_position_idx" ON "product_images" USING btree ("product_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_store_barcode_unique" ON "product_variants" USING btree ("store_id","barcode") WHERE "product_variants"."barcode" is not null;--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_store_status_idx" ON "products" USING btree ("store_id","status","featured");--> statement-breakpoint
CREATE INDEX "products_store_created_idx" ON "products" USING btree ("store_id","created_at");--> statement-breakpoint
-- The stock ledger is append-only: corrections are new movements, never edits.
CREATE FUNCTION "inventory_movements_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inventory_movements is append-only (% is not allowed)', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "inventory_movements_no_update_or_delete" BEFORE UPDATE OR DELETE ON "inventory_movements" FOR EACH ROW EXECUTE FUNCTION "inventory_movements_append_only"();
