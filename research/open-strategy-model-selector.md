# Open Strategy for Model Selector: DHITL-Aligned Architecture

**Status:** Draft v0.1 (2026-07-09)
**Author:** For Cogentia/FractaVolta infrastructure
**Context:** Model selector design with anti-capture principles
**Related:** [DHITL (MareNostrum)](https://github.com/JeanHuguesRobert/marenostrum/blob/main/research/DHITL.md), [Model Selector Design](./model-selector-design.md)

---

## Orientation

This document extends the generic model selector design with **DHITL-aligned principles**: avoiding vendor cognitive capture, maximizing commons for humanity, and enabling private-sector financing of general interest AI infrastructure.

**Core Axiom:** Infrastructure sovereignty is prerequisite for AI safety. A perfectly aligned model on captured infrastructure is systemically unsafe.

---

## Part 1: OpenAI Alternatives Landscape

### Proprietary Competitors (with CLI Tools)

| Provider | CLI Tool | API | Openness | Lock-in Risk |
|----------|----------|-----|----------|--------------|
| **Anthropic** | Claude Code | ✅ | Proprietary API | Medium (SDK兼容) |
| **Google** | Gemini CLI | ✅ | Open source CLI | Low (OSS CLI) |
| **xAI** | Grok Build | ✅ | Proprietary | High (X-specific) |
| **Mistral** | Via Ollama/vLLM | ✅ | Open models | Low (self-host) |
| **DeepSeek** | Via Ollama | ✅ | Open models | Low (open) |
| **Meta (Llama)** | Via Ollama | ❌ (self-host only) | Fully open | None |

### Open Source Ecosystem

**Self-Hosting Platforms:**
- **Ollama**: `ollama run llama3:70b` - Simplest CLI for local models
- **vLLM**: Production serving engine (Mistral-endorsed)
- **LocalAI**: OpenAI-compatible API for local models
- **llama.cpp**: CPU inference for consumer hardware

**Major Open Models (2026):**
| Model | Context | Capability | Self-host Cost |
|-------|---------|------------|-----------------|
| **Llama 3.1 405B** | 128K | Frontier | 8x A100 |
| **Qwen 2.5 72B** | 128K | Coding strong | 2x A100 |
| **DeepSeek V3** | 64K | Cost-effective | CPU-capable |
| **Mistral Large 2** | 128K | Multilingual | 2x A100 |
| **Yi-Large** | 200K | Bilingual | 4x A100 |

**Key Insight:** Open models have reached frontier capability parity while offering zero lock-in.

---

## Part 2: Vendor Lock-In Avoidance Strategies

### Lock-In Mechanisms to Avoid

1. **Proprietary API Formats:** Provider-specific message formats
2. **Closed-Source Models:** Weights unavailable, cannot self-host
3. **Ecosystem Entrenchment:** Tied to specific tools/platforms
4. **Data Captivity:** Data used for training without opt-out
5. **Infrastructure Dependency:** Must use provider's cloud

### Anti-Lock-In Architecture

```javascript
class OpenModelSelector {
  constructor() {
    this.providers = {
      // Fallback chain: OSS → Proprietary API → Local
      chain: [
        { type: "oss", priority: 1 },      // Open source first
        { type: "api", priority: 2 },      // Proprietary API fallback
        { type: "local", priority: 3 }     // Local models last resort
      ]
    };
  }

  async select(request) {
    // 1. Try open source (self-hosted or community)
    for (const ossProvider of this.ossProviders) {
      if (await ossProvider.available()) {
        return await ossProvider.invoke(request);
      }
    }

    // 2. Fallback to proprietary API (with abstraction)
    const apiProvider = this.selectApiProvider(request);
    return await this.invokeViaGateway(apiProvider, request);
  }

  // Key: Use gateway abstraction, never direct API calls
  async invokeViaGateway(provider, request) {
    return await this.gateway.invoke({
      provider: provider.name,
      compatibility: "openai-format",  // Standardize on one format
      model: this.mapModel(request.model, provider),
      messages: request.messages
    });
  }
}
```

### Abstraction Layer Pattern

```javascript
// Standardize on OpenAI format as lingua franca
interface StandardLLMRequest {
  model: string;
  messages: Array<{role: string, content: string}>;
  temperature?: number;
  max_tokens?: number;
}

// Adapter pattern for each provider
interface ProviderAdapter {
  toStandard(request: StandardLLMRequest): ProviderRequest;
  fromStandard(response: ProviderResponse): StandardLLMResponse;
}

class AnthropicAdapter implements ProviderAdapter {
  toStandard(req) {
    return {
      model: req.model.replace("gpt-", "claude-"),
      messages: req.messages,  // May need role mapping
      max_tokens: req.max_tokens
    };
  }
}
```

### Vendor Off-Ramps

**Data Portability:**
- Export conversation history in standard format (JSONL)
- Maintain local copies of all interactions
- Use open formats for memory/storage (Markdown, JSON)

**Model Portability:**
- Fine-tune on open models when possible
- Maintain ability to switch providers without retraining
- Use provider-agnostic embeddings

**Infrastructure Portability:**
- Design for multi-cloud from start
- Use containerized deployments
- Avoid provider-specific services (e.g., OpenAI Assistants API)

---

## Part 3: DHITL-Aligned Architecture

### Five-Layer Model (from DHITL.md)

```
Layer 5: Cognitive        Democratic oversight of AI decisions
    ↓
Layer 4: Political        Governance structures (one human, one voice)
    ↓
Layer 3: Economic        Compute Exergy (CXU) accounting
    ↓
Layer 2: Physical        Distributed compute infrastructure
    ↓
Layer 1: Energy          Power/thermodynamic limits
```

### Model Selector Governance

**Layer 3 (Economic) Implementation:**
```javascript
const governance = {
  cxu_tracking: {
    enabled: true,
    per_request_cxu: (tokens, model) => {
      // Calculate compute exergy cost
      return {
        cxu: tokens * MODEL_EFFICIENCY[model],
        provider: model.provider,
        certified: model.certified || false
      };
    },
    monthly_limits: {
      sovereign: 1000000,    // DHITL-certified compute
      commercial: 500000,     // Commercial provider compute
      ratio: 2                // Max 2:1 commercial:sovereign
    }
  }
};
```

**Layer 4 (Political) Implementation:**
```javascript
const democratic_oversight = {
  one_human_one_voice: {
    // Each human gets equal compute allocation
    base_cxu_per_human: 1000,
    community_pool: true,       // Shared pool for public interest
    veto_mechanism: true        // Community can veto expensive ops
  },
  transparency: {
    log_all_requests: true,
    public_metrics: true,
    audit_trail: "immutable"
  }
};
```

### Anti-Capture Mechanisms

**1. No Single Point of Control:**
```javascript
// Distributed routing across multiple providers
const providers = [
  { id: "local-llama", type: "oss", location: "sovereign" },
  { id: "community-mistral", type: "oss", location: "community" },
  { id: "openai-api", type: "api", location: "external" },
  { id: "anthropic-api", type: "api", location: "external" }
];
```

**2. Compute Source Certification:**
```javascript
const compute_sources = {
  sovereign: {
    // Self-hosted, community-controlled
    certification: "DHITL-Sovereign",
    governance: "democratic",
    cxu_multiplier: 1.0
  },
  commercial: {
    // Proprietary API
    certification: "DHITL-Commercial",
    governance: "corporate",
    cxu_multiplier: 1.5  // Higher cost for same compute
  }
};
```

**3. Exit Strategy Guarantee:**
```javascript
const exit_strategy = {
  data_export: {
    format: "jsonl",           // Human-readable
    includes: ["history", "memory", "fine_tunes"],
    frequency: "daily"
  },
  model_portability: {
    fine_tune_export: true,    // Can export fine-tunes
    format: "safetensors",     // Open format
    license: "apache-2.0"
  },
  infrastructure_migration: {
    containers: true,
    iac: "terraform",         // Infrastructure as code
    docs: "public"
  }
};
```

---

## Part 4: Financing General Interest

### Public-Private Partnership Models

**1. Compute Credits for Public Interest:**
```javascript
const public_interest_funding = {
  // Private sector provides compute for public good
  mechanism: "cxu_credits",
  sources: {
    corporate: {
      // Companies donate CXU for tax benefits
      contribution: "compute_cluster",
      tax_credit: 1.5,           // 150% tax credit
      recognition: "public"        // Acknowledgment
    },
    foundation: {
      // Non-profit funding
      grants: "dhital_aligned",
      oversight: "democratic_board"
    }
  },
  allocation: {
    // Must serve general interest
    eligible_use: [
      "scientific_research",
      "civic_infrastructure",
      "education",
      "public_health",
      "environmental_monitoring"
    ],
    veto_mechanism: "community"
  }
};
```

**2. Commons-Based Compute Pool:**
```javascript
const commons_pool = {
  funding: "mixed",
  contributors: {
    public: ["governments", "universities", "ngos"],
    private: ["corporations", "individuals"],
    in_kind: ["compute_clusters", "bandwidth", "storage"]
  },
  governance: {
    structure: "multistakeholder",
    voting: "quadratic",          // One human, one voice
    transparency: "full"
  },
  pricing: {
    // Below-market rates for public interest
    public_interest_rate: 0.3,    // 30% of commercial rate
    research_rate: 0.5,
    commercial_rate: 1.0
  }
};
```

### Existing Models to Study

**Mozilla Builders:**
- Open source support
- Community funding
- Fiscal hosting for projects

**HuggingFace:**
- Open model hosting (free)
- Enterprise API (commercial revenue cross-subsidizes)
- Democratized access

**Partnership on AI:**
- Multi-stakeholder governance
- Industry + nonprofit + academia
- $500K Humanity AI grant (2026)

**National AI Strategies:**
- US: Public-private partnerships emphasized
- EU: AI Act + Digital Europe Program
- UK: AI Research Resource innovation fund

---

## Part 5: Implementation Strategy

### Phase 1: Open Source Foundation

**Immediate Actions:**
1. Deploy Ollama with Llama 3.1 70B as baseline
2. Implement OpenAI-compatible API layer (LocalAI/vLLM)
3. Build provider adapter system
4. Establish DHITL certification for compute sources

**Code:**
```bash
# Self-hosted foundation
ollama run llama3.1:70b -p 8793

# OpenAI-compatible API
localai run --models-path /models --port 8793

# Now both work identically
curl http://localhost:8793/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "llama3.1:70b", "messages": [...]}'
```

### Phase 2: Multi-Provider Routing

**Architecture:**
```javascript
const router = {
  providers: {
    oss: [
      { name: "local-llama", endpoint: "http://localhost:8793", type: "oss" },
      { name: "community-mistral", endpoint: "http://community.marenostrum:8793", type: "oss" }
    ],
    api: [
      { name: "openai", endpoint: "https://api.openai.com/v1", type: "api" },
      { name: "anthropic", endpoint: "https://api.anthropic.com/v1", type: "api" },
      { name: "deepseek", endpoint: "https://api.deepseek.com/v1", type: "api" }
    ]
  },
  strategy: {
    // DHITL-aligned: prefer democratic compute
    priority: ["oss_sovereign", "oss_community", "api_commercial"],
    fallback: "automatic",
    health_check: "continuous"
  }
};
```

### Phase 3: DHITL Governance Integration

```javascript
const dhitl_selector = {
  request: async (prompt, context) => {
    // 1. Calculate CXU requirement
    const cxu = calculate_cxu(prompt, context);

    // 2. Check democratic allocation
    const allocation = await get_allocation(context.user);
    if (cxu > allocation.sovereign && cxu > allocation.commercial) {
      throw new Error("Insufficient democratic compute allocation");
    }

    // 3. Route based on purpose
    if (context.purpose === "public_interest") {
      // Use sovereign compute only
      return await router.route({
        type: "oss",
        governance: "sovereign",
        cxu_budget: allocation.sovereign
      });
    }

    // 4. For commercial use, allow API with limits
    return await router.route({
      type: "mixed",
      ratio: allocation.commercial / (allocation.sovereign + allocation.commercial)
    });
  }
};
```

---

## Part 6: Cost Comparison (2026)

### Per 1M Tokens (Input)

| Model | Cost | Openness | DHITL Rating |
|-------|------|----------|--------------|
| **Llama 3.1 70B (self-host)** | $0 | Fully open | ⭐⭐⭐⭐⭐ Sovereign |
| **Qwen 2.5 72B (self-host)** | $0 | Fully open | ⭐⭐⭐⭐⭐ Sovereign |
| **DeepSeek V3 (API)** | $0.14 | Open weights | ⭐⭐⭐⭐ Community |
| **GPT-4o (API)** | $2.50 | Closed | ⭐⭐ Commercial |
| **Claude Sonnet 5 (API)** | $3.00 | Closed | ⭐⭐ Commercial |
| **Gemini Pro (API)** | $0.50 | Partial | ⭐⭐⭐ Mixed |

**Key Insight:** Self-hosted open models are **free** at marginal cost (hardware amortization). For high-volume public interest work, this is transformative.

### Infrastructure Costs

**Self-Hosting 70B Model:**
- Hardware: 8x A100 (used) ≈ $40K one-time
- Monthly: ≈ $800 (electricity + cooling)
- Capacity: 100 requests/second
- Cost per 1M tokens: Amortized to ≈ $0.02

**Break-even Analysis:**
- At 100M tokens/month: Self-hosting pays for itself in 2 months vs API
- DHITL principle: Sovereign infrastructure for long-term public interest

---

## Part 7: Anti-Capture Checklist

### For Each Provider Decision

**Data Sovereignty:**
- [ ] Can we export all data?
- [ ] Is data used for training without opt-out?
- [ ] Can we host locally?

**Infrastructure Sovereignty:**
- [ ] Can we self-host?
- [ ] Is the model open weights?
- [ ] Can we fork/customize?

**Governance:**
- [ ] Is provider governance democratic?
- [ ] Is there community oversight?
- [ ] Can we appeal decisions?

**Exit Strategy:**
- [ ] Can we switch providers in < 1 day?
- [ ] Are fine-tunes portable?
- [ ] Is there a migration path?

---

## Part 8: Recommended Provider Strategy

### For Cogentia Guide

**Primary (Sovereign):**
1. **Self-hosted Llama 3.1 70B** via Ollama/vLLM
   - Zero API cost
   - Full control
   - DHITL-certified

**Secondary (Community):**
2. **Community-hosted Mistral** via MareNostrum network
   - Distributed compute
   - Democratic governance
   - Shared cost

**Fallback (Commercial):**
3. **API providers** (DeepSeek → OpenAI → Anthropic)
   - For overflow
   - Specialized capabilities
   - Always with abstraction layer

**Never:**
- Single-provider dependency
- Closed-source models without OSS alternative
- Vendor-specific features (Assistants API, etc.)

### Cost Projection (Public Interest AI)

**Scenario: 1M queries/month, 10K tokens/query**

| Approach | Monthly Cost | Annual | DHITL Score |
|----------|-------------|--------|-------------|
| **All GPT-4o API** | $50,000 | $600K | ⭐⭐ Capture risk |
| **Self-hosted Llama** | $800 + hardware | $50K year 1 | ⭐⭐⭐⭐⭐ Sovereign |
| **Mixed (80% self, 20% API)** | $10,000 | $120K | ⭐⭐⭐⭐ Balanced |

**ROI of Sovereignty:** Hardware investment ($40K) pays for itself in 1 month vs pure API.

---

## Sources

### DHITL Framework
- [DHITL (MareNostrum)](https://github.com/JeanHuguesRobert/marenostrum/blob/main/research/DHITL.md)
- [Democratic AI Safety](https://github.com/JeanHuguesRobert/barons-Mariani/blob/main/research/democratic_ai_safety.md)
- [Infrastructure Is All You Need](https://github.com/JeanHuguesRobert/marenostrum/blob/main/research/infrastructure_is_all_you_need.md)

### OpenAI Competitors & CLI Tools
- [Mastering Claude Code in 2026](https://www.bolderapps.com/blog-posts/mastering-claude-code-in-2026-9-ways-to-access-anthropics-new-agentic-dev-environment)
- [Gemini CLI Official](https://geminicli.com/)
- [Gemini CLI GitHub](https://github.com/google-gemini/gemini-cli)
- [Self-Deployment - Mistral Docs](https://docs.mistral.ai/models/deployment/local-deployment)
- [Self-Host Mistral with Ollama](https://blog.itgranules.com/self-host-free-mistral-ai-models-using-ollama)
- [DeepSeek API Pricing](https://api-docs.deepseek.com/quick_start/pricing)

### Vendor Lock-In Avoidance
- [Vendor Lock-In in AI - Kong](https://konghq.com/blog/learning-center/vendor-lock-in)
- [Best Practices to Avoid AI Lock-In - TechTarget](https://www.techtarget.com/searchenterpriseai/tip/Best-practices-to-avoid-AI-vendor-lock-in)
- [OpenAI Responses API - LinkedIn](https://www.linkedin.com/pulse/openais-responses-api-breaking-down-vendor-lock-in-ai-development-cdnqc)
- [Enterprise AI Lock-In Guide - Advisori](https://www.advisori.de/en/blog/how-to-avoid-ai-vendor-lock-in-enterprise-guide)

### Public-Private Partnerships
- [Public-Private Partnerships in AI - TIME](https://time.com/article/2026/06/24/public-private-partnerships-will-define-innovation-in-the-ai-era/)
- [State of Open Source - HuggingFace](https://huggingface.co/blog/open-source/state-of-os-hf-spring-2026)
- [Partnership on AI Grant](https://partnershiponai.org/humanity-ai-500k-grant-partnership-on-ai/)
- [AI Research Funding - NextGov](https://www.nextgov.com/artificial-intelligence/2025/06/industry-calls-more-research-funding-public-private-partnerships-national-ai-strategy/406028/)

### Decentralized HITL Research
- [The Loop - TeamFlow Institute](https://teamflow.institute/the-loop-a-decentralized-approach-to-augmented-humanity/)
- [Blockchain Protocol for HITL - arXiv](https://arxiv.org/abs/2211.10859)
- [Protecting from AI Risks - LinkedIn](https://www.linkedin.com/posts/emine-gokce-phillips_aiinnovation-aicentreforbusiness-aiforbusiness-activity-7455206329175994368-DV9e)
- [Responsible AI - ATSE](https://atse.org/media/11ynljfo/4-13-semmler-and-tikhomirov-responsible-ai-means-keeping-humans-in-the-loop.pdf)

---

## Part 9: Self-Hosting Infrastructure Requirements

### VRAM Requirements by Model Size

**Rule of Thumb:**
- **FP16/BF16 (half precision):** ~2GB VRAM per 1B parameters
- **INT4 quantization:** ~0.5GB VRAM per 1B parameters
- Add 20% overhead for KV cache and activations

**Specific Model Requirements:**
| Model | FP16 VRAM | INT4 VRAM | Recommended GPU |
|-------|-----------|-----------|-----------------|
| **7B models** | 6-8GB | 2-3GB | RTX 3060 12GB ($279) |
| **13B models** | 12-14GB | 4-5GB | RX 7600 XT 16GB ($299) |
| **30B models** | 40GB+ | 12-15GB | Dual 7900 XT (48GB) |
| **70B models** | ~140GB | ~35GB | 2x A100 80GB or H100 |

### 2026 GPU Market

**Budget Tier (Self-Hosting Entry):**
- **Intel Arc B580:** $249 - New budget king
- **NVIDIA RTX 3060 12GB:** $279 - Proven starter
- **AMD RX 7600 XT 16GB:** $299 - VRAM value

**High-End Consumer:**
- **NVIDIA RTX 5090:** ~$1,999 - 32GB VRAM
- **Dual AMD 7900 XTX:** ~48GB combined - Cheapest high-VRAM option

**Professional/Enterprise:**
- **NVIDIA A6000:** ~$7,000 (40GB)
- **NVIDIA H100:** Enterprise pricing (80GB)

**Key 2026 Trend:** 3-way GPU competition - NVIDIA, Apple M5 Max, Intel Arc B70. VRAM becoming more critical than raw compute for inference.

### Cost-Effective Setups

**Multi-GPU Configuration:**
- 2x Strix Halo GPUs: ~$4,000-4,600
- Used Infiniband cards: 2x $200
- Total: ~$4,500-4,600 for 48GB VRAM

**Deployment Options:**
```bash
# Option 1: Ollama (simplest)
ollama run llama3.1:70b

# Option 2: vLLM (production)
vllm serve meta-llama/Llama-3.1-70B --tensor-parallel-size 2

# Option 3: llama.cpp (CPU inference, VRAM-saver)
llama-cli -m llama-3.1-70b.Q4_K_M.gguf -p "Your prompt"
```

---

## Part 10: Fine-Tuning Without Lock-In

### LoRA/QLoRA Approach

**Why LoRA/QLoRA in 2026:**
- Only fine-tuning approach most teams should consider
- Avoids vendor lock-in through open models
- Memory-efficient: QLoRA can fine-tune 65B model on single 48GB GPU
- Cost-effective: Fine-tuning 7B model costs <$5 (2026)

**LoRA vs QLoRA:**
| Method | VRAM Requirement | Use Case |
|--------|-----------------|----------|
| **LoRA** | Base model VRAM + adapters | When VRAM sufficient |
| **QLoRA** | 4-bit quantized + LoRA | Memory-constrained setups |

**Implementation Example:**
```python
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM

# Load open model
model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.1-70B")

# Configure LoRA
lora_config = LoraConfig(
    r=16,                    # Rank
    lora_alpha=32,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)

# Apply LoRA
model = get_peft_model(model, lora_config)

# Fine-tune on your data
# Result: Adapter weights only (~5% of model size)
# Export format: safetensors (open format)
```

**Vendor-Neutral Workflow:**
1. Start with open model (Llama, Qwen, Mistral)
2. Fine-tune with LoRA/QLoRA on your domain
3. Export adapter in safetensors format
4. Deploy anywhere (Ollama, vLLM, custom inference)
5. Full portability - no platform lock-in

**Tools:**
- **Unsloth:** Lightning-fast LoRA/QLoRA training
- **Axolotl:** Flexible fine-tuning platform
- **PEFT:** HuggingFace parameter-efficient fine-tuning library

---

## Part 11: Energy & Environmental Impact

### Energy Consumption Metrics

**Per-Token Energy Use:**
- **GPT-4 on H100:** ~36 joules per token
- **1M tokens:** ~12 kWh (enough to drive US car ~42 miles)
- **Simple query:** ~0.047 kWh
- **Image generation:** Up to 2.907 kWh (60x more energy)

**Carbon Footprint Calculation:**
```
CO2e = Energy (kWh) × Grid Intensity (gCO2e/kWh)

Example (1M tokens):
- US average grid: 400 gCO2e/kWh
- 12 kWh × 400 = 4,800 gCO2e = 4.8 kg CO2e
```

**Data Center Energy Sources:**
- **Renewable-powered:** Google Cloud, AWS (some regions)
- **Mixed grid:** Most providers
- **Self-hosting:** Depends on local grid

### DHITL Energy Principle

**Layer 1 (Energy) Implementation:**
```javascript
const energy_tracking = {
  per_token_cxu: (model, provider) => {
    const energy_per_token = {
      "local_llama_70b": 0.008,      // kWh per 1K tokens
      "gpt_4o": 0.012,
      "claude_sonnet_5": 0.011
    };

    const grid_intensity = {
      "sovereign": 100,              // gCO2e/kWh (renewable)
      "grid_france": 50,             // gCO2e/kWh (nuclear)
      "grid_us": 400,                // gCO2e/kWh (mixed)
      "grid_china": 600              // gCO2e/kWh (coal-heavy)
    };

    return {
      kwh: energy_per_token[model] * tokens / 1000,
      co2e: energy_per_token[model] * tokens / 1000 * grid_intensity[location],
      cxu_cost: energy_per_token[model] * CXU_RATE
    };
  },

  // Prefer low-carbon compute
  routing: {
    priority: "carbon_efficient",
    threshold: 100  // gCO2e/kWh max for public interest
  }
};
```

**Energy Optimization Strategies:**
1. **Geographic routing:** Use low-carbon regions first
2. **Model selection:** Smaller models when sufficient
3. **Semantic caching:** Avoid recomputation (up to 86% reduction)
4. **Quantization:** INT4 vs FP16 (4x energy savings)

---

## Part 12: Regulatory Compliance

### EU AI Act 2026

**Critical Deadline: August 2, 2026**

**Requirements for High-Risk AI Systems:**
- Transparency obligations
- Human oversight
- Accuracy metrics
- Cybersecurity resilience
- Conformity assessments

**LLM-Specific Compliance Areas:**
- Algorithmic transparency
- Bias detection & mitigation
- Automated decision-making safeguards
- Data protection (GDPR intersection)

**Compliance Checklist:**
```javascript
const ai_act_compliance = {
  transparency: {
    disclose_llm_use: true,
    provide_model_info: true,
    document_limitations: true
  },

  human_oversight: {
    hitl_required: "high_risk",
    override_mechanism: true,
    intervention_protocol: true
  },

  data_protection: {
    gdpr_compliant: true,
    data_minimization: true,
    retention_limits: true,
    user_rights: ["access", "rectification", "erasure"]
  },

  documentation: {
    technical_docs: true,
    quality_management: true,
    conformity_assessment: true,
    post_market_monitoring: true
  }
};
```

**Penalties:** Fines up to €20 million for non-compliance

**Dual Compliance:** Organizations must comply with both GDPR and AI Act requirements simultaneously.

### Integrated Compliance Approach

**Intersection Points:**
- AI Act + GDPR: Automated decision-making
- AI Act + DORA: Critical infrastructure resilience
- AI Act + DSA: Content moderation systems

---

## Part 13: Distributed Training (DiLoCo)

### DiLoCo: Distributed Low-Communication Training

**Key Innovation:** 500x communication reduction vs traditional distributed training

**Architecture:**
```
Islands of poorly connected devices:
  Device A (Location 1) ──┐
  Device B (Location 1) ──┤
  Device C (Location 2) ──┼──→ Central Server (sparse sync)
  Device D (Location 3) ──┤       (every N local steps)
  Device E (Location 3) ──┘
```

**DHITL Relevance:**
- Enables globally distributed training
- Reduces dependency on high-bandwidth connections
- Supports community-hosted model training
- Democratic compute across locations

**Key Features:**
1. **Local SGD:** Devices perform multiple local optimization steps before communicating
2. **Communication Efficiency:** 500x reduction vs traditional methods
3. **Federated Learning Approach:** Similar to federated learning techniques
4. **Resilient Training:** "Decoupled DiLoCo" for distant data centers

**OpenDiLoCo Framework:**
- Open-source implementation
- Demonstrated across 2 continents, 3 countries
- 90-95% compute utilization
- Suitable for MareNostrum-style distributed networks

**Infrastructure Implications:**
- Training across geographically dispersed locations
- Reduced bandwidth requirements
- More accessible and cost-effective distributed training
- Bridges centralized distributed training and federated learning

### DHITD (Democratic HITL + DiLoCo)

**Combined Approach:**
```javascript
const dhitd_training = {
  distributed: {
    protocol: "diloco",
    local_steps: 100,
    sync_interval: "adaptive",
    participants: "democratic_pool"
  },

  governance: {
    one_human_one_node: true,
    community_validation: true,
    veto_mechanism: true,
    transparency: "full"
  },

  // Community trains model together
  training: {
    data_sources: "distributed",
    validation: "democratic",
    model_ownership: "commons",
    license: "apache-2.0"
  }
};
```

---

## Updated Sources

### Self-Hosting Hardware
- [Local LLM Hardware in 2026 Guide](https://www.kunalganglani.com/blog/local-llm-hardware-2026)
- [2025/2026 Self-Hosting Field Guide](https://www.freeportmetrics.com/blog/the-2025-self-hosting-field-guide-to-open-llms)
- [VRAM Calculator](https://apxml.com/tools/vram-calculator)
- [Self-Hosted LLMs Reddit](https://www.reddit.com/r/selfhosted/comments/1liq9dl/for_those_of_you_running_llms_for_your_self/)

### LoRA/QLoRA Fine-Tuning
- [Fine-Tune LLMs with LoRA and QLoRA: 2026 Guide - Effloow](https://effloow.com/articles/llm-fine-tuning-lora-qlora-guide-2026)
- [QLoRA GitHub Repository](https://github.com/artidoro/qlora)
- [How to Fine-Tune LLMs in 2026: Costs, GPUs, and Code - Spheron](https://www.spheron.network/blog/how-to-fine-tune-llms-2026/)
- [Unsloth and Training Hub - Red Hat Developers](https://developers.redhat.com/articles/2026/04/01/unsloth-and-training-hub-lightning-fast-lora-and-qlora-fine-tuning)

### Energy & Environment
- [How Hungry is AI? Benchmarking Energy, Water, and Carbon - arXiv](https://arxiv.org/html/2505.09598v1)
- [Quantifying Energy Consumption and Carbon Emissions of LLMs - arXiv](https://arxiv.org/pdf/2507.11417)
- [AI Energy Usage Estimator - Tokenomy](https://tokenomy.ai/tools/energy-usage-estimator)
- [The Real Carbon Cost of an AI Token - DitchCarbon](https://ditchcarbon.com/blog/llm-carbon-emissions)
- [Tokens per Joule - JohnSnowLabs](https://www.johnsnowlabs.com/tokens-per-joule-how-to-quantify-and-reduce-the-energy-footprint-of-clinical-llm-inference/)

### GDPR/AI Act Compliance
- [AI Act - Shaping Europe's Digital Future](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- [EU AI Act Compliance 2026 - GDPRRegister](https://www.gdprregister.eu/regulations/eu-ai-act-compliance/)
- [GDPR Compliance AI Regulation: Key Insights 2026 - BLCKALPACA](https://blckalpaca.at/en/blog/gdpr-compliance-ai-regulation-key-insights-2026)
- [GDPR for AI Developers 2026 - Medium](https://medium.com/@odere.pub/gdpr-for-ai-developers-compliance-guide-0125bf12a1d2)

### DiLoCo & Distributed Training
- [DiLoCo: Distributed Low-Communication Training of Language Models - arXiv](https://arxiv.org/abs/2311.08105)
- [DiLoCo - OpenReview](https://openreview.net/forum?id=pICSfWkJIk)
- [Decoupled DiLoCo - Google DeepMind](https://deepmind.google/blog/decoupled-diloco/)
- [OpenDiLoCo - PrimeIntellect](https://www.primeintellect.ai/blog/opendiloco)

---

## Next Steps

1. ✅ Research: OpenAI alternatives landscape
2. ✅ Research: Open source ecosystem
3. ✅ Research: Vendor lock-in avoidance
4. ✅ Research: DHITL principles
5. ✅ Research: Self-hosting infrastructure requirements
6. ✅ Research: LoRA/QLoRA fine-tuning without lock-in
7. ✅ Research: Energy consumption & environmental impact
8. ✅ Research: GDPR/AI Act compliance
9. ✅ Research: DiLoCo distributed training
10. ⏳ Implement: Ollama deployment for self-hosting
11. ⏳ Implement: Provider adapter system
12. ⏳ Implement: DHITL governance layer
13. ⏳ Document: CXU accounting integration
14. ⏳ Propose: Public interest compute pool structure

**Status:** Research complete. Ready for implementation planning.

**Updated:** 2026-07-09 (Parts 9-13 added)
