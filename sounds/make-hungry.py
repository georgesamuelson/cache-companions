"""Writes hungry.wav: a soft two-note rising chime, about half a second.

Original sound for Cache Companions, synthesized from sine waves by this
script; no samples or third-party audio. Run: python3 make-hungry.py
"""
import math
import struct
import wave

RATE = 22050
NOTES = [(659.25, 0.0, 0.22), (880.0, 0.16, 0.34)]  # E5 then A5: start, length (s)
LENGTH = 0.55
VOLUME = 0.22


def envelope(t, length):
    attack = 0.015
    if t < attack:
        return t / attack
    return math.exp(-5.0 * (t - attack) / length)


frames = []
for i in range(int(RATE * LENGTH)):
    t = i / RATE
    v = 0.0
    for freq, start, length in NOTES:
        if start <= t < start + length * 2:
            local = t - start
            # A sine with a quiet octave on top, for a rounder tone.
            tone = math.sin(2 * math.pi * freq * local) + 0.25 * math.sin(4 * math.pi * freq * local)
            v += tone * envelope(local, length)
    frames.append(struct.pack('<h', int(max(-1.0, min(1.0, v * VOLUME)) * 32767)))

with wave.open('hungry.wav', 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    w.writeframes(b''.join(frames))
