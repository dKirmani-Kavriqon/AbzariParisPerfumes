/*
 * Fragrance-note content shared by the 3D story and product pages: what each note smells like,
 * and the round ingredient photos in /public/notes. Which notes a product has comes from the
 * catalogue (database); this file only describes the notes themselves.
 */

/** What each note smells like, in plain words. */
export const noteDescription: Record<string, string> = {
  Woody: 'Dry, smooth wood, like a freshly planed board of cedar.',
  Balsamic: 'Warm tree resin, sweet and a little sticky, glowing like honey.',
  Powdery: 'A soft, cosmetic finish that blurs the edges, like face powder on skin.',
  Musky: 'Clean, skin-like warmth that sits close and lasts.',
  'Warm Spicy': 'Cinnamon bark, clove and star anise, warm rather than hot.',
  Tobacco: 'Cured leaf, sweet and faintly smoky, like an opened tin.',
  Oud: 'Agarwood. Deep, smoky and a little leathery: the heart of Rawah.',
  Amber: 'Golden resin warmth, round and sweet, that holds everything together.',
  Metallic: 'A cool mineral edge that keeps the base from feeling heavy.',
}

export const noteImage = (note: string) => `/notes/${note.toLowerCase().replace(/\s+/g, '-')}.webp`
export const hasNoteImage = (note: string) =>
  ['woody', 'balsamic', 'powdery', 'musky', 'warm spicy', 'tobacco', 'oud', 'amber', 'metallic'].includes(note.toLowerCase())
