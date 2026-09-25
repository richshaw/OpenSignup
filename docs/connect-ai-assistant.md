# Connect an AI assistant

OpenSignup speaks OAuth 2.1, so any MCP client — the Claude app, Claude Code,
ChatGPT, or something you wrote yourself — can ask for access to your
organizer account. You approve the request in your browser, and you can take
the access away again at any time.

The same steps, for organizers, are in the app's help at
`/help/connect-an-ai-assistant`.

The address of the MCP endpoint is always your instance's URL with
`/api/mcp` on the end:

```
https://<your-instance>/api/mcp
```

On the public instance that is `https://opensignup.org/api/mcp`.

## What an assistant can do

Once connected, an assistant can work on your signups the way you would in
the browser:

- **See** your workspaces, your signups, and each signup's fields and slots,
  including how many places are taken.
- **Create** a signup with its fields and slots in one go. It starts as a
  draft: participants cannot see it until you publish it, though other people
  in the same workspace can.
- **Change** a signup: title, description, tags, closing time, visibility,
  settings, fields, and slots.
- **Publish, close, archive, or delete** a signup.

Try: "Build me a snack rota for six Saturday games starting 3 October, two
families per game." Then: "Publish it and give me the link to share."

An assistant cannot see who has signed up. Names and email addresses sit behind
a separate permission that no assistant receives by default (see below), and
even with it there is no tool that returns them yet.

Your role in each workspace still decides what it can do there. In a workspace
where you are a viewer, an assistant can read your signups but cannot create or
change anything, exactly as you cannot.

Every change an assistant makes is recorded with the app that made it, so the
record can always tell your own edits from the assistant's. There is no page
that shows you that history yet.

## Connecting

Menu names change between releases; if the wording below does not match what
you see, look for whatever the app calls a custom connector or MCP server and
give it the URL above.

**Claude app** — Settings → Connectors → Add custom connector, then paste the
MCP endpoint URL. Claude opens a browser window for you to sign in and
approve.

**Claude Code** — add the server, then authenticate:

```bash
claude mcp add --transport http opensignup https://<your-instance>/api/mcp
```

Then run `/mcp` inside Claude Code and pick the OpenSignup server to start the
sign-in. A browser window opens for approval.

**ChatGPT** — turn on developer mode, add an MCP server, and use the same URL.

Whatever the client, the flow is the same: you land on OpenSignup, sign in if
you are not signed in already, and see a consent screen.

## What you are approving

The consent screen leads with the website the app comes from, such as
`claude.ai`. OpenSignup checks that part for you. The app picks its own name,
so the name is shown next to the website, never instead of it. Only allow an
app if you trust the website. (If whoever runs your OpenSignup site set an app
up for you with `OAUTH_STATIC_CLIENTS`, there is no website to check, and the
screen shows the name they gave it.)

A connected app acts as *you*, and it can't do anything you couldn't do
yourself. If you belong to more than one workspace, it can reach all of them,
with the same role you have in each.

Permissions are approved individually:

| Permission | What it unlocks |
|---|---|
| See your signups and their slots | Reading: workspaces, signups, fields, slots, and how full each slot is |
| Create and edit signups | Everything that changes a signup, including publishing and deleting |
| See who has signed up, including their names and email addresses | Participant contact details (no tool returns them yet) |

The third one is deliberately harder to get. It is not advertised to clients,
so an app does not receive it by default — it has to ask for it explicitly,
and when it does, the consent screen flags it in amber and says: *participants
gave these details to you, not to this app. Only approve if you are
comfortable with that domain handling them.* Take that at face value. An app
you did not grant it to cannot read participant details at all.

Allow and Don't allow carry equal weight on the screen. Declining sends the
app an `access_denied` answer and connects nothing.

## How long access lasts

- The token an app actually uses expires **15 minutes** after it is issued and
  is then renewed automatically.
- A renewal is good for **30 days** of inactivity before it lapses.
- Nothing survives past **90 days from the moment you approved it**. After
  that the app has to ask again.

Re-approving an app you already connected extends the connection you have
rather than creating a second one. An app can never gain a permission you did
not approve by renewing.

## Disconnecting

Click your email address in the organizer header to open **Settings**, then **Connected apps** (`/app/settings/connected-apps`).
Each connection shows the domain, the name the app reports, the permissions
you approved, when you approved it, when it was last used, and when it
expires.

Disconnect deletes the approval and every renewal token under it straight
away, so the app can get no new access. A token it was already holding keeps
working until it expires, which is at most 15 minutes — tokens are verified
without a database lookup, so there is no way to cut one short. The page says
the same thing where you click the button.

## For self-hosters

There is nothing to configure. The authorization server is always on and
derives everything from `AUTH_URL`:

- **`AUTH_URL` must be correct**, and in production it must be **HTTPS**. The
  OAuth issuer, the discovery documents, and the resource the tokens are bound
  to are all built from its origin, so a wrong value breaks every client.
  Plain HTTP is accepted only on loopback, for local development.
- **Node 22.12 or later** (the floor in `package.json`). The `oidc-provider`
  library needs it, and the `Dockerfile` and CI moved to Node 22 for this reason.
- Signing keys generate themselves on first use and live in the database, so
  every instance behind a load balancer verifies the others' tokens and a
  redeploy does not disconnect anyone.

Discovery is served at `/.well-known/oauth-authorization-server` (and the
identical `/.well-known/openid-configuration`) plus
`/.well-known/oauth-protected-resource`. Endpoints live under `/api/oauth/`.

Clients identify themselves with a Client ID Metadata Document: the
`client_id` is an HTTPS URL that OpenSignup fetches. Dynamic client
registration is off.

### Clients that cannot use a metadata document

Set `OAUTH_STATIC_CLIENTS` to a JSON array to pre-register them. This is what
you want for the MCP Inspector, or for a client with a fixed `client_id` and
no document to serve:

```bash
OAUTH_STATIC_CLIENTS='[{"client_id":"mcp-inspector","client_name":"MCP Inspector","redirect_uris":["http://localhost:6274/oauth/callback"]}]'
```

Static clients are public clients: no secret, PKCE required, and redirect URIs
matched exactly — except loopback addresses, where any port matches, as RFC
8252 requires for native apps.

Each static client may also set `"application_type": "web"` for a hosted client. The default, `native`, matches loopback redirect URIs on any port, which desktop MCP clients rely on.
