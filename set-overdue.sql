UPDATE students SET overdue_amount = 180 WHERE first_name = 'Jake' AND last_name = 'Johnson';
UPDATE students SET overdue_amount = 90 WHERE first_name = 'Ella' AND last_name = 'Thompson';
UPDATE students SET overdue_amount = 0 WHERE first_name IN ('Lily', 'Olivia');
