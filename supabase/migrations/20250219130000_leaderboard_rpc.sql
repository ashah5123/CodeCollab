-- Leaderboard RPC: returns top 10 by submissions, comments, and reactions received.
-- Reads auth.users for email (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  by_submissions jsonb;
  by_comments jsonb;
  by_reactions jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object('user_id', t.user_id, 'user_email', COALESCE(u.email, ''), 'count', t.c)
    ORDER BY t.c DESC
  ) INTO by_submissions
  FROM (
    SELECT user_id, count(*)::int AS c
    FROM public.submissions
    GROUP BY user_id
    ORDER BY c DESC
    LIMIT 10
  ) t
  LEFT JOIN auth.users u ON u.id = t.user_id;

  SELECT jsonb_agg(
    jsonb_build_object('user_id', t.author_id, 'user_email', COALESCE(u.email, ''), 'count', t.c)
    ORDER BY t.c DESC
  ) INTO by_comments
  FROM (
    SELECT author_id, count(*)::int AS c
    FROM public.comments
    GROUP BY author_id
    ORDER BY c DESC
    LIMIT 10
  ) t
  LEFT JOIN auth.users u ON u.id = t.author_id;

  SELECT jsonb_agg(
    jsonb_build_object('user_id', t.user_id, 'user_email', COALESCE(u.email, ''), 'count', t.c)
    ORDER BY t.c DESC
  ) INTO by_reactions
  FROM (
    SELECT s.user_id, count(*)::int AS c
    FROM public.submission_reactions r
    JOIN public.submissions s ON s.id = r.submission_id
    GROUP BY s.user_id
    ORDER BY c DESC
    LIMIT 10
  ) t
  LEFT JOIN auth.users u ON u.id = t.user_id;

  RETURN jsonb_build_object(
    'by_submissions', COALESCE(by_submissions, '[]'::jsonb),
    'by_comments', COALESCE(by_comments, '[]'::jsonb),
    'by_reactions_received', COALESCE(by_reactions, '[]'::jsonb)
  );
END;
$$;
