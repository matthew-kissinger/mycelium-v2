CREATE TABLE `agent_stats` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`total_tasks` integer DEFAULT 0,
	`successful` integer DEFAULT 0,
	`failed` integer DEFAULT 0,
	`success_rate` real DEFAULT 0,
	`total_cost` real DEFAULT 0,
	`best_for` text,
	`avoid_for` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `fruiting_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`repo_path` text NOT NULL,
	`agent` text,
	`model` text,
	`context_trace` text,
	`full_prompt` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memory_patterns` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`source` text NOT NULL,
	`task_id` text,
	`repo_path` text,
	`tags` text DEFAULT '[]',
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memory_warnings` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`severity` text DEFAULT 'medium' NOT NULL,
	`task_id` text,
	`repo_path` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `repos` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`language` text,
	`mode` text DEFAULT 'align' NOT NULL,
	`created_at` text NOT NULL,
	`last_scanned_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repos_path_unique` ON `repos` (`path`);--> statement-breakpoint
CREATE TABLE `shepherd_evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`repo_path` text NOT NULL,
	`evaluated_at` text NOT NULL,
	`tasks_evaluated` text NOT NULL,
	`health` text NOT NULL,
	`headline` text NOT NULL,
	`concerns` text,
	`wins` text,
	`recommendation` text,
	`global_patterns` text,
	`global_warnings` text,
	`branch_evaluations` text,
	`raw_response` text
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` text PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`options` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`response` text,
	`task_id` text,
	`repo_path` text,
	`telegram_message_id` integer,
	`created_at` text NOT NULL,
	`responded_at` text
);
--> statement-breakpoint
CREATE TABLE `system_agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_type` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`repo_path` text,
	`context` text,
	`output` text,
	`error` text,
	`started_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`agent` text,
	`model` text,
	`repo_path` text NOT NULL,
	`prompt` text,
	`depends_on` text DEFAULT '[]',
	`sequenced` integer DEFAULT false,
	`branch_name` text,
	`github_url` text,
	`spec_context` text,
	`retry_context` text,
	`user_input` text,
	`enrich_with_opus` integer DEFAULT false,
	`result` text,
	`parsed_result` text,
	`error` text,
	`error_details` text,
	`cost_usd` real DEFAULT 0,
	`duration_seconds` real,
	`created_at` text NOT NULL,
	`started_at` text,
	`completed_at` text,
	`shepherd_evaluated_at` text,
	`armory_reviewed_at` text
);
