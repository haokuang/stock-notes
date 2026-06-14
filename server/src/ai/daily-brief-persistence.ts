import type { PoolClient } from 'pg'

export interface StockBriefRow {
  id: string
  user_id: string
  stock_id: string
  trade_date: string
  signal: 'green' | 'yellow' | 'red'
  technical_analysis: string
  logic_judgment: string
  action: 'hold' | 'review' | 'sell'
  sell_reasons: string[]
  evidence_note_ids: string[]
  price_at_brief: string | null
  stop_loss_triggered: boolean | string
  created_at: string
  updated_at: string
}

export interface DailyBriefPersistenceInput {
  userId: string
  stockId: string
  stockCode: string
  stockName: string
  tradeDate: string
  signal: StockBriefRow['signal']
  content: string
  contentHtml: string
  priceAtBrief: string | null
  stopLossTriggered: boolean
}

export async function persistDailyBriefArtifacts(
  client: PoolClient,
  input: DailyBriefPersistenceInput,
): Promise<{ brief: StockBriefRow; noteId: string }> {
  const action = input.signal === 'red' ? 'sell' : input.signal === 'yellow' ? 'review' : 'hold'
  const direction = input.signal === 'green' ? 'bull' : input.signal === 'red' ? 'bear' : 'neutral'
  const noteTitle = `每日简评·${input.stockName}(${input.stockCode}) ${input.tradeDate}`
  const sourceRef = `${input.stockId}:${input.tradeDate}`

  await client.query('BEGIN')
  try {
    const briefResult = await client.query<StockBriefRow>(
      `INSERT INTO stock_briefs
        (user_id, stock_id, trade_date, signal, technical_analysis, logic_judgment, action,
         sell_reasons, evidence_note_ids, price_at_brief, stop_loss_triggered)
       VALUES ($1, $2, $3, $4, $5, '', $6, '[]'::jsonb, '{}'::uuid[], $7, $8)
       ON CONFLICT (user_id, stock_id, trade_date)
       DO UPDATE SET
         signal = EXCLUDED.signal,
         technical_analysis = EXCLUDED.technical_analysis,
         logic_judgment = EXCLUDED.logic_judgment,
         action = EXCLUDED.action,
         sell_reasons = EXCLUDED.sell_reasons,
         evidence_note_ids = EXCLUDED.evidence_note_ids,
         price_at_brief = EXCLUDED.price_at_brief,
         stop_loss_triggered = EXCLUDED.stop_loss_triggered,
         updated_at = NOW()
       RETURNING id, user_id, stock_id, trade_date, signal, technical_analysis,
         logic_judgment, action, sell_reasons, evidence_note_ids, price_at_brief,
         stop_loss_triggered, created_at, updated_at`,
      [
        input.userId,
        input.stockId,
        input.tradeDate,
        input.signal,
        input.content,
        action,
        input.priceAtBrief,
        input.stopLossTriggered,
      ],
    )

    const noteResult = await client.query<{ id: string }>(
      `INSERT INTO notes
        (user_id, stock_id, stock_code, stock_name, type, title, content, doc_md, direction,
         entry_price, target_price, stop_loss, tags, event, source, source_ref, images, ai_summary)
       VALUES ($1, $2, $3, $4, 'doc', $5, $6, $7, $8,
         NULL, NULL, NULL, ARRAY['daily-brief', 'auto']::text[], NULL,
         'auto-brief', $9, '[]'::jsonb, NULL)
       ON CONFLICT (user_id, source, source_ref)
       DO UPDATE SET
         stock_id = EXCLUDED.stock_id,
         stock_code = EXCLUDED.stock_code,
         stock_name = EXCLUDED.stock_name,
         type = EXCLUDED.type,
         title = EXCLUDED.title,
         content = EXCLUDED.content,
         doc_md = EXCLUDED.doc_md,
         direction = EXCLUDED.direction,
         tags = EXCLUDED.tags,
         updated_at = NOW()
       RETURNING id`,
      [
        input.userId,
        input.stockId,
        input.stockCode,
        input.stockName,
        noteTitle,
        input.contentHtml,
        input.content,
        direction,
        sourceRef,
      ],
    )

    await client.query('COMMIT')
    return {
      brief: briefResult.rows[0],
      noteId: noteResult.rows[0].id,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}
