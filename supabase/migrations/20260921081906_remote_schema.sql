


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."admin_role" AS ENUM (
    'VIEWER',
    'ADMIN',
    'MANAGER',
    'SUPERADMIN'
);


ALTER TYPE "public"."admin_role" OWNER TO "postgres";


CREATE TYPE "public"."submission_status" AS ENUM (
    'submitted',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."submission_status" OWNER TO "postgres";


CREATE TYPE "public"."submission_type" AS ENUM (
    'visitor_entry',
    'visitor_exit',
    'key_borrowing',
    'key_return',
    'package_registration'
);


ALTER TYPE "public"."submission_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_hikj_record_id"("p_form_code" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
declare
  n bigint;
  code text := upper(trim(coalesce(p_form_code,'')));
  letters text;
begin
  if code !~ '^[A-Z]{2}$' then
    raise exception 'Invalid HIKJ form code: %', p_form_code;
  end if;
  n := nextval('public.hikj_public_id_seq');
  if n > 9999999999 then
    raise exception 'HIKJ public ID sequence exhausted';
  end if;
  letters :=
    chr(65 + (((n - 1) / 26) % 26)::integer) ||
    chr(65 + ((n - 1) % 26)::integer);
  return 'HIKJ-' || code || '-' || letters || lpad(n::text,10,'0');
end;
$_$;


ALTER FUNCTION "public"."generate_hikj_record_id"("p_form_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_outstanding_key_borrowing_race"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE outstanding_exists boolean;
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended(NEW.key_number,0));
SELECT EXISTS(SELECT 1 FROM public.key_control_transactions WHERE key_number=NEW.key_number AND outstanding_quantity>0) INTO outstanding_exists;
IF outstanding_exists THEN RAISE EXCEPTION 'Key % is currently outstanding. Please return the outstanding key(s) before a new borrowing.',NEW.key_number USING ERRCODE='23514'; END IF;
RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_outstanding_key_borrowing_race"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_key_expected_return_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN NEW.expected_return_at:=NEW.borrowed_at+interval '24 hours'; RETURN NEW; END;
$$;


ALTER FUNCTION "public"."set_key_expected_return_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_package_distribution_public_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
begin
  if new.distribution_number is null or new.distribution_number !~ '^HIKJ-PD-[A-Z]{2}[0-9]{10}$' then
    new.distribution_number := public.generate_hikj_record_id('PD');
  end if;
  return new;
end;
$_$;


ALTER FUNCTION "public"."set_package_distribution_public_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_submission_public_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
declare
  code text;
begin
  if new.submission_id is null or new.submission_id !~ '^HIKJ-[A-Z]{2}-[A-Z]{2}[0-9]{10}$' then
    code := case new.submission_type::text
      when 'visitor_entry' then 'VE'
      when 'visitor_exit' then 'VX'
      when 'key_borrowing' then 'KB'
      when 'key_return' then 'KR'
      when 'package_registration' then 'PR'
      else 'OT'
    end;
    new.submission_id := public.generate_hikj_record_id(code);
  end if;
  return new;
end;
$_$;


ALTER FUNCTION "public"."set_submission_public_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_key_return_quantity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  borrowed_qty integer;
  returned_qty integer;
begin
  if new.borrowing_id is null then
    raise exception 'Borrowing transaction is required';
  end if;

  select quantity into borrowed_qty
  from public.key_borrowings
  where id = new.borrowing_id
  for update;

  if borrowed_qty is null then
    raise exception 'Borrowing transaction not found';
  end if;

  select coalesce(sum(quantity),0) into returned_qty
  from public.key_returns
  where borrowing_id = new.borrowing_id
    and id <> new.id;

  if returned_qty + new.quantity > borrowed_qty then
    raise exception 'Return quantity exceeds outstanding quantity';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_key_return_quantity"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_profiles" (
    "user_id" "uuid" NOT NULL,
    "full_name" "text",
    "role" "public"."admin_role" DEFAULT 'VIEWER'::"public"."admin_role" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "setting_key" "text" NOT NULL,
    "setting_value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_name" "text",
    "module" "text",
    "target" "text",
    "description" "text"
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "text" NOT NULL,
    "submission_type" "public"."submission_type" NOT NULL,
    "visitor_id" "uuid",
    "status" "public"."submission_status" DEFAULT 'submitted'::"public"."submission_status" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "whatsapp_opened_at" timestamp with time zone,
    "whatsapp_sent_at" timestamp with time zone,
    "source" "text" DEFAULT 'web'::"text" NOT NULL,
    "idempotency_key" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "submissions_submission_id_format_check" CHECK (("submission_id" ~ '^HIKJ-[A-Z]{2}-[A-Z]{2}[0-9]{10}$'::"text"))
);


ALTER TABLE "public"."submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visitor_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "visitor_id" "uuid" NOT NULL,
    "work_location" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "security_officer_name" "text" NOT NULL,
    "pass_vest_number" "text" NOT NULL,
    "entry_at" timestamp with time zone NOT NULL,
    "exit_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "visitor_name_snapshot" "text",
    "phone_snapshot" "text",
    "company_name_snapshot" "text",
    "category_snapshot" "text",
    "visitor_name" "text",
    "visitor_phone" "text",
    "visitor_company_name" "text",
    "visitor_category" "text"
);


ALTER TABLE "public"."visitor_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visitors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "phone" "text",
    "phone_normalized" "text",
    "company_name" "text",
    "category" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "visitors_category_check" CHECK (("category" = ANY (ARRAY['Contractor'::"text", 'Supplier'::"text", 'Visitor'::"text", 'Part-time'::"text"])))
);


