# Design: Firebase Serverless Architecture

## Overview

This document outlines the architectural decisions for converting the INTACT platform from Express.js + MongoDB to a Firebase serverless architecture. The design prioritizes minimal changes to the existing React frontend while completely replacing the backend.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client (React + Vite)                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │   Auth Store    │    │  React Query    │    │   Components    │ │
│  │   (Zustand)     │    │   (Cache)       │    │   (UI)          │ │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘ │
│           │                      │                      │          │
│           ▼                      ▼                      ▼          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Firebase SDK Layer                        │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐    │   │
│  │  │ firebase.ts   │  │ firestore/*   │  │ converters.ts │    │   │
│  │  │ (init)        │  │ (services)    │  │ (data xform)  │    │   │
│  │  └───────────────┘  └───────────────┘  └───────────────┘    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            Firebase                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │
│  │ Authentication │  │   Firestore    │  │    Hosting     │        │
│  │ (Email/Pass)   │  │   (Database)   │  │   (Static)     │        │
│  └────────────────┘  └────────────────┘  └────────────────┘        │
│                             │                                       │
│                    ┌────────┴────────┐                             │
│                    │ Security Rules  │                             │
│                    │ (firestore.rules)│                             │
│                    └─────────────────┘                             │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. Firebase Initialization (`client/src/lib/firebase.ts`)

```typescript
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Connect to emulators in development
if (import.meta.env.DEV) {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
}
```

### 2. Auth Store Updates (`client/src/store/auth-store.ts`)

The auth store will be updated to use Firebase Auth's observer pattern:

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

interface User {
  id: string;
  username: string;
  role: 'admin';
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => () => void; // Returns unsubscribe function
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: true,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        const userDoc = await getDoc(doc(db, 'users', credential.user.uid));
        if (userDoc.exists()) {
          set({
            user: { id: credential.user.uid, ...userDoc.data() } as User,
            isAuthenticated: true,
          });
        }
      },

      logout: async () => {
        await firebaseSignOut(auth);
        set({ user: null, isAuthenticated: false });
      },

      initialize: () => {
        return onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
            const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (userDoc.exists()) {
              set({
                user: { id: firebaseUser.uid, ...userDoc.data() } as User,
                isAuthenticated: true,
                isLoading: false,
              });
            }
          } else {
            set({ user: null, isAuthenticated: false, isLoading: false });
          }
        });
      },
    }),
    { name: 'auth-storage' }
  )
);
```

### 3. Firestore Service Pattern

Each collection will have a dedicated service module following this pattern:

```typescript
// client/src/lib/firestore/services.ts
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  DocumentReference,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

const COLLECTION = 'services';

// Type converters
const toFirestore = (data: CreateServiceData) => ({
  ...data,
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
});

const fromFirestore = (doc: DocumentSnapshot): Service => ({
  _id: doc.id,
  ...doc.data(),
  createdAt: doc.data().createdAt.toDate().toISOString(),
  updatedAt: doc.data().updatedAt.toDate().toISOString(),
});

export const servicesFirestore = {
  list: async (filters: ServicesQuery = {}): Promise<ServicesResponse> => {
    let q = query(collection(db, COLLECTION));

    if (filters.table) {
      q = query(q, where('repositoryTable', '==', filters.table));
    }
    if (filters.category) {
      q = query(q, where('categoryId', '==', filters.category));
    }
    // ... more filters

    const snapshot = await getDocs(q);
    const services = snapshot.docs.map(fromFirestore);

    return {
      services,
      total: snapshot.size,
      limit: filters.limit || 100,
      skip: filters.skip || 0,
    };
  },

  get: async (id: string): Promise<Service> => {
    const docRef = doc(db, COLLECTION, id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) throw new Error('Service not found');
    return fromFirestore(snapshot);
  },

  create: async (data: CreateServiceData): Promise<Service> => {
    const docRef = await addDoc(collection(db, COLLECTION), toFirestore(data));
    return servicesFirestore.get(docRef.id);
  },

  update: async (id: string, data: Partial<CreateServiceData>): Promise<Service> => {
    const docRef = doc(db, COLLECTION, id);
    await updateDoc(docRef, { ...data, updatedAt: Timestamp.now() });
    return servicesFirestore.get(id);
  },

  delete: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, COLLECTION, id));
  },
};
```

### 4. Scenarios as Subcollection

Scenarios will be stored as a subcollection under projects:

```
/projects/{projectId}/scenarios/{scenarioId}
```

This design choice:

- Enables efficient queries for scenarios within a project
- Allows security rules to inherit from parent project
- Simplifies deletion (delete project deletes all scenarios)

```typescript
// client/src/lib/firestore/scenarios.ts
export const scenariosFirestore = {
  listByProject: async (projectId: string): Promise<Scenario[]> => {
    const q = query(
      collection(db, 'projects', projectId, 'scenarios'),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(fromFirestore);
  },

  get: async (projectId: string, scenarioId: string): Promise<Scenario> => {
    const docRef = doc(db, 'projects', projectId, 'scenarios', scenarioId);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) throw new Error('Scenario not found');
    return fromFirestore(snapshot);
  },

  // Note: Need to find projectId from scenarioId for some operations
  // Consider storing projectId in scenario document for convenience
};
```

### 5. Reference Population

Unlike MongoDB's `populate()`, Firestore requires manual reference resolution:

```typescript
// Utility for populating references
async function populateRef<T>(
  ref: DocumentReference | string,
  collectionName: string
): Promise<T | null> {
  const docRef = typeof ref === 'string' ? doc(db, collectionName, ref) : ref;
  const snapshot = await getDoc(docRef);
  return snapshot.exists() ? ({ _id: snapshot.id, ...snapshot.data() } as T) : null;
}

// Usage in getServiceById
const service = fromFirestore(serviceDoc);
if (service.categoryId) {
  service.categoryId = await populateRef<Category>(service.categoryId, 'categories');
}
```

### 6. API Compatibility Layer

To minimize frontend changes, maintain the same API interface:

```typescript
// client/src/lib/api.ts - Updated
import { servicesFirestore } from './firestore/services';
import { projectsFirestore } from './firestore/projects';
// ... other imports

// Re-export with same interface
export const servicesApi = servicesFirestore;
export const projectsApi = projectsFirestore;
export const categoriesApi = categoriesFirestore;
export const scenariosApi = scenariosFirestore;
export const infrastructuresApi = infrastructuresFirestore;
export const usersApi = usersFirestore;
export { authApi }; // Keep as separate Firebase Auth implementation
```

## Data Type Considerations

### Timestamps

- MongoDB: `Date` objects
- Firestore: `Timestamp` objects
- Conversion in `fromFirestore`: `timestamp.toDate().toISOString()`

### ObjectIds → Document IDs

- MongoDB: `ObjectId` type
- Firestore: String document IDs (auto-generated or custom)
- Convention: Use `_id` field for compatibility

### References

- MongoDB: `ObjectId` with `populate()`
- Firestore: `DocumentReference` or store as string ID
- Strategy: Store as string ID, resolve manually when needed

### Arrays of Objects

- MongoDB: Subdocuments with `_id`
- Firestore: Arrays of maps (no auto-generated IDs)
- Strategy: Generate client-side IDs for `versions`, `executions`

## Security Rules Design

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Authentication helper
    function isSignedIn() {
      return request.auth != null;
    }

    // Admin check - reads user document to verify role
    function isAdmin() {
      return isSignedIn() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Users collection
    match /users/{userId} {
      // Users can read their own document
      allow read: if isSignedIn() && request.auth.uid == userId;
      // Only admins can list all users or write
      allow list: if isAdmin();
      allow write: if isAdmin();
    }

    // Read-heavy collections (categories, services)
    match /categories/{categoryId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }

    match /services/{serviceId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }

    // Projects with nested scenarios
    match /projects/{projectId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();

      // Scenarios inherit project permissions
      match /scenarios/{scenarioId} {
        allow read: if isSignedIn();
        allow write: if isAdmin();
      }
    }

    // Sensitive infrastructure data
    match /infrastructures/{infraId} {
      allow read, write: if isAdmin();
    }
  }
}
```

## Migration Strategy

### Step 1: Export MongoDB Data

```bash
# Export each collection to JSON
mongoexport --db intact --collection categories --out categories.json --jsonArray
mongoexport --db intact --collection services --out services.json --jsonArray
# ... etc
```

### Step 2: Transform Data

```typescript
// Migration script transforms:
// - ObjectId → string
// - Date → Firestore Timestamp
// - Nested ObjectId refs → string refs
// - Flatten scenarios into project subcollections
```

### Step 3: Import to Firestore

```typescript
// Use Firebase Admin SDK for bulk imports
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();
const batch = db.batch();

for (const category of categories) {
  const ref = db.collection('categories').doc(category._id);
  batch.set(ref, transformToFirestore(category));
}

await batch.commit();
```

## Performance Considerations

### Indexes Required

```json
// firestore.indexes.json
{
  "indexes": [
    {
      "collectionGroup": "services",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "repositoryTable", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "projects",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "sector", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

### Denormalization for Counts

Since Firestore doesn't support efficient counts, maintain counter documents:

```typescript
// When creating a scenario, also update project's scenarioCount
const projectRef = doc(db, 'projects', projectId);
await updateDoc(projectRef, {
  scenarioCount: increment(1),
});
```

## Error Handling

```typescript
import { FirebaseError } from 'firebase/app';

function handleFirestoreError(error: unknown): never {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'permission-denied':
        throw new Error('You do not have permission to perform this action');
      case 'not-found':
        throw new Error('The requested resource was not found');
      case 'unavailable':
        throw new Error('Service temporarily unavailable. Please try again.');
      default:
        throw new Error(`Database error: ${error.message}`);
    }
  }
  throw error;
}
```

## Testing Strategy

### Local Development

- Use Firebase Emulator Suite for local development
- Emulator provides Auth + Firestore without cloud costs
- Security rules can be tested locally

### Unit Tests

- Mock Firestore with `@firebase/rules-unit-testing`
- Test each service module independently
- Verify data transformations

### Integration Tests

- Use emulator for integration tests
- Test full CRUD flows
- Verify security rules enforcement
