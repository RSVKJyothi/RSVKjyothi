(function(){
  class PitchDetectorYIN {
    constructor(sampleRate, threshold){
      this.sampleRate = sampleRate;
      this.threshold = typeof threshold === 'number' ? threshold : 0.1;
      this.bufferSize = 2048; // tradeoff latency/accuracy
      this.probability = 0;
      this._yinBuffer = new Float32Array(this.bufferSize / 2);
    }

    getPitch(timeDomainBuffer){
      const buffer = timeDomainBuffer;
      const size = Math.min(buffer.length, this.bufferSize);
      if (size < 512) return null;

      const yin = this._yinBuffer;
      yin.fill(0);

      // Step 1: Difference function d(tau)
      for (let tau = 1; tau < yin.length; tau++) {
        let sum = 0;
        for (let i = 0; i < size - tau; i++) {
          const delta = buffer[i] - buffer[i + tau];
          sum += delta * delta;
        }
        yin[tau] = sum;
      }

      // Step 2: Cumulative mean normalized difference function
      let runningSum = 0;
      yin[0] = 1;
      for (let tau = 1; tau < yin.length; tau++) {
        runningSum += yin[tau];
        yin[tau] = yin[tau] * tau / runningSum;
      }

      // Step 3: Absolute threshold
      let tauEstimate = -1;
      for (let tau = 2; tau < yin.length; tau++) {
        if (yin[tau] < this.threshold) {
          while (tau + 1 < yin.length && yin[tau + 1] < yin[tau]) {
            tau++;
          }
          tauEstimate = tau;
          break;
        }
      }

      if (tauEstimate === -1) {
        // No pitch found
        this.probability = 0;
        return null;
      }

      // Step 4: Parabolic interpolation for better tau
      const tau = tauEstimate;
      const x0 = tau < 1 ? tau : tau - 1;
      const x2 = tau + 1 < yin.length ? tau + 1 : tau;
      const s0 = yin[x0];
      const s1 = yin[tau];
      const s2 = yin[x2];
      const betterTau = tau + (x2 - x0) * (s2 - s0) / (2 * (2 * s1 - s2 - s0));

      const frequency = this.sampleRate / betterTau;
      this.probability = 1 - yin[tauEstimate];
      if (!isFinite(frequency) || frequency <= 0) return null;
      return frequency;
    }
  }

  window.PitchDetectorYIN = PitchDetectorYIN;
})();
