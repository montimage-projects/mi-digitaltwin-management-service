# Proposal: Convert to Firebase Serverless Architecture

## Change ID
`convert-firebase-serverless`

## Summary
Convert the INTACT Digital Twin Management Platform from a traditional Express.js + MongoDB backend to a serverless Firebase architecture using Firebase Authentication and Firestore database. This phase focuses on the client-side integration only - Cloud Functions will be implemented separately in a future phase.

## Motivation
- **Reduce operational overhead**: Eliminate the need to manage and deploy a Node.js server
- **Cost efficiency**: Pay-per-use model with Firebase's generous free tier (50K reads/day, 20K writes/day, 1GB storage)
- **Built-in authentication**: Leverage Firebase Auth for secure, scalable authentication with multiple providers
- **Real-time capabilities**: Firestore provides real-time listeners for live data updates
- **Scalability**: Automatic scaling without server configuration
- **Simplified deployment**: Static frontend hosting with Firebase Hosting

## Scope

### In Scope
1. Replace MongoDB with Firestore as the primary database
2. Replace custom JWT authentication with Firebase Authentication
3. Move all data access logic to client-side Firebase SDK
4. Update all API calls to direct Firestore operations
5. Migrate existing data models to Firestore collections
6. Update security rules for Firestore
7. Remove Express.js server dependency

### Out of Scope (Deferred)
- Cloud Functions for server-side logic (future phase)
- Complex aggregations requiring server-side processing
- PDF generation (will use client-side libraries temporarily)
- Infrastructure credential encryption (requires Cloud Functions)
- MAESTRO integration webhooks (requires Cloud Functions)

## Current Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   React     │────▶│  Express    │────▶│  MongoDB    │
│   Frontend  │     │  Server     │     │  Database   │
└─────────────┘     └─────────────┘     └─────────────┘
       │
       └── JWT Tokens (custom)
```

## Proposed Architecture

```
┌─────────────┐     ┌─────────────────────────────────┐
│   React     │────▶│         Firebase                │
│   Frontend  │     │  ┌───────────┐  ┌───────────┐   │
└─────────────┘     │  │   Auth    │  │ Firestore │   │
                    │  └───────────┘  └───────────┘   │
                    └─────────────────────────────────┘
```

## Data Model Migration

### Current MongoDB Collections → Firestore Collections

| MongoDB Collection | Firestore Collection | Notes |
|-------------------|---------------------|-------|
| users | users | Email-based auth via Firebase Auth |
| categories | categories | Direct migration |
| services | services | Direct migration with nested objects |
| projects | projects | Direct migration |
| scenarios | scenarios | Subcollection under projects |
| infrastructures | infrastructures | Credentials handled differently |

### Firestore Document Structure

```
/users/{userId}
  - username: string
  - role: "admin"
  - createdAt: timestamp
  - updatedAt: timestamp

/categories/{categoryId}
  - name: string
  - slug: string
  - description?: string
  - createdAt: timestamp
  - updatedAt: timestamp

/services/{serviceId}
  - shortName: string (unique)
  - title: string
  - categoryId: reference(/categories/{id})
  - provider: string
  - description?: string
  - currentVersion?: string
  - versions: array<Version>
  - type: "Software" | "Hardware" | "Software/Hardware"
  - trl: { current?: number, expected?: number }
  - license?: string
  - standards: string[]
  - inputs: array<InputOutput>
  - outputs: array<InputOutput>
  - interactsWith: string[]
  - potentialUseCases: string[]
  - repositoryTable: "INTACT_TOOLBOX" | "OTHER_SERVICES"
  - createdAt: timestamp
  - updatedAt: timestamp

/projects/{projectId}
  - shortName: string (unique)
  - title: string
  - sector: string
  - leader: string
  - involvedPartners: string[]
  - description?: string
  - isComposite: boolean
  - atomicProjectIds: reference[]
  - createdAt: timestamp
  - updatedAt: timestamp

/projects/{projectId}/scenarios/{scenarioId}
  - title: string
  - description?: string
  - topology: { yaml: string, nodes: array, edges: array }
  - infrastructureId?: reference
  - executions: array<Execution>
  - createdAt: timestamp
  - updatedAt: timestamp

