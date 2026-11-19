'use strict';

/**
 * Two demo manuscripts:
 *  - GOOD: a well-formed JACS submission that should PASS (> 6).
 *  - WEAK: a drug-discovery MSC with missing sections, typos, copied text,
 *          figure/table problems and an invalid ORCID that should FAIL.
 */

const refs = n => Array.from({ length: n }, (_, i) => {
  const authors = ['Alvarez, M.; Chen, L.', 'Brennan, K. P.; Osei, A.', 'Dubois, C.; Kim, H.', 'Fischer, T.; Nakamura, Y.', 'Gupta, R.; Larsen, E.'][i % 5];
  const topics = ['Copper Catalysis in Modern Synthesis', 'Visible-Light Photoredox Strategies', 'Ligand Design for Base Metals', 'Mechanistic Studies of C–N Bond Formation', 'Sustainable Amination Methods', 'Kinetic Isotope Effects in Catalysis', 'Radical Cross-Coupling Reactions', 'Computational Insights into Copper Intermediates'][i % 8];
  return `${authors} ${topics} ${i + 1}. J. Am. Chem. Soc. ${2012 + (i % 12)}, ${130 + i}, ${1000 + i * 37}–${1010 + i * 37}.`;
});

const GOOD = {
  title: 'Photoinduced Copper-Catalyzed C–N Coupling of Aryl Chlorides with Aliphatic Amines at Room Temperature',
  authors: ['Priya R. Nair', 'Daniel K. Osei', 'Mei-Ling Zhou', 'Thomas A. Becker'],
  affiliations: ['Department of Chemistry, University of Wisconsin–Madison, Madison, WI 53706, USA', 'Institute of Organic Chemistry, Technical University of Munich, 85748 Garching, Germany'],
  corresponding: { name: 'Thomas A. Becker', email: 't.becker@chem.wisc.edu' },
  orcid: '0000-0002-1825-0097',
  creator: 'Thomas A. Becker',
  abstract: 'Aryl chlorides are inexpensive and abundant electrophiles, yet their use in copper-catalyzed amination usually requires temperatures above 110 °C. We report a photoinduced copper catalyst supported by a carbazolide-phosphine ligand that couples aryl chlorides with primary and secondary aliphatic amines at 25 °C under blue-light irradiation. The method tolerates esters, nitriles, unprotected alcohols and heteroarenes and delivers 42 coupled products in yields up to 96%. Catalyst loadings as low as 0.5 mol % are sufficient on gram scale. Stern–Volmer quenching, radical clock experiments and kinetic analysis support a mechanism in which an excited copper(I) amido complex transfers an electron to the aryl chloride, generating an aryl radical that recombines with a copper(II) species. These findings provide a practical and mild route to aryl amines that are prevalent in pharmaceuticals and organic materials.',
  keywords: ['copper catalysis', 'photoredox', 'C–N coupling', 'aryl chlorides', 'amination'],
  introduction: [
    'Aryl amines appear in a large fraction of approved small-molecule drugs, agrochemicals and organic electronic materials, so methods that forge aryl C–N bonds efficiently remain in high demand [1–3]. Palladium-catalyzed Buchwald–Hartwig amination is the benchmark approach, but the cost and toxicity of palladium motivate the development of catalysts based on earth-abundant metals [4,5].',
    'Copper-mediated Ullmann-type couplings were among the first C–N bond-forming reactions, and modern ligand design has greatly expanded their scope [6,7]. Nevertheless, the oxidative addition of aryl chlorides to copper(I) is slow, and most protocols still rely on aryl iodides or bromides or on harsh temperatures [8]. Light offers an orthogonal means of activating copper complexes: photoexcited copper(I) amides are strong reductants capable of single-electron transfer to haloarenes [9–11].',
    'Building on these observations, we hypothesized that a rigid, electron-rich ligand would stabilize the key copper(I) amido intermediate, extend its excited-state lifetime and thus enable room-temperature coupling of unactivated aryl chlorides [12]. Herein we describe the realization of this design, a detailed study of its scope and a mechanistic investigation of the catalytic cycle.'
  ],
  methods: [
    'General procedure. In a nitrogen-filled glovebox, an oven-dried 8 mL vial was charged with CuCl (0.5 mol %), ligand L3 (0.6 mol %), sodium tert-butoxide (1.4 equiv), the aryl chloride (1.0 mmol) and the amine (1.2 mmol) in 2.0 mL of anhydrous acetonitrile. The vial was sealed and irradiated with a 450 nm LED at 25 °C for 16 h with fan cooling.',
    'The reaction mixture was diluted with ethyl acetate, filtered through a short silica plug and concentrated. Products were purified by flash chromatography and characterized by 1H and 13C NMR spectroscopy and high-resolution mass spectrometry. Full characterization data and NMR spectra are provided in the Supporting Information.',
    'Stern–Volmer experiments were carried out with a calibrated fluorimeter using degassed acetonitrile solutions. Kinetic profiles were obtained by in situ infrared spectroscopy, and quantum yields were measured by ferrioxalate actinometry [13].'
  ],
  results: [
    'We began by evaluating ligands for the coupling of 4-chloroanisole with morpholine under blue-light irradiation (Table 1). Simple diamine and phenanthroline ligands gave little or no product, whereas carbazolide-phosphine ligands were markedly more effective. Ligand L3 furnished the aryl amine in 94% yield, and control experiments confirmed that copper, ligand and light were all required.',
    { table: { n: 1, caption: 'Optimization of the Photoinduced Coupling of 4-Chloroanisole with Morpholine', rows: [
      ['Entry', 'Ligand', 'Light source', 'Temperature (°C)', 'Yield (%)'],
      ['1', 'L1', '450 nm', '25', '8'],
      ['2', 'L2', '450 nm', '25', '41'],
      ['3', 'L3', '450 nm', '25', '94'],
      ['4', 'L3', 'dark', '25', '0'],
      ['5', 'none', '450 nm', '25', '0']
    ] } },
    'With the optimized conditions in hand, we examined the scope of aryl chlorides. Electron-rich, electron-neutral and electron-poor substrates all reacted smoothly, and the highest yield of 96% was obtained for 4-chlorobenzonitrile. Ortho substitution was tolerated, and pyridyl, quinolinyl and thienyl chlorides coupled in good yields (Figure 1).',
    { figure: { n: 1, caption: 'Isolated yields for representative aryl chlorides bearing electron-donating, neutral and electron-withdrawing substituents.', values: [94, 88, 96, 79, 83, 71], kind: 'bar' } },
    'To probe the mechanism, we measured the luminescence of the copper amido complex in the presence of increasing concentrations of 4-chloroanisole. Linear Stern–Volmer behavior was observed, with a quenching constant consistent with electron transfer from the excited state (Figure 2). The rate of product formation showed first-order dependence on copper and on light intensity, and the quantum yield of 0.31 argues against a long radical chain. The observed rate constant is described by eq 1, where I is the photon flux and the bracketed terms denote concentrations.',
    { figure: { n: 2, caption: 'Stern–Volmer plot for quenching of the excited copper(I) amido complex by 4-chloroanisole.', values: [1.0, 1.4, 1.9, 2.3, 2.8, 3.2], kind: 'line', color: '#C0392B' } },
    { equation: { n: 1, text: 'k_obs = k_q·I·[Cu]·[ArCl]' } },
    'A cyclopropyl radical clock substrate gave exclusively ring-opened products, supporting the intermediacy of aryl radicals [14]. Density functional theory calculations indicate that recombination of the aryl radical with the copper(II) amide is nearly barrierless, followed by facile reductive elimination [15]. The process could be performed on a 10 mmol scale with 0.5 mol % copper, delivering 1.79 g of product without erosion of yield [16].'
  ],
  conclusions: ['We have developed a photoinduced copper catalyst that couples aryl chlorides with aliphatic amines at room temperature. The reaction displays broad functional group tolerance, operates at low catalyst loading and proceeds through an aryl radical pathway initiated by electron transfer from an excited copper amide. We anticipate that this ligand design will enable other base-metal-catalyzed couplings of challenging electrophiles.'],
  contributions: 'P.R.N. and D.K.O. performed the experiments; M.-L.Z. carried out the computational studies; T.A.B. conceived and supervised the project. All authors wrote and approved the manuscript.',
  coi: 'The authors declare no competing financial interest.',
  data: 'Experimental procedures, characterization data, NMR spectra and computational coordinates are available in the Supporting Information and in the Zenodo repository (doi:10.5281/zenodo.0000000).',
  acknowledgments: 'This work was supported by the National Science Foundation (CHE-2154321).',
  references: refs(16)
};

