'use strict';

/**
 * Reference lists used by the MSC integrity clauses (src/clauses.js).
 *
 * In production each list is replaced by a live feed or provider API:
 *   retractions      → Crossref REST API (Retraction Watch data, Crossmark updates)
 *   predatory venues → internal watch-list / Cabells-style list
 *   sanctions        → OFAC SDN, EU, UN, UK and BIS Entity List feeds or a screening provider
 *   ROR domains      → ROR API (institution ↔ e-mail domain)
 *   free / disposable mail domains → maintained domain lists
 *
 * The prototype ships small DEMO lists so the checks run offline. Entries
 * that are not real-world data use fictitious names and the Crossref test
 * DOI prefix 10.5555, so nothing here labels a real paper or organisation.
 */

// Crossref/Retraction Watch stand-in: DOI or title fragment → notice.
const RETRACTIONS = [
  { doi: '10.5555/retracted.2019.0042', title: 'ultrasensitive kinase profiling by quantum dot fret', notice: 'Retracted (2021): data fabrication', type: 'retraction' },
  { doi: '10.5555/eoc.2022.0117', title: 'room-temperature superconductivity in doped lead apatite thin films', notice: 'Expression of concern (2023): image irregularities under investigation', type: 'expression of concern' },
  { doi: '10.5555/retracted.2020.0310', title: 'universal catalyst for nitrogen fixation at ambient conditions', notice: 'Retracted (2022): results could not be reproduced', type: 'retraction' },
  { doi: '10.5555/withdrawn.2018.0007', title: 'self-healing perovskite single crystals under ambient light', notice: 'Withdrawn (2019) by the authors', type: 'withdrawal' }
];

// Predatory / hijacked journal watch-list (fictitious demo titles).
const PREDATORY_VENUES = [
  'International Journal of Advanced Chemical Research Letters',
  'Global Journal of Pure and Applied Chemical Sciences',
  'World Open Journal of Nanoscience and Engineering',
  'American Journal of Universal Pharmaceutical Discoveries',
  'Journal of Rapid Molecular Publications'
];

// Venues recognised in reference strings, used for citation-stacking checks.
const VENUES = [
  ['J. Am. Chem. Soc.', /\bJ\.?\s*Am\.?\s*Chem\.?\s*Soc\b|Journal of the American Chemical Society/i],
  ['Angew. Chem. Int. Ed.', /\bAngew(andte)?\.?\s*Chem/i],
  ['Nano Lett.', /\bNano\s*Lett/i],
  ['ACS Nano', /\bACS\s*Nano\b/i],
  ['Nat. Mater.', /\bNat(ure)?\.?\s*Mater/i],
  ['Nat. Commun.', /\bNat(ure)?\.?\s*Commun/i],
  ['Nat. Chem.', /\bNat(ure)?\.?\s*Chem\b/i],
  ['Nature', /\bNature\b(?!\s*(Commun|Mater|Chem|Energy|Catal|Nano|Rev|Sustain|Photon))/],
  ['Science', /\bScience\b(?!\s*(Advances|China|Bulletin))/],
  ['Chem. Rev.', /\bChem\.?\s*Rev\b|Chemical Reviews/i],
  ['Chem. Sci.', /\bChem\.?\s*Sci\b/i],
  ['Adv. Mater.', /\bAdv(anced)?\.?\s*Mater(ials)?\b(?!\s*Interfaces)/i],
  ['Adv. Sci.', /\bAdv(anced)?\.?\s*Sci(ence)?\b/i],
  ['Adv. Energy Mater.', /\bAdv(anced)?\.?\s*Energy\s*Mater/i],
  ['Energy Environ. Sci.', /\bEnergy\s*(&|and)?\s*Environ(mental)?\.?\s*Sci/i],
  ['Org. Lett.', /\bOrg\.?\s*Lett\b|Organic Letters/i],
  ['J. Org. Chem.', /\bJ\.?\s*Org\.?\s*Chem\b/i],
  ['Inorg. Chem.', /\bInorg\.?\s*Chem\b/i],
  ['J. Phys. Chem. C', /\bJ\.?\s*Phys\.?\s*Chem\.?\s*C\b/i],
  ['J. Med. Chem.', /\bJ\.?\s*Med\.?\s*Chem\b/i],
  ['ACS Catal.', /\bACS\s*Catal/i],
  ['ACS Energy Lett.', /\bACS\s*Energy\s*Lett/i],
  ['Chem. Mater.', /\bChem\.?\s*Mater\b/i],
  ['Chem. Soc. Rev.', /\bChem\.?\s*Soc\.?\s*Rev\b/i],
  ['Chem. Commun.', /\bChem\.?\s*Commun\b/i],
  ['Joule', /\bJoule\b/]
];

// Restricted-party screening stand-in (fictitious entities, demo only).
const SANCTIONS = [
  { name: 'Northgate Defence Materials Institute', list: 'Demo restricted-party list (stands in for BIS Entity List)', country: '—' },
  { name: 'Volkhov Advanced Propellants Bureau', list: 'Demo restricted-party list (stands in for OFAC SDN)', country: '—' },
  { name: 'Red Meridian Strategic Chemicals Co', list: 'Demo restricted-party list (stands in for EU consolidated list)', country: '—' },
  { name: 'Kestrel Dual-Use Research Centre', list: 'Demo restricted-party list (stands in for UK sanctions list)', country: '—' },
  { name: 'Ostrava Nuclear Isotope Trading', list: 'Demo restricted-party list (stands in for UN consolidated list)', country: '—' }
];

