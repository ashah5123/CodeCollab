from supabase import create_client

from app.config import settings

# Service role client for server-side operations (bypasses RLS when needed)
supabase_admin = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key,
)
