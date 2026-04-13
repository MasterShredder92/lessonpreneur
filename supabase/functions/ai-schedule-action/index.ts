import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ═══════════════════════════════════════
// ZIRO ACCESS CONTROL — HARD SECURITY BOUNDARY
// ═══════════════════════════════════════
// Same policy as ai-assistant:
//   owner / admin / company_director → full access
//   studio_director                  → assigned location(s) only
//   teacher / student / parent       → 403
const ZIRO_ALLOWED_ROLES = new Set(["owner", "admin", "company_director", "studio_director"]);
const ZIRO_FORBIDDEN_ROLES = new Set(["teacher", "student", "parent"]);

interface ZiroCallerIdentity {
  profileId: string;
  tenantId: string;
  role: string;
  allowedLocationIds: string[] | null;
  isLocationScoped: boolean;
}

async function authorizeZiroCaller(
  req: Request,
  sb: ReturnType<typeof createClient>,
  requestedTenantId: string,
): Promise<ZiroCallerIdentity> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Response(
      JSON.stringify({ error: "Authentication required." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // CRITICAL: validate the JWT signature via Supabase auth.getUser().
  // Decoding base64 alone is NOT secure — anyone could forge a payload.
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    throw new Response(
      JSON.stringify({ error: "Invalid authentication token." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const profileId = userData.user.id;

  const { data: profile, error: profErr } = await sb
    .from("profiles")
    .select("id, tenant_id, role")
    .eq("id", profileId)
    .maybeSingle();

  if (profErr || !profile) {
    throw new Response(
      JSON.stringify({ error: "Profile not found. Access denied." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const role = String(profile.role ?? "").toLowerCase().trim();

  if (ZIRO_FORBIDDEN_ROLES.has(role)) {
    throw new Response(
      JSON.stringify({ error: "Schedule actions are not available for your role." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!ZIRO_ALLOWED_ROLES.has(role)) {
    throw new Response(
      JSON.stringify({ error: "Access denied for this role." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (requestedTenantId && profile.tenant_id !== requestedTenantId) {
    throw new Response(
      JSON.stringify({ error: "Tenant mismatch. Access denied." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let allowedLocationIds: string[] | null = null;
  let isLocationScoped = false;
  if (role === "studio_director") {
    const { data: locs } = await sb
      .from("profile_locations")
      .select("location_id")
      .eq("profile_id", profileId);
    allowedLocationIds = (locs ?? []).map((l: any) => l.location_id);
    isLocationScoped = true;
    if (allowedLocationIds.length === 0) {
      throw new Response(
        JSON.stringify({ error: "Studio director has no assigned locations." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  return { profileId, tenantId: profile.tenant_id, role, allowedLocationIds, isLocationScoped };
}

/**
 * For studio directors: verify a student's location is in their allowed set.
 * For owners/admins: always passes.
 */
async function assertStudentInScope(
  sb: ReturnType<typeof createClient>,
  caller: ZiroCallerIdentity,
  studentId: string | null | undefined,
): Promise<void> {
  if (!caller.isLocationScoped || !studentId) return;
  const { data: student } = await sb
    .from("students")
    .select("location_id")
    .eq("id", studentId)
    .eq("tenant_id", caller.tenantId)
    .maybeSingle();
  if (!student) {
    throw new Error("Student not found in your scope.");
  }
  if (!caller.allowedLocationIds!.includes(student.location_id)) {
    throw new Error("Access denied: this student is not at your assigned location.");
  }
}

/**
 * For studio directors: verify a teacher operates at one of their allowed locations.
 */
async function assertTeacherInScope(
  sb: ReturnType<typeof createClient>,
  caller: ZiroCallerIdentity,
  teacherId: string | null | undefined,
): Promise<void> {
  if (!caller.isLocationScoped || !teacherId) return;
  const { data: locs } = await sb
    .from("teacher_locations")
    .select("location_id")
    .eq("teacher_id", teacherId);
  const teacherLocationIds = (locs ?? []).map((l: any) => l.location_id);
  const overlap = teacherLocationIds.some((id: string) => caller.allowedLocationIds!.includes(id));
  if (!overlap) {
    throw new Error("Access denied: this teacher is not at your assigned location.");
  }
}

/**
 * For studio directors: verify a raw location_id in params is in their allowed set.
 */
function assertLocationInScope(caller: ZiroCallerIdentity, locationId: string | null | undefined): void {
  if (!caller.isLocationScoped || !locationId) return;
  if (!caller.allowedLocationIds!.includes(locationId)) {
    throw new Error("Access denied: this location is not in your assigned scope.");
  }
}

// ═══════════════════════════════════════
// NAME RESOLVERS
// ═══════════════════════════════════════

async function resolveStudent(sb: any, tenantId: string, name: string) {
  const parts = name.trim().split(/\s+/);
  let query = sb.from("students").select("id, first_name, last_name, instrument, location_id, teacher_id, family_id")
    .eq("tenant_id", tenantId).eq("status", "active");
  if (parts.length >= 2) {
    query = query.ilike("first_name", `%${parts[0]}%`).ilike("last_name", `%${parts.slice(1).join(" ")}%`);
  } else {
    query = query.ilike("first_name", `%${parts[0]}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data || data.length === 0) throw new Error(`Student "${name}" not found`);
  if (data.length > 1) throw new Error(`Multiple students match "${name}": ${data.map((s: any) => `${s.first_name} ${s.last_name}`).join(", ")}. Be more specific.`);
  return data[0];
}

async function resolveTeacher(sb: any, tenantId: string, name: string) {
  const parts = name.trim().split(/\s+/);
  const { data: teachers } = await sb.from("teachers")
    .select("id, first_name, last_name, instruments, is_active, profile:profiles!teachers_profile_id_fkey(first_name, last_name)")
    .eq("tenant_id", tenantId).eq("is_active", true);
  const matches = (teachers ?? []).filter((t: any) => {
    const full = `${t.first_name ?? t.profile?.first_name ?? ""} ${t.last_name ?? t.profile?.last_name ?? ""}`.trim().toLowerCase();
    return parts.every(p => full.includes(p.toLowerCase()));
  });
  if (matches.length === 0) throw new Error(`Teacher "${name}" not found`);
  if (matches.length > 1) throw new Error(`Multiple teachers match "${name}". Be more specific.`);
  const t = matches[0];
  return { id: t.id, name: `${t.first_name ?? t.profile?.first_name ?? ""} ${t.last_name ?? t.profile?.last_name ?? ""}`.trim(), instruments: t.instruments };
}

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "pm" : "am";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m}${ampm}`;
}

// ═══════════════════════════════════════
// AVAILABILITY HELPERS
// ═══════════════════════════════════════

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

async function checkTeacherAvailability(
  sb: any, teacherId: string, locationId: string | null, date: string, startTime: string
): Promise<any> {
  const dow = DAY_NAMES[new Date(date + "T12:00:00").getDay()];
  let query = sb.from("teacher_availability")
    .select("id, start_time, end_time, location_id")
    .eq("teacher_id", teacherId)
    .eq("day_of_week", dow)
    .eq("is_active", true)
    .lte("start_time", startTime)
    .gt("end_time", startTime);
  if (locationId) query = query.eq("location_id", locationId);
  const { data } = await query;
  return data && data.length > 0 ? data[0] : null;
}

async function findOrCreateOpenSlot(
  sb: any, tenantId: string, teacherId: string, locationId: string | null, date: string, startTime: string
): Promise<string | null> {
  const { data: existing } = await sb.from("schedule_blocks")
    .select("id")
    .eq("teacher_id", teacherId)
    .eq("block_date", date)
    .eq("start_time", startTime)
    .eq("status", "available")
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  const avail = await checkTeacherAvailability(sb, teacherId, locationId, date, startTime);
  if (!avail) return null;

  const endH = parseInt(startTime.split(":")[0]);
  const endM = startTime.split(":")[1] === "30" ? "00" : "30";
  const endHour = startTime.split(":")[1] === "30" ? endH + 1 : endH;
  const endTime = `${String(endHour).padStart(2, "0")}:${endM}:00`;

  const { data: created, error } = await sb.from("schedule_blocks").insert({
    tenant_id: tenantId,
    location_id: avail.location_id ?? locationId,
    teacher_id: teacherId,
    block_date: date,
    start_time: startTime,
    end_time: endTime,
    status: "available",
    block_type: "open_time",
    is_recurring: false,
    generated_from_availability: true,
  }).select("id").single();

  if (error || !created) return null;
  return created.id;
}

async function createRecurringBlocks(
  sb: any, tenantId: string, teacherId: string, studentId: string,
  locationId: string, startDate: string, startTime: string, endTime: string,
  blockType: string
) {
  const baseDate = new Date(startDate + "T12:00:00");
  const dow = baseDate.getDay();
  const rows: any[] = [];

  for (let week = 1; week <= 12; week++) {
    const futureDate = new Date(baseDate);
    futureDate.setDate(futureDate.getDate() + week * 7);
    if (futureDate.getDay() !== dow) continue;
    const dateStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, "0")}-${String(futureDate.getDate()).padStart(2, "0")}`;

    const { data: existing } = await sb.from("schedule_blocks")
      .select("id, status, student_id")
      .eq("teacher_id", teacherId)
      .eq("block_date", dateStr)
      .eq("start_time", startTime)
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (existing.status === "available") {
        await sb.from("schedule_blocks").update({
          student_id: studentId, status: "booked", block_type: blockType, is_recurring: true,
        }).eq("id", existing.id);
      }
      continue;
    }

    rows.push({
      tenant_id: tenantId, location_id: locationId, teacher_id: teacherId,
      student_id: studentId, block_date: dateStr,
      start_time: startTime, end_time: endTime,
      status: "booked", block_type: blockType, is_recurring: true,
      generated_from_availability: true,
    });
  }

  if (rows.length > 0) {
    await sb.from("schedule_blocks").insert(rows);
  }
  return rows.length;
}

// ═══════════════════════════════════════
// ACTION HANDLERS
// ═══════════════════════════════════════

async function moveLesson(sb: any, tenantId: string, params: any, userId: string | null) {
  const { student_id, target_time, target_date, target_teacher_id, location_id, move_scope } = params;

  const date = target_date ?? new Date().toISOString().split("T")[0];
  const scope = move_scope ?? "this_instance";

  // Find the student's current block on the target date (or today)
  const { data: currentBlocks } = await sb.from("schedule_blocks")
    .select("*")
    .eq("student_id", student_id)
    .eq("block_date", date)
    .eq("status", "booked");

  if (!currentBlocks || currentBlocks.length === 0) {
    const today = new Date().toISOString().split("T")[0];
    const { data: todayBlocks } = await sb.from("schedule_blocks")
      .select("*").eq("student_id", student_id).eq("block_date", today).eq("status", "booked");
    if (!todayBlocks || todayBlocks.length === 0) throw new Error("No scheduled lesson found for this student on that date");
  }

  const sourceBlock = currentBlocks![0];
  const teacherId = target_teacher_id ?? sourceBlock.teacher_id;
  const locId = location_id ?? sourceBlock.location_id;

  const startTimeFull = target_time.length === 5 ? target_time + ":00" : target_time;

  // ── GUARD 1: Duplicate-booking check ──
  // If this student is already booked with the target teacher at the target time, refuse.
  const { data: dupeCheck } = await sb.from("schedule_blocks")
    .select("id")
    .eq("student_id", student_id)
    .eq("teacher_id", teacherId)
    .eq("block_date", date)
    .eq("start_time", startTimeFull)
    .eq("status", "booked")
    .limit(1)
    .maybeSingle();

  if (dupeCheck) {
    throw new Error(`This student is already booked with that teacher at ${formatTime(startTimeFull)} on ${date}. No action taken.`);
  }

  // ── GUARD 2: Teacher conflict check ──
  const { data: conflictCheck } = await sb.from("schedule_blocks")
    .select("id, student_id, status, block_type")
    .eq("teacher_id", teacherId)
    .eq("block_date", date)
    .eq("start_time", startTimeFull)
    .eq("status", "booked")
    .limit(1)
    .maybeSingle();

  if (conflictCheck && conflictCheck.student_id && conflictCheck.student_id !== student_id) {
    const { data: conflictStudent } = await sb.from("students").select("first_name, last_name").eq("id", conflictCheck.student_id).single();
    const conflictName = conflictStudent ? `${conflictStudent.first_name} ${conflictStudent.last_name}` : "another student";
    throw new Error(`Can't move there — ${formatTime(startTimeFull)} is already booked with ${conflictName}.`);
  }

  // Find existing open slot OR create from teacher_availability
  const slotId = !conflictCheck
    ? await findOrCreateOpenSlot(sb, tenantId, teacherId, locId, date, startTimeFull)
    : null;

  if (!slotId && !conflictCheck) {
    const { data: teacherInfo } = await sb.from("teachers").select("first_name, last_name, profile:profiles!teachers_profile_id_fkey(first_name, last_name)").eq("id", teacherId).single();
    const teacherName = teacherInfo ? `${teacherInfo.first_name ?? teacherInfo.profile?.first_name ?? ""} ${teacherInfo.last_name ?? teacherInfo.profile?.last_name ?? ""}`.trim() : "This teacher";
    const { data: teacherOpenBlocks } = await sb.from("schedule_blocks")
      .select("start_time").eq("teacher_id", teacherId).eq("block_date", date).eq("status", "available").order("start_time");
    const openTimes = (teacherOpenBlocks ?? []).map((b: any) => formatTime(b.start_time)).join(", ");
    throw new Error(`${teacherName} doesn't have availability at ${formatTime(startTimeFull)}.${openTimes ? ` Open times: ${openTimes}` : " No open times on this date."}`);
  }

  // ── STEP 1: Clear source FIRST (before booking target) ──
  // This order prevents double-booking: if clear fails, we throw before creating the new booking.
  const { error: clearErr } = await sb.from("schedule_blocks").update({
    student_id: null, status: "available", block_type: "open_time", is_recurring: false,
    original_teacher_id: null, original_teacher_name: null,
  }).eq("id", sourceBlock.id);

  if (clearErr) {
    throw new Error(`Failed to clear source lesson (${sourceBlock.id}): ${clearErr.message}. No changes made.`);
  }

  // Verify the source was actually cleared (belt-and-suspenders)
  const { data: srcVerify } = await sb.from("schedule_blocks")
    .select("student_id, status").eq("id", sourceBlock.id).single();

  if (srcVerify?.student_id !== null || srcVerify?.status !== "available") {
    throw new Error(`Source lesson clear could not be verified (block ${sourceBlock.id}). Aborting to prevent double-booking.`);
  }

  // ── STEP 2: Book target slot (source is confirmed clear) ──
  if (slotId) {
    const { error: bookErr } = await sb.from("schedule_blocks").update({
      student_id: sourceBlock.student_id, status: "booked", block_type: sourceBlock.block_type,
      original_teacher_id: sourceBlock.original_teacher_id, original_teacher_name: sourceBlock.original_teacher_name,
    }).eq("id", slotId);

    if (bookErr) {
      // Rollback: restore source block since target booking failed
      await sb.from("schedule_blocks").update({
        student_id: sourceBlock.student_id, status: "booked", block_type: sourceBlock.block_type,
        is_recurring: sourceBlock.is_recurring,
        original_teacher_id: sourceBlock.original_teacher_id, original_teacher_name: sourceBlock.original_teacher_name,
      }).eq("id", sourceBlock.id);
      throw new Error(`Failed to book target slot: ${bookErr.message}. Source lesson restored.`);
    }
  }

  // ── STEP 3: Final double-book safety check ──
  const { data: postCheck } = await sb.from("schedule_blocks")
    .select("id, teacher_id")
    .eq("student_id", student_id)
    .eq("block_date", date)
    .eq("start_time", startTimeFull)
    .eq("status", "booked");

  if (postCheck && postCheck.length > 1) {
    // Emergency: double-book detected after write. Clear all but the target.
    const dupes = postCheck.filter((b: any) => b.id !== slotId);
    for (const d of dupes) {
      await sb.from("schedule_blocks").update({
        student_id: null, status: "available", block_type: "open_time", is_recurring: false,
        original_teacher_id: null, original_teacher_name: null,
        notes: "[Ziro auto-fix] Cleared duplicate booking after move",
      }).eq("id", d.id);
    }
    console.error(`[moveLesson] Auto-fixed ${dupes.length} duplicate bookings for student ${student_id} at ${startTimeFull} on ${date}`);
  }

  await sb.from("activity_log").insert({
    tenant_id: tenantId, entity_type: "schedule_block", entity_id: sourceBlock.id,
    action: "ai_move_lesson",
    details: `Star moved lesson: ${sourceBlock.start_time} → ${startTimeFull} on ${date}${scope === "all_future" ? " (+ all future)" : ""}`,
    user_id: userId,
  });

  // ── all_future scope: cancel remaining future blocks with old teacher, create recurring with new ──
  if (scope === "all_future" && sourceBlock.teacher_id !== teacherId) {
    const { data: futureBlocks } = await sb.from("schedule_blocks")
      .select("id, block_date")
      .eq("student_id", student_id)
      .eq("teacher_id", sourceBlock.teacher_id)
      .eq("start_time", sourceBlock.start_time)
      .eq("status", "booked")
      .gt("block_date", date);

    let cancelledCount = 0;
    if (futureBlocks && futureBlocks.length > 0) {
      for (const fb of futureBlocks) {
        await sb.from("schedule_blocks").update({
          student_id: null, status: "available", block_type: "open_time", is_recurring: false,
          notes: `[Star Move All Future] Transferred to new teacher`,
          original_teacher_id: null, original_teacher_name: null,
        }).eq("id", fb.id);
      }
      cancelledCount = futureBlocks.length;
    }

    const endH = parseInt(startTimeFull.split(":")[0]);
    const endM = startTimeFull.split(":")[1] === "30" ? "00" : "30";
    const endHour = startTimeFull.split(":")[1] === "30" ? endH + 1 : endH;
    const endTimeFull = `${String(endHour).padStart(2, "0")}:${endM}:00`;

    const recurCount = await createRecurringBlocks(
      sb, tenantId, teacherId, student_id,
      locId ?? "", date, startTimeFull, endTimeFull, sourceBlock.block_type ?? "student_session"
    );

    await sb.from("activity_log").insert({
      tenant_id: tenantId, entity_type: "student", entity_id: student_id,
      action: "ai_move_lesson_all_future",
      details: `Star moved all future: cancelled ${cancelledCount} old blocks, created ${recurCount} new recurring with new teacher`,
      user_id: userId,
    });

    return `Lesson moved to ${formatTime(startTimeFull)} on ${date} — removed from previous teacher. ${cancelledCount} future lessons cancelled with old teacher, ${recurCount} future weeks created with new teacher.`;
  }

  return `Lesson moved to ${formatTime(startTimeFull)} on ${date} — removed from previous teacher's schedule.`;
}

async function bookStudent(sb: any, tenantId: string, params: any, userId: string | null) {
  const { student_id, teacher_id, target_time, target_date, location_id, block_type, recurring } = params;

  const date = target_date ?? new Date().toISOString().split("T")[0];
  const startTimeFull = target_time.length === 5 ? target_time + ":00" : target_time;
  const bType = block_type ?? "student_session";
  const isRecurring = recurring !== false; // default true

  if (!teacher_id) throw new Error("No teacher specified and student has no assigned teacher.");

  // VALIDATION: Check if slot is already booked
  const { data: conflictCheck } = await sb.from("schedule_blocks")
    .select("id, student_id, status")
    .eq("teacher_id", teacher_id)
    .eq("block_date", date)
    .eq("start_time", startTimeFull)
    .eq("status", "booked")
    .limit(1)
    .maybeSingle();

  if (conflictCheck && conflictCheck.student_id) {
    const { data: conflictStudent } = await sb.from("students").select("first_name, last_name").eq("id", conflictCheck.student_id).single();
    const conflictName = conflictStudent ? `${conflictStudent.first_name} ${conflictStudent.last_name}` : "another student";
    const { data: openBlocks } = await sb.from("schedule_blocks")
      .select("start_time").eq("teacher_id", teacher_id).eq("block_date", date).eq("status", "available").order("start_time");
    const openTimes = (openBlocks ?? []).map((b: any) => formatTime(b.start_time)).join(", ");
    throw new Error(`That slot is already booked with ${conflictName}.${openTimes ? ` Open times: ${openTimes}` : ""}`);
  }

  // Find existing open slot OR create from teacher_availability
  const slotId = await findOrCreateOpenSlot(sb, tenantId, teacher_id, location_id, date, startTimeFull);

  if (!slotId) {
    const { data: teacherInfo } = await sb.from("teachers").select("first_name, last_name, profile:profiles!teachers_profile_id_fkey(first_name, last_name)").eq("id", teacher_id).single();
    const teacherName = teacherInfo ? `${teacherInfo.first_name ?? teacherInfo.profile?.first_name ?? ""} ${teacherInfo.last_name ?? teacherInfo.profile?.last_name ?? ""}`.trim() : "This teacher";
    const { data: openBlocks } = await sb.from("schedule_blocks")
      .select("start_time").eq("teacher_id", teacher_id).eq("block_date", date).eq("status", "available").order("start_time");
    const openTimes = (openBlocks ?? []).map((b: any) => formatTime(b.start_time)).join(", ");
    throw new Error(`${teacherName} doesn't have availability at ${formatTime(startTimeFull)}.${openTimes ? ` Existing open times: ${openTimes}` : " No open times on this date."}`);
  }

  // Compute end time
  const endH = parseInt(startTimeFull.split(":")[0]);
  const endM = startTimeFull.split(":")[1] === "30" ? "00" : "30";
  const endHour = startTimeFull.split(":")[1] === "30" ? endH + 1 : endH;
  const endTimeFull = `${String(endHour).padStart(2, "0")}:${endM}:00`;

  // Book the initial slot
  await sb.from("schedule_blocks").update({
    student_id, status: "booked", block_type: bType, is_recurring: isRecurring,
  }).eq("id", slotId);

  // Create recurring future blocks if weekly
  let recurCount = 0;
  if (isRecurring) {
    recurCount = await createRecurringBlocks(
      sb, tenantId, teacher_id, student_id,
      location_id ?? "", date, startTimeFull, endTimeFull, bType
    );
  }

  const { data: student } = await sb.from("students").select("first_name, last_name").eq("id", student_id).single();
  const studentName = student ? `${student.first_name} ${student.last_name}` : "Student";
  const recurLabel = isRecurring ? ` + ${recurCount} future weeks` : " (one-time)";

  await sb.from("activity_log").insert({
    tenant_id: tenantId, entity_type: "schedule_block", entity_id: slotId,
    action: "ai_book_student",
    details: `Star booked ${studentName} at ${formatTime(startTimeFull)} on ${date} (${bType})${recurLabel}`,
    user_id: userId,
  });

  return `Booked ${studentName} at ${formatTime(startTimeFull)} on ${date}${isRecurring ? ` — recurring weekly (${recurCount} future weeks created)` : " (one-time)"}. Existing lessons were not affected.`;
}

async function batchBookStudents(sb: any, tenantId: string, params: any, userId: string | null) {
  const { teacher_id, target_date, location_id, bookings, recurring } = params;

  const date = target_date ?? new Date().toISOString().split("T")[0];
  const isRecurring = recurring !== false;
  if (!teacher_id) throw new Error("No teacher specified for batch booking.");

  const { data: teacherInfo } = await sb.from("teachers").select("first_name, last_name, profile:profiles!teachers_profile_id_fkey(first_name, last_name)").eq("id", teacher_id).single();
  const teacherName = teacherInfo ? `${teacherInfo.first_name ?? teacherInfo.profile?.first_name ?? ""} ${teacherInfo.last_name ?? teacherInfo.profile?.last_name ?? ""}`.trim() : "Teacher";

  const results: string[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const booking of (bookings ?? [])) {
    const { student_id, student_display, target_time, block_type, error: resolveError } = booking;

    if (resolveError || !student_id) {
      results.push(`✗ ${student_display} at ${formatTime(target_time.length === 5 ? target_time + ":00" : target_time)}: ${resolveError ?? "Student not found"}`);
      failed++;
      continue;
    }

    const startTimeFull = target_time.length === 5 ? target_time + ":00" : target_time;
    const bType = block_type ?? "student_session";

    try {
      const { data: conflictCheck } = await sb.from("schedule_blocks")
        .select("id, student_id, status")
        .eq("teacher_id", teacher_id).eq("block_date", date).eq("start_time", startTimeFull).eq("status", "booked")
        .limit(1).maybeSingle();

      if (conflictCheck && conflictCheck.student_id) {
        const { data: cs } = await sb.from("students").select("first_name, last_name").eq("id", conflictCheck.student_id).single();
        results.push(`✗ ${student_display} at ${formatTime(startTimeFull)}: Booked with ${cs ? `${cs.first_name} ${cs.last_name}` : "another student"}`);
        failed++;
        continue;
      }

      const slotId = await findOrCreateOpenSlot(sb, tenantId, teacher_id, location_id, date, startTimeFull);
      if (!slotId) {
        results.push(`✗ ${student_display} at ${formatTime(startTimeFull)}: No availability`);
        failed++;
        continue;
      }

      // Compute end time for recurring
      const eH = parseInt(startTimeFull.split(":")[0]);
      const eM = startTimeFull.split(":")[1] === "30" ? "00" : "30";
      const eHour = startTimeFull.split(":")[1] === "30" ? eH + 1 : eH;
      const endTimeFull = `${String(eHour).padStart(2, "0")}:${eM}:00`;

      await sb.from("schedule_blocks").update({
        student_id, status: "booked", block_type: bType, is_recurring: isRecurring,
      }).eq("id", slotId);

      let recurCount = 0;
      if (isRecurring) {
        recurCount = await createRecurringBlocks(sb, tenantId, teacher_id, student_id, location_id ?? "", date, startTimeFull, endTimeFull, bType);
      }

      await sb.from("activity_log").insert({
        tenant_id: tenantId, entity_type: "schedule_block", entity_id: slotId,
        action: "ai_book_student",
        details: `Star booked ${student_display} at ${formatTime(startTimeFull)} on ${date} with ${teacherName} (${bType}) [batch]${isRecurring ? ` +${recurCount}wk` : ""}`,
        user_id: userId,
      });

      results.push(`✓ ${student_display} at ${formatTime(startTimeFull)}${isRecurring ? ` (+${recurCount}wk)` : ""}`);
      succeeded++;
    } catch (err: any) {
      results.push(`✗ ${student_display} at ${formatTime(startTimeFull)}: ${err.message}`);
      failed++;
    }
  }

  const recurLabel = isRecurring ? " (recurring weekly)" : " (one-time)";
  return `Batch booking with ${teacherName}${recurLabel} on ${date}:\n${results.join("\n")}\n\n${succeeded} booked, ${failed} failed.`;
}

async function findCoverage(sb: any, tenantId: string, params: any, userId: string | null) {
  const { teacher_id, date: dateParam, location_id } = params;
  const date = dateParam ?? new Date().toISOString().split("T")[0];

  const { data: teacherBlocks } = await sb.from("schedule_blocks")
    .select("*")
    .eq("teacher_id", teacher_id)
    .eq("block_date", date)
    .eq("status", "booked")
    .not("student_id", "is", null);

  if (!teacherBlocks || teacherBlocks.length === 0) {
    return "No booked lessons found for this teacher on that date.";
  }

  const locId = location_id ?? teacherBlocks[0].location_id;
  const dayOfWeek = new Date(date + "T12:00:00").getDay();
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  const { data: allTeachers } = await sb.from("teachers")
    .select("id, first_name, last_name, instruments, profile:profiles!teachers_profile_id_fkey(first_name, last_name)")
    .eq("tenant_id", tenantId).eq("is_active", true);

  const [{ data: todayBlocks }, { data: avail }] = await Promise.all([
    sb.from("schedule_blocks").select("teacher_id, location_id, start_time, student_id").eq("block_date", date).eq("status", "booked"),
    sb.from("teacher_availability").select("teacher_id, location_id").eq("day_of_week", dayNames[dayOfWeek]).eq("is_active", true),
  ]);

  const hereToday = new Set((todayBlocks ?? []).filter((b: any) => b.location_id === locId).map((b: any) => b.teacher_id));
  const availHere = new Set((avail ?? []).filter((a: any) => a.location_id === locId).map((a: any) => a.teacher_id));
  const busyAt: Record<string, Set<string>> = {};
  (todayBlocks ?? []).forEach((b: any) => {
    if (!busyAt[b.teacher_id]) busyAt[b.teacher_id] = new Set();
    busyAt[b.teacher_id].add(b.start_time);
  });

  const calledOutTeacher = (allTeachers ?? []).find((t: any) => t.id === teacher_id);
  const calledOutName = calledOutTeacher
    ? `${calledOutTeacher.first_name ?? calledOutTeacher.profile?.first_name ?? ""} ${calledOutTeacher.last_name ?? calledOutTeacher.profile?.last_name ?? ""}`.trim()
    : "Unknown";

  const results: string[] = [];
  let covered = 0;

  for (const block of teacherBlocks) {
    const candidates = (allTeachers ?? [])
      .filter((t: any) => t.id !== teacher_id && !(busyAt[t.id]?.has(block.start_time)))
      .map((t: any) => {
        const name = `${t.first_name ?? t.profile?.first_name ?? ""} ${t.last_name ?? t.profile?.last_name ?? ""}`.trim();
        let score = 0;
        if (block.instrument && t.instruments?.includes(block.instrument)) score += 10;
        if (hereToday.has(t.id)) score += 8;
        if (availHere.has(t.id)) score += 5;
        return { id: t.id, name, score };
      })
      .sort((a: any, b: any) => b.score - a.score);

    if (candidates.length > 0) {
      const best = candidates[0];
      await sb.from("schedule_blocks").delete()
        .eq("teacher_id", best.id).eq("block_date", date).eq("start_time", block.start_time).eq("status", "available");

      await sb.from("schedule_blocks").update({
        teacher_id: best.id, block_type: "sub",
        original_teacher_id: teacher_id, original_teacher_name: calledOutName,
      }).eq("id", block.id);

      results.push(`${formatTime(block.start_time)}: ${best.name} covering (score ${best.score})`);
      covered++;
    } else {
      await sb.from("schedule_blocks").update({
        block_type: "call_out", original_teacher_id: teacher_id, original_teacher_name: calledOutName,
      }).eq("id", block.id);
      results.push(`${formatTime(block.start_time)}: No coverage found — marked as call-out`);
    }
  }

  await sb.from("activity_log").insert({
    tenant_id: tenantId, entity_type: "teacher", entity_id: teacher_id,
    action: "ai_find_coverage",
    details: `Star found coverage for ${calledOutName}: ${covered}/${teacherBlocks.length} covered`,
    user_id: userId,
  });

  return `Coverage for ${calledOutName} on ${date}:\n${results.join("\n")}\n\n${covered}/${teacherBlocks.length} lessons covered.`;
}

const REASON_LABELS: Record<string, string> = {
  student_sick: "Student Sick",
  teacher_sick: "Teacher Sick",
  family_emergency: "Family Emergency",
  no_show: "No Show",
  schedule_conflict: "Schedule Conflict",
  holiday: "Holiday",
  weather: "Weather",
  other: "Other",
};

async function cancelSingleBlock(
  sb: any, tenantId: string, block: any, reason: string, reasonDetail: string | null, userId: string | null
) {
  const reasonText = reason === "other" ? (reasonDetail ?? "Other") : (REASON_LABELS[reason] ?? reason);
  await sb.from("schedule_blocks").update({
    student_id: null, status: "available", block_type: "open_time", is_recurring: false,
    notes: `[Star Cancel] ${reasonText}${reasonDetail && reason !== "other" ? ` — ${reasonDetail}` : ""}`,
    original_teacher_id: null, original_teacher_name: null,
  }).eq("id", block.id);

  await sb.from("activity_log").insert({
    tenant_id: tenantId, entity_type: "schedule_block", entity_id: block.id,
    action: "ai_cancel_lesson",
    details: `Star cancelled: ${reasonText}`,
    user_id: userId,
  });
}

async function cancelLesson(sb: any, tenantId: string, params: any, userId: string | null) {
  const { student_id, date: dateParam, reason, reason_detail, cancel_scope } = params;
  const date = dateParam ?? new Date().toISOString().split("T")[0];
  const scope = cancel_scope ?? "this_week";
  const reasonText = reason === "other" ? (reason_detail ?? "Other") : (REASON_LABELS[reason] ?? reason);

  const { data: blocks } = await sb.from("schedule_blocks")
    .select("*").eq("student_id", student_id).eq("block_date", date).eq("status", "booked");

  if (!blocks || blocks.length === 0) throw new Error("No lesson found for this student on that date");
  const block = blocks[0];

  await cancelSingleBlock(sb, tenantId, block, reason, reason_detail, userId);
  let cancelledCount = 1;

  if (scope === "all_future") {
    const { data: futureBlocks } = await sb.from("schedule_blocks")
      .select("id, block_date")
      .eq("student_id", student_id)
      .eq("teacher_id", block.teacher_id)
      .eq("start_time", block.start_time)
      .eq("status", "booked")
      .gt("block_date", date);

    if (futureBlocks && futureBlocks.length > 0) {
      for (const fb of futureBlocks) {
        await sb.from("schedule_blocks").update({
          student_id: null, status: "available", block_type: "open_time", is_recurring: false,
          notes: `[Star Cancel All Future] ${reasonText}`,
          original_teacher_id: null, original_teacher_name: null,
        }).eq("id", fb.id);
      }
      cancelledCount += futureBlocks.length;

      await sb.from("activity_log").insert({
        tenant_id: tenantId, entity_type: "schedule_block", entity_id: block.id,
        action: "ai_cancel_all_future",
        details: `Star cancelled ${futureBlocks.length} future recurring blocks: ${reasonText}`,
        user_id: userId,
      });
    }
  }

  const { data: student } = await sb.from("students").select("first_name, last_name").eq("id", student_id).single();
  const studentName = student ? `${student.first_name} ${student.last_name}` : "Student";
  const scopeLabel = scope === "all_future" ? ` + ${cancelledCount - 1} future weeks` : " (this week only)";

  return `Cancelled ${studentName}'s lesson on ${date}${scopeLabel}. Reason: ${reasonText}.`;
}

async function batchCancelLessons(sb: any, tenantId: string, params: any, userId: string | null) {
  const { date: dateParam, reason, reason_detail, cancel_scope, cancellations } = params;
  const date = dateParam ?? new Date().toISOString().split("T")[0];
  const scope = cancel_scope ?? "this_week";
  const reasonText = reason === "other" ? (reason_detail ?? "Other") : (REASON_LABELS[reason] ?? reason);

  const results: string[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const c of (cancellations ?? [])) {
    const { student_id, student_display, target_time, error: resolveError } = c;

    if (resolveError || !student_id) {
      results.push(`✗ ${student_display}: ${resolveError ?? "Student not found"}`);
      failed++;
      continue;
    }

    try {
      let query = sb.from("schedule_blocks").select("*")
        .eq("student_id", student_id).eq("block_date", date).eq("status", "booked");
      if (target_time) {
        const timeFull = target_time.length === 5 ? target_time + ":00" : target_time;
        query = query.eq("start_time", timeFull);
      }
      const { data: blocks } = await query;

      if (!blocks || blocks.length === 0) {
        results.push(`✗ ${student_display}: No lesson found on ${date}`);
        failed++;
        continue;
      }

      const block = blocks[0];
      await cancelSingleBlock(sb, tenantId, block, reason, reason_detail, userId);
      let extra = "";

      if (scope === "all_future") {
        const { data: futureBlocks } = await sb.from("schedule_blocks")
          .select("id").eq("student_id", student_id).eq("teacher_id", block.teacher_id)
          .eq("start_time", block.start_time).eq("status", "booked").gt("block_date", date);
        if (futureBlocks && futureBlocks.length > 0) {
          for (const fb of futureBlocks) {
            await sb.from("schedule_blocks").update({
              student_id: null, status: "available", block_type: "open_time", is_recurring: false,
              notes: `[Star Cancel All Future] ${reasonText}`,
              original_teacher_id: null, original_teacher_name: null,
            }).eq("id", fb.id);
          }
          extra = ` +${futureBlocks.length} future`;
        }
      }

      const timeStr = target_time ? ` at ${formatTime(block.start_time)}` : "";
      results.push(`✓ ${student_display}${timeStr}${extra}`);
      succeeded++;
    } catch (err: any) {
      results.push(`✗ ${student_display}: ${err.message}`);
      failed++;
    }
  }

  const scopeLabel = scope === "all_future" ? " + all future" : "";
  return `Batch cancel${scopeLabel} on ${date} — ${reasonText}:\n${results.join("\n")}\n\n${succeeded} cancelled, ${failed} failed.`;
}

// ═══════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, tenant_id, params } = await req.json();
    if (!action || !tenant_id) {
      return new Response(JSON.stringify({ error: "action and tenant_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ─── HARD AUTH ──────────────────────────────────────────
    let caller: ZiroCallerIdentity;
    try {
      caller = await authorizeZiroCaller(req, sb, tenant_id);
    } catch (authResponse) {
      if (authResponse instanceof Response) return authResponse;
      throw authResponse;
    }
    const userId = caller.profileId;

    // ─── PER-ACTION SCOPE VALIDATION (studio directors) ────
    // Validate that all student/teacher/location IDs in params are within
    // the caller's assigned locations BEFORE running the action.
    try {
      switch (action) {
        case "move_lesson":
          await assertStudentInScope(sb, caller, params?.student_id);
          await assertTeacherInScope(sb, caller, params?.target_teacher_id);
          assertLocationInScope(caller, params?.location_id);
          break;
        case "book_student":
          await assertStudentInScope(sb, caller, params?.student_id);
          await assertTeacherInScope(sb, caller, params?.teacher_id);
          assertLocationInScope(caller, params?.location_id);
          break;
        case "batch_book_students":
          await assertTeacherInScope(sb, caller, params?.teacher_id);
          assertLocationInScope(caller, params?.location_id);
          for (const b of (params?.bookings ?? [])) {
            if (b?.student_id) await assertStudentInScope(sb, caller, b.student_id);
          }
          break;
        case "find_coverage":
          await assertTeacherInScope(sb, caller, params?.teacher_id);
          assertLocationInScope(caller, params?.location_id);
          break;
        case "cancel_lesson":
          await assertStudentInScope(sb, caller, params?.student_id);
          break;
        case "batch_cancel_lessons":
          for (const c of (params?.cancellations ?? [])) {
            if (c?.student_id) await assertStudentInScope(sb, caller, c.student_id);
          }
          break;
      }
    } catch (scopeErr: any) {
      return new Response(
        JSON.stringify({ error: scopeErr.message || "Access denied: out of scope." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let message: string;

    switch (action) {
      case "move_lesson":
        message = await moveLesson(sb, caller.tenantId, params, userId);
        break;
      case "book_student":
        message = await bookStudent(sb, caller.tenantId, params, userId);
        break;
      case "batch_book_students":
        message = await batchBookStudents(sb, caller.tenantId, params, userId);
        break;
      case "find_coverage":
        message = await findCoverage(sb, caller.tenantId, params, userId);
        break;
      case "cancel_lesson":
        message = await cancelLesson(sb, caller.tenantId, params, userId);
        break;
      case "batch_cancel_lessons":
        message = await batchCancelLessons(sb, caller.tenantId, params, userId);
        break;
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
