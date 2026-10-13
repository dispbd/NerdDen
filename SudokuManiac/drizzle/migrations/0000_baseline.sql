CREATE TABLE "achievements" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"icon" text DEFAULT '🏆' NOT NULL,
	"xp_reward" integer DEFAULT 0 NOT NULL,
	"condition" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alias_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"host_id" text,
	"status" text DEFAULT 'lobby' NOT NULL,
	"topic" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"difficulty" text DEFAULT 'medium' NOT NULL,
	"turn_duration" integer DEFAULT 60 NOT NULL,
	"word_count" integer DEFAULT 30 NOT NULL,
	"game_state" jsonb,
	"turn_ends_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "alias_rooms_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "alias_team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"user_id" text,
	"user_name" text NOT NULL,
	"token" text,
	"speaker_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alias_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text,
	"kind" text DEFAULT 'challenge' NOT NULL,
	"game_type" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"ref_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitive_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"host_id" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"difficulty" text NOT NULL,
	"grid_size" integer DEFAULT 9 NOT NULL,
	"puzzle" jsonb,
	"solution" jsonb,
	"max_players" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	CONSTRAINT "competitive_rooms_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "crossword_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"crossword_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"player_grid" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"time_spent" integer DEFAULT 0 NOT NULL,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "crosswords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"topic" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"difficulty" text DEFAULT 'medium' NOT NULL,
	"width" integer DEFAULT 15 NOT NULL,
	"height" integer DEFAULT 15 NOT NULL,
	"grid" jsonb NOT NULL,
	"clues" jsonb NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" text NOT NULL,
	"game_type" text DEFAULT 'sudoku' NOT NULL,
	"difficulty" text NOT NULL,
	"puzzle" jsonb NOT NULL,
	"solution" jsonb NOT NULL,
	CONSTRAINT "daily_tasks_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"game_type" text NOT NULL,
	"difficulty" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"time_spent" integer DEFAULT 0 NOT NULL,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"grid_state" jsonb NOT NULL,
	"puzzle" jsonb,
	"solution" jsonb NOT NULL,
	"grid_size" integer DEFAULT 9 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "nonogram_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"nonogram_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"player_grid" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mistakes" integer DEFAULT 0 NOT NULL,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"time_spent" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "nonograms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"size" integer NOT NULL,
	"difficulty" text NOT NULL,
	"grid" jsonb NOT NULL,
	"row_clues" jsonb NOT NULL,
	"col_clues" jsonb NOT NULL,
	"reveals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL,
	"color" text DEFAULT '#3E5C76' NOT NULL,
	"solver_stats" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"grid_state" jsonb,
	"time_spent" integer,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"finish_position" integer,
	"elo_delta" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"abandoned_at" timestamp,
	CONSTRAINT "room_participants_unique" UNIQUE("room_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "story_chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"order_index" integer NOT NULL,
	"required_completed_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "story_chapters_order_index_unique" UNIQUE("order_index")
);
--> statement-breakpoint
CREATE TABLE "story_puzzles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"difficulty" text NOT NULL,
	"grid_size" integer DEFAULT 9 NOT NULL,
	"puzzle" jsonb NOT NULL,
	"solution" jsonb NOT NULL,
	CONSTRAINT "story_puzzles_chapter_order" UNIQUE("chapter_id","order_index")
);
--> statement-breakpoint
CREATE TABLE "trivia_parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"set_id" uuid NOT NULL,
	"status" text DEFAULT 'lobby' NOT NULL,
	"current_index" integer DEFAULT 0 NOT NULL,
	"question_started_at" timestamp,
	"question_count" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trivia_parties_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "trivia_party_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"token" text NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"is_host" boolean DEFAULT false NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"last_answered_index" integer DEFAULT -1 NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trivia_party_players_token" UNIQUE("party_id","token")
);
--> statement-breakpoint
CREATE TABLE "trivia_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_index" integer NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	CONSTRAINT "trivia_questions_set_order" UNIQUE("set_id","order_index")
);
--> statement-breakpoint
CREATE TABLE "trivia_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"set_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"current_index" integer DEFAULT 0 NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"time_spent" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "trivia_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"topic" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"difficulty" text DEFAULT 'medium' NOT NULL,
	"question_count" integer DEFAULT 10 NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"earned_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_achievements_unique" UNIQUE("user_id","achievement_id")
);
--> statement-breakpoint
CREATE TABLE "user_daily_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"daily_task_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"time_spent" integer DEFAULT 0 NOT NULL,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_daily_tasks_unique" UNIQUE("user_id","daily_task_id")
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"user_id" text PRIMARY KEY NOT NULL,
	"sudoku_played" integer DEFAULT 0 NOT NULL,
	"sudoku_solved" integer DEFAULT 0 NOT NULL,
	"sudoku_best_time_seconds" integer,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"hints_available" integer DEFAULT 3 NOT NULL,
	"streak_days" integer DEFAULT 0 NOT NULL,
	"last_played_at" timestamp,
	"elo_rating" integer DEFAULT 1200 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_story_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"puzzle_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"time_spent" integer DEFAULT 0 NOT NULL,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_story_progress_unique" UNIQUE("user_id","puzzle_id")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alias_rooms" ADD CONSTRAINT "alias_rooms_host_id_user_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alias_team_members" ADD CONSTRAINT "alias_team_members_team_id_alias_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."alias_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alias_team_members" ADD CONSTRAINT "alias_team_members_room_id_alias_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."alias_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alias_team_members" ADD CONSTRAINT "alias_team_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alias_teams" ADD CONSTRAINT "alias_teams_room_id_alias_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."alias_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitive_rooms" ADD CONSTRAINT "competitive_rooms_host_id_user_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crossword_sessions" ADD CONSTRAINT "crossword_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crossword_sessions" ADD CONSTRAINT "crossword_sessions_crossword_id_crosswords_id_fk" FOREIGN KEY ("crossword_id") REFERENCES "public"."crosswords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonogram_sessions" ADD CONSTRAINT "nonogram_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonogram_sessions" ADD CONSTRAINT "nonogram_sessions_nonogram_id_nonograms_id_fk" FOREIGN KEY ("nonogram_id") REFERENCES "public"."nonograms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_room_id_competitive_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."competitive_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_puzzles" ADD CONSTRAINT "story_puzzles_chapter_id_story_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."story_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trivia_parties" ADD CONSTRAINT "trivia_parties_set_id_trivia_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."trivia_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trivia_party_players" ADD CONSTRAINT "trivia_party_players_party_id_trivia_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."trivia_parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trivia_party_players" ADD CONSTRAINT "trivia_party_players_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trivia_questions" ADD CONSTRAINT "trivia_questions_set_id_trivia_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."trivia_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trivia_sessions" ADD CONSTRAINT "trivia_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trivia_sessions" ADD CONSTRAINT "trivia_sessions_set_id_trivia_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."trivia_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_tasks" ADD CONSTRAINT "user_daily_tasks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_tasks" ADD CONSTRAINT "user_daily_tasks_daily_task_id_daily_tasks_id_fk" FOREIGN KEY ("daily_task_id") REFERENCES "public"."daily_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_story_progress" ADD CONSTRAINT "user_story_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_story_progress" ADD CONSTRAINT "user_story_progress_puzzle_id_story_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "public"."story_puzzles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alias_team_members_roomId_idx" ON "alias_team_members" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "alias_team_members_teamId_idx" ON "alias_team_members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "alias_teams_roomId_idx" ON "alias_teams" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "challenges_toUserId_idx" ON "challenges" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX "challenges_fromUserId_idx" ON "challenges" USING btree ("from_user_id");--> statement-breakpoint
CREATE INDEX "crossword_sessions_userId_idx" ON "crossword_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crossword_sessions_crosswordId_idx" ON "crossword_sessions" USING btree ("crossword_id");--> statement-breakpoint
CREATE INDEX "game_sessions_userId_idx" ON "game_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "game_sessions_status_idx" ON "game_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "nonogram_sessions_userId_idx" ON "nonogram_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "nonogram_sessions_nonogramId_idx" ON "nonogram_sessions" USING btree ("nonogram_id");--> statement-breakpoint
CREATE INDEX "nonograms_size_idx" ON "nonograms" USING btree ("size");--> statement-breakpoint
CREATE INDEX "room_participants_roomId_idx" ON "room_participants" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "room_participants_userId_idx" ON "room_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trivia_party_players_partyId_idx" ON "trivia_party_players" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "trivia_sessions_userId_idx" ON "trivia_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trivia_sessions_setId_idx" ON "trivia_sessions" USING btree ("set_id");--> statement-breakpoint
CREATE INDEX "user_achievements_userId_idx" ON "user_achievements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_daily_tasks_userId_idx" ON "user_daily_tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_story_progress_userId_idx" ON "user_story_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");