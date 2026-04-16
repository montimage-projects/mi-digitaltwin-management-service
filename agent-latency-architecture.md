# Multi-Agent Latency Architecture: Design Ideas for Real-Time Incident Response

## The Problem

In the multi-agent system (Boss Agent -> Blue Team -> Mitigator), the Boss Agent becomes a bottleneck. Every decision must pass through it, and a large LLM (e.g., qwen3:14b) takes 30-50 seconds on local hardware. This is too slow for real-time mitigation during an active attack on critical infrastructure.

### Current latency breakdown (MacBook, Apple Silicon)

| Step                         | Time     |
| ---------------------------- | -------- |
| Embedding (nomic-embed-text) | ~1-2s    |
| Vector search                | <0.5s    |
| LLM inference (qwen3:14b)    | ~35-40s  |
| **Total**                    | **~40s** |

### Expected latency on GPU server

| Setup                       | Token speed    | Approx. response time |
| --------------------------- | -------------- | --------------------- |
| MacBook (Apple Silicon)     | ~10-15 tok/s   | 30-50s                |
| Server with RTX 4090 (24GB) | ~60-80 tok/s   | 5-8s                  |
| Server with A100 (80GB)     | ~100-150 tok/s | 2-5s                  |

---

## Approach 1: Tiered Response with Pre-Approved Playbooks

The Boss Agent pre-approves response playbooks during peacetime. The Mitigator can execute pre-approved actions immediately without waiting for the Boss.

**Examples:**

- **Auto-approved:** "If DDoS detected on port X -> block source IP"
- **Auto-approved:** "If unknown malware -> isolate container + alert human"
- **Requires human approval:** "If data exfiltration -> wait for human decision" (too risky for auto)

The Boss only gets involved for novel or high-risk scenarios. This mirrors how real SOCs (Security Operations Centers) operate: runbooks for known threats, human escalation for unknowns.

---

## Approach 2: Parallel Deliberation (First Aid + Full Strategy)

The Mitigator applies a fast "first aid" response immediately using a small model, while the Boss Agent deliberates the full strategy in parallel with the big model.

```
Blue Team detects threat
    |
    +--> Mitigator (immediate first aid, small model, <2s)
    |       e.g., rate-limit suspicious traffic
    |
    +--> Boss Agent (deliberate full strategy, big model, 5-40s)
            |
            +--> Mitigator (refine/override initial response if needed)
```

This ensures there is always a fast initial response while still benefiting from the Boss Agent's deeper reasoning.

---

## Approach 3: Human-in-the-Loop as a Feature

The Boss Agent's latency becomes a deliberate design choice. The flow is:

1. Boss Agent proposes a strategy
2. Human operator reviews and approves/modifies
3. Mitigator executes the approved plan

**Why this makes sense for critical infrastructure:**

- Automatic instant responses on nuclear, telecom, or healthcare systems could cause more damage than the attack itself
- A deliberation pause gives the human operator situational awareness
- Aligns with NIS2 compliance requirements for human oversight

---

## Thesis Benchmarking Opportunity

Compare all three approaches with these metrics:

| Approach                                         | Metrics to measure                    |
| ------------------------------------------------ | ------------------------------------- |
| **Fully autonomous** (fast but risky)            | MTTR, false-positive damage rate      |
| **Boss-mediated** (slower but safer)             | MTTR, decision accuracy               |
| **Human-in-the-loop** (slowest, most controlled) | MTTR, operator confidence, compliance |

The key thesis question: **What is the right speed-accuracy-safety tradeoff for critical infrastructure protection?**

---

## Model Sizing Insight

Different agents can run on different model sizes:

| Agent             | Role                 | Model size | Rationale                              |
| ----------------- | -------------------- | ---------- | -------------------------------------- |
| Boss Agent        | Strategy, reasoning  | 14B+       | Needs deep reasoning and context       |
| Blue Team Analyst | Alert classification | 3-7B       | Narrow classification task             |
| Mitigator         | Execute actions      | 1-3B       | Pick and execute from known actions    |
| Red Team          | Simulate attacks     | 7-14B      | Needs creativity for attack simulation |

A smaller specialized model can be both faster AND more accurate for narrow tasks than a large generalist model.

---

## Intent Classification for RAG Optimization

Currently RAG runs on every message, including greetings. A small model (e.g., qwen3:1.7b) can classify intent first:

- **Service query** -> run RAG + big model
- **Casual conversation** -> skip RAG, use big model directly

Note: Fixed score thresholds don't work well -- "Hello" scored 0.51-0.52 while a legitimate query "Tell me about MMT" scored 0.48. Intent classification is more reliable than score filtering.
