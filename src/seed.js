'use strict';

/**
 * Builds the initial database: editors, reviewers and a realistic set of
 * manuscripts in every workflow state. Seed manuscripts are generated as
 * real .docx files and run through the integrity engine, so their scores,
 * fitment indices and review pages are genuine.
 */
const store = require('./store');
const { analyzeManuscript } = require('./integrity');
const { buildManuscriptDocx } = require('./msc-builder');
const service = require('./service');

const H = 36e5;

const EDITORS = [
  { id: 'ED-1', name: 'Dr. Helen Carter', email: 'h.carter@editorial.example', journals: ['JACS', 'INORGCHEM'] },
  { id: 'ED-2', name: 'Dr. Rajesh Menon', email: 'r.menon@editorial.example', journals: ['JMEDCHEM', 'ORGLETT', 'JACS'] },
  { id: 'ED-3', name: 'Dr. Sofia Lindqvist', email: 's.lindqvist@editorial.example', journals: ['ACSNANO', 'JPCC'] },
  { id: 'ED-4', name: 'Dr. Kwame Asante', email: 'k.asante@editorial.example', journals: ['ESTECH', 'ANALCHEM'] }
];

const REVIEWERS = [
  { id: 'RV-1', name: 'Prof. Anna Kowalski', affiliation: 'University of Warsaw', expertise: ['Organometallic catalysis', 'C–H activation'], journals: ['JACS', 'ORGLETT', 'INORGCHEM'], capacity: 3, avgTurnaroundDays: 6 },
  { id: 'RV-2', name: 'Dr. Liam O\'Connor', affiliation: 'Trinity College Dublin', expertise: ['Total synthesis', 'Asymmetric catalysis'], journals: ['ORGLETT', 'JACS'], capacity: 4, avgTurnaroundDays: 9 },
  { id: 'RV-3', name: 'Prof. Hiroshi Tanaka', affiliation: 'Kyoto University', expertise: ['Coordination chemistry', 'Magnetism'], journals: ['INORGCHEM', 'JACS'], capacity: 2, avgTurnaroundDays: 5 },
  { id: 'RV-4', name: 'Dr. Fatima Al-Sayed', affiliation: 'KAUST', expertise: ['Medicinal chemistry', 'Kinase inhibitors'], journals: ['JMEDCHEM'], capacity: 3, avgTurnaroundDays: 7 },
  { id: 'RV-5', name: 'Prof. Carlos Mendes', affiliation: 'University of São Paulo', expertise: ['2D materials', 'Nanodevices'], journals: ['ACSNANO', 'JPCC'], capacity: 3, avgTurnaroundDays: 8, unavailableInDays: 10 },
  { id: 'RV-6', name: 'Dr. Emily Zhang', affiliation: 'ETH Zürich', expertise: ['Electrocatalysis', 'Batteries'], journals: ['JPCC', 'ACSNANO', 'JACS'], capacity: 4, avgTurnaroundDays: 4 },
  { id: 'RV-7', name: 'Prof. Olumide Adeyemi', affiliation: 'University of Lagos', expertise: ['Water treatment', 'Emerging contaminants'], journals: ['ESTECH'], capacity: 3, avgTurnaroundDays: 10 },
  { id: 'RV-8', name: 'Dr. Ingrid Svensson', affiliation: 'Karolinska Institutet', expertise: ['Mass spectrometry', 'Bioanalysis'], journals: ['ANALCHEM', 'JMEDCHEM'], capacity: 3, avgTurnaroundDays: 6 },
  { id: 'RV-9', name: 'Prof. David Levi', affiliation: 'Weizmann Institute of Science', expertise: ['Physical organic chemistry', 'Photochemistry'], journals: ['JACS', 'JPCC'], capacity: 2, avgTurnaroundDays: 12 }
];

