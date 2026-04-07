// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { computeLazyAvatarXp } from './lazy-avatar-xp';

describe('computeLazyAvatarXp', () => {
  it('rewards gratitude on completed task', () => {
    expect(
      computeLazyAvatarXp({
        sourceType: 'task',
        completed: true,
        text: 'Shipped the fix — grateful it is done',
        notificationIntensity: 50,
      }),
    ).toBeGreaterThanOrEqual(32);
  });

  it('rewards priority language while planning', () => {
    expect(
      computeLazyAvatarXp({
        sourceType: 'task',
        completed: false,
        text: 'Not sure what to tackle first; feeling overwhelmed by the backlog and need to decide which project matters.',
        notificationIntensity: 50,
      }),
    ).toBeGreaterThanOrEqual(15);
  });

  it('bonuses low notification intensity when xp already earned', () => {
    const low = computeLazyAvatarXp({
      sourceType: 'feedback',
      completed: true,
      text: 'Thanks for the calm pace today',
      notificationIntensity: 30,
    });
    const high = computeLazyAvatarXp({
      sourceType: 'feedback',
      completed: true,
      text: 'Thanks for the calm pace today',
      notificationIntensity: 90,
    });
    expect(low).toBeGreaterThan(high);
  });

  it('rewards rest language (kick back) on completed task', () => {
    expect(
      computeLazyAvatarXp({
        sourceType: 'task',
        completed: true,
        text: 'Wrapped the sprint — time to kick back',
        notificationIntensity: 50,
      }),
    ).toBe(26);
  });

  it('rewards rest on post source', () => {
    expect(
      computeLazyAvatarXp({
        sourceType: 'post',
        completed: false,
        text: 'Taking a moment to chill after the thread',
        notificationIntensity: 50,
      }),
    ).toBe(24);
  });
});
