-- Private bucket for receipt / bill / statement images (proof attachments).
-- Files are served only through short-lived signed URLs created by the server.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;
