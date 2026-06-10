# Firebase Security Specification (TDD)

This spec defines the structural constraints and access controls for our Firebase application: 
- **Guests Profile (`/guests/{userId}`)**
- **Wayfinding Sessions Logs (`/sessions/{sessionId}`)**
- **Collaborative Building Tips (`/tips/{tipId}`)**

## 1. Data Invariants

1. **Guest Profile Integrity**:
   - Guests can only read and write their own profile document (`/guests/{userId}`). Blanket lists are forbidden.
   - Profile must contain `guestName` (string, max 100 characters) and `userId` matching the authenticated user.
   - `favoriteBuildings` must be an array of integers with size <= 50.

2. **Wayfinding Sessions Isolation**:
   - Each guest can only view their own wayfinding sessions using queries targeting `userId == request.auth.uid`.
   - Creating a session requires the `userId` in the payload to match the authenticated guest.
   - Once a session is created, it cannot be updated or deleted by anyone to preserve historical correctness.

3. **Building Tips Collaboration**:
   - Any authenticated guest can read the list of tips left by other guests (`allow list`).
   - Any authenticated guest can post comments/tips for a building (`allow create`).
   - The tip payload `caption` must be a string of length <= 200.
   - `userId` in the tip must match the creator's UID.
   - A tip can be deleted ONLY by its creator.
   - A tip cannot be modified (updated) after creation.

---

## 2. The "Dirty Dozen" Malicious Payloads

The following payloads attempt to violate security layers and must be blocked with `PERMISSION_DENIED`.

### Pillar 1: Identity Spoofing & Impersonation
1. **Payload 1: Impersonate Guest Profile**
   - Payload: `{ userId: "hacker_uid", guestName: "Hacker Bob" }`
   - Target Path: `/guests/legit_guest_uid` (Authenticated as `legit_guest_uid`)
   - Intent: Set someone else's profile details.
2. **Payload 2: Fake Author Session Creation**
   - Payload: `{ sessionId: "sess_1", userId: "target_uid", buildingId: 2, buildingName: "Al Hamra", completed: true, timestamp: request.time }`
   - Target Path: `/sessions/sess_1` (Authenticated as `hacker_uid`)
   - Intent: Create a session representing another user.

### Pillar 2: Schema Violations & Types
3. **Payload 3: Huge Nickname Denial of Wallet**
   - Payload: `{ userId: "legit_uid", guestName: "A".repeat(10000) }`
   - Target Path: `/guests/legit_uid`
   - Intent: Store extremely large string to inflate database query costs.
4. **Payload 4: Invalid Field Type Injection**
   - Payload: `{ sessionId: "sess_2", userId: "legit_uid", buildingId: "not-a-number", buildingName: "Al Hamra", completed: true, timestamp: request.time }`
   - Target Path: `/sessions/sess_2`
   - Intent: Break sorting/queries by injecting non-integer building IDs.

### Pillar 3: Status Shortcutting & State Locking
5. **Payload 5: Session Modification Hack**
   - Payload: `{ sessionId: "sess_3", userId: "legit_uid", buildingId: 2, buildingName: "Al Hamra", completed: true, timestamp: request.time }`
   - Target Path: `/sessions/sess_3` (Update target)
   - Intent: Rewrite history or mark a failed session as completed.
6. **Payload 6: Unauthorized Modification of Tips**
   - Payload: `{ tipId: "tip_abc", buildingId: 2, userId: "legit_uid", userName: "Legit", userEmail: "l@test.com", caption: "Defaced caption content!", createdAt: request.time }`
   - Target Path: `/tips/tip_abc` (Update target)
   - Intent: Mutate a community tip, defacing or changing history.

### Pillar 4: PII / Privacy Leak Risks
7. **Payload 7: Unauthenticated Profile Peek**
   - Action: `get` / `/guests/legit_uid` (Unauthenticated)
   - Intent: Scrape private user profiles.
8. **Payload 8: Guest Directory Scraping**
   - Action: `list` / `/guests` (Authenticated as standard user)
   - Intent: List all checked-in resort guests.

### Pillar 5: Value & Injection Attacks
9. **Payload 9: Path Pointer Escape**
   - Target ID: `../../hack/doc`
   - Intent: Evade structured path boundaries.
10. **Payload 10: Array Flood Attack**
    - Payload: `{ userId: "legit_uid", guestName: "Legit", favoriteBuildings: [1, 2, 3... 10000 items] }`
    - Target Path: `/guests/legit_uid`
    - Intent: Saturate memory/wallet limits using giant array properties.

### Pillar 6: Temporal Integrity Check
11. **Payload 11: Past/Future Fake Creation Time**
    - Payload: `{ tipId: "tip_def", buildingId: 2, userId: "legit_uid", userName: "Legit", caption: "Nice place", createdAt: "1999-01-01T00:00:00Z" }`
    - Target Path: `/tips/tip_def`
    - Intent: Circumvent temporal bounds with falsified local timestamps.

### Pillar 7: Deletion Overrides
12. **Payload 12: Delete Another User's Tip**
    - Action: `delete` on `/tips/victim_tip` (Authenticated as hacker)
    - Intent: Erase negative ratings or genuine feedback left by others.
