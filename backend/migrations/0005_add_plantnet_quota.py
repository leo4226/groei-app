\"\"\"Add plantnet_quota table for per-account daily rate limiting.\"\"\"

from yoyo import step

step("""
    CREATE TABLE plantnet_quota (
        account_id  INTEGER NOT NULL REFERENCES accounts(id),
        date        TEXT NOT NULL,
        count       INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (account_id, date)
    );
""")
