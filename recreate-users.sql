INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, role, aud,
  email_change, phone_change, phone_change_token,
  email_change_token_new, email_change_token_current,
  recovery_token, reauthentication_token
) VALUES
  (
    '00000000-0000-0000-0001-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'owner@test.com',
    crypt('testpassword123', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '{"provider":"email","providers":["email"]}',
    '{}', false, 'authenticated', 'authenticated',
    '', '', '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0001-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'admin@test.com',
    crypt('testpassword123', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '{"provider":"email","providers":["email"]}',
    '{}', false, 'authenticated', 'authenticated',
    '', '', '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0001-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'teacher@test.com',
    crypt('testpassword123', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '{"provider":"email","providers":["email"]}',
    '{}', false, 'authenticated', 'authenticated',
    '', '', '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0001-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'parent@test.com',
    crypt('testpassword123', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '{"provider":"email","providers":["email"]}',
    '{}', false, 'authenticated', 'authenticated',
    '', '', '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0001-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'student@test.com',
    crypt('testpassword123', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '{"provider":"email","providers":["email"]}',
    '{}', false, 'authenticated', 'authenticated',
    '', '', '', '', '', '', ''
  );
