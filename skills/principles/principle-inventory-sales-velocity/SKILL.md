---
name: principle-inventory-sales-velocity
description: Operational inventory velocity vs sales expansion divergence engine. Detects channel stuffing, unexpected inventory accumulation, and supply chain bottlenecks.
---

# principle-inventory-sales-velocity

Operational inventory velocity divergence engine measuring the delta between inventory growth and top-line sales growth:

$$\Delta = g_{\text{inventory}} - g_{\text{sales}}$$

## Core Thresholds

- $\Delta \le 0.0\%$: Healthy / Lean operational velocity (sales expanding faster than inventories)
- $0.1\% - 5.0\%$: Normal working capital buffer
- $5.1\% - 10.0\%$: Warning threshold (inventory accumulation outpacing shipments)
- $> 10.0\%$: Severe channel-stuffing or inventory obsolescence danger

