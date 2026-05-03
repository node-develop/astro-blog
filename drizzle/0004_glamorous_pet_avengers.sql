CREATE TABLE "course_progress" (
	"user_id" uuid NOT NULL,
	"course_slug" text NOT NULL,
	"lesson_slug" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	CONSTRAINT "course_progress_user_id_course_slug_lesson_slug_pk" PRIMARY KEY("user_id","course_slug","lesson_slug")
);
--> statement-breakpoint
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_progress_user_course_idx" ON "course_progress" USING btree ("user_id","course_slug");--> statement-breakpoint
CREATE INDEX "course_progress_course_idx" ON "course_progress" USING btree ("course_slug");