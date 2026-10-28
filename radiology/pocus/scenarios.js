// Teaching cases. Each one is a patient: the parameters that change the anatomy (see DEFAULTS in patient.js), the vital signs that set the
// heart and breathing rate, a short clinical story and what the exam should find. Ground truth lives here and nowhere in the UI,
// so test mode can hide it.

export const SCENARIOS = [
  {
    id: 'normal', title: 'Normal adult', level: 'Start here',
    story: 'A healthy volunteer, lying supine. Every standard window is normal, so this is the case to learn what normal looks like before you look for disease.',
    params: {}, vitals: { hr: 68, rr: 14 },
    findings: [],
    teach: ['The liver and the cortex of the right kidney are close in brightness, with the liver a little brighter.', 'The IVC is wide and narrows when the patient sniffs.', 'The lung shows a bright pleural line that slides with breathing, and repeating A-lines below it.'],
  },
  {
    id: 'blunt-ruq', title: 'Blunt trauma, hypotensive', level: 'FAST',
    story: 'A 34 year old driver, restrained, hit from the right by another car. Pain in the right upper abdomen. Heart rate 112, blood pressure 92 over 58.',
    params: { fluidRUQ: 14, ascites: 0 }, vitals: { hr: 112, rr: 20 },
    findings: ['ruq-fluid'],
    teach: ['Free fluid in the hepatorenal space (Morison’s pouch) is the most sensitive place for intraperitoneal blood in a supine patient.', 'Fluid is black. Behind it the image is brighter, because the sound has lost less on its way.', 'Fluid between the liver and the diaphragm, or along the liver tip, means a larger bleed.'],
  },
  {
    id: 'blunt-luq', title: 'Blunt trauma, fall from a ladder', level: 'FAST',
    story: 'A 58 year old fell about three metres onto his left side. Left flank and shoulder tip pain. Heart rate 104, blood pressure 108 over 70.',
    params: { fluidLUQ: 16 }, vitals: { hr: 104, rr: 18 },
    findings: ['luq-fluid'],
    teach: ['Blood collects around the spleen first, between it and the diaphragm, because the subphrenic space is the lowest part of the left upper quadrant when supine.', 'The spleen is smaller and further back than the liver, so the probe has to sit higher and further back than on the right.'],
  },
  {
    id: 'blunt-pelvis', title: 'Blunt trauma, pelvic pain', level: 'FAST',
    story: 'A 27 year old cyclist hit by a van. Lower abdominal and pelvic pain, heart rate 118, blood pressure 90 over 55.',
    params: { fluidPelvis: 30, bladder: 320 }, vitals: { hr: 118, rr: 20 },
    findings: ['pelvis-fluid'],
    teach: ['The bladder is the acoustic window to the pelvis, so scan it before the patient passes urine.', 'Free fluid collects behind and above the bladder and its edges become pointed where the fluid wraps round it.', 'A black bladder with a black stripe behind it is not necessarily one structure. Rock the probe through it.'],
  },
  {
    id: 'tamponade', title: 'Stab wound to the chest', level: 'FAST · RUSH',
    story: 'A 22 year old stabbed in the left chest. Anxious, pale, neck veins distended. Heart rate 126, blood pressure 80 over 62, pulse weak.',
    params: { pericardial: 20, ivcDiam: 25, ivcCollapse: 0.05, ef: 0.62 }, vitals: { hr: 126, rr: 24 },
    findings: ['pericardial-fluid', 'plethoric-ivc'],
    teach: ['A pericardial effusion is a black rim between the bright pericardium and the heart. In a supine patient it collects behind the left ventricle first.', 'The IVC is wide and does not narrow with a sniff: the right heart cannot fill.', 'Do not mistake the fat pad in front of the heart, or a pleural effusion behind it, for a pericardial effusion.'],
  },
  {
    id: 'hemothorax', title: 'Rib fractures after a fall', level: 'eFAST',
    story: 'A 63 year old fell down the stairs. Right chest pain and breathlessness. Heart rate 98, saturation 92 percent.',
    params: { pleuralR: 45 }, vitals: { hr: 98, rr: 22 },
    findings: ['pleural-effusion-right'],
    teach: ['Above the diaphragm there should be no black space. Fluid above it lets you see the spine continue upward (the spine sign).', 'The lung floats in the fluid and flaps with breathing.', 'The mirror image of the liver above the diaphragm disappears when there is fluid in the chest.'],
  },
  {
    id: 'pneumothorax', title: 'Breathless after a fall', level: 'eFAST',
    story: 'A 41 year old thin man fell from a bicycle. Sharp right chest pain, short of breath. Heart rate 106, saturation 91 percent.',
    params: { ptxR: 16 }, vitals: { hr: 106, rr: 24 },
    findings: ['pneumothorax-right'],
    teach: ['In a pneumothorax the pleural line does not slide: the shimmer is gone.', 'M-mode shows horizontal lines all the way down, the barcode sign, instead of the seashore.', 'Look for the lung point, where sliding comes back at the edge of the air.'],
  },
  {
    id: 'pulmonary-edema', title: 'Acutely breathless, orthopnoea', level: 'RUSH · lung',
    story: 'A 72 year old with a history of heart attack. Breathless lying flat for two days, wet cough. Heart rate 108, saturation 88 percent.',
    params: { ef: 0.28, lvDil: 1.3, ivcDiam: 24, ivcCollapse: 0.1, pleuralR: 8, pleuralL: 8 }, vitals: { hr: 108, rr: 28 }, lung: { blines: 0.8 },
    findings: ['b-lines', 'poor-lv'],
    teach: ['B-lines are laser-like streaks from the pleural line to the bottom of the screen, that erase the A-lines and move with sliding. More than two in a view is abnormal.', 'The left ventricle is dilated and barely squeezes.', 'A wide IVC that does not collapse fits a full tank.'],
  },
  {
    id: 'hypovolemia', title: 'Vomiting and bleeding', level: 'RUSH',
    story: 'A 49 year old with a day of vomiting blood. Dizzy on standing. Heart rate 124, blood pressure 84 over 50.',
    params: { ef: 0.8, lvDil: 0.82, ivcDiam: 11, ivcCollapse: 0.9, bladder: 60 }, vitals: { hr: 124, rr: 22 },
    findings: ['flat-ivc', 'hyperdynamic-lv'],
    teach: ['A small IVC that collapses almost completely with a sniff means the tank is empty.', 'The left ventricle squeezes until its walls nearly touch (kissing papillary muscles).', 'The bladder is empty.'],
  },
  {
    id: 'aaa', title: 'Back pain and collapse', level: 'RUSH',
    story: 'A 71 year old smoker. Sudden severe back pain, then collapse. Heart rate 118, blood pressure 76 over 40.',
    params: { aaa: 22, ivcDiam: 17 }, vitals: { hr: 118, rr: 22 },
    findings: ['aaa'],
    teach: ['The aorta should be under 3 cm across. Measure from outer wall to outer wall, in two planes.', 'A mural thrombus makes a grey rim inside the bright wall, so the flowing lumen looks smaller than the aneurysm.', 'The aorta lies to the patient’s left of the IVC, in front of the spine.'],
  },
  {
    id: 'hydronephrosis', title: 'Severe flank pain', level: 'Abdomen',
    story: 'A 45 year old with sudden, colicky right flank pain spreading to the groin, and blood in the urine.',
    params: { hydro: 0.75 }, vitals: { hr: 92, rr: 16 },
    findings: ['hydronephrosis'],
    teach: ['The renal sinus fat is split by black, branching fluid: the dilated calyces and pelvis.', 'Dilatation is not obstruction, and the converse is also true, so the picture is read with the story.'],
  },
  {
    id: 'cholelithiasis', title: 'Pain after fatty meals', level: 'Abdomen',
    story: 'A 38 year old woman with episodes of right upper abdominal pain after eating, now with nausea.',
    params: { stones: 1 }, vitals: { hr: 82, rr: 15 },
    findings: ['gallstones'],
    teach: ['Stones are bright with a black shadow behind them, because they stop the sound.', 'They move when the patient rolls: the gallbladder is scanned in more than one position.', 'Look at the wall, and for fluid around the gallbladder.'],
  },
  {
    id: 'ascites', title: 'Swollen abdomen', level: 'Abdomen',
    story: 'A 60 year old with known liver disease and a belly that has swollen over a month.',
    params: { ascites: 30, fluidRUQ: 8, fluidLUQ: 8, fluidPelvis: 20, habitus: 0.2 }, vitals: { hr: 88, rr: 16 },
    findings: ['ruq-fluid', 'luq-fluid', 'pelvis-fluid'],
    teach: ['Free fluid outlines the organs. Bowel loops float in it.', 'The fluid is in all three dependent spaces.'],
  },
  {
    id: 'pe', title: 'Collapse after a long flight', level: 'RUSH',
    story: 'A 55 year old, calf pain, then sudden breathlessness and collapse on landing. Heart rate 124, saturation 86 percent.',
    params: { rvDil: 1.7, ivcDiam: 25, ivcCollapse: 0.1, ef: 0.55 }, vitals: { hr: 124, rr: 28 },
    findings: ['rv-dilated', 'plethoric-ivc'],
    teach: ['In a four chamber view the right ventricle is as large as the left ventricle or larger, normally it is about two thirds.', 'The IVC is wide and fixed.', 'None of this proves a clot, but with this story it is a strong pointer.'],
  },
];

export const scenarioById = id => SCENARIOS.find(s => s.id === id);

// The patient parameters of a scenario on top of the defaults.
export const paramsOf = (scenario, defaults) => ({ ...defaults, ...scenario.params });

// Which lung artefacts a scenario brings, for the shader. Aerated lung by default.
export const lungOf = scenario => ({ blines: 0, ...scenario.lung });
