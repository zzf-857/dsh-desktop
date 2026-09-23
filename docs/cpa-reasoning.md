# CPA 思考强度适配

Desktop 的聊天输入框已支持按模型选择推理等级。自定义 provider 的模型只有 ID 和名称时，DSH 无法知道它有哪些档位；普通 OpenAI 模型列表通常也不包含这项能力。

CPA 的扩展目录 `GET /v1/models?client_version=pi` 提供 `supported_reasoning_levels`。本仓库的同步命令把这些声明写入现有模型的 `reasoningEfforts`，并优先使用显式的本地模型覆盖配置，不根据模型名称、别名或厂商猜测。

## 同步已配置的 provider

在仓库根目录执行，先预览，再应用：

```powershell
corepack yarn provider:cpa:sync --provider <provider-id>
corepack yarn provider:cpa:sync --provider <provider-id> --apply
```

命令从 `.local-data/dsh-home/settings.yaml` 读取指定 provider 的地址与凭据引用，从环境或本地凭据文件读取密钥。它只查询模型目录，不发起模型推理，也不输出密钥。当前支持 `openai-completions` 路由。

应用时使用与 DSH 相同的文件锁和原子写入机制；如果查询期间配置已变更，就拒绝覆盖并提示重试。原设置会备份到已被 Git 忽略的 `.local-data/provider-backups/`。会话、凭据文件和当前选中的模型/档位保持不变。

## 目录少报档位时使用本地覆盖

代理的目录可能只声明 Low、Medium、High，而后端实际接受 Xhigh、Max。对已经确认可用的模型，在被 Git 忽略的 `.local-data/cpa-reasoning-overrides.json` 中按 provider ID 和完整模型 ID 声明档位：

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

再次执行同一条同步命令即可应用。本地配置只覆盖完全匹配的模型，优先级高于目录，后续同步也会保留这些档位。键是 Desktop 的选项，值是实际发送的参数值，例如 `max: "max"` 原样发送 `reasoning_effort: "max"`。模型必须已存在于该 provider 中；不要把一个模型的能力推广到其他模型。HTTP 请求成功表示网关接受请求，不单独证明后端采用了某种推理质量或预算。

## 在 Desktop 中使用

点击聊天输入框右下角的模型名称，再选择 **推理等级**。菜单显示该模型同步后的档位；例如配置 `low / medium / high / xhigh / max` 时，会出现 **Default / Low / Medium / High / Xhigh / Max**。

选择明确档位会通过 `reasoning_effort` 发送给 CPA。**Default** 不强制发送档位，继续使用服务端默认行为。同步同时指定 OpenAI 格式，并在没有显式配置时保持系统提示词使用 `system` 角色，避免启用思考后被 SDK 改成 `developer`。设置会动态生效；菜单已打开时请关闭后重新打开。

同时缺少目录声明与本地覆盖的模型保持原样；重复模型 ID、未知档位以及冲突的模型级协议配置会报错。没有显式声明时不会增加 Off、Xhigh、Max，也不会新增模型或更改模型别名、上下文长度和凭据引用。

## 验证

`corepack yarn test:cpa-reasoning` 验证元数据映射、字段保留、幂等、备份与并发保护，并通过 Stable/Beta 实际 LLM adapter 向本机模拟服务器检查请求参数。真实模型的最终执行仍由 CPA 及其后端决定。

参考：[CPA 官方 Pi provider 的目录协议](https://github.com/router-for-me/pi-cliproxyapi-provider#model-mapping)、[CPA 思考参数说明](https://help.router-for.me/configuration/thinking)。
