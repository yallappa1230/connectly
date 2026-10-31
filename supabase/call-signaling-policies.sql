-- Connectly private WebRTC signaling authorization.
-- Call media is peer-to-peer WebRTC. Supabase Realtime carries only signaling messages.
-- Only authenticated, accepted, unblocked friends can exchange these broadcasts.

DROP POLICY IF EXISTS connectly_call_broadcast_receive ON realtime.messages;
CREATE POLICY connectly_call_broadcast_receive
  ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    extension = 'broadcast'
    AND (
      realtime.topic() = 'user-calls:' || (SELECT auth.uid())::text
      OR (
        split_part(realtime.topic(), ':', 1) = 'call'
        AND (SELECT auth.uid())::text IN (
          split_part(realtime.topic(), ':', 2),
          split_part(realtime.topic(), ':', 3)
        )
        AND EXISTS (
          SELECT 1
          FROM public.friend_requests fr
          WHERE fr.status = 'accepted'
            AND (
              (fr.sender_id::text = split_part(realtime.topic(), ':', 2)
               AND fr.receiver_id::text = split_part(realtime.topic(), ':', 3))
              OR
              (fr.sender_id::text = split_part(realtime.topic(), ':', 3)
               AND fr.receiver_id::text = split_part(realtime.topic(), ':', 2))
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.user_blocks b
          WHERE
            (b.blocker_id::text = split_part(realtime.topic(), ':', 2)
             AND b.blocked_id::text = split_part(realtime.topic(), ':', 3))
            OR
            (b.blocker_id::text = split_part(realtime.topic(), ':', 3)
             AND b.blocked_id::text = split_part(realtime.topic(), ':', 2))
        )
      )
    )
  );

DROP POLICY IF EXISTS connectly_call_broadcast_send ON realtime.messages;
CREATE POLICY connectly_call_broadcast_send
  ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    extension = 'broadcast'
    AND (
      (
        split_part(realtime.topic(), ':', 1) = 'user-calls'
        AND EXISTS (
          SELECT 1
          FROM public.friend_requests fr
          WHERE fr.status = 'accepted'
            AND (
              (fr.sender_id = (SELECT auth.uid())
               AND fr.receiver_id::text = split_part(realtime.topic(), ':', 2))
              OR
              (fr.receiver_id = (SELECT auth.uid())
               AND fr.sender_id::text = split_part(realtime.topic(), ':', 2))
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.user_blocks b
          WHERE
            (b.blocker_id = (SELECT auth.uid())
             AND b.blocked_id::text = split_part(realtime.topic(), ':', 2))
            OR
            (b.blocked_id = (SELECT auth.uid())
             AND b.blocker_id::text = split_part(realtime.topic(), ':', 2))
        )
      )
      OR
      (
        split_part(realtime.topic(), ':', 1) = 'call'
        AND (SELECT auth.uid())::text IN (
          split_part(realtime.topic(), ':', 2),
          split_part(realtime.topic(), ':', 3)
        )
        AND EXISTS (
          SELECT 1
          FROM public.friend_requests fr
          WHERE fr.status = 'accepted'
            AND (
              (fr.sender_id::text = split_part(realtime.topic(), ':', 2)
               AND fr.receiver_id::text = split_part(realtime.topic(), ':', 3))
              OR
              (fr.sender_id::text = split_part(realtime.topic(), ':', 3)
               AND fr.receiver_id::text = split_part(realtime.topic(), ':', 2))
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.user_blocks b
          WHERE
            (b.blocker_id::text = split_part(realtime.topic(), ':', 2)
             AND b.blocked_id::text = split_part(realtime.topic(), ':', 3))
            OR
            (b.blocker_id::text = split_part(realtime.topic(), ':', 3)
             AND b.blocked_id::text = split_part(realtime.topic(), ':', 2))
        )
      )
    )
  );