/infrastructures/{infrastructureId}
  - name: string (unique)
  - type: "kubernetes" | "docker" | "virtual"
  - endpoint: string
  - capacity: { cpu?: number, memory?: number, storage?: number }
  - status: "active" | "inactive" | "error"
  - lastHealthCheck?: timestamp
  - createdAt: timestamp
  - updatedAt: timestamp
  # Note: credentials NOT stored (requires Cloud Functions)
```

## Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper: Check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }

    // Helper: Check if user is admin
    function isAdmin() {
      return isAuthenticated() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Users - admins only
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }

    // Categories - read all, write admin only
    match /categories/{categoryId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }

    // Services - read all, write admin only
    match /services/{serviceId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();
    }

    // Projects and nested scenarios
    match /projects/{projectId} {
      allow read: if isAuthenticated();
      allow write: if isAdmin();

      match /scenarios/{scenarioId} {
        allow read: if isAuthenticated();
        allow write: if isAdmin();
      }
    }

    // Infrastructures - admin only
    match /infrastructures/{infraId} {
      allow read, write: if isAdmin();
    }
  }
}
```

## Implementation Phases

### Phase 1: Firebase Setup & Authentication (This Proposal)
- Initialize Firebase project
- Configure Firebase Authentication with email/password
- Replace custom JWT auth with Firebase Auth
- Update auth store and login flow

### Phase 2: Firestore Data Layer
- Create Firestore service modules
- Migrate API calls to Firestore operations
- Implement data converters (MongoDB → Firestore format)
- Add real-time listeners where beneficial

### Phase 3: Data Migration & Cleanup
- Create migration script for existing data
- Test all CRUD operations
- Remove Express.js server code
- Update deployment configuration

### Future Phase: Cloud Functions
- Credential encryption for infrastructures
- Complex aggregations
- PDF generation
- MAESTRO webhooks
- Scheduled tasks

## Trade-offs & Considerations

### Advantages
1. **No server management**: Firebase handles scaling and availability
2. **Built-in auth**: Industry-standard authentication with session management
3. **Real-time updates**: Instant UI updates via Firestore listeners
4. **Offline support**: Firestore SDK provides offline caching
5. **Cost-effective**: Free tier covers typical development usage

### Limitations
1. **No server-side encryption**: Infrastructure credentials cannot be encrypted without Cloud Functions
2. **Query limitations**: Firestore has different query capabilities than MongoDB
3. **Vendor lock-in**: Tight coupling to Firebase ecosystem
4. **Aggregations**: Complex counts/aggregations require client-side or Cloud Functions
5. **Text search**: No native full-text search (may need Algolia integration later)

### Mitigations
- **Credentials**: Store only non-sensitive infrastructure config; credentials entered at execution time
- **Search**: Use client-side filtering for small datasets; plan Algolia for scale
- **Aggregations**: Maintain counter documents for scenario counts

## Dependencies
- firebase (^11.x)
- react-firebase-hooks (^5.x)

## Files to Modify/Create

### New Files
- `client/src/lib/firebase.ts` - Firebase initialization
- `client/src/lib/firestore/` - Firestore service modules
- `firebase.json` - Firebase configuration
- `firestore.rules` - Security rules
- `.firebaserc` - Firebase project config

### Modified Files
- `client/src/lib/api.ts` - Replace axios with Firestore
- `client/src/store/auth-store.ts` - Use Firebase Auth
- `client/src/pages/Login.tsx` - Firebase Auth login
- `client/package.json` - Add Firebase dependencies

### Removed Files (Phase 3)
- `server/` directory (entire Express.js backend)

## Success Criteria
1. Users can authenticate via Firebase Auth
2. All CRUD operations work via Firestore
3. Real-time updates reflect data changes instantly
4. Security rules enforce admin-only writes
5. Application works offline with Firestore caching
6. No server required to run the application

## Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data migration errors | Medium | High | Thorough testing, rollback plan |
| Query performance issues | Low | Medium | Index optimization, denormalization |
| Firebase outages | Low | High | Firestore offline mode provides resilience |
| Cost overruns | Low | Low | Monitor usage, set budget alerts |

## Timeline Estimate
- Phase 1: Firebase Auth integration
- Phase 2: Firestore data layer
- Phase 3: Migration and cleanup
- Future: Cloud Functions (separate proposal)
