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
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`command` text NOT NULL,
	`cli_version` text,
	`timeout_seconds` integer DEFAULT 1800,
	`max_turns` integer,
	`supports_streaming` integer DEFAULT true,
	`default_provider` text,
	`default_model` text,
	`enabled` integer DEFAULT true,
	`status` text DEFAULT 'unknown',
	`has_headless` integer DEFAULT true,
	`has_json_output` integer DEFAULT false,
	`has_model_list_cmd` integer DEFAULT false,
	`has_mcp` integer DEFAULT false,
	`has_acp` integer DEFAULT false,
	`model_list_cmd` text,
	`cli_detected_at` text,
	`notes` text,
	`config` text,
	`created_at` text NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `config_history` (
	`id` text PRIMARY KEY NOT NULL,
	`config_key` text NOT NULL,
	`field` text,
	`old_value` text,
	`new_value` text,
	`changed_at` text NOT NULL,
	`changed_by` text DEFAULT 'api'
);
--> statement-breakpoint
CREATE TABLE `config_overrides` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text DEFAULT 'api'
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`host` text NOT NULL,
	`port` integer,
	`protocol` text DEFAULT 'http',
	`status` text DEFAULT 'unknown',
	`last_seen` text,
	`last_error` text,
	`response_time_ms` integer,
	`config` text,
	`description` text,
	`created_at` text NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_name_unique` ON `devices` (`name`);--> statement-breakpoint
CREATE TABLE `fruiting_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`repo_path` text NOT NULL,
	`agent` text,
	`model` text,
	`context_trace` text,
	`full_prompt` text,
	`session_log` text,
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
CREATE TABLE `models` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`short_name` text,
	`context_window` integer,
	`cost_input` real,
	`cost_output` real,
	`strengths` text,
	`thinking` integer DEFAULT false,
	`vision` integer DEFAULT false,
	`free` integer DEFAULT false,
	`compatible_agents` text,
	`fallback_model_id` text,
	`available` integer DEFAULT true,
	`last_used_at` text,
	`source` text DEFAULT 'seed',
	`created_at` text NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `prompt_overrides` (
	`prompt_id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`api_base` text,
	`billing` text DEFAULT 'subscription' NOT NULL,
	`auth_type` text,
	`auth_key_env` text,
	`status` text DEFAULT 'unknown',
	`last_checked_at` text,
	`last_error` text,
	`rate_limit_info` text,
	`credits_info` text,
	`models_fetched_at` text,
	`config` text,
	`created_at` text NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `repos` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`language` text,
	`mode` text DEFAULT 'align' NOT NULL,
	`weight` integer DEFAULT 50,
	`skills` text DEFAULT '[]',
	`github_owner` text,
	`github_repo` text,
	`github_default_branch` text,
	`is_public` integer,
	`created_at` text NOT NULL,
	`last_scanned_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repos_path_unique` ON `repos` (`path`);--> statement-breakpoint
CREATE TABLE `scheduler_stats` (
	`cycle_name` text PRIMARY KEY NOT NULL,
	`runs_completed` integer DEFAULT 0,
	`errors` integer DEFAULT 0,
	`last_run_at` text,
	`last_duration_ms` integer,
	`last_error` text,
	`updated_at` text
);
--> statement-breakpoint
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
	`provider` text,
	`repo_path` text NOT NULL,
	`prompt` text,
	`depends_on` text DEFAULT '[]',
	`sequenced` integer DEFAULT true,
	`branch_name` text,
	`github_url` text,
	`github_pr_number` integer,
	`github_pr_url` text,
	`spec_context` text,
	`retry_context` text,
	`user_input` text,
	`enrich_with_opus` integer DEFAULT false,
	`timeout_seconds` integer,
	`result` text,
	`parsed_result` text,
	`error` text,
	`error_details` text,
	`cost_usd` real DEFAULT 0,
	`duration_seconds` real,
	`input_tokens` integer,
	`output_tokens` integer,
	`created_at` text NOT NULL,
	`started_at` text,
	`completed_at` text,
	`worktree_path` text,
	`skills` text DEFAULT '[]',
	`shepherd_evaluated_at` text,
	`armory_reviewed_at` text
);
