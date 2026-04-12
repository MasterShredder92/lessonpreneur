import { describe, expect, it } from 'vitest'
import { pickMovesForExecute, type ZiroScheduleMovePreflightOk, type ZiroScheduleMoveProposal } from './scheduleMoveSessions'

describe('pickMovesForExecute', () => {
  const proposal: ZiroScheduleMoveProposal = {
    moves: [
      { source_block_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', target_block_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      { source_block_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', target_block_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
    ],
  }

  it('keeps safe moves and ignores blocked', () => {
    const preflight: ZiroScheduleMovePreflightOk = {
      moves: [
        {
          index: 0,
          source_block_id: proposal.moves[0].source_block_id,
          target_block_id: proposal.moves[0].target_block_id,
          classification: 'safe',
          reason_code: null,
          message: null,
        },
        {
          index: 1,
          source_block_id: proposal.moves[1].source_block_id,
          target_block_id: proposal.moves[1].target_block_id,
          classification: 'blocked',
          reason_code: 'teacher_already_booked',
          message: 'Teacher busy',
        },
      ],
      summary: { safe_count: 1, blocked_count: 1, override_required_count: 0 },
    }
    const out = pickMovesForExecute(proposal, preflight, false)
    expect(out.moves).toHaveLength(1)
    expect(out.moves[0]).toEqual(proposal.moves[0])
    expect(out.override_ack.cross_teacher).toEqual([])
  })

  it('includes cross-teacher override when acked', () => {
    const preflight: ZiroScheduleMovePreflightOk = {
      moves: [
        {
          index: 0,
          source_block_id: proposal.moves[0].source_block_id,
          target_block_id: proposal.moves[0].target_block_id,
          classification: 'override_required',
          reason_code: 'cross_teacher',
          message: 'Confirm',
          flags: { cross_teacher: true },
        },
      ],
      summary: { safe_count: 0, blocked_count: 0, override_required_count: 1 },
    }
    const noAck = pickMovesForExecute({ moves: [proposal.moves[0]] }, preflight, false)
    expect(noAck.moves).toHaveLength(0)

    const withAck = pickMovesForExecute({ moves: [proposal.moves[0]] }, preflight, true)
    expect(withAck.moves).toHaveLength(1)
    expect(withAck.override_ack.cross_teacher).toEqual([0])
  })
})
