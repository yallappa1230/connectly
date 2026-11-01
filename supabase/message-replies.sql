-- Message replies. The foreign key uses ON DELETE SET NULL so deleting
-- the referenced message does not delete replies that quote it.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_reply_to_message_id_fkey'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_reply_to_message_id_fkey
      FOREIGN KEY (reply_to_message_id)
      REFERENCES public.messages(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS messages_reply_to_message_id_idx
  ON public.messages(reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;
