/*
    TakeFive - Website Time Tracker & Blocker
    Copyright (C) 2026  Xue Tianhao (GitHub: @lumiaxth)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

let audioCtx = null;

function getContext() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// pattern: sequence of [frequency(Hz), startOffset(s), duration(s)]
const PATTERNS = {
  focus: [[880, 0, 0.12], [1174.7, 0.16, 0.16]], // focus ended: rising two-tone
  break: [[1174.7, 0, 0.12], [880, 0.16, 0.16]], // break ended: falling two-tone
  complete: [[880, 0, 0.1], [1108.7, 0.14, 0.1], [1318.5, 0.28, 0.2]] // all rounds done: triple beep
};

function playPattern(name) {
  const pattern = PATTERNS[name] || PATTERNS.focus;
  const ctx = getContext();
  const t0 = ctx.currentTime + 0.02;
  for (const [freq, offset, dur] of pattern) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + offset);
    gain.gain.exponentialRampToValueAtTime(0.22, t0 + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0 + offset);
    osc.stop(t0 + offset + dur + 0.02);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'PLAY_SOUND') {
    try {
      playPattern(msg.pattern);
    } catch (e) {
      /* audio may be blocked */
    }
  }
});
