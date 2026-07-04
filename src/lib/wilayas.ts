/* Wilaya list for Algeria */
export const WILAYAS = [
  "Adrar","Chlef","Laghouat","Oum El Bouaghi","Batna","Béjaïa","Biskra",
  "Béchar","Blida","Bouira","Tamanrasset","Tébessa","Tlemcen","Tiaret",
  "Tizi Ouzou","Alger","Djelfa","Jijel","Sétif","Saïda","Skikda",
  "Sidi Bel Abbès","Annaba","Guelma","Constantine","Médéa","Mostaganem",
  "M'Sila","Mascara","Ouargla","Oran","El Bayadh","Illizi","Bordj Bou Arréridj",
  "Boumerdès","El Tarf","Tindouf","Tissemsilt","El Oued","Khenchela","Souk Ahras",
  "Tipaza","Mila","Aïn Defla","Naâma","Aïn Témouchent","Ghardaïa","Relizane",
  "Timimoun","Bordj Badji Mokhtar","Ouled Djellal","Béni Abbès","In Salah",
  "In Guezzam","Touggourt","Djanet","El M'Ghair","El Meniaa",
];

/**
 * Default delivery rates (DZD) based on WeCan Services Tarif Économique (tarif à domicile).
 * Zone 1 (Alger + immediate suburbs): 450–500
 * Zone 2 (North/centre wilayas): 650
 * Zone 3 (Pre-Saharan wilayas): 800
 * Zone 4/5 (Deep south): 1600
 */
export const DEFAULT_DELIVERY_RATES: Record<string, number> = {
  default: 650,
  // Zone 1 — Algérois
  "Alger": 450,
  "Blida": 500,
  "Boumerdès": 500,
  "Tipaza": 500,
  // Zone 2 — North / Centre
  "Chlef": 650,
  "Oum El Bouaghi": 650,
  "Batna": 650,
  "Béjaïa": 650,
  "Bouira": 650,
  "Tlemcen": 650,
  "Tiaret": 650,
  "Tizi Ouzou": 650,
  "Jijel": 650,
  "Sétif": 650,
  "Saïda": 650,
  "Skikda": 650,
  "Sidi Bel Abbès": 650,
  "Annaba": 650,
  "Guelma": 650,
  "Constantine": 650,
  "Médéa": 650,
  "Mostaganem": 650,
  "M'Sila": 650,
  "Mascara": 650,
  "Oran": 650,
  "El Bayadh": 650,
  "Bordj Bou Arréridj": 650,
  "El Tarf": 650,
  "Tissemsilt": 650,
  "Khenchela": 650,
  "Souk Ahras": 650,
  "Mila": 650,
  "Aïn Defla": 650,
  "Aïn Témouchent": 650,
  "Relizane": 650,
  // Zone 3 — Pre-Saharan
  "Laghouat": 800,
  "Biskra": 800,
  "Tébessa": 800,
  "Djelfa": 800,
  "Ouargla": 800,
  "El Oued": 800,
  "Ghardaïa": 800,
  "Ouled Djellal": 800,
  "Touggourt": 800,
  "El M'Ghair": 800,
  "El Meniaa": 800,
  // Zone 4/5 — Deep south (Sahara)
  "Adrar": 1600,
  "Béchar": 1600,
  "Tamanrasset": 1600,
  "Illizi": 1600,
  "Tindouf": 1600,
  "Naâma": 1600,
  "Timimoun": 1600,
  "Bordj Badji Mokhtar": 1600,
  "Béni Abbès": 1600,
  "In Salah": 1600,
  "In Guezzam": 1600,
  "Djanet": 1600,
};
