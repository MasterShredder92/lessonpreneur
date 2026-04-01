INSERT INTO student_files (tenant_id, student_id, file_name, file_url, file_size, uploaded_by, uploaded_by_role) 
SELECT '00000000-0000-0000-0000-000000000001', id, 'Beginner Piano - Week 1-4 Lesson Plan.pdf', 'https://example.com/lesson-plan-w1-4.pdf', 245000, 'Sarah Cornell', 'teacher'
FROM students WHERE first_name = 'Lily' AND last_name = 'Chen';
INSERT INTO student_files (tenant_id, student_id, file_name, file_url, file_size, uploaded_by, uploaded_by_role) 
SELECT '00000000-0000-0000-0000-000000000001', id, 'Let It Go - Simplified Piano Sheet.pdf', 'https://example.com/let-it-go-easy.pdf', 180000, 'Sarah Cornell', 'teacher'
FROM students WHERE first_name = 'Lily' AND last_name = 'Chen';
INSERT INTO student_files (tenant_id, student_id, file_name, file_url, file_size, uploaded_by, uploaded_by_role) 
SELECT '00000000-0000-0000-0000-000000000001', id, 'C Major Scale Practice Sheet.pdf', 'https://example.com/c-major-practice.pdf', 95000, 'Sarah Cornell', 'teacher'
FROM students WHERE first_name = 'Lily' AND last_name = 'Chen';
INSERT INTO student_files (tenant_id, student_id, file_name, file_url, file_size, uploaded_by, uploaded_by_role) 
SELECT '00000000-0000-0000-0000-000000000001', id, 'Progress Notes - January 2026.pdf', 'https://example.com/progress-jan.pdf', 120000, 'Zach', 'admin'
FROM students WHERE first_name = 'Lily' AND last_name = 'Chen';
INSERT INTO student_files (tenant_id, student_id, file_name, file_url, file_size, uploaded_by, uploaded_by_role) 
SELECT '00000000-0000-0000-0000-000000000001', id, 'Twinkle Twinkle - Both Hands Practice.pdf', 'https://example.com/twinkle-both-hands.pdf', 110000, 'Sarah Cornell', 'teacher'
FROM students WHERE first_name = 'Lily' AND last_name = 'Chen';
