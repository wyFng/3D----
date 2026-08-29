# 极速跑酷 3D

网页版 3D 关卡制跑酷游戏。Three.js + Vite 构建，**全部美术与音效程序化生成，零外部资源、零网络请求**，纯静态部署。

## 快速开始

```bash
npm install
npm run dev      # 开发服务器
npm run build    # 构建静态文件到 dist/
npm run preview  # 预览构建产物
npm test         # 运行单元测试（Vitest）
```

## 游戏内容

- **12 个关卡 · 4 大主题**：霓虹都市 → 古庙丛林 → 天空浮岛 → 熔岩洞窟，难度递进
- **5 个可选角色**（主菜单 → 选择角色）：暗影盗贼 / 钢铁骑士 / 狂野蛮人 / 秘法师 / 电子机器人，骨骼动画驱动（跑/跳/滑/死亡/庆祝）
- **障碍类型**：墙（换道）、低栏（跳跃）、横杆（滑铲）、移动石墩（预判走位）、断桥缺口（跳跃）
- **收集与道具**：金币（结算收集率）、磁铁 / 护盾（挡一次碰撞）/ 加速
- **结算**：金币收集率 + 通关时间 → 1~3 星评价（仅当次会话，无存档）

## 角色模型来源与许可

- `KayKit_*` 角色：[KayKit - Character Pack: Adventures](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0)，作者 Kay Lousberg（KayKit），**CC0** 协议
- `RobotExpressive`：来自 [three.js 官方示例资产](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf)，作者 Quaternius，**CC0** 协议
- 模型文件已打包进 `public/models/`，运行时本地加载，无外部网络请求

## 场景道具来源与许可

- 障碍物（残墙/半墙/墙柱/石柱）与装饰（木桶/木箱/缺口碎石/终点旗帜/尖刺）：[KayKit - Dungeon Remastered](https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0)，作者 Kay Lousberg，**CC0** 协议
- 道具按主题染色适配四大世界（霓虹偏冷蓝、丛林偏暖沙岩、天空偏亮、熔岩偏暗红），并保留程序化几何作为加载失败的兜底

## 操作

| 动作 | 电脑 | 手机 |
|---|---|---|
| 换道 | ← → / A D | 左右滑动 |
| 跳跃 | ↑ / W / 空格 | 上滑或点击 |
| 下滑 | ↓ / S | 下滑 |
| 暂停 | Esc / P | ⏸ 按钮 |
| 重开 | R | — |
| 静音 | M | 🔊 按钮 |

## 测试钩子（自动化验证用）

URL 参数：`?level=N`（直达第 N 关）、`&autoplay=1`（AI 自动试玩）、`&ts=3`（时间倍率）。
`window.__game` 暴露游戏实例（`state` / `player` / `beginRun()` 等）。

## 测试与质量

- **单元测试**（31 项）：AABB 碰撞、跳跃抛物线、缺口坠落、道具效果、星级评定、
  以及 **12 关关卡数据合法性校验**（可通行性、金币/道具不压障碍、难度曲线）
- **GUI 黑盒实测**：浏览器自动化逐关真实试玩（键盘 + 触屏双端）、UI 全流程、控制台零报错

## 安全设计

纯静态、无后端、无账号、运行时无任何网络请求；依赖本地打包（不用 CDN）；
`package-lock.json` 锁定版本；页面启用 CSP（`script-src 'self'`）防脚本注入。
