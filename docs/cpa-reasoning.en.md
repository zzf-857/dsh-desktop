# CPA reasoning effort integration

Desktop already supports per-model reasoning selection in the chat composer. A custom provider configured with only model IDs and names does not describe selectable levels; the ordinary OpenAI model listing usually omits this capability too.

CPA's extended catalog, `GET /v1/models?client_version=pi`, provides `supported_reasoning_levels`. The repository sync command imports those declarations into the existing models' `reasoningEfforts`, preferring explicit local model overrides, without guessing from names, aliases or vendors.

## Synchronize a configured provider

Run from the repository root, previewing before applying:

```powershell
corepack yarn provider:cpa:sync --provider <provider-id>
corepack yarn provider:cpa:sync --provider <provider-id> --apply
```

The command reads the selected provider's endpoint and credential reference from `.local-data/dsh-home/settings.yaml`, then resolves the key from the environment or local credential file. It queries only the catalog, never performs inference or prints credentials. Currently it supports `openai-completions` routes.

Applying uses DSH's own file lock and atomic writer. A configuration change during the catalog request refuses the write and requires a retry. Original settings are backed up under the Git-ignored `.local-data/provider-backups/`. Sessions, the credential file and the current model/effort selection are preserved.

## Override an incomplete catalog locally

A proxy catalog may advertise only Low, Medium and High while its backend accepts Xhigh and Max. For models whose support has been confirmed, declare levels by provider ID and complete model ID in the Git-ignored `.local-data/cpa-reasoning-overrides.json`:

```json
{
  "version": 1,
  "providers": {
    "my-provider": {
      "relay/model-id": {
        "low": "low",
        "medium": "medium",
        "high": "high",
        "xhigh": "xhigh",
        "max": "max"
      }
    }
  }
}
```

Apply with the same sync command. Local declarations affect only exact model matches, take precedence over the catalog and survive later syncs. Keys are Desktop choices and values are wire values: for example, `max: "max"` sends `reasoning_effort: "max"` unchanged. The model must already exist in that provider; do not generalize one model's capabilities to others. HTTP success means the gateway accepted the request; it does not alone prove the backend used a particular reasoning quality or budget.

## Use in Desktop

Click the model name at the bottom right of the chat composer, then **Reasoning effort**. The model's synchronized choices appear. For example, configuring `low / medium / high / xhigh / max` offers **Default / Low / Medium / High / Xhigh / Max**.

An explicit selection is sent to CPA as `reasoning_effort`. **Default** omits an explicit effort and preserves the server's behavior. Sync also selects the OpenAI wire format and, unless explicitly configured otherwise, preserves the `system` prompt role so enabling reasoning does not make the SDK switch to `developer`. Settings apply dynamically; close and reopen an already-open menu.

Models without either catalog metadata or a local override are preserved. Duplicate model IDs, unknown levels and conflicting model-level protocol overrides are rejected. Without an explicit declaration, sync never invents Off, Xhigh or Max, adds models, or changes aliases, context limits or credential references.

## Verification

`corepack yarn test:cpa-reasoning` checks metadata mapping, field preservation, idempotence, backups and concurrent-write protection. It also exercises the actual Stable/Beta LLM adapters against a local mock HTTP server to verify wire parameters. The final execution behavior remains owned by CPA and its backend.

References: [CPA's official Pi provider catalog contract](https://github.com/router-for-me/pi-cliproxyapi-provider#model-mapping), [CPA thinking parameters](https://help.router-for.me/configuration/thinking).
