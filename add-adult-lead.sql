INSERT INTO leads (tenant_id, location_id, first_name, last_name, email, phone, instrument, stage, source, how_heard, age, goals)
SELECT 
  '00000000-0000-0000-0000-000000000001',
  id,
  'Marcus', 'Rivera',
  'marcus.rivera@gmail.com', '(402) 555-8821',
  'guitar', 'inquiry', 'website', 'Google Search',
  '34', 'Always wanted to learn guitar. Looking for evening sessions after work.'
FROM locations WHERE name = 'Omaha Music Lessons' LIMIT 1;
