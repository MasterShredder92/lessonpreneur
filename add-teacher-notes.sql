ALTER TABLE students ADD COLUMN IF NOT EXISTS teacher_notes TEXT;
UPDATE students SET teacher_notes = '[3/22/2026, 4:30:00 PM] Sarah Cornell: Lily nailed the first 8 bars of Let It Go today! She was so proud of herself. We high-fived and she asked if we could learn the chorus next week. Keeping momentum going.
[3/15/2026, 4:15:00 PM] Sarah Cornell: Worked on hand positioning for C scale. Lily is left-handed so we are mirroring everything. She gets confused switching between hands. I made a color-coded finger chart for her to take home.
[3/8/2026, 4:45:00 PM] Sarah Cornell: Tough lesson today. Lily got frustrated when she could not get the rhythm right on Twinkle Twinkle with both hands. I switched to a clapping game and she recovered. Need to go slower with coordination exercises.
[3/1/2026, 4:00:00 PM] Sarah Cornell: First lesson! Lily was very shy for the first 10 minutes. We played a name-that-tune game and she opened up. She loves Frozen and wants to learn Let It Go. Great first session.
[2/20/2026, 4:30:00 PM] Sarah Cornell: Assessment lesson. Lily has zero piano experience but great ear. She can match pitch when singing. Left-handed. Recommend starting with single-hand melodies before introducing both hands.' WHERE first_name = 'Lily' AND last_name = 'Chen';
UPDATE students SET notes = '[3/25/2026, 10:00:00 AM] Andrea: Wei called to ask about summer schedule. Lily will be traveling in July but wants to keep August lessons. Made a note to follow up in June.
[3/20/2026, 2:15:00 PM] Zach: Mom called to say Lily has been practicing every day this week. She is really excited about the Frozen song we started. Keep going with that.
[3/15/2026, 10:30:00 AM] Andrea: Moved Lily from Tuesday to Wednesday per mom request. New time works better with school pickup.
[3/10/2026, 4:00:00 PM] Zach: Lily had a rough lesson today. She got frustrated with the C scale and started crying. Sarah handled it well — switched to a fun song and she recovered. May need to slow down on theory for now.
[3/5/2026, 9:15:00 AM] Andrea: Sent welcome packet to Wei Chen. Confirmed Wednesday 4pm slot with Sarah at Bellevue.
[3/1/2026, 9:00:00 AM] Alicia: First contact with Wei Chen. Very nice, wants Lily to love music first, theory second. Signed up for 1x/week piano at Bellevue with Sarah.' WHERE first_name = 'Lily' AND last_name = 'Chen';
