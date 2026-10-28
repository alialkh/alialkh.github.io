// Acoustic tissue table. Every anatomy entry names one of these.
// Values are textbook soft-tissue figures (Szabo, Diagnostic Ultrasound Imaging; Goss et al. 1978; Duck, Physical Properties of Tissues),
// rounded, and tuned so that the displayed grey levels fall where a clinician expects them. Educational, not metrology.
//
//   z      acoustic impedance in MRayl. The echo at a boundary comes from the contrast of z across it.
//   alpha  attenuation in dB per cm per MHz, one way.
//   mu     backscatter power in dB relative to liver parenchyma. Sets the brightness of speckle inside the tissue.
//   het    standard deviation in dB of a slow (a few mm) variation of mu, so organs are not perfectly even.
//   septa  0 to 1, thin bright connective tissue sheets (fat lobules, muscle fascicles).
//   gas    0 to 1, the tissue holds air. Gas reflects nearly everything and drives the lung and bowel artefacts.
//   color  the teaching colour for the anatomy map.

export const TISSUES = [
  { key: 'air', name: 'Air', z: 0.0004, alpha: 40, mu: -90, het: 0, septa: 0, gas: 1, color: '#05070a' },
  { key: 'gel', name: 'Coupling gel', z: 1.5, alpha: 0.02, mu: -90, het: 0, septa: 0, gas: 0, color: '#0b1a22' },
  { key: 'skin', name: 'Skin', z: 1.65, alpha: 1.0, mu: 5, het: 1, septa: 0, gas: 0, color: '#e0a98c' },
  { key: 'fat_sc', name: 'Subcutaneous fat', z: 1.38, alpha: 0.6, mu: -12, het: 2, septa: 1, gas: 0, color: '#f2d27a' },
  { key: 'muscle', name: 'Skeletal muscle', z: 1.7, alpha: 1.0, mu: -9, het: 2, septa: 0.6, gas: 0, color: '#c0504d' },
  { key: 'fascia', name: 'Fascia and peritoneum', z: 1.7, alpha: 1.0, mu: 8, het: 0, septa: 0, gas: 0, color: '#d9d2c3' },
  { key: 'fat_visc', name: 'Visceral and retroperitoneal fat', z: 1.4, alpha: 0.6, mu: 4, het: 3, septa: 0.4, gas: 0, color: '#f6e3a1' },
  { key: 'liver', name: 'Liver', z: 1.65, alpha: 0.55, mu: 0, het: 1.2, septa: 0, gas: 0, color: '#8c4a2f' },
  { key: 'spleen', name: 'Spleen', z: 1.64, alpha: 0.55, mu: 1.5, het: 0.8, septa: 0, gas: 0, color: '#7a2f5a' },
  { key: 'kidney_cortex', name: 'Renal cortex', z: 1.64, alpha: 0.6, mu: -6, het: 1, septa: 0, gas: 0, color: '#b85c38' },
  { key: 'kidney_medulla', name: 'Renal pyramid', z: 1.62, alpha: 0.5, mu: -16, het: 1, septa: 0, gas: 0, color: '#8a3b2a' },
  { key: 'kidney_sinus', name: 'Renal sinus', z: 1.45, alpha: 0.8, mu: 8, het: 4, septa: 0.5, gas: 0, color: '#e8c27c' },
  { key: 'pancreas', name: 'Pancreas', z: 1.62, alpha: 0.6, mu: 2, het: 3, septa: 0, gas: 0, color: '#e5b36a' },
  { key: 'gb_wall', name: 'Gallbladder wall', z: 1.65, alpha: 0.6, mu: 3, het: 0, septa: 0, gas: 0, color: '#6c8f3a' },
  { key: 'bile', name: 'Bile', z: 1.5, alpha: 0.02, mu: -70, het: 0, septa: 0, gas: 0, color: '#4f9d5d' },
  { key: 'urine', name: 'Urine', z: 1.5, alpha: 0.01, mu: -70, het: 0, septa: 0, gas: 0, color: '#6fc3e8' },
  { key: 'fluid', name: 'Free fluid', z: 1.5, alpha: 0.01, mu: -70, het: 0, septa: 0, gas: 0, color: '#2f7fd6' },
  { key: 'clot', name: 'Clotted blood', z: 1.58, alpha: 0.4, mu: -8, het: 5, septa: 0.2, gas: 0, color: '#8e1b2a' },
  { key: 'blood', name: 'Blood', z: 1.61, alpha: 0.18, mu: -34, het: 0, septa: 0, gas: 0, color: '#d62839' },
  { key: 'vessel_wall', name: 'Vessel wall', z: 1.68, alpha: 0.8, mu: 8, het: 0, septa: 0, gas: 0, color: '#e86a6a' },
  { key: 'myocardium', name: 'Myocardium', z: 1.67, alpha: 0.52, mu: -5, het: 1.5, septa: 0.3, gas: 0, color: '#a8324a' },
  { key: 'valve', name: 'Valve leaflet', z: 1.72, alpha: 0.9, mu: 6, het: 0, septa: 0, gas: 0, color: '#f4a261' },
  { key: 'pericardium', name: 'Pericardium', z: 1.72, alpha: 1.0, mu: 12, het: 0, septa: 0, gas: 0, color: '#f1e3c4' },
  { key: 'lung', name: 'Aerated lung', z: 0.05, alpha: 40, mu: -6, het: 0, septa: 0, gas: 1, color: '#9ec9e8' },
  { key: 'pleural_air', name: 'Air in the pleural space', z: 0.0004, alpha: 40, mu: -90, het: 0, septa: 0, gas: 1, color: '#bfe8ff' },
  { key: 'collapsed_lung', name: 'Compressed lung', z: 1.6, alpha: 0.7, mu: -3, het: 2, septa: 0, gas: 0, color: '#7e9fb8' },
  { key: 'gas', name: 'Gas', z: 0.0004, alpha: 40, mu: -90, het: 0, septa: 0, gas: 1, color: '#d9ecf7' },
  { key: 'bone', name: 'Bone', z: 7.0, alpha: 18, mu: 6, het: 0, septa: 0, gas: 0, color: '#f5f1e6' },
  { key: 'cartilage', name: 'Costal cartilage', z: 1.8, alpha: 1.5, mu: -14, het: 1, septa: 0, gas: 0, color: '#bcd7e0' },
  { key: 'disc', name: 'Intervertebral disc', z: 1.6, alpha: 0.8, mu: -12, het: 1, septa: 0, gas: 0, color: '#9fb8c9' },
  { key: 'bowel_wall', name: 'Bowel wall', z: 1.6, alpha: 0.7, mu: -4, het: 1, septa: 0, gas: 0, color: '#d98c8c' },
  { key: 'bowel_content', name: 'Bowel contents', z: 1.5, alpha: 0.4, mu: 4, het: 6, septa: 0.2, gas: 0, color: '#c9a66b' },
  { key: 'prostate', name: 'Prostate', z: 1.62, alpha: 0.6, mu: 0, het: 2, septa: 0, gas: 0, color: '#b9718f' },
  { key: 'stone', name: 'Stone', z: 3.5, alpha: 10, mu: 10, het: 0, septa: 0, gas: 0, color: '#fff3b0' },
  { key: 'thyroid', name: 'Soft tissue of the neck', z: 1.64, alpha: 0.6, mu: 2, het: 1, septa: 0, gas: 0, color: '#c98a7a' },
];

export const TISSUE_INDEX = Object.fromEntries(TISSUES.map((t, i) => [t.key, i]));

// ln z, alpha, mu, het, septa, gas for each tissue, flat, in table order. The sim packs this into uniforms.
export function tissueUniform() {
  const out = new Float32Array(TISSUES.length * 8);
  TISSUES.forEach((t, i) => {
    out.set([Math.log(t.z), t.alpha, t.mu, t.het, t.septa, t.gas, 0, 0], i * 8);
  });
  return out;
}

// Reflection coefficient of intensity at a boundary between two impedances.
export const reflection = (z1, z2) => ((z2 - z1) / (z2 + z1)) ** 2;

// Speed of sound is taken as constant. 1540 m/s is the machine's own assumption, so range errors from refraction are not modelled.
export const SOUND_SPEED = 1540;
