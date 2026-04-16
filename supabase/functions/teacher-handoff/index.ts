import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { student_id } = await req.json();
    if (!student_id) {
      return new Response(JSON.stringify({ error: "student_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get student data
    const { data: student } = await sb.from("students").select("*").eq("id", student_id).single();
    if (!student) {
      return new Response(JSON.stringify({ error: "Student not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get location name
    const { data: loc } = await sb.from("locations").select("name").eq("id", student.location_id).single();

    // Get teacher name
    let teacherName = "Unknown";
    if (student.teacher_id) {
      const { data: teacher } = await sb.from("teachers").select("profile:profiles!teachers_profile_id_fkey(first_name, last_name)").eq("id", student.teacher_id).single();
      if (teacher) teacherName = `${teacher.profile?.first_name} ${teacher.profile?.last_name}`;
    }

    // Get uploaded documents
    const { data: files } = await sb.from("student_files").select("file_name, uploaded_by, uploaded_by_role, created_at").eq("student_id", student_id).order("created_at", { ascending: false });

    // Get family/parent name
    const { data: family } = await sb.from("families").select("primary_contact_name, name").eq("id", student.family_id).single();
    const parentName = family?.primary_contact_name ?? family?.name ?? "Unknown";

    const prompt = `You are Ziro, an AI music school coach. Generate a simple TEACHER HANDOFF REPORT for a new or substitute teacher.

RULES:
- NO phone numbers, emails, addresses, payment info, or financial details
- NO director notes or internal business notes
- Keep it simple and focused on what the teacher needs to teach great lessons

STUDENT INFO:
- Student: ${student.first_name} ${student.last_name}
- Parent: ${parentName}
- Instrument: ${student.instrument}
- Previous Teacher: ${teacherName}

TEACHER NOTES (from the previous teacher):
${student.teacher_notes ?? "No teacher notes available."}

UPLOADED LESSON MATERIALS:
${files && files.length > 0 ? files.map((f: any) => `- ${f.file_name}`).join("\n") : "No materials uploaded yet."}

GENERATE A SHORT REPORT WITH THESE SECTIONS:

1. **Student Overview** — 2-3 sentences about the student based on teacher notes.

2. **Where They Are** — Current progress, what they've been working on, what the previous teacher was building toward.

3. **Materials** — Quick overview of the uploaded lesson plans and documents.

4. **Suggested First Lesson** — A simple plan for the new teacher's first lesson.

Keep it conversational and brief — like one teacher texting another before a lesson swap.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const claudeData = await claudeRes.json();

    if (!claudeRes.ok) {
      console.error("Claude API error:", JSON.stringify(claudeData));
      return new Response(JSON.stringify({ error: claudeData.error?.message ?? "Claude API error", details: claudeData }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const report = claudeData.content?.[0]?.text;
    if (!report) {
      console.error("No content in Claude response:", JSON.stringify(claudeData));
      return new Response(JSON.stringify({ error: "No content returned from AI" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      student_name: `${student.first_name} ${student.last_name}`,
      instrument: student.instrument,
      location: loc?.name?.replace(" Music Lessons", ""),
      previous_teacher: teacherName,
      report,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
