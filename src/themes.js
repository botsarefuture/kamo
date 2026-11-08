export const THEMES = {
  kamo: {
    label: 'Kamo',
    description: 'Lämmin paperi, männynvihreä ja kupari. Rauhallinen yleisteema.',
    swatches: ['#f4efe6', '#1f4b3f', '#b4653a', '#22231f'],
  },
  mielenosoitukset: {
    label: 'Mielenosoitukset.fi',
    description: 'Kansalaisjärjestön sininen: kirkas sininen, oranssi ja vaalea canvasi.',
    swatches: ['#f6f8fb', '#0033a0', '#ff6600', '#172033'],
  },
  xr: {
    label: 'Elokapina / XR',
    description: 'Posteri: lähes musta pohja, neonvihreä ja neonpinkki, Fucxed Caps.',
    swatches: ['#0a0a0a', '#caff11', '#ff1493', '#ffc11e'],
  },
  general: {
    label: 'Yleinen',
    description: 'Selkeä ja neutraali: vaalea pohja, sinivihreä aksentti, tiivis taulukko.',
    swatches: ['#f7f8f6', '#1f6b5c', '#d7e4df', '#1b2422'],
  },
};

export function isTheme(value) {
  return Object.hasOwn(THEMES, value);
}

export function themeOrDefault(value, fallback = 'general') {
  return isTheme(value) ? value : fallback;
}
