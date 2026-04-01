SELECT t.id, p.first_name, p.last_name FROM teachers t JOIN profiles p ON t.profile_id = p.id WHERE p.first_name IN ('Sam', 'Sarah') LIMIT 5;
