'use strict';

/**
 * Journal portfolio and the backend "journal mapping" used for
 * scope assessment and transfer recommendations.
 *
 * Each journal is described by genre, context and subject matter keywords.
 * The integrity engine scores a manuscript against every journal, and the
 * reviewer transfer flow proposes alternates from the same mapping.
 */
const JOURNALS = [
  {
    id: 'JACS',
    name: 'Journal of the American Chemical Society',
    shortName: 'JACS',
    genre: 'Broad-scope chemistry (high impact)',
    context: 'Fundamental advances of broad interest across all chemistry disciplines',
    limits: { abstractWords: 200, totalWords: 9000, titleChars: 150, minReferences: 15, maxKeywords: 6 },
    subjects: [
      'catalysis', 'catalyst', 'synthesis', 'mechanism', 'reaction', 'chemistry', 'molecular',
      'supramolecular', 'spectroscopy', 'kinetics', 'organometallic', 'ligand', 'complex',
      'photochemistry', 'electrochemistry', 'materials', 'polymer', 'enzyme', 'chemical biology',
      'crystal structure', 'selectivity', 'bond activation', 'computational', 'dft', 'self-assembly'
    ],
    related: ['ORGLETT', 'INORGCHEM', 'JPCC', 'ACSNANO']
  },
  {
    id: 'ORGLETT',
    name: 'Organic Letters',
    shortName: 'Org. Lett.',
    genre: 'Rapid communications in organic chemistry',
    context: 'Concise reports of new organic methods, total synthesis and reactivity',
    limits: { abstractWords: 150, totalWords: 4500, titleChars: 150, minReferences: 10, maxKeywords: 6 },
    subjects: [
      'organic synthesis', 'total synthesis', 'cross-coupling', 'asymmetric', 'enantioselective',
      'stereoselective', 'natural product', 'cyclization', 'alkene', 'alkyne', 'aryl', 'amination',
      'c-h activation', 'palladium', 'organocatalysis', 'heterocycle', 'protecting group', 'yield',
      'substrate scope', 'diastereoselective', 'olefin', 'ketone', 'aldehyde', 'methodology'
    ],
    related: ['JACS', 'JMEDCHEM']
  },
  {
    id: 'INORGCHEM',
    name: 'Inorganic Chemistry',
    shortName: 'Inorg. Chem.',
    genre: 'Inorganic and bioinorganic chemistry',
    context: 'Synthesis, structure and properties of inorganic and coordination compounds',
    limits: { abstractWords: 200, totalWords: 8000, titleChars: 150, minReferences: 15, maxKeywords: 6 },
    subjects: [
      'coordination', 'metal complex', 'lanthanide', 'actinide', 'transition metal', 'cluster',
      'metal-organic framework', 'mof', 'magnetic', 'ligand', 'oxidation state', 'crystal structure',
      'x-ray diffraction', 'bioinorganic', 'cobalt', 'iron', 'copper', 'nickel', 'zinc', 'luminescence',
      'solid-state', 'perovskite', 'paramagnetic', 'redox'
    ],
    related: ['JACS', 'JPCC']
  },
  {
    id: 'JMEDCHEM',
    name: 'Journal of Medicinal Chemistry',
    shortName: 'J. Med. Chem.',
    genre: 'Medicinal chemistry and drug discovery',
    context: 'Design, synthesis and biological evaluation of therapeutic agents',
    limits: { abstractWords: 250, totalWords: 10000, titleChars: 150, minReferences: 20, maxKeywords: 6 },
    subjects: [
      'drug', 'inhibitor', 'kinase', 'ic50', 'potency', 'selectivity', 'pharmacokinetic',
      'structure-activity', 'sar', 'lead optimization', 'in vivo', 'in vitro', 'cell line', 'cancer',
      'antibacterial', 'antiviral', 'receptor', 'binding affinity', 'clinical', 'bioavailability',
      'toxicity', 'metabolic stability', 'target', 'docking'
    ],
    related: ['ORGLETT', 'JACS']
  },
  {
    id: 'ACSNANO',
    name: 'ACS Nano',
    shortName: 'ACS Nano',
    genre: 'Nanoscience and nanotechnology',
    context: 'Synthesis, assembly, characterization and application of nanomaterials',
    limits: { abstractWords: 250, totalWords: 10000, titleChars: 150, minReferences: 25, maxKeywords: 7 },
    subjects: [
      'nanoparticle', 'nanomaterial', 'nanostructure', 'graphene', 'nanotube', 'quantum dot',
      'nanowire', '2d material', 'tem', 'sem', 'afm', 'plasmonic', 'nanoscale', 'surface area',
      'thin film', 'self-assembly', 'nanomedicine', 'device', 'sensor', 'flexible', 'mxene', 'core-shell'
    ],
    related: ['JPCC', 'JACS', 'ESTECH']
  },
  {
    id: 'JPCC',
    name: 'The Journal of Physical Chemistry C',
    shortName: 'J. Phys. Chem. C',
    genre: 'Physical chemistry of materials, interfaces and energy',
    context: 'Energy conversion, surfaces, interfaces, nanomaterials and spectroscopy',
    limits: { abstractWords: 200, totalWords: 9000, titleChars: 150, minReferences: 20, maxKeywords: 6 },
    subjects: [
      'battery', 'electrode', 'electrolyte', 'photovoltaic', 'solar cell', 'band gap', 'semiconductor',
      'interface', 'surface', 'adsorption', 'dft', 'density functional', 'spectroscopy', 'charge transfer',
      'photocatalysis', 'energy storage', 'conductivity', 'raman', 'xps', 'thermodynamic', 'kinetics',
      'electrocatalysis', 'hydrogen evolution'
    ],
    related: ['ACSNANO', 'JACS', 'INORGCHEM']
  },
  {
    id: 'ESTECH',
    name: 'Environmental Science & Technology',
    shortName: 'Environ. Sci. Technol.',
    genre: 'Environmental science, engineering and policy',
    context: 'Environmental processes, pollutants, remediation, exposure and sustainability',
    limits: { abstractWords: 250, totalWords: 8000, titleChars: 150, minReferences: 20, maxKeywords: 6 },
    subjects: [
      'environmental', 'pollutant', 'contaminant', 'wastewater', 'water treatment', 'remediation',
      'soil', 'air quality', 'emission', 'microplastic', 'pfas', 'toxicity', 'exposure', 'climate',
      'carbon capture', 'life cycle', 'sustainability', 'degradation', 'sediment', 'groundwater',
      'heavy metal', 'atmospheric'
    ],
    related: ['ACSNANO', 'JPCC']
  },
  {
    id: 'ANALCHEM',
    name: 'Analytical Chemistry',
    shortName: 'Anal. Chem.',
    genre: 'Measurement science',
    context: 'New analytical methods, instrumentation and sensing',
    limits: { abstractWords: 200, totalWords: 8000, titleChars: 150, minReferences: 20, maxKeywords: 6 },
    subjects: [
      'mass spectrometry', 'chromatography', 'hplc', 'detection limit', 'limit of detection', 'sensor',
      'biosensor', 'assay', 'quantification', 'calibration', 'electrophoresis', 'imaging', 'microfluidic',
      'analytical method', 'sensitivity', 'proteomics', 'metabolomics', 'fluorescence', 'nmr', 'validation'
    ],
    related: ['JACS', 'ESTECH', 'JMEDCHEM']
  }
];

const byId = Object.fromEntries(JOURNALS.map(j => [j.id, j]));

function getJournal(id) {
  return byId[id] || null;
}

/**
 * Proposes alternate journals for a transfer, ranked by scope fit
 * (from the integrity report when available) and by the editorial
 * "related" mapping of the current journal.
 */
function proposeAlternates(currentId, fitScores) {
  const current = byId[currentId];
  const related = new Set(current ? current.related : []);
  return JOURNALS
    .filter(j => j.id !== currentId)
    .map(j => {
      const fit = fitScores && typeof fitScores[j.id] === 'number' ? fitScores[j.id] : 0;
      const mappingBonus = related.has(j.id) ? 10 : 0;
      return {
        id: j.id,
        name: j.name,
        genre: j.genre,
        fitmentIndex: fit,
        mapped: related.has(j.id),
        rank: fit + mappingBonus
      };
    })
    .sort((a, b) => b.rank - a.rank);
}

module.exports = { JOURNALS, getJournal, proposeAlternates };
