"use client";
/** Buddy's voice settings: talk back, hands-free, which voice, and how lively. */
import { Button, Card } from "@/components/ui";
import { isAppleMobile } from "@/lib/buddy/voice/audio-session";
import type { BuddyVoice } from "./use-buddy-voice";

export const VOICE_SAMPLE = "Hey you! It's your Spark Buddy. I'm so ready to help. What's on your mind?";

export function VoicePanel({ voice, premium, onClose }: { voice: BuddyVoice; premium: boolean; onClose(): void }) {
  const { prefs, setPrefs } = voice;
  return (
    <Card className="mb-4" aria-labelledby="voice-settings-title">
      <div className="flex items-start justify-between gap-3">
        <h2 id="voice-settings-title" className="text-lg font-bold text-ink">
          Buddy's voice
        </h2>
        <button type="button" className="min-h-11 text-sm font-semibold text-accent-text underline" onClick={onClose}>
          Done
        </button>
      </div>

      <label className="mt-2 flex min-h-11 items-center gap-3 text-ink">
        <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={prefs.speak} onChange={(e) => setPrefs({ speak: e.target.checked })} />
        Buddy talks back out loud
      </label>

      <label className="flex min-h-11 items-center gap-3 text-ink">
        <input
          type="checkbox"
          className="h-5 w-5 accent-[var(--accent)]"
          checked={prefs.handsFree}
          disabled={!voice.canListen}
          onChange={(e) => setPrefs({ handsFree: e.target.checked })}
        />
        Hands-free: after Buddy talks, it listens for you again
      </label>
      {!voice.canListen ? <p className="text-sm text-muted">This browser can't listen, so tap Send after typing. Buddy can still talk back.</p> : null}

      {premium && !prefs.onDeviceOnly ? (
        <p className="mt-2 rounded-2xl bg-accent-soft px-3 py-2 text-sm text-ink">Using Buddy's studio voice. If it can't be reached, Buddy switches to this device's voice below.</p>
      ) : null}

      <div className="mt-3">
        <label htmlFor="buddy-voice" className="mb-1 block text-sm font-semibold text-ink">
          {premium && !prefs.onDeviceOnly ? "Backup voice on this device" : "Voice"}
        </label>
        <select
          id="buddy-voice"
          className="block min-h-12 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-ink"
          value={prefs.voiceURI ?? ""}
          onChange={(e) => setPrefs({ voiceURI: e.target.value || null })}
        >
          <option value="">Buddy's pick (the liveliest on this device)</option>
          {voice.voices.filter((v) => !prefs.onDeviceOnly || v.localService).map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} ({v.lang})
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        <label htmlFor="buddy-energy" className="mb-1 flex justify-between text-sm font-semibold text-ink">
          <span>Energy</span>
          <span className="font-normal text-muted">{prefs.energy <= 0.95 ? "Calm" : prefs.energy >= 1.2 ? "Super lively" : "Lively"}</span>
        </label>
        <input
          id="buddy-energy"
          type="range"
          min={0.8}
          max={1.3}
          step={0.05}
          value={prefs.energy}
          onChange={(e) => setPrefs({ energy: Number(e.target.value) })}
          className="w-full accent-[var(--accent)]"
          aria-valuetext={prefs.energy <= 0.95 ? "Calm" : prefs.energy >= 1.2 ? "Super lively" : "Lively"}
        />
        <div className="flex justify-between text-xs text-muted" aria-hidden>
          <span>Calm</span>
          <span>Lively</span>
        </div>
      </div>

      <label className="mt-4 flex min-h-11 items-center gap-3 text-ink">
        <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={prefs.onDeviceOnly} onChange={(e) => setPrefs({ onDeviceOnly: e.target.checked, voiceURI: null })} />
        Use only voices that stay on this device
      </label>
      <p className="text-sm text-muted">
        Talking and listening use your browser's own speech features. Some browsers, like Chrome and Edge, turn speech into text and text into speech on Google's or Microsoft's servers. Their liveliest voices work that way. Turn this on to keep Buddy's voice on your device (it may sound less lively). This also turns off the studio voice. Spark itself never records or stores your voice.
      </p>
      {voice.noLocalVoice ? (
        <p className="mt-2 text-sm font-semibold text-ink">This browser has no voice that stays on the device, so Buddy will stay quiet while this is on. Buddy's replies still show as text.</p>
      ) : null}
      {premium && !prefs.onDeviceOnly ? (
        <p className="mt-2 text-sm text-muted">The studio voice is made by ElevenLabs, a voice service. It receives only the words Buddy says out loud, which can include things you told Buddy and what your partner chose to share. It never receives your voice.</p>
      ) : null}

      <Button
        variant="secondary"
        className="mt-4"
        disabled={!voice.canSpeak}
        onClick={() => {
          voice.unlock();
          voice.hush();
          void voice.say(VOICE_SAMPLE, { force: true });
        }}
      >
        ▶ Hear Buddy
      </Button>
      {!voice.canSpeak ? <p className="mt-2 text-sm text-muted">This browser can't speak out loud. Buddy's replies still show as text.</p> : null}
      {isAppleMobile() ? (
        <p className="mt-2 text-sm text-muted">
          On iPhone: Buddy can't be heard while the silent switch is on, and listening needs Siri &amp; Dictation turned on (Settings › Siri). If you added Spark to your Home Screen, open it in Safari to talk.
        </p>
      ) : null}
    </Card>
  );
}
