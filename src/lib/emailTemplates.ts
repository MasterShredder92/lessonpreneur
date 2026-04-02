/**
 * Email HTML templates for Lessonpreneur.
 * All templates are mobile-responsive, studio-branded, and clean.
 * Brand data (color, logo, studio name) is passed in per-render.
 */

export interface EmailBrand {
  studioName: string
  primaryColor: string
  logoUrl: string | null
  websiteDomain: string
  appUrl: string  // e.g. https://app.lessonpreneur.io
}

const DEFAULT_BRAND: EmailBrand = {
  studioName: 'Adkins Music Lessons',
  primaryColor: '#D4226A',
  logoUrl: null,
  websiteDomain: 'lessonpreneur.io',
  appUrl: 'https://app.lessonpreneur.io',
}

function layout(brand: EmailBrand, content: string, unsubscribeUrl?: string): string {
  const b = { ...DEFAULT_BRAND, ...brand }
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${b.studioName}</title>
</head>
<body style="margin:0;padding:0;background:#08080c;color:#E0E0F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#08080c;padding:20px 0;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;margin:0 auto;background:#101018;border-radius:16px;border:1px solid #1a1a28;overflow:hidden;">
        <!-- Header -->
        <tr><td style="padding:24px 28px 16px;border-bottom:1px solid #1a1a28;text-align:center;">
          ${b.logoUrl ? `<img src="${b.logoUrl}" alt="${b.studioName}" style="height:40px;margin-bottom:8px;" />` : ''}
          <div style="font-size:14px;font-weight:700;color:${b.primaryColor};letter-spacing:0.02em;">${b.studioName}</div>
        </td></tr>
        <!-- Content -->
        <tr><td style="padding:28px;">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 28px 24px;border-top:1px solid #1a1a28;text-align:center;">
          <a href="${b.appUrl}/parent" style="display:inline-block;padding:12px 28px;border-radius:8px;background:${b.primaryColor};color:#fff;text-decoration:none;font-weight:700;font-size:14px;">View in App &rarr;</a>
          <div style="margin-top:16px;font-size:11px;color:#606088;">
            ${b.studioName} &middot; ${b.websiteDomain}
            ${unsubscribeUrl ? `<br><a href="${unsubscribeUrl}" style="color:#606088;text-decoration:underline;">Unsubscribe</a>` : ''}
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ─── Template: Progress Update ───────────────────────

export function progressUpdateEmail(brand: EmailBrand, data: {
  studentName: string
  instrument: string
  teacherName: string
  body: string
  workedOn: string[]
  progressIndicator: string | null
}): { subject: string; html: string } {
  const progressColors: Record<string, string> = { crushing_it: '#22C55E', on_track: '#FFB800', struggling: '#fb923c' }
  const progressLabels: Record<string, string> = { crushing_it: 'Crushing It!', on_track: 'On Track', struggling: 'Working Through It' }
  const color = progressColors[data.progressIndicator ?? ''] ?? '#FFB800'
  const label = progressLabels[data.progressIndicator ?? ''] ?? ''

  const tags = data.workedOn.slice(0, 4).map(t =>
    `<span style="display:inline-block;padding:3px 10px;border-radius:12px;background:${brand.primaryColor}18;color:${brand.primaryColor};font-size:12px;font-weight:600;margin:2px;">${t}</span>`
  ).join(' ')

  const content = `
    <div style="margin-bottom:16px;">
      <div style="font-size:20px;font-weight:800;color:#E0E0F4;margin-bottom:4px;">${data.studentName}'s Session Update</div>
      <div style="font-size:13px;color:#8080A8;">${data.instrument} with ${data.teacherName}</div>
    </div>
    ${label ? `<div style="margin-bottom:14px;"><span style="display:inline-block;padding:4px 12px;border-radius:8px;background:${color}18;color:${color};font-size:12px;font-weight:700;">${label}</span></div>` : ''}
    ${tags ? `<div style="margin-bottom:14px;">${tags}</div>` : ''}
    <div style="font-size:15px;color:#C0C0E0;line-height:1.7;">${data.body}</div>
  `

  return {
    subject: `${data.studentName}'s ${data.instrument} session update`,
    html: layout(brand, content),
  }
}

// ─── Template: Semester Summary (Wave 1) ─────────────

export function semesterSummaryEmail(brand: EmailBrand, data: {
  studentName: string
  instrument: string
  body: string
  sessionCount: number
  skillCount: number
}): { subject: string; html: string } {
  const content = `
    <div style="margin-bottom:16px;">
      <div style="font-size:22px;font-weight:800;color:#FFB800;margin-bottom:4px;">Semester Progress Report</div>
      <div style="font-size:14px;color:#E0E0F4;font-weight:600;">${data.studentName} — ${data.instrument}</div>
    </div>
    <div style="display:flex;gap:16px;margin-bottom:16px;">
      <div style="text-align:center;padding:12px 16px;border-radius:10px;background:rgba(255,184,0,0.08);border:1px solid rgba(255,184,0,0.15);flex:1;">
        <div style="font-size:28px;font-weight:800;color:#FFB800;">${data.sessionCount}</div>
        <div style="font-size:11px;color:#8080A8;">sessions</div>
      </div>
      <div style="text-align:center;padding:12px 16px;border-radius:10px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.15);flex:1;">
        <div style="font-size:28px;font-weight:800;color:#22C55E;">${data.skillCount}</div>
        <div style="font-size:11px;color:#8080A8;">skills developed</div>
      </div>
    </div>
    <div style="font-size:15px;color:#C0C0E0;line-height:1.7;">${data.body}</div>
  `
  return {
    subject: `${data.studentName}'s Semester Progress`,
    html: layout(brand, content),
  }
}

// ─── Template: Campaign (generic — summer bridge, win-back) ─

export function campaignEmail(brand: EmailBrand, data: {
  subject: string
  heading: string
  body: string
  studentName?: string
}): { subject: string; html: string } {
  const content = `
    <div style="margin-bottom:16px;">
      <div style="font-size:20px;font-weight:800;color:#E0E0F4;">${data.heading}</div>
      ${data.studentName ? `<div style="font-size:13px;color:#8080A8;margin-top:4px;">For ${data.studentName}'s family</div>` : ''}
    </div>
    <div style="font-size:15px;color:#C0C0E0;line-height:1.7;">${data.body}</div>
  `
  return {
    subject: data.subject,
    html: layout(brand, content),
  }
}

// ─── Template: Auto-Pay Nudge ────────────────────────

export function autoPayNudgeEmail(brand: EmailBrand, data: {
  familyName: string
  body: string
  waveNumber: number
}): { subject: string; html: string } {
  const subjects: Record<number, string> = { 1: 'Set up auto-pay in 30 seconds', 2: 'Reminder: auto-pay saves you time', 3: 'Final reminder: set up auto-pay' }
  const content = `
    <div style="margin-bottom:16px;">
      <div style="font-size:20px;font-weight:800;color:#E0E0F4;">A Quick Note About Payments</div>
    </div>
    <div style="font-size:15px;color:#C0C0E0;line-height:1.7;">${data.body}</div>
  `
  return {
    subject: subjects[data.waveNumber] ?? 'Payment reminder',
    html: layout(brand, content),
  }
}

// ─── Template: Welcome ───────────────────────────────

export function welcomeEmail(brand: EmailBrand, data: {
  parentName: string
  studentName: string
  instrument: string
  teacherName: string
  locationName: string
}): { subject: string; html: string } {
  const content = `
    <div style="margin-bottom:16px;">
      <div style="font-size:22px;font-weight:800;color:${brand.primaryColor};">Welcome to ${brand.studioName}!</div>
    </div>
    <div style="font-size:15px;color:#C0C0E0;line-height:1.7;">
      Hi ${data.parentName},<br><br>
      We're so excited to have ${data.studentName} join us for ${data.instrument} sessions at our ${data.locationName} studio!
      ${data.teacherName ? `${data.studentName} will be studying with ${data.teacherName} — they're going to love it.` : ''}
      <br><br>
      You can check ${data.studentName}'s progress, upcoming sessions, and messages from their teacher right from your parent dashboard.
      We'll send you updates after each session so you always know how things are going.
      <br><br>
      Welcome to the family!
    </div>
  `
  return {
    subject: `Welcome to ${brand.studioName}, ${data.studentName}!`,
    html: layout(brand, content),
  }
}

// ─── Template: Session Reminder ──────────────────────

export function sessionReminderEmail(brand: EmailBrand, data: {
  studentName: string
  instrument: string
  teacherName: string
  date: string
  time: string
  locationName: string
  address: string
}): { subject: string; html: string } {
  const content = `
    <div style="margin-bottom:16px;">
      <div style="font-size:20px;font-weight:800;color:#E0E0F4;">Session Reminder</div>
    </div>
    <div style="padding:16px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);margin-bottom:16px;">
      <div style="font-size:16px;font-weight:700;color:#E0E0F4;margin-bottom:8px;">${data.studentName}'s ${data.instrument} Session</div>
      <div style="font-size:14px;color:#A0A0C8;line-height:1.6;">
        <strong>When:</strong> ${data.date} at ${data.time}<br>
        <strong>Teacher:</strong> ${data.teacherName}<br>
        <strong>Where:</strong> ${data.locationName}<br>
        <span style="font-size:12px;color:#8080A8;">${data.address}</span>
      </div>
    </div>
    <div style="font-size:13px;color:#8080A8;">See you there!</div>
  `
  return {
    subject: `Reminder: ${data.studentName}'s session tomorrow at ${data.time}`,
    html: layout(brand, content),
  }
}
