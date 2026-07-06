import { Service } from '../models/Service.js';
import { Category } from '../models/Category.js';
import { Sector } from '../models/Sector.js';
import { upsertRecord, deprecateStale } from './sync-helpers.js';

interface ServiceSeed {
  shortName: string;
  title: string;
  categorySlug: string;
  sectorSlug?: string; // For Critical Infrastructure Services
  provider: string;
  description: string;
  type: 'Software' | 'Hardware' | 'Software/Hardware';
  trl: { current: number; expected: number };
  license: string;
  standards: string[];
  inputs: { name: string; description: string }[];
  outputs: { name: string; description: string }[];
  interactsWith: string[];
  potentialUseCases: string[];
  repositoryTable: 'INTACT_TOOLBOX' | 'OTHER_SERVICES';
}

// ---------------------------------------------------------------------------
// Table 1: Cybersecurity Services catalog (INTACT_TOOLBOX)
//
// Refreshed from the SECASSURED source of truth (Horizon Europe Grant
// Agreement GAP-101225858, "Cybersecurity Services Catalogue"). The 12
// services below are the R1-R5.4 entries from that catalogue's Summary
// Table, grouped into the "Dev Services" (R1-R3.5) and "Ops Services" (R5)
// categories the source document defines. Resolves issue #5.
// ---------------------------------------------------------------------------
const intactToolboxServices: ServiceSeed[] = [
  {
    shortName: 'CSAM',
    title: 'Reference Architecture & Compliance and Security Assurance Model (CSAM)',
    categorySlug: 'dev-services',
    provider: 'Fraunhofer Fokus (FF)',
    description:
      'A holistic, modular assurance model integrating both cybersecurity and regulatory aspects, with a focus on interactions and dependencies between the two. Built with extensible components to adapt to diverse stakeholder needs and hardware/software supply chain requirements. Provides a unified methodology for aligning with certification schemes, standards and regulations including GDPR, the AI Act, and ISO 8000 for data quality.',
    type: 'Software',
    trl: { current: 5, expected: 7 },
    license: 'TBD',
    standards: [
      'ISO/IEC 15408',
      'EUCC',
      'EN 17927',
      'EN 17640',
      'Cyber Security Act',
      'Cyber Resilience Act',
      'AI Act',
    ],
    inputs: [
      {
        name: 'Stakeholder Requirements',
        description: 'Cybersecurity and regulatory requirements from stakeholders',
      },
    ],
    outputs: [
      {
        name: 'Assurance Model',
        description: 'Modular compliance & security assurance model artefacts',
      },
    ],
    interactsWith: [],
    potentialUseCases: [
      'Covers 1+ EU regulation, 3+ recommendations to standards, 1+ organisational policy per use case',
    ],
    repositoryTable: 'INTACT_TOOLBOX',
  },
  {
    shortName: 'SECINTERP',
    title: 'Assurance-driven Standard Interpretation Service (secInterp)',
    categorySlug: 'dev-services',
    provider: 'Tecnalia (TEC)',
    description:
      'A two-level LLM-based assistant (prioritising open-source models) for the automated extraction and interpretation of cybersecurity requirements. Level 1 (Cybersecurity Standard Mapping Assistant) advises non-cybersecurity experts on relevant norms and standards based on their role and industry sector. Level 2 (Cybersecurity Technical Requirements Assistant) assists software developers in industrial sectors during functional requirements specification, ensuring technical requirements align with industry standards.',
    type: 'Software',
    trl: { current: 4, expected: 7 },
    license: 'TBD',
    standards: ['IEC 62443-4-2', 'IEEE 1686', 'IEC 62351'],
    inputs: [
      { name: 'Regulatory Corpus', description: 'Cybersecurity standards and regulatory texts' },
    ],
    outputs: [
      {
        name: 'Requirement Mapping',
        description: 'Interpreted, role-tailored cybersecurity requirements',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['>=25% reduction in time to derive and interpret security requirements'],
    repositoryTable: 'INTACT_TOOLBOX',
  },
  {
    shortName: 'SECSAC',
    title: 'Security Assurance Case Tool (secSAC)',
    categorySlug: 'dev-services',
    provider: 'Tecnalia (TEC)',
    description:
      'An LLM-based assistant capable of identifying Security Assurance Cases (SACs) and mapping the necessary information to fulfil and enrich them: extracting data from requirements lists, company-provided system/product information and the assurance patterns catalogue, then synthesising it into a cohesive, structured document guiding the assurance process. Uses OSCAL for representing security controls and assessment results.',
    type: 'Software',
    trl: { current: 3, expected: 7 },
    license: 'TBD',
    standards: ['OSCAL'],
    inputs: [
      {
        name: 'Requirements & System Information',
        description: 'Requirements lists and product/system descriptions',
      },
    ],
    outputs: [
      {
        name: 'Security Assurance Case',
        description: 'Structured OSCAL-based assurance case document',
      },
    ],
    interactsWith: [],
    potentialUseCases: [
      '>=25% reduction in time to create assurance cases for selected regulations/standards',
    ],
    repositoryTable: 'INTACT_TOOLBOX',
  },
  {
    shortName: 'SECDEVTWIN',
    title: 'Assurance-driven Security Development Twin (SecDevTwin)',
    categorySlug: 'dev-services',
    provider: 'SINTEF (STF)',
    description:
      'A specialised, federated digital twin that continuously supports the software development phase, enabling virtual representation of software components or modules susceptible to vulnerabilities. Integrates the assurance model with Digital Twins for DevOps/TechDebt management, supporting wide collaboration and coordination for multiple assurance tasks and stakeholders within "Security Engineering Workspaces".',
    type: 'Software',
    trl: { current: 3, expected: 7 },
    license: 'TBD',
    standards: [],
    inputs: [
      {
        name: 'Software Component Model',
        description: 'Representation of software components/modules under development',
      },
    ],
    outputs: [
      { name: 'Digital Twin State', description: 'Synchronised development-phase security twin' },
    ],
    interactsWith: [],
    potentialUseCases: [
      '>=25% reduction in time to identify non-compliance issues with security standards',
    ],
    repositoryTable: 'INTACT_TOOLBOX',
  },
  {
    shortName: 'SECNCD',
    title: 'AI-based Non-Compliance Detector (secNCD)',
    categorySlug: 'dev-services',
    provider: 'CERTH',
    description:
      'An AI-based Non-Compliance Detector that identifies regulatory and security gaps at design time (and even at runtime). Enhances LLMs to act as digital assistants guiding reviewers on checking compliance with security requirements, assisting security and compliance experts in assessing system compliance with complex regulations and standards, identifying non-compliance issues and recommending changes.',
    type: 'Software',
    trl: { current: 5, expected: 7 },
    license: 'TBD',
    standards: [],
    inputs: [
      {
        name: 'System & Compliance Requirements',
        description: 'Design-time system artefacts and applicable regulations/standards',
      },
    ],
    outputs: [
      {
        name: 'Non-Compliance Report',
        description: 'Identified regulatory/security gaps and recommended changes',
      },
    ],
    interactsWith: [],
    potentialUseCases: [
      '>=25% reduction in time/effort to detect and repair vulnerabilities at design time',
    ],
    repositoryTable: 'INTACT_TOOLBOX',
  },
  {
    shortName: 'SECVDR',
    title: 'Vulnerability Discovery and Repair (secVDR)',
    categorySlug: 'dev-services',
    provider: 'CERTH',
    description:
      'Detects vulnerabilities residing in the source and configuration code of software programs. Fine-tunes the CodeBERT model for vulnerability detection, covering a wide range of programming languages and considering additional context and system-specific characteristics to increase detection accuracy. Provides proper vulnerability fixes using advanced ML/GenAI models.',
    type: 'Software',
    trl: { current: 5, expected: 7 },
    license: 'TBD',
    standards: [],
    inputs: [
      {
        name: 'Source & Configuration Code',
        description: 'Software source code and configuration files',
      },
    ],
    outputs: [
      {
        name: 'Vulnerability Fixes',
        description: 'Detected vulnerabilities with automated fix suggestions',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['50% of vulnerabilities repaired with minimum human intervention'],
    repositoryTable: 'INTACT_TOOLBOX',
  },
  {
    shortName: 'SECASSURE4AI',
    title: 'Security Assurance Service for AI Components (secAssure4AI)',
    categorySlug: 'dev-services',
    provider: 'Tecnalia (TEC)',
    description:
      'Elevates security by integrating a holistic view encompassing not only security but also key dimensions of AI trustworthiness: explainability, fairness and robustness. Enhances the integration and automation of tests with AML tools and adds tests for LLM-based services.',
    type: 'Software',
    trl: { current: 4, expected: 7 },
    license: 'TBD',
    standards: [],
    inputs: [
      { name: 'AI/ML Component', description: 'AI/ML models and components under assessment' },
    ],
    outputs: [
      {
        name: 'AI Assurance Report',
        description: 'Security, explainability, fairness and robustness assessment results',
      },
    ],
    interactsWith: [],
    potentialUseCases: [
      '>=50% of AI/ML relevant attacks tested automatically for at least 2 use cases',
    ],
    repositoryTable: 'INTACT_TOOLBOX',
  },
  {
    shortName: 'SECSIM',
    title: 'Assurance-driven Simulator (secSIM)',
    categorySlug: 'dev-services',
    provider: 'Montimage (MTI)',
    description:
      'An assurance-driven simulator supporting proactive and predictive analysis of emerging security impacts for evolving hardware/software changes and hybrid AI-enabled systems. Covers IoT security simulation with SOAR capabilities to automate detection, analysis and response to security incidents during the design phase, plus zero-trust networking and AI service architecture deployment simulation. Covers 3 simulation layers: architecture, functional and non-functional.',
    type: 'Software',
    trl: { current: 4, expected: 7 },
    license: 'TBD',
    standards: [],
    inputs: [
      {
        name: 'Architecture Changes',
        description: 'Proposed hardware/software architecture modifications',
      },
    ],
    outputs: [
      {
        name: 'Simulation Results',
        description:
          'Predicted security impacts across architecture, functional and non-functional layers',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['3 simulation layers covered (architecture, functional, non-functional)'],
    repositoryTable: 'INTACT_TOOLBOX',
  },
  {
    shortName: 'SECOPSTWIN',
    title: 'Assurance-driven Security Operation Twin (SecOpsTwin)',
    categorySlug: 'ops-services',
    provider: 'SINTEF (STF)',
    description:
      'A Digital Twin for continuous security monitoring and management, enabling real-time connections to deployed software systems across use cases. Allows human operators to interact with and gain insight into assessment processes using natural language guidance over evaluation results, and includes AI-supported automatic and continuous detection, analysis, evaluation and mitigation of cybersecurity attacks and privacy risks during operation.',
    type: 'Software',
    trl: { current: 4, expected: 7 },
    license: 'TBD',
    standards: [],
    inputs: [
      { name: 'Operational Telemetry', description: 'Real-time data from deployed systems' },
    ],
    outputs: [
      {
        name: 'Security Assessment Insights',
        description: 'Continuous risk/attack assessment and mitigation guidance',
      },
    ],
    interactsWith: [],
    potentialUseCases: [
      '>=80% accuracy of predicted attack data in simulation for at least 2 use cases',
    ],
    repositoryTable: 'INTACT_TOOLBOX',
  },
  {
    shortName: 'SECATTSIM',
    title: 'Attack and Incident Simulator (secAttSIM)',
    categorySlug: 'ops-services',
    provider: 'Tecnalia (TEC)',
    description:
      'Provides new attack simulation tools with white-box and black-box adversarial AI attacks for different operation scenarios. Develops reinforcement learning-guided and LLM-generated attack controls to simulate emerging AI-era attack scenarios, operating in parallel with physical, real IoT-edge-cloud systems and their software components.',
    type: 'Software',
    trl: { current: 4, expected: 7 },
    license: 'TBD',
    standards: [],
    inputs: [
      { name: 'Operation Scenario', description: 'IoT-edge-cloud system and scenario definitions' },
    ],
    outputs: [
      { name: 'Simulated Attacks', description: 'Adversarial AI attack and incident simulations' },
    ],
    interactsWith: [],
    potentialUseCases: ['>=80% accuracy of attack/anomaly detection'],
    repositoryTable: 'INTACT_TOOLBOX',
  },
  {
    shortName: 'SECANOD',
    title: 'AI-based Attack/Anomaly Detection (secAnoD)',
    categorySlug: 'ops-services',
    provider: 'Montimage (MTI)',
    description:
      'Develops explainable LLM-based models for anomaly detection and prediction, extending MMT (Multi-modal Model) with LLMs to automatically generate new detection mechanisms and facilitate operator reporting via an adaptive GUI. Learns from up-to-date threat intelligence (e.g. through RAG), recommends security solutions and autonomously mitigates vulnerabilities identified by security experts.',
    type: 'Software',
    trl: { current: 3, expected: 7 },
    license: 'TBD',
    standards: [],
    inputs: [
      {
        name: 'Threat Intelligence & Telemetry',
        description: 'Up-to-date threat intelligence feeds and monitoring data',
      },
    ],
    outputs: [
      {
        name: 'Anomaly Predictions',
        description: 'Explainable attack/anomaly detections and mitigation recommendations',
      },
    ],
    interactsWith: [],
    potentialUseCases: [
      '>=80% accuracy of incident prediction; >=70% of studied attacks where the SOAR learns the response solution',
    ],
    repositoryTable: 'INTACT_TOOLBOX',
  },
  {
    shortName: 'SECAISOAR',
    title: 'AI-driven Security Control Orchestration (secAISOAR)',
    categorySlug: 'ops-services',
    provider: 'Montimage (MTI)',
    description:
      'Handles intelligent selection of optimal responses to security incidents, building on an enhancement of the "Shuffle automation" open-source solution. Analyses real-time data and threat intelligence to improve decision-making, integrating resilience mechanisms within its playbooks that focus on both immediate threat remediation and system recovery/adaptation, with reinforcement learning for better playbook adaptation.',
    type: 'Software',
    trl: { current: 6, expected: 7 },
    license: 'TBD',
    standards: [],
    inputs: [
      {
        name: 'Incident & Threat Data',
        description: 'Real-time security incident and threat intelligence data',
      },
    ],
    outputs: [
      {
        name: 'Orchestrated Response Playbook',
        description: 'Automated remediation and recovery actions',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['>=15% improvement in system resilience from proposed remediations'],
    repositoryTable: 'INTACT_TOOLBOX',
  },
];

// ---------------------------------------------------------------------------
// Table 2: Infrastructure list (OTHER_SERVICES)
//
// Refreshed from the SECASSURED source of truth (Grant Agreement
// GAP-101225858, Part B page 41, section "Infrastructure"). Each entry is a
// piece of partner-operated infrastructure supporting the project's use
// cases; `sectorSlug` maps it to the closest NIS2 sector already seeded in
// `sectors.seed.ts`. Resolves issue #7.
//
// The source document's separate "Cybersecurity Infrastructure" section
// explicitly lists none ("*None listed in the Grant Agreement.*"), so no
// entries are seeded for that classification — see issue #6, resolved by the
// deprecate-stale mechanism in `seedServices()`/`seedCategories()` retiring
// whatever legacy entries previously stood in for it (e.g. the old
// `infrastructure` category and its `AEGIS-COS` message-broker tool).
// ---------------------------------------------------------------------------
const infrastructureServices: ServiceSeed[] = [
  {
    shortName: 'ORO-5GLAB',
    title: 'Orange 5G Lab',
    categorySlug: '5g-testbeds',
    sectorSlug: 'digital-infrastructure',
    provider: 'ORO (Orange Romania)',
    description:
      '5G Full-Stack Development, Testing, And Validation Laboratory with state-of-the-art equipment and access to current 3GPP and future 3GPP-specification technologies.',
    type: 'Software/Hardware',
    trl: { current: 9, expected: 9 },
    license: 'N/A (Partner Infrastructure)',
    standards: ['3GPP'],
    inputs: [
      {
        name: 'RF & Network Configuration',
        description: '5G lab equipment configuration for full-stack testing',
      },
    ],
    outputs: [
      {
        name: 'Validated 5G Test Results',
        description: 'Development, testing and validation results across the 5G stack',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['UC1 - Telecom Software Development Life Cycle'],
    repositoryTable: 'OTHER_SERVICES',
  },
  {
    shortName: 'ORO-3GPP16',
    title: '3GPP Rel 16 Commercial Facility',
    categorySlug: '5g-testbeds',
    sectorSlug: 'digital-infrastructure',
    provider: 'ORO (Orange Romania)',
    description:
      '5G infrastructure deployed in 45 cities, providing agility for new 5G communication systems with dedicated/customised network slices (e.g. MEC capabilities).',
    type: 'Hardware',
    trl: { current: 9, expected: 9 },
    license: 'N/A (Partner Infrastructure)',
    standards: ['3GPP'],
    inputs: [
      {
        name: 'Network Slice Requests',
        description: 'Requests for dedicated/customised 5G network slices',
      },
    ],
    outputs: [
      {
        name: 'Commercial 5G Network Slices',
        description: 'MEC-capable network slices across 45 deployed cities',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['UC1 - Telecom Software Development Life Cycle'],
    repositoryTable: 'OTHER_SERVICES',
  },
  {
    shortName: 'ITPAERO-CLUSTER',
    title: 'Computer Cluster',
    categorySlug: 'hpc-compute',
    sectorSlug: 'manufacturing',
    provider: 'ITP Aero',
    description:
      'Capacity within the world top 500; optimised for CFD simulations, FEM, materials, aerothermal, design optimisation, manufacturing processes and highly complex coupled models.',
    type: 'Hardware',
    trl: { current: 9, expected: 9 },
    license: 'N/A (Partner Infrastructure)',
    standards: [],
    inputs: [
      {
        name: 'Simulation Jobs',
        description: 'CFD/FEM/materials/aerothermal simulation workloads',
      },
    ],
    outputs: [
      { name: 'Simulation Results', description: 'High-fidelity engineering simulation outputs' },
    ],
    interactsWith: [],
    potentialUseCases: ['UC2 - Aerospace Digitalization Platform'],
    repositoryTable: 'OTHER_SERVICES',
  },
  {
    shortName: 'ITPAERO-CFAA',
    title: 'CFAA (Basque Country University)',
    categorySlug: 'manufacturing-labs',
    sectorSlug: 'manufacturing',
    provider: 'ITP Aero',
    description:
      'Equipped with advanced manufacturing equipment for joint R&T manufacturing projects.',
    type: 'Hardware',
    trl: { current: 9, expected: 9 },
    license: 'N/A (Partner Infrastructure)',
    standards: [],
    inputs: [
      {
        name: 'Manufacturing Process Specs',
        description: 'Joint R&T manufacturing project requirements',
      },
    ],
    outputs: [
      {
        name: 'Manufactured Components',
        description: 'R&T manufacturing outputs from advanced equipment',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['UC2 - Aerospace Digitalization Platform'],
    repositoryTable: 'OTHER_SERVICES',
  },
  {
    shortName: 'SAVVY-DEVSRV',
    title: 'Development Servers & Operational Networks',
    categorySlug: 'data-center-hosting',
    sectorSlug: 'digital-infrastructure',
    provider: 'SAVVY (Savvy Data Systems)',
    description:
      'Core distributed network in Logroño on a TIER III Data Centre; provides real-time, big data, massive infrastructure for machines and gateways worldwide.',
    type: 'Software/Hardware',
    trl: { current: 9, expected: 9 },
    license: 'N/A (Partner Infrastructure)',
    standards: [],
    inputs: [
      {
        name: 'Device & Gateway Telemetry',
        description: 'Global machine and gateway data streams',
      },
    ],
    outputs: [
      {
        name: 'Distributed Network Services',
        description: 'Real-time big-data infrastructure services',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['Cross-cutting infrastructure support'],
    repositoryTable: 'OTHER_SERVICES',
  },
  {
    shortName: 'IDEKO-CNC',
    title: 'Industry 4.0 CNC Controller Digital Laboratory',
    categorySlug: 'manufacturing-labs',
    sectorSlug: 'manufacturing',
    provider: 'IDEKO',
    description: 'For testing and demonstration purposes where a digital factory can be simulated.',
    type: 'Software/Hardware',
    trl: { current: 9, expected: 9 },
    license: 'N/A (Partner Infrastructure)',
    standards: [],
    inputs: [
      { name: 'Factory Process Model', description: 'Digital factory simulation configuration' },
    ],
    outputs: [
      {
        name: 'Digital Factory Simulation',
        description: 'Simulated Industry 4.0 CNC factory environment',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['Cross-cutting infrastructure support'],
    repositoryTable: 'OTHER_SERVICES',
  },
  {
    shortName: 'UIH-PROSUMER',
    title: 'Prosumer Cell',
    categorySlug: 'energy-grid-infrastructure',
    sectorSlug: 'energy',
    provider: 'UIH (Urban Institute Magyarorszag)',
    description:
      '3.5kW peak capacity solar powered (DER - distributed energy resource) at Balatonfüred site; 5kWh energy storage capacity; connected to local power grid and internet for remote control.',
    type: 'Hardware',
    trl: { current: 9, expected: 9 },
    license: 'N/A (Partner Infrastructure)',
    standards: [],
    inputs: [
      {
        name: 'Solar Irradiance & Grid Signals',
        description: 'Solar generation input and grid connection signals',
      },
    ],
    outputs: [
      {
        name: 'Distributed Energy Resource Data',
        description: 'Prosumer generation, storage and remote-control telemetry',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['UC3 - Renewable Prosumer Energy'],
    repositoryTable: 'OTHER_SERVICES',
  },
  {
    shortName: 'SPS-DEVSECOPS',
    title: 'DevSecOps Architecture',
    categorySlug: 'devsecops-platforms',
    sectorSlug: 'energy',
    provider: 'SPS (Safepay Systems)',
    description: 'Three system platforms providing a solid background for development activities.',
    type: 'Software',
    trl: { current: 9, expected: 9 },
    license: 'N/A (Partner Infrastructure)',
    standards: [],
    inputs: [
      { name: 'Development Pipelines', description: 'Application build/test/deploy pipelines' },
    ],
    outputs: [
      { name: 'DevSecOps Environment', description: 'Secure development and operations platform' },
    ],
    interactsWith: [],
    potentialUseCases: ['UC3 - Renewable Prosumer Energy'],
    repositoryTable: 'OTHER_SERVICES',
  },
  {
    shortName: 'TELLU-CARE',
    title: 'TelluCare Product Family',
    categorySlug: 'healthcare-iot-platforms',
    sectorSlug: 'health',
    provider: 'TELLU AS',
    description:
      'IPR software product line enabling remote healthcare as SaaS; Personal Health Gateway for managing and operating IoT and Edge infrastructure distributed in patient homes.',
    type: 'Software',
    trl: { current: 9, expected: 9 },
    license: 'N/A (Partner Infrastructure)',
    standards: [],
    inputs: [
      {
        name: 'Patient Health Device Data',
        description: 'IoT/Edge health device data from patient homes',
      },
    ],
    outputs: [
      {
        name: 'Remote Healthcare Services',
        description: 'SaaS-delivered remote healthcare monitoring and management',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['UC4 - Healthcare (eHealth SaaS)'],
    repositoryTable: 'OTHER_SERVICES',
  },
  {
    shortName: 'PPC-EMOB',
    title: 'E-mobility Testing Facilities',
    categorySlug: 'e-mobility-iiot',
    sectorSlug: 'energy',
    provider: 'PPC',
    description:
      'A number of charging stations with technological diversity from various vendors; exploited for testing new technologies and services for CPOs and eMSPs.',
    type: 'Hardware',
    trl: { current: 9, expected: 9 },
    license: 'N/A (Partner Infrastructure)',
    standards: [],
    inputs: [
      {
        name: 'Charging Session Requests',
        description: 'EV charging protocol/session test requests',
      },
    ],
    outputs: [
      {
        name: 'Charging Test Results',
        description: 'Interoperability and technology test results for CPOs/eMSPs',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['UC5 - Smart Charging Stations'],
    repositoryTable: 'OTHER_SERVICES',
  },
  {
    shortName: 'PPC-IIOT',
    title: 'PPC IIoT Lab',
    categorySlug: 'e-mobility-iiot',
    sectorSlug: 'energy',
    provider: 'PPC',
    description:
      'Two virtualisation nodes and a number of IIoT devices for cybersecurity experiments; used for evaluating cybersecurity platforms and products.',
    type: 'Software/Hardware',
    trl: { current: 9, expected: 9 },
    license: 'N/A (Partner Infrastructure)',
    standards: [],
    inputs: [
      {
        name: 'IIoT Device Traffic',
        description: 'Industrial IoT device network traffic and telemetry',
      },
    ],
    outputs: [
      {
        name: 'Cybersecurity Evaluation Results',
        description: 'Evaluation results for cybersecurity platforms and products',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['UC5 - Smart Charging Stations'],
    repositoryTable: 'OTHER_SERVICES',
  },
  {
    shortName: 'AST-DEDISRV',
    title: 'Dedicated Server',
    categorySlug: 'data-center-hosting',
    sectorSlug: 'ict-service-management-b2b',
    provider: 'AST (Assist Software)',
    description:
      'For hosting development environments, version control systems, and CI/CD pipelines.',
    type: 'Hardware',
    trl: { current: 9, expected: 9 },
    license: 'N/A (Partner Infrastructure)',
    standards: [],
    inputs: [
      { name: 'CI/CD Jobs', description: 'Build, version control and deployment pipeline jobs' },
    ],
    outputs: [
      {
        name: 'Hosted Dev Environments',
        description: 'Hosted development, VCS and CI/CD services',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['Cross-cutting infrastructure support'],
    repositoryTable: 'OTHER_SERVICES',
  },
  {
    shortName: 'AALTO-LUMI',
    title: 'LUMI Supercomputer',
    categorySlug: 'hpc-compute',
    sectorSlug: 'research',
    provider: 'AALTO',
    description: 'Top green supercomputer in EU for AI training.',
    type: 'Hardware',
    trl: { current: 9, expected: 9 },
    license: 'N/A (Partner Infrastructure)',
    standards: [],
    inputs: [
      { name: 'AI Training Workloads', description: 'Large-scale AI/ML model training jobs' },
    ],
    outputs: [
      {
        name: 'Trained AI Models',
        description: 'AI training results from high-performance computing',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['Research infrastructure support'],
    repositoryTable: 'OTHER_SERVICES',
  },
  {
    shortName: 'AALTO-EDGE5G',
    title: 'Edge Devices & 5G Testbed',
    categorySlug: '5g-testbeds',
    sectorSlug: 'research',
    provider: 'AALTO',
    description: 'For IIoT and edge computing.',
    type: 'Software/Hardware',
    trl: { current: 9, expected: 9 },
    license: 'N/A (Partner Infrastructure)',
    standards: ['3GPP'],
    inputs: [{ name: 'Edge Workloads', description: 'IIoT and edge computing workloads' }],
    outputs: [
      {
        name: 'Edge Computing Results',
        description: 'Processed IIoT/edge computing outputs over the 5G testbed',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['Research infrastructure support'],
    repositoryTable: 'OTHER_SERVICES',
  },
];

const servicesData: ServiceSeed[] = [...intactToolboxServices, ...infrastructureServices];
const activeServiceShortNames = servicesData.map((s) => s.shortName.toUpperCase());

export const seedServices = async (): Promise<void> => {
  console.info('Seeding services...');

  // Get all categories for lookup
  const categories = await Category.find();
  const categoryMap = new Map(categories.map((c) => [c.slug, c._id]));

  // Get all sectors for lookup (for Critical Infrastructure Services)
  const sectors = await Sector.find();
  const sectorMap = new Map(sectors.map((s) => [s.slug, s._id]));

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const serviceData of servicesData) {
    const categoryId = categoryMap.get(serviceData.categorySlug);

    if (!categoryId) {
      console.error(
        `  Category not found for ${serviceData.shortName}: ${serviceData.categorySlug}`
      );
      skipped++;
      continue;
    }

    let sectorId = undefined;
    if (serviceData.sectorSlug) {
      sectorId = sectorMap.get(serviceData.sectorSlug);
      if (!sectorId) {
        console.warn(`  Sector not found for ${serviceData.shortName}: ${serviceData.sectorSlug}`);
      }
    }

    const desiredFields: Record<string, unknown> = {
      title: serviceData.title,
      categoryId,
      sectorId,
      provider: serviceData.provider,
      description: serviceData.description,
      type: serviceData.type,
      trl: serviceData.trl,
      license: serviceData.license,
      standards: serviceData.standards,
      inputs: serviceData.inputs,
      outputs: serviceData.outputs,
      interactsWith: serviceData.interactsWith,
      potentialUseCases: serviceData.potentialUseCases,
      repositoryTable: serviceData.repositoryTable,
    };

    const action = await upsertRecord(Service, { shortName: serviceData.shortName }, desiredFields);

    if (action === 'created') {
      created++;
      // A brand-new service needs an initial version entry; upsertRecord only
      // manages the tracked fields above, so set it separately.
      await Service.updateOne(
        { shortName: serviceData.shortName },
        {
          $set: {
            currentVersion: '1.0.0',
            versions: [
              {
                version: '1.0.0',
                dockerImage: `registry.montimage.eu/${serviceData.provider.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${serviceData.shortName.toLowerCase()}:v1.0.0`,
                releaseNotes: 'Initial release',
                releasedAt: new Date(),
              },
            ],
          },
        }
      );
      const sectorInfo = sectorId ? ` (sector: ${serviceData.sectorSlug})` : '';
      console.info(`  Created service: ${serviceData.shortName}${sectorInfo}`);
    } else if (action === 'updated') {
      updated++;
      console.info(`  Updated service: ${serviceData.shortName}`);
    } else {
      unchanged++;
      console.info(`  Service up to date: ${serviceData.shortName}`);
    }
  }

  const deprecatedCount = await deprecateStale(Service, {}, 'shortName', activeServiceShortNames);
  if (deprecatedCount > 0) {
    console.info(`  Deprecated ${deprecatedCount} services no longer in the source catalog`);
  }

  console.info(
    `Services seeded successfully (${created} created, ${updated} updated, ${unchanged} unchanged, ${skipped} skipped, ${deprecatedCount} deprecated)`
  );
};
