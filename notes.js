(function(){
  const TWELVE_ROOT_OF_TWO = Math.pow(2, 1/12);

  function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
  }

  function frequencyToMidi(frequency, a4Hz){
    if (!frequency || frequency <= 0) return null;
    const a4 = a4Hz || 440;
    const midi = 69 + 12 * Math.log2(frequency / a4);
    return midi;
  }

  function midiToFrequency(midi, a4Hz){
    const a4 = a4Hz || 440;
    return a4 * Math.pow(2, (midi - 69) / 12);
  }

  function centsBetween(freqA, freqB){
    if (!freqA || !freqB || freqA <= 0 || freqB <= 0) return null;
    return 1200 * Math.log2(freqA / freqB);
  }

  const WESTERN_SOLFEGE = ["Do","Di","Re","Ri","Mi","Fa","Fi","So","Si","La","Li","Ti"]; // chromatic
  const WESTERN_LETTERS = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

  function westernNoteName(frequency, a4Hz){
    const midi = frequencyToMidi(frequency, a4Hz);
    if (midi == null) return { name: "—", octave: null };
    const rounded = Math.round(midi);
    const idx = ((rounded % 12) + 12) % 12;
    const octave = Math.floor(rounded / 12) - 1;
    return { name: `${WESTERN_LETTERS[idx]}${octave}`, solfege: WESTERN_SOLFEGE[idx], octave, midi: rounded };
  }

  // Indian mapping relative to tonic (Sa)
  const INDIAN_SWARAS = ["Sa","Re","Re^","Ga","Ga^","Ma","Ma^","Pa","Dha","Dha^","Ni","Ni^"];

  function indianNoteName(frequency, tonicHz){
    if (!tonicHz || !frequency || frequency <= 0) return { name: "—", octave: null };
    const semitonesFromSa = 12 * Math.log2(frequency / tonicHz);
    const nearest = Math.round(semitonesFromSa);
    const idx = ((nearest % 12) + 12) % 12;
    const octave = Math.floor((nearest) / 12) + 4; // arbitrary base
    return { name: `${INDIAN_SWARAS[idx]}`, octave, semitone: nearest };
  }

  function snapToEqualTemperament(frequency, a4Hz){
    const midi = frequencyToMidi(frequency, a4Hz);
    if (midi == null) return null;
    const rounded = Math.round(midi);
    return midiToFrequency(rounded, a4Hz);
  }

  window.Notes = {
    frequencyToMidi,
    midiToFrequency,
    centsBetween,
    westernNoteName,
    indianNoteName,
    snapToEqualTemperament,
    WESTERN_LETTERS,
  };
})();
