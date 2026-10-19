/* Noten der Klickgeräusche: [MIDI-Note, Beginn (s), Länge (s), Wellenform]. Abgespielt in ui/sfx.js. */
export const SFX = {
  /* Münze: zwei schnelle Töne aufwärts (H5 → E6) */
  coin: [[83, 0, 0.07], [88, 0.07, 0.22]],
  /* Fanfare: C-Dur-Dreiklang hoch, Schlusston länger */
  fanfare: [[72, 0, 0.1], [76, 0.1, 0.1], [79, 0.2, 0.1], [84, 0.3, 0.35], [60, 0.3, 0.35, "triangle"]],
};
