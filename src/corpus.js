'use strict';

/**
 * A small reference corpus that stands in for a plagiarism database
 * (e.g. Crossref Similarity Check) in this prototype. Previously submitted
 * manuscripts in the platform are added to this corpus at check time.
 */
module.exports = [
  {
    id: 'REF-0001',
    source: 'Published article: "Ligand-Enabled Palladium-Catalyzed C–H Arylation of Unactivated Arenes" (2019)',
    text: `Transition metal catalyzed carbon hydrogen bond functionalization has emerged as a powerful strategy for the construction of complex molecules from simple precursors. In particular palladium catalyzed direct arylation avoids the need for prefunctionalized coupling partners and therefore reduces waste and the number of synthetic steps. Despite significant progress the arylation of unactivated arenes remains challenging because of the low reactivity of the carbon hydrogen bond and the difficulty of controlling site selectivity. Herein we report a mono protected amino acid ligand that accelerates the palladium catalyzed arylation of simple arenes and provides high selectivity for the meta position under mild conditions.`
  },
  {
    id: 'REF-0002',
    source: 'Published article: "Metal–Organic Frameworks for Selective Carbon Dioxide Capture" (2020)',
    text: `Metal organic frameworks are crystalline porous materials constructed from metal nodes and organic linkers and they have attracted considerable attention for gas storage and separation. The high surface area and tunable pore chemistry of these materials make them promising candidates for the selective capture of carbon dioxide from flue gas. However the stability of many frameworks in the presence of water vapor limits their practical application. In this work we describe a series of zirconium based frameworks functionalized with amine groups that retain their crystallinity after exposure to humid conditions and display high carbon dioxide uptake at low pressure.`
  },
  {
    id: 'REF-0003',
    source: 'Published article: "Discovery of Selective Kinase Inhibitors by Structure-Based Design" (2021)',
    text: `Protein kinases regulate a wide range of cellular processes and their dysregulation is associated with cancer and inflammatory diseases. The development of selective kinase inhibitors is complicated by the high structural similarity of the adenosine triphosphate binding site across the kinome. Structure based drug design has enabled the identification of inhibitors that exploit subtle differences in the binding pocket. We describe the optimization of a pyrazolopyrimidine scaffold that resulted in a potent inhibitor with nanomolar activity, excellent selectivity over related kinases and favorable pharmacokinetic properties in mice.`
  },
  {
    id: 'REF-0004',
    source: 'Published article: "Microplastic Transport in Freshwater Sediments" (2022)',
    text: `Microplastics are ubiquitous contaminants in aquatic environments and their accumulation in sediments poses risks to benthic organisms. The transport of microplastic particles in freshwater systems depends on particle size density and shape as well as on hydrodynamic conditions. Field measurements combined with laboratory flume experiments were used to quantify the deposition and resuspension of polyethylene and polystyrene fragments. The results indicate that biofilm formation significantly increases the settling velocity of buoyant particles and promotes their retention in riverbed sediments.`
  },
  {
    id: 'REF-0005',
    source: 'Published article: "Graphene-Based Electrodes for High-Rate Lithium-Ion Batteries" (2018)',
    text: `Lithium ion batteries are the dominant energy storage technology for portable electronics and electric vehicles. Improving the rate capability of electrodes requires materials that combine high electronic conductivity with short ion diffusion pathways. Graphene and its derivatives offer a large specific surface area and excellent conductivity which make them attractive components of composite electrodes. In this study a three dimensional graphene network decorated with silicon nanoparticles was prepared by a scalable freeze drying method and delivered a high reversible capacity at elevated current densities.`
  }
];
