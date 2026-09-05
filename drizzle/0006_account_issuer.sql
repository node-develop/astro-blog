-- Better-Auth 1.7: accounts gained a required `issuer` namespace and sign-in
-- matches on (issuer, account_id). Backfill existing rows before enforcing
-- NOT NULL so nobody is locked out after the deploy:
--   credential logins  -> local:credential
--   OAuth (github,...) -> local:oauth:<provider_id>
ALTER TABLE "accounts" ADD COLUMN "issuer" text;--> statement-breakpoint
UPDATE "accounts" SET "issuer" = CASE
  WHEN "provider_id" = 'credential' THEN 'local:credential'
  ELSE 'local:oauth:' || "provider_id"
END WHERE "issuer" IS NULL;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_issuer_account_idx" ON "accounts" USING btree ("issuer","account_id");
