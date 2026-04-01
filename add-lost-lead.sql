INSERT INTO leads (tenant_id, location_id, first_name, last_name, parent_name, email, phone, instrument, stage, source, how_heard, age, goals, personality_notes, experience, has_instrument, preferred_days, notes)
SELECT 
  '00000000-0000-0000-0000-000000000001',
  id,
  'Tyler', 'Nguyen', 'Kim Nguyen',
  'kim.nguyen@outlook.com', '(402) 555-3341',
  'piano', 'lost', 'Google', 'Google Search',
  '8', 'Tyler wanted to learn piano to play songs from his favorite video games. He is shy and quiet but very creative.', 
  'Tyler is introverted and takes time to warm up. He learns best with gentle, patient instruction. Hates being put on the spot. Responds well to praise and gamified learning.',
  '1-2 years', 'Yes',
  ARRAY['Monday 3:30p-9p', 'Wednesdays 3:30p-9p'],
  'Mom called to cancel. Said Tyler was losing interest and didn''t want to practice anymore. She mentioned the teacher felt too strict and Tyler was starting to dread lessons. Offered a different teacher but she said they''d think about it and never called back.'
FROM locations WHERE name = 'Gretna Music Lessons' LIMIT 1;
