-- Drop unique index on FieldKyc.userId to allow multiple fields per user
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'FieldKyc_userId_key'
  ) THEN
    EXECUTE 'DROP INDEX "FieldKyc_userId_key"';
  END IF;
END $$;


