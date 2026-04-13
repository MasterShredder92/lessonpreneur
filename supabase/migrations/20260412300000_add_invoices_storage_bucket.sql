-- Create invoices storage bucket for PDF invoice storage
-- PDFs are generated client-side and stored here per-family

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('invoices', 'invoices', true, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- RLS policies for invoice PDFs
CREATE POLICY "Authenticated users can upload invoices"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'invoices');

CREATE POLICY "Authenticated users can read invoices"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'invoices');

CREATE POLICY "Public can read invoices"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'invoices');
