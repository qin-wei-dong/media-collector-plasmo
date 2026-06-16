# Popup 可访问性审计报告

生成时间:6/16/2026, 8:59:30 PM

## 概要

- 可处理违规:**0**
- 外部限制(已知无法修复):1
- 通过(passes):8
- 待人工复核(incomplete):0

✅ **无可处理违规项**

## 外部限制(不计入审计结果)

以下违规来自框架/工具默认行为,无法在源码层修复:

- **meta-viewport** (moderate):Zooming and scaling must not be disabled
  - 原因:Plasmo 自动注入 viewport meta 含 user-scalable=no
  - 绕过:无,需 fork Plasmo 或 post-build patch