ALTER TABLE "public"."visitors" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."currently_inside" WITH ("security_invoker"='true') AS
 SELECT "e"."id" AS "entry_id",
    "s"."submission_id",
    "v"."id" AS "visitor_id",
    "v"."full_name",
    "v"."phone",
    "v"."company_name",
    "v"."category",
    "e"."work_location",
    "e"."purpose",
    "e"."pass_vest_number",
    "e"."security_officer_name",
    "e"."entry_at"
   FROM (("public"."visitor_entries" "e"
     JOIN "public"."submissions" "s" ON (("s"."id" = "e"."submission_id")))
     JOIN "public"."visitors" "v" ON (("v"."id" = "e"."visitor_id")))
  WHERE ("e"."exit_id" IS NULL);


ALTER VIEW "public"."currently_inside" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."hikj_public_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."hikj_public_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."key_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key_number" "text" NOT NULL,
    "key_description" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "location_department" "text",
    CONSTRAINT "key_assets_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."key_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."key_borrowings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "borrower_name" "text" NOT NULL,
    "department" "text" NOT NULL,
    "key_number" "text" NOT NULL,
    "key_description" "text",
    "quantity" integer DEFAULT 1 NOT NULL,
    "security_officer_name" "text" NOT NULL,
    "borrowed_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expected_return_at" timestamp with time zone NOT NULL,
    CONSTRAINT "key_borrowings_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."key_borrowings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."key_returns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "borrowing_id" "uuid",
    "return_name" "text" NOT NULL,
    "department" "text" NOT NULL,
    "key_number" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "security_officer_name" "text" NOT NULL,
    "returned_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "borrowed_quantity" integer NOT NULL,
    "discrepancy_qty" boolean DEFAULT false NOT NULL,
    "returned_by" "text",
    CONSTRAINT "key_returns_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "key_returns_quantity_positive" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."key_returns" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."key_control_transactions" WITH ("security_invoker"='true') AS
 SELECT "b"."id" AS "borrowing_id",
    "s"."submission_id",
    "b"."borrower_name",
    "b"."department",
    "b"."key_number",
    "b"."key_description",
    "b"."quantity" AS "borrowed_quantity",
    (COALESCE("sum"("r"."quantity"), (0)::bigint))::integer AS "returned_quantity",
    (GREATEST(("b"."quantity" - COALESCE("sum"("r"."quantity"), (0)::bigint)), (0)::bigint))::integer AS "outstanding_quantity",
    "max"("r"."returned_at") AS "last_returned_at",
    "b"."security_officer_name" AS "issued_by_security",
    "b"."borrowed_at",
    "b"."expected_return_at",
        CASE
            WHEN (GREATEST(("b"."quantity" - COALESCE("sum"("r"."quantity"), (0)::bigint)), (0)::bigint) = 0) THEN 'RETURNED'::"text"
            WHEN ("now"() > "b"."expected_return_at") THEN 'OUTSTANDING'::"text"
            ELSE 'BORROWED'::"text"
        END AS "status",
    false AS "discrepancy"
   FROM (("public"."key_borrowings" "b"
     JOIN "public"."submissions" "s" ON (("s"."id" = "b"."submission_id")))
     LEFT JOIN "public"."key_returns" "r" ON (("r"."borrowing_id" = "b"."id")))
  GROUP BY "b"."id", "s"."submission_id", "b"."borrower_name", "b"."department", "b"."key_number", "b"."key_description", "b"."quantity", "b"."security_officer_name", "b"."borrowed_at", "b"."expected_return_at";


