---
title: Users and invites
description: Invite an administrator or a user, with or without SMTP.
sidebar:
  order: 32
---

**Users** is for administrators. **Invite User** is shown only while password login is allowed. The dialog asks for an email and a role, User or Administrator. The invite lasts 7 days.

The link is `${FRONTEND_URL}/invite/<token>`. `FRONTEND_URL` defaults to `http://localhost:4200` when it is unset, and the stock Compose file does not pass it. Set it to the public origin before you send invites. The raw token is returned once. Only a hash is stored.

SMTP is not required to create an invite.

- SMTP off: the UI says to share the link yourself (`not_configured`).
- SMTP on and the queue accepts the message: the status is `sent`. Delivery happens in the background, so a later SMTP error only shows in the backend log.
- SMTP on and the queue rejects it: the invite still exists and the UI says to share the link (`failed`).

Pending invites can be revoked. Accepting the link creates the user with that email, that role, and the [password rules](/dmarc-visualizer/docs/authentication/local-accounts/).

Queued mail needs Redis. See [SMTP](/dmarc-visualizer/docs/authentication/smtp/).