const FREE_MAIL = ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'hotmail.com', 'outlook.com', 'live.com', 'qq.com', '163.com', '126.com', 'aol.com', 'icloud.com', 'gmx.com', 'gmx.de', 'proton.me', 'protonmail.com', 'yandex.ru', 'mail.ru', 'rediffmail.com', 'sina.com'];
const DISPOSABLE_MAIL = ['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'trashmail.com', 'yopmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com', 'throwawaymail.com'];

// Institutional domains used for look-alike (typosquat) detection.
const INSTITUTION_DOMAINS = [
  'harvard.edu', 'mit.edu', 'stanford.edu', 'caltech.edu', 'berkeley.edu', 'wisc.edu', 'princeton.edu', 'yale.edu', 'columbia.edu',
  'ox.ac.uk', 'cam.ac.uk', 'imperial.ac.uk', 'ucl.ac.uk', 'tcd.ie', 'ethz.ch', 'epfl.ch', 'tum.de', 'mpg.de', 'kofo.mpg.de',
  'uw.edu.pl', 'kyoto-u.ac.jp', 'u-tokyo.ac.jp', 'kaust.edu.sa', 'usp.br', 'weizmann.ac.il', 'ki.se', 'pku.edu.cn', 'polimi.it',
  'iisc.ac.in', 'cnrs.fr', 'iit.it', 'unimib.it', 'uantwerpen.be', 'sioc.ac.cn', 'ucas.ac.cn', 'szu.edu.cn', 'hkust-gz.edu.cn',
  'ust.hk', 'bit.edu.cn', 'tu-chemnitz.de', 'nus.edu.sg', 'ntu.edu.sg', 'utoronto.ca', 'acs.org'
];

// ROR stand-in: e-mail domain → institution name fragments it belongs to.
const ROR_DOMAINS = {
  'unimib.it': ['milano-bicocca', 'milano bicocca'],
  'iit.it': ['istituto italiano di tecnologia'],
  'uantwerpen.be': ['university of antwerp'],
  'sioc.ac.cn': ['shanghai institute of organic chemistry'],
  'ucas.ac.cn': ['university of chinese academy of sciences'],
  'hznu.edu.cn': ['hangzhou normal university'],
  'szu.edu.cn': ['shenzhen university'],
  'hkust-gz.edu.cn': ['hong kong university of science and technology'],
  'ust.hk': ['hong kong university of science and technology'],
  'bit.edu.cn': ['beijing institute of technology'],
  'tu-chemnitz.de': ['tu chemnitz', 'chemnitz university of technology'],
  'wisc.edu': ['university of wisconsin'],
  'tum.de': ['technical university of munich'],
  'cam.ac.uk': ['university of cambridge']
};

// Leftover chatbot text (IA-08).
const CHATBOT_PHRASES = [
  'as an ai language model', 'as a large language model', 'regenerate response', 'i cannot fulfill this request',
  'certainly! here is', 'certainly, here is', 'here is a revised version', 'i hope this helps', 'knowledge cutoff',
  'my last knowledge update', 'i don\'t have access to real-time', 'please note that as an ai', 'insert citation here',
  '[citation needed]', 'as of my last update'
];

// Tortured phrases (Problematic Paper Screener style): tortured → expected term.
const TORTURED_PHRASES = {
  'counterfeit consciousness': 'artificial intelligence',
  'profound learning': 'deep learning',
  'irregular woodland': 'random forest',
  'bosom peril': 'breast cancer',
  'flag to commotion': 'signal to noise',
  'colossal information': 'big data',
  'haphazard woodland': 'random forest',
  'mean square blunder': 'mean square error',
  'man-made brainpower': 'artificial intelligence',
  'neural organization': 'neural network',
  'sun powered': 'solar',
  'vitality utilization': 'energy consumption',
  'amino corrosive': 'amino acid',
  'lactic corrosive': 'lactic acid',
  'warm conductivity': 'thermal conductivity',
  'nuclear power microscopy': 'atomic force microscopy',
  'checking electron magnifying instrument': 'scanning electron microscope',
  'x-beam diffraction': 'X-ray diffraction'
};

// Vocabulary over-represented in LLM-generated prose; used for a coarse AI-text score.
const AI_STYLE_TERMS = [
  'delve', 'delves', 'delving', 'tapestry', 'intricate', 'intricacies', 'showcasing', 'showcases', 'meticulous', 'meticulously',
  'commendable', 'noteworthy', 'realm', 'multifaceted', 'paramount', 'seamlessly', 'seamless', 'underscores', 'underscoring',
  'pivotal', 'groundbreaking', 'invaluable', 'game-changer', 'unwavering', 'navigating the complexities', 'ever-evolving',
  'holistic', 'synergistic interplay', 'a testament to'
];

module.exports = {
  RETRACTIONS, PREDATORY_VENUES, VENUES, SANCTIONS, FREE_MAIL, DISPOSABLE_MAIL, INSTITUTION_DOMAINS, ROR_DOMAINS,
  CHATBOT_PHRASES, TORTURED_PHRASES, AI_STYLE_TERMS
};
