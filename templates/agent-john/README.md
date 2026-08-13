# Agent John (WhatsApp) templates

Secret-free fragments for Fracta (and similar hosts).

| File | Use |
|------|-----|
| `agent-john-whatsapp.retrieval.env.example` | Env key list for retrieval modes |
| `agent-john-whatsapp.service.d-retrieval.conf` | systemd drop-in for **shadow** pilot |
| `agent-john-whatsapp.accounting.conf.example` | COP durable spend (Supabase + spool) for WhatsApp unit |
| `mcp-cogentia.accounting.conf.example` | COP flags for Guide/MCP unit |

Desired state and apply/verify steps:

- [`docs/agent-john-whatsapp-retrieval.md`](../../docs/agent-john-whatsapp-retrieval.md)

Product / pairing handbook (code repo):

- [cogentia `docs/agent-john-deployment-operium.md`](https://github.com/JeanHuguesRobert/cogentia/blob/main/docs/agent-john-deployment-operium.md)
