/**
 * Web Audio Procedural Synthesizer for Scotland Rail
 * Generates gentle ambient train clatter and arrival chimes
 */

class RailAudioEngine {
	private ctx: AudioContext | null = null;
	private clatterOsc: OscillatorNode | null = null;
	private clatterGain: GainNode | null = null;
	private isRunning = false;

	private init() {
		if (this.ctx) return;
		const AudioContextClass =
			window.AudioContext ||
			(window as unknown as { webkitAudioContext: typeof AudioContext })
				.webkitAudioContext;
		if (AudioContextClass) {
			this.ctx = new AudioContextClass();
		}
	}

	public unlockAudio() {
		this.init();
		if (this.ctx && this.ctx.state === "suspended") {
			this.ctx.resume();
		}
	}

	public startAmbient(activeTrainCount: number) {
		if (this.isRunning) return;
		this.init();
		if (!this.ctx) return;

		if (this.ctx.state === "suspended") {
			this.ctx.resume();
		}

		// Ambient low rhythmic rumble
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		const filter = this.ctx.createBiquadFilter();

		osc.type = "sine";
		osc.frequency.setValueAtTime(45, this.ctx.currentTime);

		filter.type = "lowpass";
		filter.frequency.setValueAtTime(120, this.ctx.currentTime);

		const volume = Math.min(0.08, 0.02 + activeTrainCount * 0.002);
		gain.gain.setValueAtTime(volume, this.ctx.currentTime);

		osc.connect(filter);
		filter.connect(gain);
		gain.connect(this.ctx.destination);

		osc.start();
		this.clatterOsc = osc;
		this.clatterGain = gain;
		this.isRunning = true;
	}

	public updateIntensity(activeTrainCount: number) {
		if (!this.ctx || !this.clatterGain || !this.isRunning) return;
		const volume = Math.min(0.08, 0.02 + activeTrainCount * 0.002);
		this.clatterGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.5);
	}

	public playArrivalChime() {
		this.init();
		if (!this.ctx) return;
		if (this.ctx.state === "suspended") {
			this.ctx.resume();
		}

		// British Rail 2-tone melodic chime (Bb4 -> Eb5)
		const now = this.ctx.currentTime;
		const osc1 = this.ctx.createOscillator();
		const osc2 = this.ctx.createOscillator();
		const gain = this.ctx.createGain();

		osc1.type = "sine";
		osc1.frequency.setValueAtTime(466.16, now); // Bb4
		osc2.type = "sine";
		osc2.frequency.setValueAtTime(622.25, now + 0.18); // Eb5

		gain.gain.setValueAtTime(0.06, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

		osc1.connect(gain);
		osc2.connect(gain);
		gain.connect(this.ctx.destination);

		osc1.start(now);
		osc1.stop(now + 0.18);
		osc2.start(now + 0.18);
		osc2.stop(now + 0.8);
	}

	public stop() {
		if (!this.isRunning) return;
		try {
			this.clatterOsc?.stop();
			this.clatterOsc?.disconnect();
			this.clatterGain?.disconnect();
		} catch {
			// ignore cleanup error
		}
		this.clatterOsc = null;
		this.clatterGain = null;
		this.isRunning = false;
	}
}

export const railAudio = new RailAudioEngine();
