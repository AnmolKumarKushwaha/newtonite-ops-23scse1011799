# A five-minute review walkthrough

## 0:00 — What Relay solves

Open the dashboard as `anmol@relay.demo`. Explain that Relay gives each operational request a team, owner, priority, state and visible history. Point out attention views and that all list filtering happens on the server.

## 0:45 — Create and own a request

Create a Payment or Incident item with a clear title and description. Leave the initial owner unassigned. Open it and click Claim item. The timeline shows a creation event and a separate claim event with version numbers.

## 1:30 — Progress and approve

Move the item to In progress, then Request approval. As a lead, approve and resolve it. Explain that a Member can progress their own item but cannot approve Review → Resolved. Demonstrate that distinction using Maya in a separate browser profile if time allows.

## 2:15 — A stale edit is rejected

Open the same editable item in two tabs. Both must show the same version. In tab A edit the priority and save. In tab B save a different priority without reloading the detail. Show the 409 conflict message and reload action. Explain the conditional SQL predicate; checking only in the UI would be insufficient.

## 3:00 — Team isolation and roles

Sign in as Kabir in another browser profile. Only Finance is available. Sign in as Isha and choose Engineering to show Viewer access, then Customer success to show Lead access. Mention that API requests enforce the same permissions even if someone bypasses the UI.

## 3:45 — Tests and trade-offs

Run `node --test tests/*.test.mjs`. Highlight concurrent claims, duplicate creates, stale updates and the forced history-failure rollback test. Explain why SQLite/D1 was chosen and acknowledge that single-writer throughput has not been benchmarked for the brief's entire expected scale.

## 4:30 — What comes next

Explain the deliberately omitted queue and notification system. Discuss a transactional outbox, a stronger identity provider, full-text search and load testing. Avoid claiming that the project is production-ready or that an originality detector has certified it.

## Questions to be ready for

- Why is `WHERE version = ?` necessary after checking the version in application code?
- What happens when the client repeats a create after losing the response?
- Why does a failed audit insert undo the item update?
- Can a Finance lead approve an Engineering request?
- Why is a read-only role checked in the backend?
- What happens when a teammate inserts a new item between two paginated requests?
- Which parts would change if writes outgrew SQLite?
- Where would you add a new workflow state, and which tests should change?

## Manual pre-submission checks

- Run the app with Docker or Node and confirm the login screen loads.
- Check narrow/mobile layout, horizontal table scrolling, keyboard focus and Escape dismissal.
- Create, claim, edit, comment, progress, approve and close an item.
- Search and filter; move forward/back between list pages.
- Repeat a stale edit from two tabs.
- Confirm data remains after a server restart.
- Verify the README from a fresh extracted copy before uploading to GitHub.
