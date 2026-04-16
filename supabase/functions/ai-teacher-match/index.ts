import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonError(message: string, code: string, status: number): Response {
  return new Response(
    JSON.stringify({ ok: false, error: message, code }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return jsonError("ANTHROPIC_API_KEY not configured", "config_missing", 500);
    }

    const { lead_id, tenant_id } = await req.json();
    if (!lead_id || !tenant_id) {
      return jsonError("lead_id and tenant_id required", "bad_request", 400);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get lead data
    const { data: lead, error: leadErr } = await sb.from("leads").select("*").eq("id", lead_id).single();
    if (leadErr || !lead) {
      return jsonError("Lead not found", "not_found", 404);
    }

    // Get all active teachers
    const { data: allTeachers } = await sb
      .from("teachers")
      .select("id, first_name, last_name, instruments, bio, rate_per_block, ai_context, is_active, profile_id, profile:profiles!teachers_profile_id_fkey(first_name, last_name)")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true);

    // Use teacher_locations + teacher_availability to find teachers at location
    const [{ data: teacherLocs }, { data: availLocs }] = await Promise.all([
      sb.from("teacher_locations").select("teacher_id, location_id"),
      sb.from("teacher_availability").select("teacher_id, location_id").eq("is_active", true),
    ]);

    const teachersAtLocation = (allTeachers ?? []).filter((t: any) => {
      if (!lead.location_id) return true;
      const inTeacherLocs = teacherLocs?.some(
        (tl: any) => tl.teacher_id === t.id && tl.location_id === lead.location_id
      );
      const inAvailLocs = availLocs?.some(
        (al: any) => al.teacher_id === t.id && al.location_id === lead.location_id
      );
      return inTeacherLocs || inAvailLocs;
    });

    // Get availability for these teachers
    const teacherIds = teachersAtLocation.map((t: any) => t.id);
    let availability: any[] = [];
    let availableBlocks: any[] = [];

    if (teacherIds.length > 0) {
      const { data: availData } = await sb
        .from("teacher_availability")
        .select("teacher_id, location_id, day_of_week, start_time, end_time")
        .in("teacher_id", teacherIds)
        .eq("is_active", true);
      availability = availData ?? [];

      // Get available blocks for next 4 weeks
      const today = new Date().toISOString().split("T")[0];
      const fourWeeks = new Date(Date.now() + 28 * 86400000).toISOString().split("T")[0];

      let blockQuery = sb
        .from("schedule_blocks")
        .select("id, teacher_id, block_date, start_time, end_time, status")
        .eq("status", "available")
        .in("teacher_id", teacherIds)
        .gte("block_date", today)
        .lte("block_date", fourWeeks)
        .order("block_date")
        .order("start_time");

      if (lead.location_id) {
        blockQuery = blockQuery.eq("location_id", lead.location_id);
      }

      const { data: blockData } = await blockQuery;
      availableBlocks = blockData ?? [];
    }

    // Get location name
    let locationName = "Unknown";
    if (lead.location_id) {
      const { data: loc } = await sb.from("locations").select("name").eq("id", lead.location_id).single();
      locationName = loc?.name?.replace(" Music Lessons", "") ?? "Unknown";
    }

    // Build teacher summaries for Claude
    const teacherSummaries = teachersAtLocation.map((t: any) => {
      const name = `${t.first_name ?? t.profile?.first_name ?? ""} ${t.last_name ?? t.profile?.last_name ?? ""}`.trim();
      const teacherAvail = availability.filter((a: any) => a.teacher_id === t.id);
      const teacherBlocks = availableBlocks.filter((b: any) => b.teacher_id === t.id);
      const aiCtx = t.ai_context ?? {};

      return {
        id: t.id,
        name,
        instruments: t.instruments ?? [],
        bio: t.bio,
        rate: t.rate_per_block,
        ai_context: aiCtx,
        availability_windows: teacherAvail.map((a: any) => `${a.day_of_week} ${a.start_time}-${a.end_time}`),
        open_slots_count: teacherBlocks.length,
        next_slots: teacherBlocks.slice(0, 5).map((b: any) => ({
          block_id: b.id,
          date: b.block_date,
          start: b.start_time,
          end: b.end_time,
        })),
      };
    });

    const leadSummary = {
      name: `${lead.first_name} ${lead.last_name ?? ""}`.trim(),
      parent: lead.parent_name,
      instrument: lead.instrument,
      age: lead.age ?? lead.age_range,
      experience: lead.experience,
      goals: lead.goals,
      personality_and_learning_style: lead.personality_notes,
      has_instrument: lead.has_instrument,
      preferred_days: lead.preferred_days,
      preferred_times: lead.preferred_times,
      location: locationName,
      is_military: lead.is_military,
      stage: lead.stage,
      director_notes: lead.notes,
    };

    const isLostLead = lead.stage === "lost";

    const prompt = isLostLead
      ? `You are Star, an AI music school coach. A lead was LOST \u2014 they didn't sign up. Your job is to analyze WHY and give the director a specific recovery plan.\n\nLOST LEAD:\n${JSON.stringify(leadSummary, null, 2)}\n\nAVAILABLE TEACHERS AT ${locationName}:\n${JSON.stringify(teacherSummaries, null, 2)}\n\nANALYSIS INSTRUCTIONS:\nYou must figure out the root cause using the "Man, Metal, Money" framework:\n1. THE MAN (Teacher Match): Look at the available teachers. Do ANY of them score above 70% for this student's personality, instrument, and schedule? If not, that's the problem \u2014 tell the director they need to hire or reassign a teacher who fits.\n2. THE METAL (Instrument/Service): Does the school even teach what this student wants? Are there enough slots on the days they need? If scheduling is the blocker, say so specifically.\n3. THE MONEY (Budget): If the director's notes mention cost, price, budget, or "too expensive" \u2014 recommend specific offers: free trial lesson, meet-and-greet visit, buy-3-get-1-free, military discount if applicable, or a reduced intro rate.\n\nAlso check the director's notes for specific reasons (teacher too strict, lost interest, schedule conflict, etc.) and address those directly.\n\nRESPOND WITH EXACTLY THIS JSON FORMAT (no markdown, no code blocks, just raw JSON):\n{\n  "recommendations": [\n    {\n      "teacher_id": "uuid",\n      "teacher_name": "Name",\n      "instruments": ["instrument1"],\n      "match_reason": "IMPORTANT: This must be 2-3 sentences explaining the recovery strategy for THIS specific teacher. Don't just say they match \u2014 explain why this teacher fixes the original problem.",\n      "match_score": 75,\n      "suggested_slots": [\n        {"block_id": "uuid", "date": "YYYY-MM-DD", "start": "HH:MM:SS", "end": "HH:MM:SS"}\n      ]\n    }\n  ],\n  "recovery_analysis": "2-3 paragraphs analyzing exactly why this lead was lost. Be direct and specific. Start with the root cause, then give 3 concrete action items the director should take TODAY."\n}\n\nReturn up to 3 teacher recommendations sorted by match_score. The recovery_analysis field is REQUIRED. Use actual block_ids from teacher data for suggested_slots.`
      : `You are a music school scheduling assistant. Given a lead (prospective student) and available teachers, recommend the top 3 best teacher matches.\n\nLEAD:\n${JSON.stringify(leadSummary, null, 2)}\n\nAVAILABLE TEACHERS AT ${locationName}:\n${JSON.stringify(teacherSummaries, null, 2)}\n\nMATCHING CRITERIA (in priority order):\n1. Teacher must teach the requested instrument (or have empty instruments list, meaning TBD)\n2. Teacher must have available blocks on the lead's preferred days\n3. Preferred time of day should match available slot times\n4. CRITICAL: If the lead has personality/learning style notes, use them heavily. Match introverted students with patient teachers. Match energetic kids with engaging teachers. This is the most important factor for long-term retention.\n5. If lead mentions experience level, match with teachers suited for that level\n6. If lead mentions specific goals, match with teachers whose bio/ai_context aligns\n7. Teachers with more open slots are preferred (more scheduling flexibility)\n\nRESPOND WITH EXACTLY THIS JSON FORMAT (no markdown, no code blocks, just raw JSON):\n{\n  "recommendations": [\n    {\n      "teacher_id": "uuid",\n      "teacher_name": "Name",\n      "instruments": ["instrument1"],\n      "match_reason": "One sentence explaining why this teacher is a great fit for this student",\n      "match_score": 95,\n      "suggested_slots": [\n        {"block_id": "uuid", "date": "YYYY-MM-DD", "start": "HH:MM:SS", "end": "HH:MM:SS"}\n      ]\n    }\n  ]\n}\n\nReturn up to 3 recommendations sorted by match_score descending. Only include teachers who teach the requested instrument (or have empty instruments list). If no teachers match, return empty recommendations array. Use the actual block_ids from the teacher data for suggested_slots (up to 3 per teacher).`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return jsonError("Claude API error: " + errText, "provider_error", 500);
    }

    const claudeData = await claudeRes.json();
    let rawText = claudeData.content?.[0]?.text ?? "{}";

    // Strip markdown code blocks if Claude wrapped the JSON
    rawText = rawText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    let recommendations: any[] = [];
    let recoveryAnalysis: string | null = null;
    try {
      const parsed = JSON.parse(rawText);
      recommendations = parsed.recommendations ?? [];
      recoveryAnalysis = parsed.recovery_analysis ?? null;
    } catch {
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          recommendations = parsed.recommendations ?? [];
          recoveryAnalysis = parsed.recovery_analysis ?? null;
        }
      } catch {
        recommendations = [];
      }
    }

    return new Response(JSON.stringify({
      lead: leadSummary,
      recommendations,
      recovery_analysis: recoveryAnalysis,
      teachers_evaluated: teacherSummaries.length,
      usage: claudeData.usage,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[ai-teacher-match] Unhandled error:", err);
    return jsonError(message, "internal_error", 500);
  }
});
