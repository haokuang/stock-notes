-- Allow ai_reports.type to record Agent-saved reports.
-- Existing rows remain; the Agent report path uses type='agent_report'.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_reports_type_check_v2'
  ) THEN
    ALTER TABLE ai_reports
      ADD CONSTRAINT ai_reports_type_check_v2
      CHECK (type IN ('image_understand', 'cross_view', 'agent_report'));
  END IF;
END $$;