const WEAK = {
  title: 'Novel inhibitors for kinase',
  authors: ['R. Sharma', 'K. Iyer', 'R. Sharma'],
  affiliations: ['Lab 4, Some Research Center'],
  corresponding: { name: 'R. Sharma', email: 'rsharma.lab@gmail.com' },
  orcid: '0000-0002-1825-0098',
  creator: 'Ghost Writer Services',
  abstract: 'We made new compounds that inhibit kinase with IC50 of 12 nM and 85% oral bioavailabilty. These are good.',
  keywords: null,
  introduction: [
    'Kinases are important targets.  Many drugs have been made but more are needed [1]. The the problem is selectivity , wich is difficult to acheive.',
    'Protein kinases regulate a wide range of cellular processes and their dysregulation is associated with cancer and inflammatory diseases. The development of selective kinase inhibitors is complicated by the high structural similarity of the adenosine triphosphate binding site across the kinome. Structure based drug design has enabled the identification of inhibitors that exploit subtle differences in the binding pocket.'
  ],
  methods: ['Compounds were synthesised using standard proceedures and tested in a kinase assay (see Figure 3). Cell line data were recieved from a collaborator.'],
  results: [
    'The results are shown in Table 1 and Figure 1. Compound 7 was the most potent with good selectivity and potency in the in vitro assay (',
    { figure: { n: 1, caption: 'Dose-response curves for compounds 1-8.', values: [10, 30, 55, 72, 85, 90], kind: 'line' } },
    { figure: { n: 2, caption: 'Docking pose of compound 7 in the binding pocket.', noImage: true } },
    { table: { n: 1, caption: 'Inhibitory activity', rows: [
      ['Compound', 'IC50 (nM)', 'Selectivity', 'Solubility'],
      ['1', '450', '', ''],
      ['2', '120', '', 'low'],
      ['5', '38', '5x', ''],
      ['7', 'twelve', '', ''],
      ['8', '95', '', '']
    ] } },
    'IC50 = (Vmax * [I]) / (Km + [I])',
    'In the cell based assay the compounds showed antiproliferative activity against several cancer cell line models. Compound 7 reduced cell viability in a dose dependant manner and was more effective then the reference inhibitor. The metabolic stability of the most promising compounds was evaluated in liver microsomes and compound 7 showed a half life of more than 60 minutes. Oral dosing in mice gave plasma levels that were consistant with the in vitro potency. The selectivity profile was determined against a panel of related kinases, and compound 7 inhibited only two off-target kinases at a concentration of 1 µM. These data suggest that the scaffold is a promising starting point for lead optimization. Further studies on toxicity and the pharmacokinetic profile in larger animals are ongoing in our labratory and will be reported in due course. We beleive these compounds could become drugs in future.'
  ],
  conclusions: null,
  coi: null,
  data: null,
  acknowledgments: null,
  omit: ['keywords', 'conclusions', 'coi', 'data', 'contributions'],
  references: [
    'Smith, J. Kinase inhibitors. J. Med. Chem. 2015, 58, 1-10.',
    'Doe, A. Selectivity of drugs. Nature 2018, 550, 100-105.',
    'Lee, B. Docking studies. J. Chem. Inf. Model. 2019, 59, 200-210.'
  ]
};

module.exports = { GOOD, WEAK };
