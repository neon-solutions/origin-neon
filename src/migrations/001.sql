CREATE TABLE IF NOT EXISTS schema_migrations (
	id text PRIMARY KEY,
	applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_states (
	state text PRIMARY KEY,
	code_verifier text NOT NULL,
	installation_id text,
	created_at timestamptz NOT NULL DEFAULT now(),
	used_at timestamptz
);

CREATE TABLE IF NOT EXISTS installations (
	installation_id text PRIMARY KEY,
	namespace_id text,
	refresh_token_ciphertext text,
	created_at timestamptz NOT NULL DEFAULT now(),
	revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS repository_bindings (
	installation_id text NOT NULL REFERENCES installations (installation_id) ON DELETE CASCADE,
	repository_id text NOT NULL,
	owner_slug text NOT NULL,
	repo_name text NOT NULL,
	neon_project_id text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (installation_id, repository_id)
);

CREATE TABLE IF NOT EXISTS pull_branches (
	repository_id text NOT NULL,
	pull_number text NOT NULL,
	installation_id text NOT NULL,
	neon_project_id text NOT NULL,
	neon_branch_id text NOT NULL,
	neon_branch_name text NOT NULL,
	parent_pull_number text,
	origin_comment_id text,
	closed_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (repository_id, pull_number)
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
	webhook_id text PRIMARY KEY,
	event_type text NOT NULL,
	received_at timestamptz NOT NULL DEFAULT now(),
	processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS pull_branches_parent_idx
	ON pull_branches (repository_id, parent_pull_number);
