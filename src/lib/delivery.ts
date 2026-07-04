/**
 * WECAN Services — Tarif Économique (Tarif à domicile, départ Alger)
 * Source: WECAN price list provided by user
 */
export const DELIVERY_FEES: Record<string, number> = {
  // ── Zone 1 ──────────────────────────────
  "Alger":        450,
  "Blida":        500,
  "Boumerdès":    500,
  "Tipaza":       500,

  // ── Zone 2 (650 DA) ──────────────────────
  "Chlef":              650,
  "Oum El Bouaghi":     650,
  "Batna":              650,
  "Béjaïa":            650,
  "Bouira":             650,
  "Tlemcen":            650,
  "Tiaret":             650,
  "Tizi Ouzou":         650,
  "Jijel":              650,
  "Sétif":             650,
  "Saïda":             650,
  "Skikda":             650,
  "Sidi Bel Abbès":    650,
  "Annaba":             650,
  "Guelma":             650,
  "Constantine":        650,
  "Médéa":             650,
  "Mostaganem":         650,
  "M'Sila":            650,
  "Mascara":            650,
  "Oran":               650,
  "Bordj Bou Arréridj":650,
  "El Tarf":            650,
  "Tissemsilt":         650,
  "Khenchela":          650,
  "Souk Ahras":         650,
  "Mila":               650,
  "Aïn Defla":         650,
  "Aïn Témouchent":    650,
  "Relizane":           650,

  // ── Zone 3 (800 DA) ──────────────────────
  "Laghouat":       800,
  "Biskra":         800,
  "Tébessa":       800,
  "Djelfa":         800,
  "Ouargla":        800,
  "El Oued":        800,
  "Ghardaïa":      800,
  "Ouled Djellal":  800,
  "Touggourt":      800,
  "El M'Ghair":    800,
  "El Meniaa":      800,

  // ── Zone 4 (1600 DA) ─────────────────────
  "Adrar":              1600,
  "Béchar":            1600,
  "El Bayadh":          1600,
  "Naâma":             1600,
  "Timimoun":           1600,
  "Bordj Badji Mokhtar":1600,
  "Béni Abbès":        1600,

  // ── Zone 5 (1600 DA) ─────────────────────
  "Tamanrasset":  1600,
  "Illizi":       1600,
  "Tindouf":      1600,
  "In Salah":     1600,
  "In Guezzam":   1600,
  "Djanet":       1600,
};

export function getDeliveryFee(wilaya: string): number {
  return DELIVERY_FEES[wilaya] ?? 650; // default to zone 2 if unknown
}
