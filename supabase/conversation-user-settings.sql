-- Per-user preferences for a conversation: favourites, mute state and read cursor.
-- Message bodies remain unchanged; this migration does NOT enable E2EE.
CREATE TABLE IF NOT EXISTS public.conversation_user_settings (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_favorite boolean NOT NULL DEFAULT false,
  is_muted boolean NOT NULL DEFAULT false,
  last_read_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_user_settings_pkey PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE public.conversation_user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_settings_select_own ON public.conversation_user_settings;
CREATE POLICY conversation_settings_select_own
  ON public.conversation_user_settings FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS conversation_settings_insert_own ON public.conversation_user_settings;
CREATE POLICY conversation_settings_insert_own
  ON public.conversation_user_settings FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS conversation_settings_update_own ON public.conversation_user_settings;
CREATE POLICY conversation_settings_update_own
  ON public.conversation_user_settings FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS conversation_settings_delete_own ON public.conversation_user_settings;
CREATE POLICY conversation_settings_delete_own
  ON public.conversation_user_settings FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_user_settings TO authenticated;
CREATE INDEX IF NOT EXISTS conversation_user_settings_user_favorite_idx
  ON public.conversation_user_settings(user_id, is_favorite);