function orcid(seed) {
  const base = String(seed).padStart(15, '0').slice(-15);
  let total = 0;
  for (let i = 0; i < 15; i++) total = (total + Number(base[i])) * 2;
  const r = (12 - (total % 11)) % 11;
  const d = base + (r === 10 ? 'X' : String(r));
  return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8, 12)}-${d.slice(12)}`;
}

function refs(topic, n) {
  return Array.from({ length: n }, (_, i) =>
    `${['Wang, Y.; Patel, S.', 'Müller, F.; Rossi, G.', 'Okafor, C.; Lee, J.', 'Silva, P.; Ito, K.'][i % 4]} Advances in ${topic}, Part ${i + 1}. ${['Chem. Rev.', 'Nat. Chem.', 'Science', 'Acc. Chem. Res.'][i % 4]} ${2010 + (i % 14)}, ${100 + i}, ${200 + i * 13}–${210 + i * 13}.`);
}

/** Expands a short topic description into a full manuscript spec. */
function spec(t, i) {
  return {
    title: t.title,
    authors: t.authors,
    affiliations: [t.affiliation],
    corresponding: { name: t.authors[t.authors.length - 1], email: t.email },
    orcid: orcid(100000000000000 + i * 7919),
    creator: t.authors[t.authors.length - 1],
    abstract: t.abstract,
    keywords: t.keywords,
    introduction: [
      `${t.intro} Prior studies established the importance of ${t.keywords[0]} for this field [1–4], and recent reports on ${t.keywords[1]} opened new opportunities [5–8].`,
      `In this contribution we focus on ${t.keywords[2]} and address open questions concerning ${t.keywords[3] || t.keywords[0]} [9,10].`
    ],
    methods: [
      `Materials for the ${t.keywords[0]} experiments were obtained from commercial suppliers and used as received unless otherwise noted [11]. ${t.method}`,
      'Full experimental details, characterization data and additional control experiments are given in the Supporting Information.'
    ],
    results: [
      `${t.result} The key performance data are summarized in Table 1 and visualized in Figure 1.`,
      { table: { n: 1, caption: `Summary of ${t.keywords[0]} results`, rows: [['Entry', 'Condition', 'Value (%)'], ['1', 'baseline', String(t.values[0])], ['2', 'optimized', String(t.values[2])], ['3', 'scale-up', String(t.values[4])]] } },
      { figure: { n: 1, caption: `Performance trend for the ${t.keywords[1]} series.`, values: t.values, kind: i % 2 ? 'line' : 'bar', color: ['#2F6FDE', '#16A085', '#8E44AD', '#D35400'][i % 4] } },
      `${t.discussion} These observations are consistent with earlier mechanistic proposals [12–14] and extend them to ${t.keywords[2]} [15,16].`
    ],
    conclusions: [t.conclusion],
    contributions: 'All authors designed the study, analyzed the data and approved the final manuscript.',
    coi: 'The authors declare no competing financial interest.',
    data: 'All data supporting the findings are available in the Supporting Information.',
    acknowledgments: 'We thank our funding agencies for financial support.',
    references: refs(t.keywords[0], 16)
  };
}

const TOPICS = [
  {
    journalId: 'JACS', title: 'Enantioselective Nickel-Catalyzed Hydroarylation of Unactivated Alkenes Enabled by Chiral Bisoxazoline Ligands',
    authors: ['Laura M. Fischer', 'Yusuf A. Bello', 'Grace H. Park'], affiliation: 'Department of Chemistry, Stanford University, Stanford, CA 94305, USA', email: 'gpark@stanford.edu',
    abstract: 'Nickel catalysis offers a cost-effective platform for asymmetric bond construction. We describe a chiral bisoxazoline nickel catalyst that promotes the hydroarylation of unactivated alkenes with arylboronic acids with high enantioselectivity. Mechanistic experiments reveal a reversible migratory insertion followed by enantiodetermining reductive elimination.',
    keywords: ['catalysis', 'enantioselective', 'nickel', 'mechanism', 'ligand'],
    intro: 'Asymmetric hydrofunctionalization of alkenes converts feedstock chemicals into chiral building blocks.',
    method: 'Reactions were run under argon with 5 mol % catalyst in dimethylacetamide at 40 °C.',
    result: 'The optimized catalyst delivered branched products with up to 97:3 enantiomeric ratio across 35 substrates.',
    discussion: 'Kinetic isotope effect measurements and deuterium labeling indicate that the insertion step is reversible.',
    conclusion: 'This nickel catalyst system provides a general route to enantioenriched 1,1-diarylalkanes from simple alkenes.',
    values: [62, 71, 88, 92, 95, 97], state: { hoursAgo: 3, status: 'Open' }
  },
  {
    journalId: 'ORGLETT', title: 'Visible-Light-Mediated Decarboxylative Alkynylation of Amino Acids for Rapid Access to Propargylamines',
    authors: ['Marco Bianchi', 'Elif Yilmaz'], affiliation: 'Department of Chemistry, University of Padova, 35131 Padova, Italy', email: 'elif.yilmaz@unipd.it',
    abstract: 'Propargylamines are versatile intermediates in organic synthesis. Using an organic photocatalyst and hypervalent iodine alkynylating reagents, we achieved decarboxylative alkynylation of N-protected amino acids under mild conditions with broad substrate scope and good yields, including late-stage modification of peptides.',
    keywords: ['organic synthesis', 'alkyne', 'photocatalysis', 'substrate scope', 'methodology'],
    intro: 'Decarboxylative couplings use carboxylic acids as traceless activating groups.',
    method: 'Reactions used 2 mol % 4CzIPN under 456 nm irradiation in dichloromethane.',
    result: 'Twenty-eight propargylamines were obtained in yields between 54% and 91%.',
    discussion: 'Fluorescence quenching studies indicate oxidation of the carboxylate by the excited photocatalyst.',
    conclusion: 'The method enables rapid diversification of amino acids into propargylamines under metal-free conditions.',
    values: [54, 63, 72, 80, 86, 91], state: { hoursAgo: 12, status: 'Open', reviewer: 'RV-2' }
  },
  {
    journalId: 'INORGCHEM', title: 'Slow Magnetic Relaxation in a Series of Dysprosium(III) Complexes with Pentagonal Bipyramidal Geometry',
    authors: ['Chen Wei', 'Olga Petrova', 'Ahmed Rahman'], affiliation: 'School of Chemistry, University of Manchester, Manchester M13 9PL, UK', email: 'ahmed.rahman@manchester.ac.uk',
    abstract: 'Single-molecule magnets based on lanthanide ions are candidates for high-density information storage. We report dysprosium complexes with pentagonal bipyramidal coordination that exhibit slow magnetic relaxation with large effective energy barriers. Ab initio calculations rationalize the magnetic anisotropy in terms of the axial ligand field.',
    keywords: ['lanthanide', 'magnetic', 'coordination', 'crystal structure', 'ligand'],
    intro: 'Axial symmetry is a key design principle for lanthanide single-molecule magnets.',
    method: 'Crystal structures were determined by single-crystal X-ray diffraction at 100 K.',
    result: 'The complexes display effective energy barriers up to 1150 K and magnetic hysteresis up to 20 K.',
    discussion: 'Comparison across the series shows that shorter axial Dy–O bonds increase the relaxation barrier.',
    conclusion: 'Tuning the axial ligands provides a rational route to improved dysprosium single-molecule magnets.',
    values: [40, 55, 68, 74, 81, 86], state: { hoursAgo: 30, status: 'In Progress', reviewer: 'RV-3', progress: 45, startedHoursAfter: 4 }
  },
  {
    journalId: 'JMEDCHEM', title: 'Discovery of Orally Bioavailable Covalent Inhibitors of KRAS G12C with Improved Metabolic Stability',
    authors: ['Sarah J. Collins', 'Vikram Desai', 'Hannah Ruiz', 'Peter Okoye'], affiliation: 'Department of Medicinal Chemistry, Oncology Research Institute, Cambridge, MA 02139, USA', email: 'p.okoye@onc-research.org',
    abstract: 'KRAS G12C is a validated oncology target. Structure-activity relationship studies on an acrylamide series yielded covalent inhibitors with nanomolar potency, improved metabolic stability and high oral bioavailability in rodents. The lead compound induced tumor regression in a xenograft model.',
    keywords: ['inhibitor', 'structure-activity', 'cancer', 'pharmacokinetic', 'in vivo'],
    intro: 'Direct targeting of mutant KRAS proteins was long considered intractable.',
    method: 'Biochemical potency was measured in a nucleotide exchange assay and cellular activity in NCI-H358 cells.',
    result: 'Lead optimization improved cellular IC50 values from 450 nM to 9 nM while reducing intrinsic clearance.',
    discussion: 'Crystallography confirmed covalent engagement of Cys12 and revealed a cryptic pocket interaction.',
    conclusion: 'The optimized inhibitor is a promising candidate for further preclinical development.',
    values: [20, 35, 52, 70, 83, 90], state: { hoursAgo: 6, status: 'In Progress', reviewer: 'RV-4', progress: 80, startedHoursAfter: 1 }
  },
  {
    journalId: 'ACSNANO', title: 'Wafer-Scale Growth of Monolayer MoS2 Transistors with Low Contact Resistance',
    authors: ['Jun Ho Lee', 'Amira Haddad'], affiliation: 'Department of Materials Science, KAIST, Daejeon 34141, Republic of Korea', email: 'amira.haddad@kaist.ac.kr',
    abstract: 'Two-dimensional semiconductors promise transistor scaling beyond silicon. We report wafer-scale chemical vapor deposition of monolayer MoS2 with uniform thickness and semimetal contacts that achieve low contact resistance, enabling high on-current field-effect transistors across 4-inch wafers.',
    keywords: ['2d material', 'nanomaterial', 'device', 'thin film', 'nanoscale'],
    intro: 'Contact resistance limits the performance of two-dimensional semiconductor devices.',
    method: 'Films were grown by metal-organic chemical vapor deposition and characterized by Raman spectroscopy and TEM.',
    result: 'Devices showed contact resistance of 120 Ω·µm and on/off ratios above 10^8 across the wafer.',
    discussion: 'Raman mapping confirms monolayer uniformity over more than 95% of the wafer area.',
    conclusion: 'This approach enables reproducible wafer-scale fabrication of high-performance 2D transistors.',
    values: [70, 78, 85, 90, 93, 95], state: { hoursAgo: 96, status: 'Complete', reviewer: 'RV-6', progress: 100, startedHoursAfter: 6, completedHoursAfter: 40, decision: { type: 'Accept', summary: 'Important advance with convincing wafer-scale data. Accept after minor editorial corrections.' } }
  },
  {
    journalId: 'JPCC', title: 'Interfacial Water Structure Governs Hydrogen Evolution Kinetics on Platinum Electrodes',
    authors: ['Nina Hoffmann', 'Ravi Shankar'], affiliation: 'Fritz Haber Institute of the Max Planck Society, 14195 Berlin, Germany', email: 'hoffmann@fhi.mpg.de',
    abstract: 'The pH dependence of hydrogen evolution on platinum remains debated. Using surface-enhanced infrared spectroscopy and density functional theory we correlate the interfacial water structure with hydrogen evolution kinetics, showing that water reorganization energy controls activity in alkaline electrolyte.',
    keywords: ['electrocatalysis', 'hydrogen evolution', 'interface', 'electrolyte', 'spectroscopy'],
    intro: 'Alkaline hydrogen evolution is two orders of magnitude slower than in acid.',
    method: 'Spectra were recorded in attenuated total reflection geometry on Pt thin film electrodes.',
    result: 'The exchange current density decreased by 85% from pH 1 to pH 13.',
    discussion: 'The analysis attributes the activity loss to a more rigid interfacial hydrogen-bond network.',
    conclusion: 'Interfacial water structure is a key descriptor for alkaline hydrogen evolution activity.',
    values: [90, 72, 55, 40, 28, 15], state: { hoursAgo: 120, status: 'Complete', reviewer: 'RV-6', progress: 100, startedHoursAfter: 10, completedHoursAfter: 60, decision: { type: 'Reject', summary: 'The spectroscopic assignments are not sufficiently supported and the conclusions overlap substantially with prior work.' } }
  },
  {
    journalId: 'ESTECH', title: 'Graphene Oxide Membranes with Tunable Nanochannels for Selective Ion Sieving',
    authors: ['Tomás Herrera', 'Lin Qiu'], affiliation: 'Department of Chemical Engineering, Tsinghua University, Beijing 100084, China', email: 'lqiu@tsinghua.edu.cn',
    abstract: 'Precise ion sieving requires membranes with sub-nanometer channels. We fabricate graphene oxide membranes whose interlayer spacing is fixed by cation cross-linking, achieving nanoscale channels that separate monovalent and divalent ions in water with high selectivity and stability.',
    keywords: ['graphene', 'nanomaterial', 'water treatment', 'thin film', 'nanoscale'],
    intro: 'Layered graphene oxide membranes swell in water, limiting their selectivity.',
    method: 'Membranes were prepared by vacuum filtration and characterized by X-ray diffraction and SEM.',
    result: 'The membranes rejected 98% of magnesium ions while maintaining high water permeance.',
    discussion: 'Interlayer spacing measurements show that cross-linking suppresses swelling over 30 days.',
    conclusion: 'Cation cross-linked graphene oxide membranes are promising for precise ion separation.',
    values: [60, 74, 83, 90, 96, 98], state: { hoursAgo: 80, status: 'Complete', reviewer: 'RV-7', progress: 100, startedHoursAfter: 5, completedHoursAfter: 30, decision: { type: 'Transfer', alternateJournalId: 'ACSNANO', summary: 'The work is primarily a nanomaterials study; better suited to ACS Nano than to Environ. Sci. Technol.' } }
  },
  {
    journalId: 'ANALCHEM', title: 'Ambient Ionization Mass Spectrometry for Rapid Quantification of Pesticide Residues in Food',
    authors: ['Isabel Moreno', 'Kenji Watanabe'], affiliation: 'Department of Analytical Chemistry, University of Barcelona, 08028 Barcelona, Spain', email: 'imoreno@ub.edu',
    abstract: 'Food safety monitoring needs fast and sensitive analytical methods. We present a paper spray mass spectrometry method that quantifies 40 pesticide residues in fruit extracts within one minute per sample, with limits of detection below regulatory thresholds and validation against a reference chromatography method.',
    keywords: ['mass spectrometry', 'quantification', 'limit of detection', 'validation', 'analytical method'],
    intro: 'Chromatography-based residue analysis is accurate but slow.',
    method: 'Samples were extracted with acetonitrile and analyzed by paper spray ionization on a triple quadrupole instrument.',
    result: 'Limits of detection ranged from 0.5 to 8 µg/kg with recoveries between 81% and 112%.',
    discussion: 'Matrix effects were compensated by isotope-labeled internal standards.',
    conclusion: 'Paper spray mass spectrometry is a practical screening tool for pesticide residues.',
    values: [81, 88, 94, 99, 105, 112], state: { hoursAgo: 70, status: 'Complete', reviewer: 'RV-8', progress: 100, startedHoursAfter: 8, completedHoursAfter: 26, decision: { type: 'Revise', revisionType: 'Major', summary: 'Please extend the validation to additional matrices and report inter-day precision.' }, feedbackStatus: 'In Progress' }
  },
  {
    journalId: 'JACS', owner: 'Admin', title: 'Mechanochemical Synthesis of Covalent Organic Frameworks for Photocatalytic Hydrogen Peroxide Production',
    authors: ['Ananya Bose', 'Felix Wagner'], affiliation: 'Department of Chemistry, Indian Institute of Science, Bengaluru 560012, India', email: 'ananya.bose@iisc.ac.in',
    abstract: 'Covalent organic frameworks are crystalline porous polymers with tunable optical properties. We report solvent-free mechanochemical synthesis of imine-linked frameworks that catalyze photocatalytic hydrogen peroxide production from water and oxygen with high apparent quantum yield.',
    keywords: ['materials', 'synthesis', 'photochemistry', 'catalysis', 'polymer'],
    intro: 'Solvothermal synthesis of covalent organic frameworks is slow and solvent-intensive.',
    method: 'Frameworks were prepared by ball milling the monomers for 60 min with catalytic acetic acid.',
    result: 'The best framework produced hydrogen peroxide at 2.1 mmol g−1 h−1 under visible light.',
    discussion: 'Transient absorption spectroscopy indicates efficient charge separation in the donor–acceptor framework.',
    conclusion: 'Mechanochemistry provides a scalable and green route to photoactive frameworks.',
    values: [0.6, 0.9, 1.3, 1.7, 1.9, 2.1], state: { hoursAgo: 60, status: 'Complete', reviewer: 'RV-1', progress: 100, startedHoursAfter: 3, completedHoursAfter: 20, decision: { type: 'Revise', revisionType: 'Minor', summary: 'Solid work. Please add stability data over repeated cycles and clarify the quantum yield measurement.' }, feedbackStatus: 'In Progress', annotations: [
      { type: 'comment', quote: 'high apparent quantum yield', comment: 'Please state the wavelength and the measured value here.' },
      { type: 'highlight', quote: 'ball milling the monomers for 60 min', comment: 'Was milling frequency optimized? Add to SI.' }
    ] }
  },
  {
    journalId: 'JACS', title: 'Electrochemical Nitrogen Reduction on Single-Atom Iron Sites Anchored in Nitrogen-Doped Carbon',
    authors: ['Sergei Volkov', 'Aisha Mohammed'], affiliation: 'Department of Chemistry, University of Toronto, Toronto, ON M5S 3H6, Canada', email: 'aisha.mohammed@utoronto.ca',
    abstract: 'Electrochemical ammonia synthesis could decarbonize fertilizer production. We prepared single-atom iron catalysts and used rigorous isotope-labeled controls to quantify nitrogen reduction activity, establishing structure–activity relationships between the iron coordination environment and Faradaic efficiency.',
    keywords: ['electrochemistry', 'catalysis', 'mechanism', 'spectroscopy', 'materials'],
    intro: 'False positives from contamination have hampered research on electrochemical nitrogen reduction.',
    method: 'Ammonia was quantified by 1H NMR using 15N2 isotope labeling experiments.',
    result: 'The Fe–N4 catalyst reached a Faradaic efficiency of 18% at −0.3 V versus RHE.',
    discussion: 'X-ray absorption spectroscopy indicates that the active site retains its single-atom character after electrolysis.',
    conclusion: 'Careful controls and spectroscopy establish iron single-atom sites as genuine nitrogen reduction catalysts.',
    values: [4, 7, 11, 15, 17, 18], state: { hoursAgo: 20, status: 'Open', reviewer: 'RV-9', revisions: 1, feedbackStatus: 'Complete', priorDecision: { type: 'Revise', revisionType: 'Minor', summary: 'Add isotope-labeled control experiments.' } }
  },
  {
    journalId: 'ORGLETT', title: 'Total Synthesis of (−)-Strychnine via a Catalytic Asymmetric Dearomative Cyclization',
    authors: ['Benjamin Hart', 'Yuki Sato'], affiliation: 'Department of Chemistry, University of Cambridge, Cambridge CB2 1EW, UK', email: 'b.hart@cam.ac.uk',
    abstract: 'Strychnine has long served as a benchmark for synthetic strategy. We report a concise total synthesis featuring a catalytic asymmetric dearomative cyclization that forms the pentacyclic core with high enantioselectivity, completing the natural product in twelve steps.',
    keywords: ['total synthesis', 'natural product', 'asymmetric', 'cyclization', 'heterocycle'],
    intro: 'Concise syntheses of complex alkaloids showcase the power of new methods.',
    method: 'Key steps were performed on gram scale with chiral phosphoric acid catalysts.',
    result: 'The dearomative cyclization proceeded in 82% yield and 94% enantiomeric excess.',
    discussion: 'The stereochemical outcome is explained by a hydrogen-bonded transition state model.',
    conclusion: 'Catalytic dearomatization offers an efficient entry into Strychnos alkaloids.',
    values: [45, 60, 70, 82, 88, 94], state: { hoursAgo: 50, status: 'In Progress', reviewer: 'RV-2', progress: 20, startedHoursAfter: 26, annotations: [
      { type: 'underline', quote: 'twelve steps', comment: 'Please count steps from commercially available materials (longest linear sequence).' }
    ] }
  },
  {
    journalId: 'JMEDCHEM', title: 'Macrocyclic Peptide Inhibitors of the PD-1/PD-L1 Interaction with Oral Activity',
    authors: ['Rachel Goldberg', 'Arjun Kapoor'], affiliation: 'Department of Pharmaceutical Sciences, University of California San Francisco, CA 94158, USA', email: 'arjun.kapoor@ucsf.edu',
    abstract: 'Small-molecule immune checkpoint inhibitors could overcome limitations of antibodies. We designed macrocyclic peptides that block the PD-1/PD-L1 interaction with nanomolar binding affinity and demonstrate oral activity in a syngeneic tumor model.',
    keywords: ['inhibitor', 'binding affinity', 'cancer', 'in vivo', 'bioavailability'],
    intro: 'Checkpoint blockade antibodies have transformed oncology but require intravenous administration.',
    method: 'Binding was measured by surface plasmon resonance and HTRF assays.',
    result: 'The lead macrocycle bound PD-L1 with a KD of 4 nM and showed 22% oral bioavailability in mice.',
    discussion: 'N-methylation of backbone amides improved permeability without loss of affinity.',
    conclusion: 'Macrocyclic peptides are viable oral alternatives to checkpoint antibodies.',
    values: [10, 25, 40, 62, 78, 85], state: { hoursAgo: 1, status: 'Open' }
  }
];

// Historical, review-complete MSCs (spread over ~5 months) so the
// week/month processing-outcome chart has a meaningful history.
const ARCHIVE = [
  [0, 'Cobalt-Catalyzed Hydrosilylation of Terminal Alkenes with Anti-Markovnikov Selectivity', 9, 'Accept', 'RV-1', 70],
  [3, 'Brain-Penetrant BTK Inhibitors for Multiple Sclerosis', 12, 'Revise', 'RV-4', 55, 'Major'],
  [4, 'Ultrathin MXene Films for Electromagnetic Interference Shielding', 16, 'Accept', 'RV-5', 48],
  [5, 'Operando Raman Spectroscopy of Nickel Oxyhydroxide Oxygen Evolution Catalysts', 20, 'Reject', 'RV-6', 90],
  [6, 'PFAS Removal from Groundwater by Cationic Cyclodextrin Polymers', 25, 'Accept', 'RV-7', 62],
  [7, 'Single-Cell Metabolomics by Nanoelectrospray Mass Spectrometry', 31, 'Revise', 'RV-8', 40, 'Minor'],
  [2, 'Luminescent Europium Frameworks for Ratiometric Temperature Sensing', 38, 'Transfer', 'RV-3', 75, null, 'ANALCHEM'],
  [1, 'Photoredox Deoxygenative Alkylation of Alcohols', 45, 'Accept', 'RV-2', 36],
  [8, 'Covalent Organic Framework Membranes for Organic Solvent Nanofiltration', 52, 'Reject', 'RV-9', 110],
  [11, 'Stapled Peptides Targeting the MDM2–p53 Interaction', 66, 'Accept', 'RV-4', 58],
  [9, 'Copper Single-Atom Catalysts for Electrochemical CO2 Reduction to Ethanol', 80, 'Revise', 'RV-6', 66, 'Minor'],
  [10, 'Asymmetric Synthesis of Tetrahydroisoquinoline Alkaloids', 95, 'Accept', 'RV-2', 44],
  [4, 'Stretchable Graphene Sensors for Wearable Sweat Analysis', 110, 'Transfer', 'RV-5', 80, null, 'ANALCHEM'],
  [6, 'Atmospheric Oxidation of Biogenic Volatile Organic Compounds', 128, 'Accept', 'RV-7', 72],
  [7, 'Microfluidic Immunoassay for Point-of-Care Troponin Detection', 140, 'Reject', 'RV-8', 50]
];

async function buildSeed() {
  const now = Date.now();
  const db = {
    meta: { seededAt: new Date(now).toISOString(), version: 1 },
    counters: { msc: 1000 },
    editors: EDITORS,
    reviewers: REVIEWERS.map(({ unavailableInDays, ...r }) => ({
      ...r,
      unavailableUntil: unavailableInDays ? new Date(now + unavailableInDays * 24 * H).toISOString() : null
    })),
    mscs: [],
    checks: []
  };
  store.set(db);

  const reports = [];
  for (let i = 0; i < TOPICS.length; i++) {
    const t = TOPICS[i];
    const buffer = await buildManuscriptDocx(spec(t, i));
    reports[i] = await analyzeManuscript({ buffer, originalName: `${t.journalId}-seed-${i + 1}.docx`, journalId: t.journalId, corpus: [] });
  }

  // Archive first, so the current MSCs get the most recent IDs.
  ARCHIVE.forEach(([ti, title, daysAgo, type, reviewer, fulfilHours, revisionType, alt]) => {
    const base = reports[ti];
    const report = { ...base, meta: { ...base.meta, title }, html: base.html.replace(TOPICS[ti].title, title) };
    const submitted = now - daysAgo * 24 * H;
    const msc = service.createMsc({ report, fileName: `${title.slice(0, 40).replace(/[^A-Za-z0-9]+/g, '_')}.docx`, owner: 'seed', seed: true, submittedAt: new Date(submitted).toISOString() });
    const decidedAt = new Date(submitted + fulfilHours * H).toISOString();
    Object.assign(msc, {
      assignedReviewer: reviewer,
      assignedAt: new Date(submitted + 1 * H).toISOString(),
      reviewStatus: 'Complete',
      reviewStartAt: new Date(submitted + 4 * H).toISOString(),
      reviewProgress: 100,
      completedAt: decidedAt,
      feedbackStatus: type === 'Revise' ? 'In Progress' : null,
      decision: { type, revisionType: revisionType || null, alternateJournalId: alt || null, summary: `${type} — see reviewer comments.`, decidedAt, decidedBy: reviewer }
    });
    msc.decisionHistory.push({ ...msc.decision, version: 1 });
  });

  for (let i = 0; i < TOPICS.length; i++) {
    const t = TOPICS[i];
    const report = reports[i];
    const s = t.state;
    const submitted = now - s.hoursAgo * H;
    const msc = service.createMsc({
      report,
      fileName: `${t.title.slice(0, 40).replace(/[^A-Za-z0-9]+/g, '_')}.docx`,
      owner: t.owner || 'seed',
      seed: true,
      submittedAt: new Date(submitted).toISOString()
    });
    msc.reviewStatus = s.status;
    if (s.reviewer) {
      msc.assignedReviewer = s.reviewer;
      msc.assignedAt = new Date(submitted + 0.5 * H).toISOString();
    }
    if (s.startedHoursAfter !== undefined) msc.reviewStartAt = new Date(submitted + s.startedHoursAfter * H).toISOString();
    if (s.progress) msc.reviewProgress = s.progress;
    if (s.revisions) {
      msc.revisions = s.revisions;
      msc.versions.unshift({ version: 0, submittedAt: new Date(submitted - 96 * H).toISOString(), fileName: msc.fileName, score: report.score, contentHash: report.contentHash });
      msc.versions = msc.versions.map((v, idx) => ({ ...v, version: idx + 1 }));
    }
    if (s.priorDecision) {
      msc.decisionHistory.push({ ...s.priorDecision, decidedAt: new Date(submitted - 24 * H).toISOString(), decidedBy: s.reviewer, version: 1 });
    }
    if (s.feedbackStatus) msc.feedbackStatus = s.feedbackStatus;
    (s.annotations || []).forEach((a, k) => {
      msc.annotations.push({
        id: `AN-seed-${i}-${k}`, type: a.type, quote: a.quote, comment: a.comment || '', start: null, end: null,
        author: db.reviewers.find(r => r.id === s.reviewer).name,
        createdAt: new Date(submitted + (s.startedHoursAfter + 1) * H).toISOString()
      });
    });
    if (s.decision) {
      const decidedAt = new Date(submitted + s.completedHoursAfter * H).toISOString();
      msc.decision = { ...s.decision, decidedAt, decidedBy: s.reviewer };
      msc.decisionHistory.push({ ...msc.decision, version: msc.versions.length });
      msc.completedAt = decidedAt;
      if (s.decision.type === 'Transfer') msc.transferredFrom = msc.journalId;
    }
  }
  store.save();
  return store.get();
}

module.exports = { buildSeed };
