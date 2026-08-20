import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { PartyEvent } from './types';

const CHANNEL_NAME = 'party-main';

export interface PartyMember {
  userId: string;
  displayName: string;
}

/**
 * The live link between everyone's browsers.
 *
 * Note what is and isn't sent here: only *intent* ("someone fired effect X").
 * No tokens, no light commands, no Spotify credentials. Each browser decides
 * for itself whether to act, and does so against its own account with its own
 * JWT. So a friend pressing a button cannot touch your bulbs unless your
 * browser is connected and logged in to receive the message.
 *
 * `private: true` makes Supabase authorise the channel against the RLS
 * policies on realtime.messages, so an unauthenticated client cannot even
 * subscribe to listen in.
 */
export function joinParty(opts: {
  userId: string;
  displayName: string;
  onEvent: (event: PartyEvent) => void;
  onMembers: (members: PartyMember[]) => void;
  onStatus?: (status: string) => void;
}): { channel: RealtimeChannel; send: (event: PartyEvent) => void; leave: () => void } {
  const channel = supabase.channel(CHANNEL_NAME, {
    config: {
      private: true,
      // self:true means the person who pressed the button also receives the
      // event, so their own lights run through the exact same code path as
      // everybody else's. One path, no special-casing.
      broadcast: { self: true },
      presence: { key: opts.userId },
    },
  });

  channel.on('broadcast', { event: 'party' }, ({ payload }) => {
    opts.onEvent(payload as PartyEvent);
  });

  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState<{ userId: string; displayName: string }>();
    const members: PartyMember[] = Object.values(state)
      .flat()
      .map((p) => ({ userId: p.userId, displayName: p.displayName }));
    opts.onMembers(members);
  });

  channel.subscribe((status) => {
    opts.onStatus?.(status);
    if (status === 'SUBSCRIBED') {
      void channel.track({ userId: opts.userId, displayName: opts.displayName });
    }
  });

  return {
    channel,
    send: (event: PartyEvent) => {
      void channel.send({ type: 'broadcast', event: 'party', payload: event });
    },
    leave: () => {
      void supabase.removeChannel(channel);
    },
  };
}