ALTER VIEW "public"."key_control_transactions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."key_return_events" WITH ("security_invoker"='true') AS
 SELECT "r"."id" AS "return_id",
    "r"."submission_id",
    "s"."submission_id" AS "return_public_id",
    "r"."borrowing_id",
    "r"."return_name" AS "returned_by",
    "r"."department",
    "r"."key_number",
    "r"."quantity" AS "returned_quantity",
    "r"."security_officer_name" AS "received_by_security",
    "r"."returned_at",
    "r"."borrowed_quantity" AS "original_borrowed_quantity",
    "r"."discrepancy_qty"
   FROM ("public"."key_returns" "r"
     LEFT JOIN "public"."submissions" "s" ON (("s"."id" = "r"."submission_id")));


ALTER VIEW "public"."key_return_events" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."outstanding_keys" WITH ("security_invoker"='true') AS
 SELECT "borrowing_id",
    "submission_id",
    "borrower_name",
    "department",
    "key_number",
    "key_description",
    "borrowed_quantity" AS "quantity",
    "borrowed_quantity",
    "returned_quantity",
    "outstanding_quantity",
    "issued_by_security" AS "security_officer_name",
    "issued_by_security",
    "borrowed_at",
    "expected_return_at",
    "last_returned_at",
    "status",
    "discrepancy"
   FROM "public"."key_control_transactions"
  WHERE ("outstanding_quantity" > 0);


ALTER VIEW "public"."outstanding_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."package_distributions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "package_registration_id" "uuid" NOT NULL,
    "package_number" "text" NOT NULL,
    "registered_recipient_name" "text",
    "recipient_name" "text" NOT NULL,
    "security_hand_over" "text" NOT NULL,
    "distributed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'DISTRIBUTED'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "distribution_number" "text" NOT NULL,
    "note" "text",
    CONSTRAINT "package_distributions_distribution_number_format_check" CHECK (("distribution_number" ~ '^HIKJ-PD-[A-Z]{2}[0-9]{10}$'::"text")),
    CONSTRAINT "package_distributions_status_check" CHECK (("status" = 'DISTRIBUTED'::"text"))
);


ALTER TABLE "public"."package_distributions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."package_distributions"."note" IS 'Optional note recorded when a package is handed over by Security.';



CREATE TABLE IF NOT EXISTS "public"."package_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "courier_name" "text" NOT NULL,
    "phone" "text",
    "phone_normalized" "text",
    "company_name" "text" NOT NULL,
    "item_type" "text" NOT NULL,
    "item_count" integer DEFAULT 1 NOT NULL,
    "recipient_type" "text" NOT NULL,
    "recipient_name" "text" NOT NULL,
    "security_officer_name" "text" NOT NULL,
    "photo_storage_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "package_registrations_item_count_check" CHECK (("item_count" > 0)),
    CONSTRAINT "package_registrations_item_type_check" CHECK (("item_type" = ANY (ARRAY['LETTER'::"text", 'PACKAGE'::"text"]))),
    CONSTRAINT "package_registrations_recipient_type_check" CHECK (("recipient_type" = ANY (ARRAY['STAFF'::"text", 'GUEST'::"text"])))
);


ALTER TABLE "public"."package_registrations" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."package_distribution_history" WITH ("security_invoker"='true') AS
 SELECT "d"."id",
    "d"."distribution_number",
    "d"."package_registration_id",
    "d"."package_number",
    "d"."registered_recipient_name",
    "d"."recipient_name",
    "d"."security_hand_over",
    "d"."distributed_at",
    "d"."status",
    "d"."created_at",
    "p"."company_name",
    "p"."courier_name",
    "p"."item_type",
    "p"."item_count",
    "p"."created_at" AS "registered_at",
    "d"."note"
   FROM ("public"."package_distributions" "d"
     JOIN "public"."package_registrations" "p" ON (("p"."id" = "d"."package_registration_id")));


