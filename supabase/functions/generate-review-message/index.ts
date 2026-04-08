const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured", fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      parent_first_name,
      students,
      location_name,
      google_review_url,
    } = await req.json();

    if (!parent_first_name || !students?.length || !location_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields", fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const studentDetails = students
      .map((s: any) => {
        const months = Math.round(
          (Date.now() - new Date(s.created_at).getTime()) /
            (30 * 24 * 60 * 60 * 1000)
        );
        return `${s.name} — ${s.instrument}${months > 0 ? `, enrolled ${months} months` : ""}`;
      })
      .join("\n");

    const prompt = `You are writing a warm, personalized Google review request SMS message for a music school.

Context:
- Parent's first name: ${parent_first_name}
- Location: ${location_name}
- Students:
${studentDetails}
- Google Review URL: ${google_review_url}

Rules:
- Write a single SMS-length message (under 300 characters if possible, max 480)
- Be warm, genuine, and personal — reference the student(s) by name
- Reference their specific instrument(s)
- Mention something about their growth or progress
- End with the Google review URL on its own line
- Do NOT include quotation marks around the message
- Do NOT include a subject line or greeting like "Dear"
- Start with "Hey ${parent_first_name}!" or similar casual opener
- Use "session" not "lesson" when referring to their time at the studio
- Keep it feeling like a real text from someone who knows the family

Write the message now:`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Anthropic API error:", errText);
      return new Response(
        JSON.stringify({ error: "AI generation failed", fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const message =
      data.content?.[0]?.text?.trim() ?? "";

    if (!message) {
      return new Response(
        JSON.stringify({ error: "Empty response from AI", fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-review-message error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", fallback: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
