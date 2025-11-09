-- Safely adjust FK only if the table and constraint exist (no-op otherwise)
DO $$
BEGIN
  -- Ensure table exists before attempting any changes
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'FieldKycImage'
  ) THEN
    -- Drop existing FK constraint if present
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      WHERE tc.constraint_schema = 'public'
        AND tc.table_name = 'FieldKycImage'
        AND tc.constraint_name = 'FieldKycImage_fieldKycId_fkey'
    ) THEN
      EXECUTE 'ALTER TABLE "public"."FieldKycImage" DROP CONSTRAINT "FieldKycImage_fieldKycId_fkey"';
    END IF;

    -- Re-create FK constraint if not present (uses RESTRICT semantics)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      WHERE tc.constraint_schema = 'public'
        AND tc.table_name = 'FieldKycImage'
        AND tc.constraint_name = 'FieldKycImage_fieldKycId_fkey'
    ) THEN
      EXECUTE 'ALTER TABLE "public"."FieldKycImage" ADD CONSTRAINT "FieldKycImage_fieldKycId_fkey" FOREIGN KEY ("fieldKycId") REFERENCES "FieldKyc"("id") ON DELETE RESTRICT ON UPDATE CASCADE';
    END IF;
  END IF;
END
$$;
