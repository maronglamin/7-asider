-- Drop prior unique index/constraint on email if exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'User_email_key') THEN
    DROP INDEX "User_email_key";
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- no-op
    NULL;
END $$;

-- Ensure a partial unique index that only applies to non-TERMINATED users
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_active_unique"
ON "User" ("email")
WHERE "status" <> 'TERMINATED';


