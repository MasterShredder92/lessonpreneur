import {
  blockStatusValues,
  blockTypeValues,
  dayOfWeekValues,
  leadStageValues,
  messageChannelValues,
  messageDirectionValues,
  reportIntervalValues,
  studentStatusValues,
  userRoleValues,
  type BlockStatus,
  type BlockType,
  type DayOfWeek,
  type LeadStage,
  type MessageChannel,
  type MessageDirection,
  type ReportInterval,
  type StudentStatus,
  type UserRole,
} from './enums'

const blockStatusSet = new Set<string>(blockStatusValues)
const blockTypeSet = new Set<string>(blockTypeValues)
const dayOfWeekSet = new Set<string>(dayOfWeekValues)
const leadStageSet = new Set<string>(leadStageValues)
const messageChannelSet = new Set<string>(messageChannelValues)
const messageDirectionSet = new Set<string>(messageDirectionValues)
const reportIntervalSet = new Set<string>(reportIntervalValues)
const studentStatusSet = new Set<string>(studentStatusValues)
const userRoleSet = new Set<string>(userRoleValues)

export function assertBlockStatus(value: string): asserts value is BlockStatus {
  if (!blockStatusSet.has(value)) {
    throw new Error(`Expected BlockStatus, got ${JSON.stringify(value)}`)
  }
}

export function assertBlockType(value: string): asserts value is BlockType {
  if (!blockTypeSet.has(value)) {
    throw new Error(`Expected BlockType, got ${JSON.stringify(value)}`)
  }
}

export function assertDayOfWeek(value: string): asserts value is DayOfWeek {
  if (!dayOfWeekSet.has(value)) {
    throw new Error(`Expected DayOfWeek, got ${JSON.stringify(value)}`)
  }
}

export function assertLeadStage(value: string): asserts value is LeadStage {
  if (!leadStageSet.has(value)) {
    throw new Error(`Expected LeadStage, got ${JSON.stringify(value)}`)
  }
}

export function assertMessageChannel(value: string): asserts value is MessageChannel {
  if (!messageChannelSet.has(value)) {
    throw new Error(`Expected MessageChannel, got ${JSON.stringify(value)}`)
  }
}

export function assertMessageDirection(value: string): asserts value is MessageDirection {
  if (!messageDirectionSet.has(value)) {
    throw new Error(`Expected MessageDirection, got ${JSON.stringify(value)}`)
  }
}

export function assertReportInterval(value: string): asserts value is ReportInterval {
  if (!reportIntervalSet.has(value)) {
    throw new Error(`Expected ReportInterval, got ${JSON.stringify(value)}`)
  }
}

export function assertStudentStatus(value: string): asserts value is StudentStatus {
  if (!studentStatusSet.has(value)) {
    throw new Error(`Expected StudentStatus, got ${JSON.stringify(value)}`)
  }
}

export function assertUserRole(value: string): asserts value is UserRole {
  if (!userRoleSet.has(value)) {
    throw new Error(`Expected UserRole, got ${JSON.stringify(value)}`)
  }
}

export function isBlockStatus(value: string): value is BlockStatus {
  return blockStatusSet.has(value)
}

export function isBlockType(value: string): value is BlockType {
  return blockTypeSet.has(value)
}

export function isDayOfWeek(value: string): value is DayOfWeek {
  return dayOfWeekSet.has(value)
}

export function isLeadStage(value: string): value is LeadStage {
  return leadStageSet.has(value)
}

export function isMessageChannel(value: string): value is MessageChannel {
  return messageChannelSet.has(value)
}

export function isMessageDirection(value: string): value is MessageDirection {
  return messageDirectionSet.has(value)
}

export function isReportInterval(value: string): value is ReportInterval {
  return reportIntervalSet.has(value)
}

export function isStudentStatus(value: string): value is StudentStatus {
  return studentStatusSet.has(value)
}

export function isUserRole(value: string): value is UserRole {
  return userRoleSet.has(value)
}

export function parseBlockStatus(value: string | null | undefined): BlockStatus | null {
  if (value == null || value === '') return null
  return isBlockStatus(value) ? value : null
}

export function parseBlockType(value: string | null | undefined): BlockType | null {
  if (value == null || value === '') return null
  return isBlockType(value) ? value : null
}

export function parseDayOfWeek(value: string | null | undefined): DayOfWeek | null {
  if (value == null || value === '') return null
  return isDayOfWeek(value) ? value : null
}

export function parseLeadStage(value: string | null | undefined): LeadStage | null {
  if (value == null || value === '') return null
  return isLeadStage(value) ? value : null
}

export function parseMessageChannel(value: string | null | undefined): MessageChannel | null {
  if (value == null || value === '') return null
  return isMessageChannel(value) ? value : null
}

export function parseMessageDirection(value: string | null | undefined): MessageDirection | null {
  if (value == null || value === '') return null
  return isMessageDirection(value) ? value : null
}

export function parseReportInterval(value: string | null | undefined): ReportInterval | null {
  if (value == null || value === '') return null
  return isReportInterval(value) ? value : null
}

export function parseStudentStatus(value: string | null | undefined): StudentStatus | null {
  if (value == null || value === '') return null
  return isStudentStatus(value) ? value : null
}

export function parseUserRole(value: string | null | undefined): UserRole | null {
  if (value == null || value === '') return null
  return isUserRole(value) ? value : null
}
