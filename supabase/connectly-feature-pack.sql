-- Connectly feature pack: reactions, private attachments, saved messages,
-- privacy preferences, user reports and one-time QR friend connections.
-- Safe to re-run: tables, policies, indexes and bucket are created idempotently.
-- Existing profiles, messages, conversations and friend history are preserved.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_reactions_read_members ON public.message_reactions;
CREATE POLICY message_reactions_read_members ON public.message_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id AND public.is_conversation_member(m.conversation_id)
  ));
DROP POLICY IF EXISTS message_reactions_add_self ON public.message_reactions;
CREATE POLICY message_reactions_add_self ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id AND public.is_conversation_member(m.conversation_id)
    )
  );
DROP POLICY IF EXISTS message_reactions_remove_self ON public.message_reactions;
CREATE POLICY message_reactions_remove_self ON public.message_reactions
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.message_reactions FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;
CREATE INDEX IF NOT EXISTS message_reactions_message_idx ON public.message_reactions(message_id);

CREATE TABLE IF NOT EXISTS public.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  original_name text NOT NULL CHECK (char_length(original_name) BETWEEN 1 AND 255),
  mime_type text NOT NULL CHECK (char_length(mime_type) BETWEEN 1 AND 120),
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 26214400),
  media_kind text NOT NULL CHECK (media_kind IN ('image','video','audio','document')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_attachments_read_members ON public.message_attachments;
CREATE POLICY message_attachments_read_members ON public.message_attachments
  FOR SELECT TO authenticated USING (public.is_conversation_member(conversation_id));
DROP POLICY IF EXISTS message_attachments_insert_sender ON public.message_attachments;
CREATE POLICY message_attachments_insert_sender ON public.message_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploader_id = (SELECT auth.uid())
    AND public.is_conversation_member(conversation_id)
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
        AND m.conversation_id = message_attachments.conversation_id
        AND m.sender_id = (SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS message_attachments_delete_uploader ON public.message_attachments;
CREATE POLICY message_attachments_delete_uploader ON public.message_attachments
  FOR DELETE TO authenticated USING (uploader_id = (SELECT auth.uid()));
REVOKE ALL ON public.message_attachments FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.message_attachments TO authenticated;
CREATE INDEX IF NOT EXISTS message_attachments_message_idx ON public.message_attachments(message_id);
CREATE INDEX IF NOT EXISTS message_attachments_conversation_idx ON public.message_attachments(conversation_id);

CREATE TABLE IF NOT EXISTS public.saved_messages (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);
ALTER TABLE public.saved_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saved_messages_read_self ON public.saved_messages;
CREATE POLICY saved_messages_read_self ON public.saved_messages
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS saved_messages_insert_self ON public.saved_messages;
CREATE POLICY saved_messages_insert_self ON public.saved_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id AND public.is_conversation_member(m.conversation_id)
    )
  );
DROP POLICY IF EXISTS saved_messages_delete_self ON public.saved_messages;
CREATE POLICY saved_messages_delete_self ON public.saved_messages
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.saved_messages FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.saved_messages TO authenticated;
CREATE INDEX IF NOT EXISTS saved_messages_saved_at_idx ON public.saved_messages(user_id, saved_at DESC);

CREATE TABLE IF NOT EXISTS public.user_privacy_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  allow_friend_requests boolean NOT NULL DEFAULT true,
  discoverable boolean NOT NULL DEFAULT true,
  read_receipts boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_privacy_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_privacy_settings_own_all ON public.user_privacy_settings;
CREATE POLICY user_privacy_settings_own_all ON public.user_privacy_settings
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.user_privacy_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_privacy_settings TO authenticated;

CREATE TABLE IF NOT EXISTS public.user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('spam','harassment','impersonation','inappropriate_content','other')),
  details text CHECK (details IS NULL OR char_length(details) <= 1000),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewed','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reporter_id <> reported_user_id)
);
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_reports_submit_self ON public.user_reports;
CREATE POLICY user_reports_submit_self ON public.user_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = (SELECT auth.uid()) AND status = 'submitted');
DROP POLICY IF EXISTS user_reports_read_reporter ON public.user_reports;
CREATE POLICY user_reports_read_reporter ON public.user_reports
  FOR SELECT TO authenticated USING (reporter_id = (SELECT auth.uid()));
REVOKE ALL ON public.user_reports FROM anon, authenticated;
GRANT INSERT, SELECT ON public.user_reports TO authenticated;
CREATE INDEX IF NOT EXISTS user_reports_created_idx ON public.user_reports(created_at DESC);

CREATE TABLE IF NOT EXISTS public.friend_qr_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
ALTER TABLE public.friend_qr_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS friend_qr_tokens_owner_select ON public.friend_qr_tokens;
CREATE POLICY friend_qr_tokens_owner_select ON public.friend_qr_tokens
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS friend_qr_tokens_owner_insert ON public.friend_qr_tokens;
CREATE POLICY friend_qr_tokens_owner_insert ON public.friend_qr_tokens
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS friend_qr_tokens_owner_revoke ON public.friend_qr_tokens;
CREATE POLICY friend_qr_tokens_owner_revoke ON public.friend_qr_tokens
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.friend_qr_tokens FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.friend_qr_tokens TO authenticated;
CREATE INDEX IF NOT EXISTS friend_qr_tokens_owner_expiry_idx ON public.friend_qr_tokens(user_id, expires_at DESC);

