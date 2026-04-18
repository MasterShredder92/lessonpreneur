/**
 * Postgres enums reconstructed from db/schema/schema.sql (column types + ::enum casts).
 * AUTO-GENERATED — do not edit by hand.
 */

export const BlockStatusEnum = {
  available: "available" as const,
} as const;
export type BlockStatusEnum = (typeof BlockStatusEnum)[keyof typeof BlockStatusEnum];

export const BlockTypeEnum = {
  open_time: "open_time" as const,
} as const;
export type BlockTypeEnum = (typeof BlockTypeEnum)[keyof typeof BlockTypeEnum];

export type DayOfWeekEnum = string;

export const LeadStageEnum = {
  inquiry: "inquiry" as const,
} as const;
export type LeadStageEnum = (typeof LeadStageEnum)[keyof typeof LeadStageEnum];

export const MessageChannelEnum = {
  sms: "sms" as const,
} as const;
export type MessageChannelEnum = (typeof MessageChannelEnum)[keyof typeof MessageChannelEnum];

export type MessageDirectionEnum = string;

export type ReportIntervalEnum = string;

export const StudentStatusEnum = {
  active: "active" as const,
} as const;
export type StudentStatusEnum = (typeof StudentStatusEnum)[keyof typeof StudentStatusEnum];

export type UserRoleEnum = string;
