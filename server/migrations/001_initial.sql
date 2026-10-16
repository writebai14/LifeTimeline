CREATE TABLE users (
 id uuid PRIMARY KEY, username text UNIQUE NOT NULL, password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('admin','user')), active boolean NOT NULL DEFAULT true,
 must_change_password boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf text NOT NULL, expires_at timestamptz NOT NULL, last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE days (
 user_id uuid NOT NULL REFERENCES users(id), date text NOT NULL, body jsonb NOT NULL,
 revision integer NOT NULL CHECK(revision > 0), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,date)
);
CREATE TABLE day_history (
 user_id uuid NOT NULL REFERENCES users(id), date text NOT NULL, revision integer NOT NULL,
 body jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,date,revision)
);
CREATE TABLE import_batches (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), started boolean NOT NULL DEFAULT false,
 selected jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX batches_user ON import_batches(user_id);
CREATE TABLE import_items (
 batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE, item_index integer NOT NULL,
 name text NOT NULL, date text, body jsonb, expected_revision integer NOT NULL DEFAULT 0,
 error text, status text NOT NULL DEFAULT 'pending', PRIMARY KEY(batch_id,item_index)
);
