CREATE TABLE "media_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"uploaded_by_id" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "post_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"frontmatter" jsonb NOT NULL,
	"body" text NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts_meta" (
	"slug" text PRIMARY KEY NOT NULL,
	"order" integer NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"hidden_from_list" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "posts" CASCADE;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_uploaded_at_idx" ON "media_assets" USING btree ("uploaded_at");--> statement-breakpoint
CREATE INDEX "post_revisions_slug_created_idx" ON "post_revisions" USING btree ("slug","created_at");--> statement-breakpoint
CREATE INDEX "posts_meta_order_idx" ON "posts_meta" USING btree ("order");--> statement-breakpoint
CREATE INDEX "posts_meta_pinned_idx" ON "posts_meta" USING btree ("pinned");