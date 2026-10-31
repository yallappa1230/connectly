-- Connectly Phase 1 database setup.
-- Run only against the Connectly Supabase project after reviewing.
-- Existing profile and chat rows are preserved.

BEGIN;

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.friendships WITH (security_invoker = true) AS
SELECT LEAST(sender_id, receiver_id) AS user_low,
       GREATEST(sender_id, receiver_id) AS user_high,
       created_at
FROM public.friend_requests
WHERE status = 'accepted';

-- One active request or friendship per pair, independent of request direction.
CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_one_active_pair
  ON public.friend_requests (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id))
  WHERE status IN ('pending', 'accepted');

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_ci_key
  ON public.profiles (lower(username));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_username_format_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_username_format_check
      CHECK (username ~ '^[a-z0-9_.]{3,40}$');
  END IF;
END $$;

DROP POLICY IF EXISTS friend_requests_participants_read ON public.friend_requests;
DROP POLICY IF EXISTS friend_requests_sender_insert ON public.friend_requests;
DROP POLICY IF EXISTS friend_requests_receiver_response ON public.friend_requests;
DROP POLICY IF EXISTS friend_requests_sender_cancel ON public.friend_requests;
DROP POLICY IF EXISTS friend_requests_end_friendship ON public.friend_requests;
DROP POLICY IF EXISTS user_blocks_participant_read ON public.user_blocks;
DROP POLICY IF EXISTS user_blocks_owner_insert ON public.user_blocks;
DROP POLICY IF EXISTS user_blocks_owner_delete ON public.user_blocks;
DROP POLICY IF EXISTS profiles_hide_blocked_users ON public.profiles;

CREATE POLICY friend_requests_participants_read
  ON public.friend_requests FOR SELECT TO authenticated
  USING (sender_id = (SELECT auth.uid()) OR receiver_id = (SELECT auth.uid()));

CREATE POLICY friend_requests_sender_insert
  ON public.friend_requests FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND receiver_id <> (SELECT auth.uid())
    AND status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_id = (SELECT auth.uid()) AND b.blocked_id = receiver_id)
         OR (b.blocker_id = receiver_id AND b.blocked_id = (SELECT auth.uid()))
    )
  );

CREATE POLICY friend_requests_receiver_response
  ON public.friend_requests FOR UPDATE TO authenticated
  USING (receiver_id = (SELECT auth.uid()) AND status = 'pending')
  WITH CHECK (
    receiver_id = (SELECT auth.uid())
    AND status IN ('accepted', 'declined')
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_id = (SELECT auth.uid()) AND b.blocked_id = sender_id)
         OR (b.blocker_id = sender_id AND b.blocked_id = (SELECT auth.uid()))
    )
  );

CREATE POLICY friend_requests_sender_cancel
  ON public.friend_requests FOR UPDATE TO authenticated
  USING (sender_id = (SELECT auth.uid()) AND status = 'pending')
  WITH CHECK (sender_id = (SELECT auth.uid()) AND status = 'cancelled');

CREATE POLICY friend_requests_end_friendship
  ON public.friend_requests FOR UPDATE TO authenticated
  USING (
    status = 'accepted'
    AND (sender_id = (SELECT auth.uid()) OR receiver_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    status = 'cancelled'
    AND (sender_id = (SELECT auth.uid()) OR receiver_id = (SELECT auth.uid()))
  );

CREATE POLICY user_blocks_participant_read
  ON public.user_blocks FOR SELECT TO authenticated
  USING (blocker_id = (SELECT auth.uid()) OR blocked_id = (SELECT auth.uid()));

CREATE POLICY user_blocks_owner_insert
  ON public.user_blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id = (SELECT auth.uid()) AND blocked_id <> (SELECT auth.uid()));

CREATE POLICY user_blocks_owner_delete
  ON public.user_blocks FOR DELETE TO authenticated
  USING (blocker_id = (SELECT auth.uid()));

-- A user blocked by another account cannot discover or read that account's profile.
CREATE POLICY profiles_hide_blocked_users
  ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE b.blocker_id = id
        AND b.blocked_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON TABLE public.friend_requests FROM anon, authenticated;
GRANT SELECT ON TABLE public.friend_requests TO authenticated;
GRANT INSERT (sender_id, receiver_id) ON TABLE public.friend_requests TO authenticated;
GRANT UPDATE (status) ON TABLE public.friend_requests TO authenticated;

REVOKE ALL ON TABLE public.user_blocks FROM anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.user_blocks TO authenticated;
GRANT INSERT (blocker_id, blocked_id) ON TABLE public.user_blocks TO authenticated;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.friendships TO authenticated;

REVOKE INSERT, DELETE, UPDATE ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (username, full_name, avatar_url) ON TABLE public.profiles TO authenticated;

-- Restrict message edits to content; identity and chat destination remain immutable.
REVOKE INSERT, UPDATE ON TABLE public.messages FROM anon, authenticated;
GRANT INSERT (conversation_id, sender_id, content) ON TABLE public.messages TO authenticated;
GRANT UPDATE (content) ON TABLE public.messages TO authenticated;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_conversation_member(cid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = cid AND cm.user_id = (SELECT auth.uid())
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_conversation_creator(cid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = cid AND c.created_by = (SELECT auth.uid())
  );
$function$;

REVOKE ALL ON FUNCTION private.is_conversation_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_conversation_creator(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_conversation_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_conversation_creator(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Members read conversations" ON public.conversations;
CREATE POLICY "Members read conversations" ON public.conversations
  FOR SELECT TO authenticated USING (private.is_conversation_member(id));

DROP POLICY IF EXISTS "Members read membership" ON public.conversation_members;
CREATE POLICY "Members read membership" ON public.conversation_members
  FOR SELECT TO authenticated USING (private.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS "Only creator adds members" ON public.conversation_members;
CREATE POLICY "Only creator adds members" ON public.conversation_members
  FOR INSERT TO authenticated WITH CHECK (private.is_conversation_creator(conversation_id));

DROP POLICY IF EXISTS "Leave or remove membership" ON public.conversation_members;
CREATE POLICY "Leave or remove membership" ON public.conversation_members
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR private.is_conversation_creator(conversation_id));

-- Repoint all message-membership policies before disabling public helper execution.
DROP POLICY IF EXISTS "Members read messages" ON public.messages;
CREATE POLICY "Members read messages" ON public.messages
  FOR SELECT TO authenticated
  USING (private.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS "Members send own messages" ON public.messages;
CREATE POLICY "Members send own messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND private.is_conversation_member(conversation_id)
  );

DROP POLICY IF EXISTS "Update own messages" ON public.messages;
CREATE POLICY "Update own messages" ON public.messages
  FOR UPDATE TO authenticated
  USING (sender_id = (SELECT auth.uid()))
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND private.is_conversation_member(conversation_id)
  );

REVOKE ALL ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_conversation_creator(uuid) FROM PUBLIC, anon, authenticated;

-- Preserve trigger attachment while removing trigger functions from the exposed schema.
DO $$
BEGIN
  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.handle_new_user() SET SCHEMA private';
  END IF;
  IF to_regprocedure('public.add_conversation_creator()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.add_conversation_creator() SET SCHEMA private';
  END IF;
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.rls_auto_enable() SET SCHEMA private';
  END IF;
END $$;

REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.add_conversation_creator() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.rls_auto_enable() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS conversations_created_by_idx ON public.conversations(created_by);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON public.messages(sender_id);

COMMIT;
