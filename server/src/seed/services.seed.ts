import { Service, type IDeploymentSpec } from '../models/Service.js';
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
  /**
   * UI affordance for the service in the execution view — `web` (default when
   * absent) renders the dashboard link, `terminal` renders a shell-access
   * hint instead (issue #233).
   */
  uiType?: 'web' | 'terminal' | 'both';
  /**
   * Explicit `versions[0].dockerImage` for the initial seeded version. When
   * absent, `seedServices()` generates a synthetic
   * `registry.montimage.eu/<provider-slug>/<shortName>:v1.0.0` reference.
   */
  dockerImage?: string;
  /**
   * Optional Kubernetes deployment spec (issue #188, playbook task 0.3) —
   * how the service's container is deployed in a scenario execution. Only
   * the Montimage scenario modules carry one; other services rely on the
   * engine defaults.
   */
  deployment?: IDeploymentSpec;
}

// INTACT_TOOLBOX: Cybersecurity Services catalog
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
// Montimage attack → detect → respond scenario modules (issue #186)
//
// The four containerized modules the Kubernetes scenario deploys — roles and
// wiring in docs/playbooks/montimage-attack-detect-respond-plan.md. Each entry
// carries the image reference confirmed in plan task Pre.1 (the `montimage-mti`
// namespace of registry.montimage.eu, pinned to v1.0.0) instead of the
// synthetic `<provider-slug>/<shortName>` dockerImage fallback. Task 0.2
// (issue #187) assigns each module to its scenario role category —
// attack/target/monitor/reaction — which drives node badges and edge
// validation in the client.
// ---------------------------------------------------------------------------
const montimageScenarioServices: ServiceSeed[] = [
  {
    shortName: 'MAG',
    title: 'Montimage Attack Generator (MAG)',
    categorySlug: 'attack',
    provider: 'Montimage (MTI)',
    description:
      'Containerized attack-traffic generator distributed by Montimage. Runs its CLI (`mag <attack> --target-ip <ip> --target-port <port>`) sending HTTP attack traffic at the scenario target; in the attack→detect→respond scenario it is deployed as a long-running Deployment the user drives from a shell via `kubectl exec`.',
    type: 'Software',
    trl: { current: 6, expected: 8 },
    license: 'TBD',
    standards: [],
    inputs: [
      {
        name: 'Attack Profile & Target',
        description: 'Attack type plus target Service IP/port passed as CLI args',
      },
    ],
    outputs: [
      {
        name: 'Attack Traffic',
        description: 'HTTP attack traffic directed at the scenario target',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['Attack module in the Montimage attack→detect→respond scenario'],
    repositoryTable: 'INTACT_TOOLBOX',
    dockerImage: 'registry.montimage.eu/montimage-mti/mag:v1.0.0',
    // Terminal UI (issue #233): the execution view shows a copyable
    // `kubectl exec` hint instead of a dashboard link.
    uiType: 'terminal',
    deployment: {
      // Long-running attack machine (issue #233): a Deployment whose pod
      // idles between attacks — the packaged `mag` image exits after its
      // CLI, so `command` overrides the entrypoint with an idle loop and the
      // user drives attacks with
      // `kubectl exec -it deploy/mag -n <exec-ns> -- sh -c 'mag <attack>
      // --target-ip <target> --target-port 8080 2>&1 | tee /proc/1/fd/1'`
      // (the tee lands the attack output in the MAG container log).
      // `startOrder` still rolls it out last so monitor and reaction report
      // Ready before the attack machine is available.
      kind: 'Deployment',
      role: 'attack',
      exposePort: false,
      command: ['sh', '-c', 'while true; do sleep 3600; done'],
      securityContext: { capabilities: ['NET_ADMIN', 'NET_RAW'] },
      startOrder: 30,
    },
  },
  {
    shortName: 'HTTP-SIM',
    title: 'Simulated HTTP Server (HTTP-SIM)',
    categorySlug: 'target',
    provider: 'Montimage (MTI)',
    description:
      'Packaged HTTP victim workload listening on :8080 (`GET /` → 200). The only workload MAG is allowed to reach in the attack→detect→respond scenario; MMT-Probe is injected as a sidecar in its pod to observe the traffic.',
    type: 'Software',
    trl: { current: 6, expected: 8 },
    license: 'TBD',
    standards: [],
    inputs: [
      {
        name: 'HTTP Requests',
        description: 'Inbound HTTP traffic, including MAG attack traffic',
      },
    ],
    outputs: [
      {
        name: 'HTTP Responses',
        description: 'Served responses plus the traffic surface observed by MMT-Probe',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['Target module in the Montimage attack→detect→respond scenario'],
    repositoryTable: 'INTACT_TOOLBOX',
    dockerImage: 'registry.montimage.eu/montimage-mti/http-sim:v1.0.0',
    deployment: {
      // Victim workload: HTTP on :8080, readiness `GET /` → 200 (Pre.2).
      kind: 'Deployment',
      role: 'target',
      containerPort: 8080,
      exposePort: true,
      readinessPath: '/',
      startOrder: 10,
    },
  },
  {
    shortName: 'MMT-PROBE',
    title: 'MMT Traffic Analysis Probe (MMT-PROBE)',
    categorySlug: 'monitor',
    provider: 'Montimage (MTI)',
    description:
      'Montimage Monitoring Tool DPI probe (shipped publicly as the `montimage/mmt` image). Injected as a sidecar sharing the target pod network namespace — requires NET_ADMIN and NET_RAW — configured via `mmt-probe.conf` (libconfig) or the `HOST_INTERFACE` env, and emits security alerts/reports consumed by AI4SOAR.',
    type: 'Software',
    trl: { current: 7, expected: 8 },
    license: 'TBD',
    standards: [],
    inputs: [
      {
        name: 'Pod Network Traffic',
        description: 'Packets on the target pod interface (HOST_INTERFACE / -i arg)',
      },
    ],
    outputs: [
      {
        name: 'DPI Alerts & Reports',
        description: 'Security output-channel alerts and analysis reports',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['Monitor module in the Montimage attack→detect→respond scenario'],
    repositoryTable: 'INTACT_TOOLBOX',
    dockerImage: 'registry.montimage.eu/montimage-mti/mmt-probe:v1.0.0',
    deployment: {
      // DPI probe injected as a sidecar in the target pod — shares its
      // network namespace, so it needs NET_ADMIN + NET_RAW (Pre.2/Pre.3)
      // and exposes no port. Alerts go to the Kafka topic AI4SOAR consumes.
      kind: 'Deployment',
      role: 'monitor',
      attachMode: 'sidecar',
      exposePort: false,
      env: [{ name: 'HOST_INTERFACE', value: 'eth0' }],
      configFiles: [
        {
          mountPath: '/opt/mmt/probe/mmt-probe.conf',
          content: [
            '# mmt-probe.conf — Montimage attack→detect→respond scenario',
            '# (libconfig syntax). Captures on the pod interface and emits',
            '# security reports over a *set* of channels — see playbook task',
            '# Pre.2 for the confirmed runtime contract (issue #234):',
            '#   kafka  → the broker AI4SOAR consumes alerts from',
            '#   stdout → each alert on the container log the SSE stream ships',
            '#   file   → CSV archive in the mmt-reports emptyDir (forensics)',
            '#',
            '# output-channel takes a set {…}, not a scalar; every channel is',
            '# gated by its own *-output.enable block.',
            'output = {',
            '  format = "JSON";',
            '};',
            'security = {',
            '  output-channel = { kafka, stdout, file };',
            '};',
            'kafka-output = {',
            '  enable = true;',
            '  # The ai4soar deployment bundles the broker its',
            '  # KafkaAlertConsumer reads (Pre.2).',
            '  host = "ai4soar";',
            '  port = 9092;',
            '  topic = "mmt-security-alerts";',
            '};',
            'stdout-output = {',
            '  enable = true;',
            '};',
            'file-output = {',
            '  enable = true;',
            '  # Mounted mmt-reports emptyDir — shared with the host container.',
            '  path = "/opt/mmt/probe/result/report";',
            '};',
          ].join('\n'),
        },
      ],
      volumes: [{ name: 'mmt-reports', mountPath: '/opt/mmt/probe/result/report', emptyDir: true }],
      securityContext: { capabilities: ['NET_ADMIN', 'NET_RAW'] },
      startOrder: 10,
    },
  },
  {
    shortName: 'SECANOD',
    title: 'AI-based Attack/Anomaly Detection (secAnoD)',
    categorySlug: 'monitor',
    provider: 'Montimage (MTI)',
    description:
      'SECASSURED secAnoD capture & detection service (`mmt-image`: mmt-probe + mmt-dpi + mmt-security) from github.com/montimage-projects/secanod, rebuilt with the mmt-probe Kafka output channel (scripts/secanod-kafka). Injected as a sidecar sharing the target pod network namespace — requires NET_ADMIN and NET_RAW — it runs live DPI and LTL rule-based detection on eth0 with only the rules for the demo MAG attacks enabled (56 SYN/HTTP flood, 20 ICMP flood, 51 ping of death) and publishes JSON security reports to the Kafka topic AI4SOAR consumes. Roadmap: explainable LLM/SLM-based detection extending MMT.',
    type: 'Software',
    trl: { current: 6, expected: 8 },
    license: 'TBD',
    standards: [],
    inputs: [
      {
        name: 'Pod Network Traffic',
        description: 'Packets on the target pod interface (eth0)',
      },
    ],
    outputs: [
      {
        name: 'Security Reports',
        description: 'mmt-security JSON reports on Kafka topic mmt-security-alerts (and stdout)',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['Monitor module in the Montimage attack→detect→respond scenario'],
    repositoryTable: 'INTACT_TOOLBOX',
    // Local build of scripts/secanod-kafka — the published mmt-image has no
    // Kafka module; load it into the cluster (`kind load docker-image`).
    dockerImage: 'secanod-mmt-image:kafka',
    deployment: {
      // The image entrypoint only drives offline PCAP analysis, so the
      // command runs mmt-probe live on the stock config with -X overrides.
      // exclude-rules keeps only the rules matching the MAG attacks the demo
      // performs: 56 (SYN flooding — mag http-flood / synflood), 20 (ICMP
      // flood) and 51 (ping of death). Reports go to Kafka for AI4SOAR and
      // to stdout for the console's Security alerts pane.
      kind: 'Deployment',
      role: 'monitor',
      attachMode: 'sidecar',
      exposePort: false,
      // stdbuf: mmt-probe's stdout is block-buffered when piped, which would
      // hold detections back from the pod log the console streams.
      command: [
        'stdbuf',
        '-oL',
        'mmt-probe',
        '-c',
        '/opt/mmt/probe/mmt-probe.conf',
        ...[
          'input.source=eth0',
          'output.format=JSON',
          'output.cache-period=1',
          'file-output.enable=false',
          'session-report.enable=false',
          'security.enable=true',
          'security.output-channel=kafka,stdout',
          'security.exclude-rules=1-19,21-50,52-55,57-1000',
          'kafka-output.enable=true',
          'kafka-output.hostname=kafka',
          'kafka-output.port=9092',
          'kafka-output.topic=mmt-security-alerts',
        ].flatMap((override) => ['-X', override]),
      ],
      securityContext: { capabilities: ['NET_ADMIN', 'NET_RAW'] },
      startOrder: 10,
    },
  },
  {
    shortName: 'KAFKA',
    title: 'Apache Kafka Alert Bus (KAFKA)',
    categorySlug: 'ops-services',
    provider: 'Apache Software Foundation',
    description:
      'Single-node Apache Kafka broker (KRaft mode, public apache/kafka image) carrying security alerts between the monitor and the reaction module: secAnoD publishes its mmt-security reports to the `mmt-security-alerts` topic, AI4SOAR consumes them. Reachable in the execution namespace as kafka:9092.',
    type: 'Software',
    trl: { current: 9, expected: 9 },
    license: 'Apache-2.0',
    standards: [],
    inputs: [{ name: 'Security Reports', description: 'Produced by the monitor (secAnoD)' }],
    outputs: [
      { name: 'Security Alerts', description: 'Consumed by the reaction module (AI4SOAR)' },
    ],
    interactsWith: [],
    potentialUseCases: ['Alert bus in the Montimage attack→detect→respond scenario'],
    repositoryTable: 'OTHER_SERVICES',
    dockerImage: 'apache/kafka:3.9.1',
    // Kafka speaks its own protocol, not HTTP — no web interface to open;
    // its CLI tools are reached with `kubectl exec` (the terminal hint).
    uiType: 'terminal',
    deployment: {
      // Generic infrastructure: no role badge, rolls out before the
      // monitor/reaction tier. Advertised as kafka:9092 — the Service name
      // the engine derives from the `kafka` node id.
      kind: 'Deployment',
      role: 'generic',
      containerPort: 9092,
      exposePort: true,
      env: [
        { name: 'KAFKA_NODE_ID', value: '1' },
        { name: 'KAFKA_PROCESS_ROLES', value: 'broker,controller' },
        { name: 'KAFKA_LISTENERS', value: 'PLAINTEXT://:9092,CONTROLLER://:9093' },
        { name: 'KAFKA_ADVERTISED_LISTENERS', value: 'PLAINTEXT://kafka:9092' },
        { name: 'KAFKA_CONTROLLER_LISTENER_NAMES', value: 'CONTROLLER' },
        {
          name: 'KAFKA_LISTENER_SECURITY_PROTOCOL_MAP',
          value: 'CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT',
        },
        { name: 'KAFKA_CONTROLLER_QUORUM_VOTERS', value: '1@localhost:9093' },
        { name: 'KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR', value: '1' },
        { name: 'KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR', value: '1' },
        { name: 'KAFKA_TRANSACTION_STATE_LOG_MIN_ISR', value: '1' },
      ],
      startOrder: 0,
    },
  },
  {
    shortName: 'AI4SOAR',
    title: 'AI-driven Security Orchestration and Response (AI4SOAR)',
    categorySlug: 'reaction',
    provider: 'Montimage (MTI)',
    description:
      'Shuffle-based SOAR stack packaged from the Montimage/ai4soar repository, exposing its API/UI on :5000. Ingests MMT-Probe / secAnoD alerts and applies namespace-scoped Kubernetes playbook responses (NetworkPolicy creation, pod deletion, Job scale-down) through its ServiceAccount.',
    type: 'Software',
    trl: { current: 5, expected: 8 },
    license: 'TBD',
    standards: [],
    inputs: [
      {
        name: 'Security Alerts',
        description: 'Detection alerts emitted by MMT-Probe',
      },
    ],
    outputs: [
      {
        name: 'Orchestrated Response',
        description: 'Namespace-scoped Kubernetes remediation actions',
      },
    ],
    interactsWith: [],
    potentialUseCases: ['Reaction module in the Montimage attack→detect→respond scenario'],
    repositoryTable: 'INTACT_TOOLBOX',
    dockerImage: 'registry.montimage.eu/montimage-mti/ai4soar:v1.0.0',
    deployment: {
      // SOAR stack on :5000, readiness `GET /health` (Pre.2). The rbac
      // rules are the namespace-scoped Role bound to the pod's
      // ServiceAccount (Pre.3): delete the MAG pod, patch/scale the MAG
      // Job, create NetworkPolicies denying ingress to the target.
      kind: 'Deployment',
      role: 'reaction',
      containerPort: 5000,
      exposePort: true,
      readinessPath: '/health',
      // Security reports arrive on the scenario's Kafka broker (the `kafka`
      // node), published there by secAnoD.
      env: [
        { name: 'KAFKA_BOOTSTRAP_SERVERS', value: 'kafka:9092' },
        { name: 'KAFKA_TOPIC', value: 'mmt-security-alerts' },
      ],
      // The ai4soar-playbook document (issue #235) — mounted into the pod
      // via the node's `<node>-config` ConfigMap. The default reaction is
      // an application-level block: parse the attacker source address
      // (`ip.src`) from the MMT security report and POST it to the acts-on
      // target's `/admin/block` endpoint, so the blocked attacker's traffic
      // stays visible to the probe for attack #2's alert. The delivered
      // NetworkPolicy playbook remains as a variant for a hard network cut.
      configFiles: [
        {
          mountPath: '/opt/ai4soar/playbooks/block-attacker.yaml',
          content: [
            '# ai4soar playbook — Montimage attack→detect→respond scenario',
            '# (issue #235). Default reaction: application-level block of the',
            '# attacker address on the acts-on target. The MMT security alert',
            '# carries the attacker source address as `ip.src` (JSON format —',
            '# see the seeded mmt-probe.conf, issue #234).',
            'name: block-attacker-address',
            'description: >-',
            '  On each MMT security alert, parse the attacker source address',
            '  (ip.src) and POST it to the acts-on target /admin/block',
            '  endpoint. The block is application-level, so attack traffic',
            '  remains observable by MMT-Probe for the second detection.',
            'trigger:',
            '  on: mmt-security-alert',
            '  # Alerts arrive on the scenario Kafka broker (kafka:9092), published',
            '  # by the secAnoD kafka output channel',
            '  # (topic mmt-security-alerts); the report format is JSON.',
            '  source: kafka:mmt-security-alerts',
            'steps:',
            '  - name: extract-attacker',
            '    # The attacker source address the alert carries (#234).',
            '    set: { attacker: "${alert.ip.src}" }',
            '  - name: block-attacker',
            '    action: http-request',
            '    method: POST',
            '    # The acts-on edge target — the CI-SIM endpoint from #231.',
            '    url: "http://ci-sim:8080/admin/block"',
            '    body: { "ip": "${attacker}" }',
            '    expect: [200, 201, 202, 204, 409]',
            'variants:',
            '  - name: networkpolicy-hard-cut',
            '    description: >-',
            '      Hard network cut instead of the application block: create',
            '      the ai4soar-block-mag NetworkPolicy denying ingress to the',
            '      target pod (the pre-#235 default). Keeps using the pod',
            '      ServiceAccount RBAC rules below.',
            '    steps:',
            '      - name: deny-ingress',
            '        action: kubernetes-create-networkpolicy',
            '        podSelector: { app: ci-sim }',
            '        policyTypes: [Ingress]',
            '        ingress: []',
          ].join('\n'),
        },
      ],
      rbac: [
        { apiGroups: [''], resources: ['pods'], verbs: ['delete'] },
        {
          apiGroups: ['apps'],
          resources: ['deployments', 'deployments/scale'],
          verbs: ['patch', 'update'],
        },
        {
          apiGroups: ['networking.k8s.io'],
          resources: ['networkpolicies'],
          verbs: ['create'],
        },
      ],
      startOrder: 20,
    },
  },
];

// ---------------------------------------------------------------------------
// OTHER_SERVICES: Infrastructure list
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
  {
    // CI-SIM — in-repo critical-infrastructure simulation (issue #231,
    // playbook task 5.1). Seeded into OTHER_SERVICES so the topology
    // editor's "Add Target" button lists it, and grouped under the `target`
    // role category (task 0.2) that matches its deployment spec. The image
    // builds from `sim/ci-sim/` in this repository — `docker build -t
    // ci-sim:local sim/ci-sim && kind load docker-image ci-sim:local` —
    // pending the registry.montimage.eu publish.
    shortName: 'CI-SIM',
    title: 'Critical Infrastructure Simulation (CI-SIM)',
    categorySlug: 'target',
    provider: 'Montimage (MTI)',
    description:
      'In-repo critical-infrastructure HTTP simulation serving on :8080. Exposes GET / health plus a small service API (/api/status, /api/metrics); POST /admin/block {"address":"<ip>"} blocklists a source (answered 403 while other sources keep being served), POST /admin/unblock removes it and GET /admin/blocks lists the entries. A sustained request rate from one source over the threshold makes the process log "service stopped" and exit, so the Deployment\'s restartPolicy: Always restarts it while the monitor sidecar holds the pod netns.',
    type: 'Software',
    trl: { current: 6, expected: 8 },
    license: 'TBD',
    standards: [],
    inputs: [
      {
        name: 'HTTP Requests',
        description:
          'Inbound HTTP traffic, including attack traffic that can exceed the service rate threshold',
      },
    ],
    outputs: [
      {
        name: 'HTTP Responses & Admin State',
        description:
          'Served responses plus the /admin blocklist surface used by the response playbook',
      },
    ],
    interactsWith: [],
    potentialUseCases: [
      'Interactive attack→detect→respond demo target: block the attacker via /admin/block, let the attack stop the process, and watch Kubernetes restart it',
    ],
    repositoryTable: 'OTHER_SERVICES',
    dockerImage: 'registry.montimage.eu/montimage-mti/ci-sim:v1.0.0',
    deployment: {
      // Victim workload: HTTP on :8080, readiness `GET /` → 200 — same
      // target-tier contract as HTTP-SIM (Pre.2), ordered with it.
      kind: 'Deployment',
      role: 'target',
      containerPort: 8080,
      exposePort: true,
      readinessPath: '/',
      // Prometheus request/error/latency series (sim/ci-sim/server.py),
      // scraped by the scenario observability stack (issue #25).
      metricsPort: 8080,
      metricsPath: '/metrics',
      startOrder: 10,
    },
  },
];

const servicesData: ServiceSeed[] = [
  ...intactToolboxServices,
  ...montimageScenarioServices,
  ...infrastructureServices,
];
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

    // Tracked only when the seed entry declares one — the schema default
    // ('web') applies to entries without it.
    if (serviceData.uiType) {
      desiredFields.uiType = serviceData.uiType;
    }

    // Tracked only when the seed entry declares one — a manually-set
    // `deployment` on a service the seed doesn't specify is left untouched.
    if (serviceData.deployment) {
      desiredFields.deployment = serviceData.deployment;
    }

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
                dockerImage:
                  serviceData.dockerImage ??
                  `registry.montimage.eu/${serviceData.provider.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${serviceData.shortName.toLowerCase()}:v1.0.0`,
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