ALTER VIEW "public"."package_distribution_history" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."recent_activity" WITH ("security_invoker"='true') AS
 SELECT "s"."id",
    "s"."submission_id",
    "s"."submission_type",
    "s"."status",
    "s"."submitted_at",
    "v"."full_name" AS "visitor_name",
    "v"."phone",
    "v"."company_name"
   FROM ("public"."submissions" "s"
     LEFT JOIN "public"."visitors" "v" ON (("v"."id" = "s"."visitor_id")));


ALTER VIEW "public"."recent_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visitor_exits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "visitor_id" "uuid",
    "entry_id" "uuid",
    "visitor_name" "text" NOT NULL,
    "pass_vest_number" "text" NOT NULL,
    "security_officer_name" "text" NOT NULL,
    "exit_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."visitor_exits" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_profiles"
    ADD CONSTRAINT "admin_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("setting_key");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."key_assets"
    ADD CONSTRAINT "key_assets_key_number_key" UNIQUE ("key_number");



ALTER TABLE ONLY "public"."key_assets"
    ADD CONSTRAINT "key_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."key_borrowings"
    ADD CONSTRAINT "key_borrowings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."key_borrowings"
    ADD CONSTRAINT "key_borrowings_submission_id_key" UNIQUE ("submission_id");



ALTER TABLE ONLY "public"."key_returns"
    ADD CONSTRAINT "key_returns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."key_returns"
    ADD CONSTRAINT "key_returns_submission_id_key" UNIQUE ("submission_id");



