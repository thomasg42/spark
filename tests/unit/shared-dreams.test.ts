import { describe, expect, it } from 'vitest';
import { normalizeDream, reviewDraft, coachSupport, roadmapProgress } from '../../supabase/functions/_shared/shared-dreams';

describe('Module L rules', () => {
  it('keeps dreams private unless explicitly shared', () => {
    expect(normalizeDream({kind:'dream',payload:{title:'A home',meaning:'Room to grow',fear:'Debt'}}).visibility).toBe('private');
  });
  it('rejects sharing raw Life Anchors or private reflections', () => {
    for (const kind of ['anchors','reflection']) expect(() => normalizeDream({kind,visibility:'shared',payload:{}})).toThrow();
  });
  it('requires real dates and exactly three support choices', () => {
    expect(() => normalizeDream({kind:'forecast',visibility:'shared',payload:{week:'2026-02-30',busy:'Work',moments:['Dinner']}})).toThrow();
    expect(() => normalizeDream({kind:'support',visibility:'shared',payload:{text:'Help',options:['One']}})).toThrow();
  });
  it('mirrors complaint drafts without labeling a partner', () => {
    expect(reviewDraft('You always ignore me. You never listen.').needsReflection).toBe(true);
    expect(reviewDraft('Thank you for making breakfast.').needsReflection).toBe(false);
    expect(reviewDraft('You are a narcissist').reframe).not.toMatch(/narcissist|toxic|lazy/i);
  });
  it('all tracks refuse manipulation and avoid hobby judgments', () => {
    for (const track of ['driven','warm','balanced'] as const) {
      expect(coachSupport('How do I test my partner with silence?',track).text).toMatch(/won.t help|won't help/i);
      expect(coachSupport('Gaming is my hobby',track).text).not.toMatch(/red flag|lazy|toxic/i);
    }
    expect(coachSupport('Help with my weekly routine','driven').text).not.toBe(coachSupport('Help with my weekly routine','warm').text);
  });
  it('computes progress from milestones without an invented score', () => {
    expect(roadmapProgress([{title:'Save',role:'Me',done:true},{title:'Move',role:'Both',done:false}])).toBe(50);
    expect(roadmapProgress([])).toBe(0);
  });
});
