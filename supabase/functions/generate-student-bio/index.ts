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

    const { data: student } = await sb.from("students").select("*").eq("id", student_id).single();
    if (!student) {
      return new Response(JSON.stringify({ error: "Student not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get teacher name
    let teacherName = "Unknown";
    if (student.teacher_id) {
      const { data: teacher } = await sb.from("teachers").select("profile:profiles!teachers_profile_id_fkey(first_name, last_name)").eq("id", student.teacher_id).single();
      if (teacher) teacherName = `${teacher.profile?.first_name} ${teacher.profile?.last_name}`;
    }

    // Get uploaded documents
    const { data: files } = await sb.from("student_files").select("file_name").eq("student_id", student_id).order("created_at", { ascending: false });

    const prompt = `You are Ziro, an AI music school coach. Write a student bio — a warm, personality-driven snapshot that helps anyone at the studio understand who this student is.

RULES:
- NO phone numbers, emails, addresses, payment info, financial details
- NO director notes or internal business information
- Focus on personality, learning style, musical journey, and what makes this student unique
- Write in third person, conversational tone
- Keep it to 3-5 sentences

STUDENT: ${student.first_name} ${student.last_name}
INSTRUMENT: ${student.instrument}
TEACHER: ${teacherName}
AGE: ${student.age ?? "Unknown"}

TEACHER NOTES (from their teacher):
${student.teacher_notes ?? "No teacher notes yet."}

LESSON MATERIALS ON FILE:
${files && files.length > 0 ? files.map((f: any) => `- ${f.file_name}`).join("\n") : "None yet."}

${student.bio ? `CURRENT BIO (update and improve this):\n${student.bio}` : "No existing bio — create one from scratch."}

Write the bio now. Just the bio text, no headers or labels.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const claudeData = await claudeRes.json();

    if (!claudeRes.ok) {
      console.error("Claude API error:", JSON.stringify(claudeData));
      return new Response(JSON.stringify({ error: claudeData.error?.message ?? "Claude API error" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bio = claudeData.content?.[0]?.text;
    if (!bio) {
      return new Response(JSON.stringify({ error: "No content returned from AI" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save the bio to the student record
    await sb.from("students").update({ bio }).eq("id", student_id);

    return new Response(JSON.stringify({ bio }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
