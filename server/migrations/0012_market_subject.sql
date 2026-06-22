ALTER TABLE stocks
  ADD COLUMN IF NOT EXISTS subject_type varchar(10) NOT NULL DEFAULT 'stock';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stocks_subject_type_check'
  ) THEN
    ALTER TABLE stocks
      ADD CONSTRAINT stocks_subject_type_check
      CHECK (subject_type IN ('stock', 'market'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS stocks_subject_type_idx
  ON stocks(subject_type);
