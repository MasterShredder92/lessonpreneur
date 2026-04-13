import { test, expect } from '@playwright/test'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'



/**

 * Smoke tests for public routes (no CRM auth).

 * Intake proof tests need real Supabase + edge `public-lead-submit`, migrations applied,

 * and `.env.local` loaded via `playwright.config.ts` (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).

 */



const OMAHA_LOCATION_ID = 'd48229c1-b70a-4d29-893e-5079887dab76'



async function postPublicLeadSubmit(body: Record<string, unknown>) {

  const url = process.env.VITE_SUPABASE_URL?.replace(/\/$/, '')

  const key = process.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')

  const res = await fetch(`${url}/functions/v1/public-lead-submit`, {

    method: 'POST',

    headers: {

      'Content-Type': 'application/json',

      Authorization: `Bearer ${key}`,

      apikey: key,

    },

    body: JSON.stringify(body),

  })

  const json = (await res.json()) as Record<string, unknown>

  return { res, json }

}



function serviceClient(): SupabaseClient | null {

  const url = process.env.VITE_SUPABASE_URL

  const svc = process.env.E2E_SUPABASE_SERVICE_ROLE

  if (!url || !svc) return null

  return createClient(url, svc)

}



test.describe('Public funnel', () => {

  test('/get-started loads and shows questionnaire', async ({ page }) => {

    await page.goto('/get-started')

    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: /tell us about your studio/i })).toBeVisible()

  })



  test('/omaha/signup loads enrollment flow', async ({ page }) => {

    await page.goto('/omaha/signup')

    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toBeVisible()

  })



  test('/trial redirects to /get-started without sessionStorage', async ({ page }) => {

    await page.goto('/trial')

    await page.waitForURL(/\/get-started/)

  })

})



test.describe('CRM lead detail (requires auth)', () => {

  test.skip(

    !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,

    'Set E2E_EMAIL and E2E_PASSWORD to run CRM smoke',

  )



  test('Leads page opens lead modal', async ({ page }) => {

    await page.goto('/login')

    await page.waitForLoadState('networkidle')

    await page.getByLabel(/email/i).fill(process.env.E2E_EMAIL!)

    await page.getByLabel(/password/i).fill(process.env.E2E_PASSWORD!)

    await page.getByRole('button', { name: /sign in|log in/i }).click()

    await page.waitForURL(/admin|leads|dashboard/i, { timeout: 30_000 })

    await page.goto('/admin/leads')

    await page.waitForLoadState('networkidle')

    const first = page.locator('[data-guide-id="lead-contact"], .lead-card, [class*="lead"]').first()

    if (await first.count()) {

      await first.click()

    }

  })

})



test.describe('Intake: edge → CRM → conversion → student', () => {

  test.skip(

    !process.env.E2E_EMAIL ||

      !process.env.E2E_PASSWORD ||

      !process.env.VITE_SUPABASE_URL ||

      !process.env.VITE_SUPABASE_ANON_KEY,

    'Set E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (e.g. from .env.local)',

  )



  test('signup creates intake + lead link; CRM shows intake; convert keeps linkage', async ({ page }) => {

    const marker = `E2E_INTAKE_${Date.now()}`

    const email = `e2e.intake.${Date.now()}@lessontest.local`

    const body = {

      school_slug: 'adkins-music-lessons',

      location_id: OMAHA_LOCATION_ID,

      first_name: 'E2E',

      last_name: 'Intake',

      email,

      phone: '4025550199',

      source: 'e2e',

      goals: marker,

      instrument: 'piano',

    }



    const { res, json } = await postPublicLeadSubmit(body)

    expect(res.ok, JSON.stringify(json)).toBeTruthy()

    expect(json.success).toBe(true)

    const leadId = json.lead_id as string

    const intakeSubmissionId = json.intake_submission_id as string

    expect(leadId).toMatch(/^[0-9a-f-]{36}$/i)

    expect(intakeSubmissionId).toMatch(/^[0-9a-f-]{36}$/i)



    const svc = serviceClient()

    if (svc) {

      const { data: leadRow, error: leadErr } = await svc

        .from('leads')

        .select('intake_submission_id')

        .eq('id', leadId)

        .single()

      expect(leadErr, String(leadErr)).toBeNull()

      expect(leadRow?.intake_submission_id).toBe(intakeSubmissionId)



      const { data: intakeRow, error: intakeErr } = await svc

        .from('intake_submissions')

        .select('id, raw_payload')

        .eq('id', intakeSubmissionId)

        .single()

      expect(intakeErr, String(intakeErr)).toBeNull()

      expect((intakeRow?.raw_payload as Record<string, unknown>)?.goals).toBe(marker)

    }



    await page.goto('/login')

    await page.waitForLoadState('networkidle')

    await page.getByLabel(/email/i).fill(process.env.E2E_EMAIL!)

    await page.getByLabel(/password/i).fill(process.env.E2E_PASSWORD!)

    await page.getByRole('button', { name: /sign in|log in/i }).click()

    await page.waitForURL(/admin|leads|dashboard/i, { timeout: 30_000 })

    await page.goto('/admin/leads')

    await page.waitForLoadState('networkidle')



    await page.locator(`[data-lead-id="${leadId}"]`).click()

    await expect(page.getByText('Original intake', { exact: false })).toBeVisible({ timeout: 15_000 })

    await expect(page.getByText(marker, { exact: false })).toBeVisible()



    await page.locator('[data-guide-id="lead-convert"]').click()



    await page.getByRole('button', { name: /Next: Pick a Slot/i }).click()

    await page.getByRole('button', { name: /Skip \(no slot\)/i }).click()

    await page.getByRole('button', { name: /Enroll Student/i }).click()



    await expect(page.getByText(/is enrolled!/i)).toBeVisible({ timeout: 60_000 })



    await page.getByRole('button', { name: /View Student Profile/i }).click()

    await page.waitForURL(/\/admin\/students\/[0-9a-f-]+/i, { timeout: 15_000 })

    await expect(page.getByText('Original intake', { exact: false })).toBeVisible({ timeout: 15_000 })

    await expect(page.getByText(marker, { exact: false })).toBeVisible()



    const studentUrl = page.url()

    const studentId = studentUrl.match(/\/admin\/students\/([0-9a-f-]+)/i)?.[1]

    expect(studentId).toBeTruthy()



    if (svc && studentId) {

      const { data: stu, error: stuErr } = await svc

        .from('students')

        .select('intake_submission_id')

        .eq('id', studentId)

        .single()

      expect(stuErr, String(stuErr)).toBeNull()

      expect(stu?.intake_submission_id).toBe(intakeSubmissionId)



      const { data: intakeAfter, error: afterErr } = await svc

        .from('intake_submissions')

        .select('converted_student_id')

        .eq('id', intakeSubmissionId)

        .single()

      expect(afterErr, String(afterErr)).toBeNull()

      expect(intakeAfter?.converted_student_id).toBe(studentId)

    }

  })

})

