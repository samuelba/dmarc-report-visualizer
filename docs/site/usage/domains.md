---
title: Domains
description: Managed domains and the ones that showed up only in reports.
sidebar:
  order: 42
---

**Domains** (`/domains`) is visible to every signed-in user. The time range defaults to 30 days, with choices of 7, 14, 30, 60, 90, 180, and 365.

Managed domains show total messages, unique sources, pass and fail counts, and DMARC, DKIM, and SPF pass rates, plus notes. A domain you added that had no mail in the range is still listed, with zeros.

Unknown domains are header-from values seen in reports and not in the managed list. They are the ones to review: a domain you forgot, or someone else using your name. **Add to Managed** promotes one. Add Domain asks for a name and optional notes.

Create, update, and delete require an administrator. The Add button is still shown to other users. The API rejects them. The name is stored as typed. A duplicate is an exact match.

The page does not print DNS instructions. The `rua` record is in [First steps](/dmarc-visualizer/docs/getting-started/first-steps/).
