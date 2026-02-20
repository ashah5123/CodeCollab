-- Add invite_code to organisations for existing databases
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE DEFAULT substring(md5(random()::text), 1, 8);
