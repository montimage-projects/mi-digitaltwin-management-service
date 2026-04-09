# Proposed Thesis Architecture: Open-Source Multi-Agent System for Digital Twin Cyber-Resilience

Based on the analysis of the `mi-digitaltwin-management-service` (a metadata-rich repository of cybersecurity services) and the goal of maximizing open-source, privacy-preserving technologies, the proposed thesis direction has evolved into a **Multi-Agent System (MAS)**.

This architecture drops the reliance on proprietary orchestrators (like MAESTRO) and instead uses advanced local LLMs to bridge the gap between human intent, database metadata, and open-source infrastructure execution.

---

## 1. The Core Architecture: Specialized Multi-Agent System

Instead of a single "god agent" that struggles with conflicting system prompts, the system will utilize specialized, narrow agents coordinated by a central orchestrator.

- **The Boss Agent (Coordinator & RAG Explorer):**
  - _Role:_ The central brain. It interacts with the human operator via natural language, queries the MongoDB service repository (RAG), formulates high-level plans, and delegates tasks to sub-agents. It requires human approval for critical actions.
- **The Installer Agent (The Muscle):**
  - _Role:_ Translates the Boss's high-level commands and MongoDB metadata (e.g., `dockerImage: montimage/mmt-probe`) into valid open-source deployment manifests (Docker Compose or Kubernetes YAML) and executes them.
- **The Blue Team Agents (Defense):**
  - _Monitor Analyst:_ Ingests _pre-filtered_ alerts from deployed security tools (like MMT or Suricata) and reports contextual anomalies to the Boss.
  - _Mitigator:_ Receives execution orders from the Boss to apply fixes (e.g., updating iptables, deploying a blocking container).
- **The Red Team Agent (Wargames):**
  - _Role:_ Operates within the safe-to-fail Digital Twin environment. It launches simulated attacks against the infrastructure to trigger the Blue Team and test the autonomous response loop.

---

## 2. Key Technical Pivots & Open-Source Stack

### Dropping MAESTRO for Open-Source Orchestration

Since the MAESTRO integration is currently a mockup, the thesis will pivot to 100% open-source infrastructure execution. The Installer Agent will interface directly with the local Docker Daemon or a local Kubernetes cluster (K3s). This guarantees zero vendor lock-in and absolute data privacy.

### Advanced Local LLMs

The availability of highly capable local models (such as **Qwen-Coder** or **Gemma** via Ollama) drastically increases the feasibility of this project. Qwen-Coder's superior ability to generate flawless YAML, JSON, and CLI commands minimizes the risk of the Installer or Mitigator agents failing due to syntax hallucinations.

### Deterministic State Management

To prevent agents from falling into infinite conversational loops during a critical cyber incident, the system will avoid free-flowing frameworks. Instead, it will use **LangGraph** to hardcode the communication edges (e.g., Red attacks → Blue alerts → Boss decides → Mitigator acts).

---

## 3. Critical Academic Challenges & Mitigations

- **Log Ingestion Limits:** Raw network traffic will overwhelm any local LLM context window. _Mitigation:_ The Blue Analyst will not parse raw pcaps; it will only analyze aggregated alerts pre-filtered by deterministic tools.
- **Latency vs. Real-Time Mitigation:** Running a 4-agent loop locally incurs heavy inference latency. _Mitigation:_ The thesis will measure "Mean Time to Respond" (MTTR) to determine if the MAS is suitable for real-time blocking, or better suited for strategic mitigation of slower Advanced Persistent Threats (APTs).
- **Evaluation Metrics:** To ensure academic rigor, the system must be benchmarked. Metrics will include Deployment Accuracy (how often the Installer writes flawless YAML), MTTD/MTTR, and Red Team evasion success rates.

---

## 4. Revised 2.5-Year Thesis Roadmap

- **Phase 1: The Brain & The Muscle (Months 1-6)**
  - Connect the Boss Agent (RAG) to the MongoDB repository.
  - Build the Installer Agent using Qwen-Coder.
  - _Milestone:_ A human can ask the Boss to "Deploy a network monitor," and the Installer successfully spins up a Docker container based on the DB metadata.
- **Phase 2: The Defender (Months 7-14)**
  - Develop the Blue Analyst to read alerts from the deployed tools.
  - Develop the Mitigator Agent to apply firewall rules or deploy counter-measures.
  - _Milestone:_ The system can detect a manually triggered anomaly and the Boss can authorize the Mitigator to resolve it.
- **Phase 3: Autonomous Wargames (Months 15-22)**
  - Develop the Red Team Agent to autonomously probe the Digital Twin.
  - Connect the full LangGraph loop: Red attacks → Blue detects → Boss coordinates → Mitigator defends.
  - _Milestone:_ A fully autonomous cyber-battle functioning inside the local Digital Twin.
- **Phase 4: Evaluation & Defense (Months 23-30)**
  - Run extensive benchmarks on latency, accuracy, and mitigation success.
  - Analyze the efficacy of Qwen-Coder/Gemma in strict function-calling environments.
  - Write and defend the thesis.