ALTER TABLE ONLY "public"."package_distributions"
    ADD CONSTRAINT "package_distributions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."package_registrations"
    ADD CONSTRAINT "package_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."package_registrations"
    ADD CONSTRAINT "package_registrations_submission_id_key" UNIQUE ("submission_id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_submission_id_key" UNIQUE ("submission_id");



ALTER TABLE ONLY "public"."visitor_entries"
    ADD CONSTRAINT "visitor_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visitor_entries"
    ADD CONSTRAINT "visitor_entries_submission_id_key" UNIQUE ("submission_id");



ALTER TABLE ONLY "public"."visitor_exits"
    ADD CONSTRAINT "visitor_exits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visitor_exits"
    ADD CONSTRAINT "visitor_exits_submission_id_key" UNIQUE ("submission_id");



ALTER TABLE ONLY "public"."visitors"
    ADD CONSTRAINT "visitors_pkey" PRIMARY KEY ("id");



CREATE INDEX "app_settings_updated_by_idx" ON "public"."app_settings" USING "btree" ("updated_by");



CREATE INDEX "idx_audit_logs_created_at" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "key_borrowings_borrowed_at_idx" ON "public"."key_borrowings" USING "btree" ("borrowed_at" DESC);



CREATE INDEX "key_borrowings_key_number_idx" ON "public"."key_borrowings" USING "btree" ("key_number");



CREATE INDEX "key_returns_borrowing_idx" ON "public"."key_returns" USING "btree" ("borrowing_id");



CREATE INDEX "key_returns_returned_at_idx" ON "public"."key_returns" USING "btree" ("returned_at" DESC);



CREATE INDEX "package_distributions_distributed_at_idx" ON "public"."package_distributions" USING "btree" ("distributed_at" DESC);



CREATE UNIQUE INDEX "package_distributions_distribution_number_key" ON "public"."package_distributions" USING "btree" ("distribution_number");



CREATE UNIQUE INDEX "package_distributions_package_registration_unique" ON "public"."package_distributions" USING "btree" ("package_registration_id");



CREATE INDEX "package_registrations_created_at_idx" ON "public"."package_registrations" USING "btree" ("created_at" DESC);



CREATE INDEX "submissions_status_idx" ON "public"."submissions" USING "btree" ("status");



CREATE INDEX "submissions_submitted_at_idx" ON "public"."submissions" USING "btree" ("submitted_at" DESC);



CREATE INDEX "submissions_type_idx" ON "public"."submissions" USING "btree" ("submission_type");



CREATE INDEX "submissions_visitor_idx" ON "public"."submissions" USING "btree" ("visitor_id");



CREATE INDEX "visitor_entries_entry_at_idx" ON "public"."visitor_entries" USING "btree" ("entry_at" DESC);



CREATE INDEX "visitor_entries_exit_id_idx" ON "public"."visitor_entries" USING "btree" ("exit_id");



CREATE INDEX "visitor_entries_pass_idx" ON "public"."visitor_entries" USING "btree" ("pass_vest_number");



CREATE INDEX "visitor_entries_visitor_idx" ON "public"."visitor_entries" USING "btree" ("visitor_id");



CREATE INDEX "visitor_exits_entry_idx" ON "public"."visitor_exits" USING "btree" ("entry_id");



CREATE INDEX "visitor_exits_exit_at_idx" ON "public"."visitor_exits" USING "btree" ("exit_at" DESC);



CREATE INDEX "visitor_exits_visitor_id_idx" ON "public"."visitor_exits" USING "btree" ("visitor_id");



CREATE OR REPLACE TRIGGER "trg_admin_profiles_updated_at" BEFORE UPDATE ON "public"."admin_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_app_settings_updated_at" BEFORE UPDATE ON "public"."app_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_key_assets_updated_at" BEFORE UPDATE ON "public"."key_assets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_key_borrowings_updated_at" BEFORE UPDATE ON "public"."key_borrowings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_key_expected_return_at" BEFORE INSERT OR UPDATE OF "borrowed_at" ON "public"."key_borrowings" FOR EACH ROW EXECUTE FUNCTION "public"."set_key_expected_return_at"();



CREATE OR REPLACE TRIGGER "trg_key_returns_updated_at" BEFORE UPDATE ON "public"."key_returns" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_package_distributions_public_id" BEFORE INSERT ON "public"."package_distributions" FOR EACH ROW EXECUTE FUNCTION "public"."set_package_distribution_public_id"();



CREATE OR REPLACE TRIGGER "trg_package_registrations_updated_at" BEFORE UPDATE ON "public"."package_registrations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_prevent_outstanding_key_borrowing_race" BEFORE INSERT ON "public"."key_borrowings" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_outstanding_key_borrowing_race"();



CREATE OR REPLACE TRIGGER "trg_submissions_public_id" BEFORE INSERT ON "public"."submissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_submission_public_id"();



CREATE OR REPLACE TRIGGER "trg_submissions_updated_at" BEFORE UPDATE ON "public"."submissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_validate_key_return_quantity" BEFORE INSERT OR UPDATE ON "public"."key_returns" FOR EACH ROW EXECUTE FUNCTION "public"."validate_key_return_quantity"();



CREATE OR REPLACE TRIGGER "trg_visitor_entries_updated_at" BEFORE UPDATE ON "public"."visitor_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_visitor_exits_updated_at" BEFORE UPDATE ON "public"."visitor_exits" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_visitors_updated_at" BEFORE UPDATE ON "public"."visitors" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."admin_profiles"
    ADD CONSTRAINT "admin_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."key_borrowings"
    ADD CONSTRAINT "key_borrowings_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."key_returns"
    ADD CONSTRAINT "key_returns_borrowing_id_fkey" FOREIGN KEY ("borrowing_id") REFERENCES "public"."key_borrowings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."key_returns"
    ADD CONSTRAINT "key_returns_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."package_distributions"
    ADD CONSTRAINT "package_distributions_package_registration_id_fkey" FOREIGN KEY ("package_registration_id") REFERENCES "public"."package_registrations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."package_registrations"
    ADD CONSTRAINT "package_registrations_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."visitor_entries"
    ADD CONSTRAINT "visitor_entries_exit_id_fkey" FOREIGN KEY ("exit_id") REFERENCES "public"."visitor_exits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."visitor_entries"
    ADD CONSTRAINT "visitor_entries_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visitor_entries"
    ADD CONSTRAINT "visitor_entries_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."visitor_exits"
    ADD CONSTRAINT "visitor_exits_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."visitor_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."visitor_exits"
    ADD CONSTRAINT "visitor_exits_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visitor_exits"
    ADD CONSTRAINT "visitor_exits_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE SET NULL;



ALTER TABLE "public"."admin_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_profiles_self_select" ON "public"."admin_profiles" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("active" = true)));



ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_settings_admin_select" ON "public"."app_settings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_profiles" "ap"
  WHERE (("ap"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ap"."active" = true) AND ("upper"(("ap"."role")::"text") = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'SUPERADMIN'::"text"]))))));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_admin_select" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_profiles" "ap"
  WHERE (("ap"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ap"."active" = true) AND ("upper"(("ap"."role")::"text") = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'SUPERADMIN'::"text"]))))));



ALTER TABLE "public"."key_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "key_assets_admin_select" ON "public"."key_assets" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_profiles" "ap"
  WHERE (("ap"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ap"."active" = true) AND ("upper"(("ap"."role")::"text") = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'SUPERADMIN'::"text"]))))));



ALTER TABLE "public"."key_borrowings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "key_borrowings_admin_select" ON "public"."key_borrowings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_profiles" "ap"
  WHERE (("ap"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ap"."active" = true) AND ("upper"(("ap"."role")::"text") = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'SUPERADMIN'::"text"]))))));



ALTER TABLE "public"."key_returns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "key_returns_admin_select" ON "public"."key_returns" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_profiles" "ap"
  WHERE (("ap"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ap"."active" = true) AND ("upper"(("ap"."role")::"text") = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'SUPERADMIN'::"text"]))))));



ALTER TABLE "public"."package_distributions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "package_distributions_admin_select" ON "public"."package_distributions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_profiles" "ap"
  WHERE (("ap"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ap"."active" = true) AND ("upper"(("ap"."role")::"text") = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'SUPERADMIN'::"text"]))))));



ALTER TABLE "public"."package_registrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "package_registrations_admin_select" ON "public"."package_registrations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_profiles" "ap"
  WHERE (("ap"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ap"."active" = true) AND ("upper"(("ap"."role")::"text") = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'SUPERADMIN'::"text"]))))));



ALTER TABLE "public"."submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "submissions_admin_select" ON "public"."submissions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_profiles" "ap"
  WHERE (("ap"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ap"."active" = true) AND ("upper"(("ap"."role")::"text") = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'SUPERADMIN'::"text"]))))));



ALTER TABLE "public"."visitor_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "visitor_entries_admin_select" ON "public"."visitor_entries" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_profiles" "ap"
  WHERE (("ap"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ap"."active" = true) AND ("upper"(("ap"."role")::"text") = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'SUPERADMIN'::"text"]))))));



ALTER TABLE "public"."visitor_exits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "visitor_exits_admin_select" ON "public"."visitor_exits" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_profiles" "ap"
  WHERE (("ap"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ap"."active" = true) AND ("upper"(("ap"."role")::"text") = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'SUPERADMIN'::"text"]))))));



ALTER TABLE "public"."visitors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "visitors_admin_select" ON "public"."visitors" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."admin_profiles" "ap"
  WHERE (("ap"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ap"."active" = true) AND ("upper"(("ap"."role")::"text") = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'SUPERADMIN'::"text"]))))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."generate_hikj_record_id"("p_form_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_hikj_record_id"("p_form_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_outstanding_key_borrowing_race"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_outstanding_key_borrowing_race"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_key_expected_return_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_key_expected_return_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_key_expected_return_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_package_distribution_public_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_package_distribution_public_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_submission_public_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_submission_public_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_key_return_quantity"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_key_return_quantity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_key_return_quantity"() TO "service_role";


















GRANT ALL ON TABLE "public"."admin_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."submissions" TO "service_role";



GRANT ALL ON TABLE "public"."visitor_entries" TO "service_role";



GRANT ALL ON TABLE "public"."visitors" TO "service_role";



GRANT ALL ON TABLE "public"."currently_inside" TO "anon";
GRANT ALL ON TABLE "public"."currently_inside" TO "authenticated";
GRANT ALL ON TABLE "public"."currently_inside" TO "service_role";



GRANT ALL ON SEQUENCE "public"."hikj_public_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."hikj_public_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."hikj_public_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."key_assets" TO "service_role";



GRANT ALL ON TABLE "public"."key_borrowings" TO "service_role";



GRANT ALL ON TABLE "public"."key_returns" TO "service_role";



GRANT ALL ON TABLE "public"."key_control_transactions" TO "anon";
GRANT ALL ON TABLE "public"."key_control_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."key_control_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."key_return_events" TO "anon";
GRANT ALL ON TABLE "public"."key_return_events" TO "authenticated";
GRANT ALL ON TABLE "public"."key_return_events" TO "service_role";



GRANT ALL ON TABLE "public"."outstanding_keys" TO "anon";
GRANT ALL ON TABLE "public"."outstanding_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."outstanding_keys" TO "service_role";



GRANT ALL ON TABLE "public"."package_distributions" TO "service_role";



GRANT ALL ON TABLE "public"."package_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."package_distribution_history" TO "service_role";



GRANT ALL ON TABLE "public"."recent_activity" TO "anon";
GRANT ALL ON TABLE "public"."recent_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."recent_activity" TO "service_role";



GRANT ALL ON TABLE "public"."visitor_exits" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