CREATE OR REPLACE FUNCTION private.profile_is_discoverable(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE((SELECT s.discoverable FROM public.user_privacy_settings s WHERE s.user_id = p_user_id), true);
$$;
CREATE OR REPLACE FUNCTION private.profile_allows_friend_requests(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE((SELECT s.allow_friend_requests FROM public.user_privacy_settings s WHERE s.user_id = p_user_id), true);
$$;
REVOKE ALL ON FUNCTION private.profile_is_discoverable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.profile_allows_friend_requests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.profile_is_discoverable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.profile_allows_friend_requests(uuid) TO authenticated;

DROP POLICY IF EXISTS "Read profiles" ON public.profiles;
CREATE POLICY "Read profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR private.profile_is_discoverable(id)
    OR EXISTS (
      SELECT 1 FROM public.friend_requests fr
      WHERE fr.status = 'accepted'
        AND (
          (fr.sender_id = (SELECT auth.uid()) AND fr.receiver_id = profiles.id)
          OR (fr.receiver_id = (SELECT auth.uid()) AND fr.sender_id = profiles.id)
        )
    )
  );

DROP POLICY IF EXISTS friend_requests_sender_insert ON public.friend_requests;
CREATE POLICY friend_requests_sender_insert ON public.friend_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND receiver_id <> (SELECT auth.uid())
    AND status = 'pending'
    AND private.profile_allows_friend_requests(receiver_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_id = (SELECT auth.uid()) AND b.blocked_id = receiver_id)
         OR (b.blocker_id = receiver_id AND b.blocked_id = (SELECT auth.uid()))
    )
  );

CREATE OR REPLACE FUNCTION public.redeem_friend_qr_token(p_token_hash text)
RETURNS TABLE(friend_id uuid, username text, full_name text, avatar_url text, request_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_owner uuid;
  v_existing_status text;
  v_request_status text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Sign in before connecting with a QR code.'; END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'This QR code is invalid.'; END IF;
  SELECT q.user_id INTO v_owner FROM public.friend_qr_tokens q
  WHERE q.token_hash = lower(p_token_hash)
    AND q.expires_at > now() AND q.redeemed_at IS NULL AND q.revoked_at IS NULL
  FOR UPDATE;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'This QR code has expired or has already been used.'; END IF;
  IF v_owner = (SELECT auth.uid()) THEN RAISE EXCEPTION 'You cannot scan your own friend QR code.'; END IF;
  IF NOT private.profile_is_discoverable(v_owner) OR NOT private.profile_allows_friend_requests(v_owner) THEN
    RAISE EXCEPTION 'This person is not accepting new friend connections.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id = (SELECT auth.uid()) AND b.blocked_id = v_owner)
       OR (b.blocker_id = v_owner AND b.blocked_id = (SELECT auth.uid()))
  ) THEN RAISE EXCEPTION 'This friend connection is unavailable.'; END IF;

  SELECT f.status INTO v_existing_status FROM public.friend_requests f
  WHERE f.status IN ('pending','accepted')
    AND LEAST(f.sender_id, f.receiver_id) = LEAST((SELECT auth.uid()), v_owner)
    AND GREATEST(f.sender_id, f.receiver_id) = GREATEST((SELECT auth.uid()), v_owner)
  LIMIT 1;

  IF v_existing_status IS NULL THEN
    INSERT INTO public.friend_requests(sender_id, receiver_id, status)
    VALUES ((SELECT auth.uid()), v_owner, 'pending');
    v_request_status := 'pending';
  ELSIF v_existing_status = 'accepted' THEN
    v_request_status := 'accepted';
  ELSE
    SELECT CASE WHEN f.sender_id = (SELECT auth.uid()) THEN 'pending' ELSE 'request_received' END
    INTO v_request_status
    FROM public.friend_requests f
    WHERE f.status = 'pending'
      AND LEAST(f.sender_id, f.receiver_id) = LEAST((SELECT auth.uid()), v_owner)
      AND GREATEST(f.sender_id, f.receiver_id) = GREATEST((SELECT auth.uid()), v_owner)
    LIMIT 1;
  END IF;

  UPDATE public.friend_qr_tokens SET redeemed_at = now() WHERE token_hash = lower(p_token_hash);
  RETURN QUERY SELECT p.id, p.username, p.full_name, p.avatar_url, v_request_status
    FROM public.profiles p WHERE p.id = v_owner;
END;
$function$;
REVOKE ALL ON FUNCTION public.redeem_friend_qr_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_friend_qr_token(text) TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES (
  'chat-media','chat-media',false,26214400,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/aac','application/pdf','text/plain','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS connectly_chat_media_read_member ON storage.objects;
CREATE POLICY connectly_chat_media_read_member ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND EXISTS (SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id::text = (storage.foldername(name))[1]
        AND cm.user_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS connectly_chat_media_upload_member ON storage.objects;
CREATE POLICY connectly_chat_media_upload_member ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
    AND EXISTS (SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id::text = (storage.foldername(name))[1]
        AND cm.user_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS connectly_chat_media_delete_owner ON storage.objects;
CREATE POLICY connectly_chat_media_delete_owner ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
    AND EXISTS (SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id::text = (storage.foldername(name))[1]
        AND cm.user_id = (SELECT auth.uid()))
  );

NOTIFY pgrst, 'reload schema';
COMMIT;
