# Capability: Firebase Backend

## Overview

Replace Express.js + MongoDB backend with Firebase services (Authentication + Firestore) accessed directly from the client application.

---

## ADDED Requirements

### Requirement: Firebase Authentication

The application SHALL authenticate users via Firebase Authentication using email/password. The system MUST persist sessions across browser reloads and handle token management internally.

#### Scenario: User logs in with email and password

- **Given** a user exists in Firebase Authentication with email "admin@example.com"
- **And** a corresponding user document exists in Firestore `/users/{uid}`
- **When** the user submits valid credentials on the login form
- **Then** Firebase Authentication validates the credentials
- **And** the user's role is fetched from Firestore
- **And** the user is redirected to the dashboard

#### Scenario: User session persists across page reloads

- **Given** a user has previously logged in
- **When** the page is reloaded
- **Then** Firebase Auth state is restored automatically
- **And** the user remains authenticated without re-entering credentials

#### Scenario: User logs out

- **Given** a user is currently authenticated
- **When** the user clicks the logout button
- **Then** `signOut()` is called on Firebase Auth
- **And** local auth state is cleared
- **And** the user is redirected to the login page

---

### Requirement: Firestore Data Storage

The application SHALL store all data in Cloud Firestore. All CRUD operations MUST be performed directly from the client using the Firebase SDK.

#### Scenario: CRUD operations on services

- **Given** an admin user is authenticated
- **When** the user creates, reads, updates, or deletes a service
- **Then** the operation is performed directly on Firestore `/services/{serviceId}`
- **And** the UI reflects the changes immediately
- **And** timestamps are automatically managed

#### Scenario: Querying services with filters

- **Given** services exist in Firestore with various `repositoryTable` values
- **When** the user filters by "INTACT_TOOLBOX"
- **Then** a Firestore query with `where('repositoryTable', '==', 'INTACT_TOOLBOX')` is executed
- **And** only matching services are returned

#### Scenario: Scenarios stored as subcollection

- **Given** a project exists at `/projects/{projectId}`
- **When** a scenario is created for that project
- **Then** the scenario is stored at `/projects/{projectId}/scenarios/{scenarioId}`
- **And** querying scenarios by project returns only that project's scenarios

---

### Requirement: Firestore Security Rules

The application SHALL enforce role-based access control via Firestore Security Rules. Non-admin users MUST NOT be able to write data.

#### Scenario: Authenticated user reads public data

- **Given** a user is authenticated (any role)
- **When** the user attempts to read categories, services, or projects
- **Then** the read operation succeeds
- **And** the data is returned

#### Scenario: Non-admin user attempts to write data

- **Given** a user is authenticated with role != "admin"
- **When** the user attempts to create or modify a service
- **Then** Firestore denies the operation with "permission-denied"
- **And** the UI displays an appropriate error message

#### Scenario: Admin user writes data

- **Given** a user is authenticated with role == "admin"
- **And** the user document at `/users/{uid}` has `role: "admin"`
- **When** the user creates, updates, or deletes any document
- **Then** the operation succeeds

---

### Requirement: Firebase Initialization

The application SHALL initialize the Firebase SDK on startup and MUST connect to Firebase services before rendering protected content.

#### Scenario: Firebase connects successfully

- **Given** valid Firebase configuration is provided via environment variables
- **When** the application starts
- **Then** Firebase Auth and Firestore are initialized
- **And** connection to Firebase services is established

#### Scenario: Development mode uses emulators

- **Given** the application is running in development mode
- **When** Firebase is initialized
- **Then** Auth connects to the local emulator on port 9099
- **And** Firestore connects to the local emulator on port 8080

---

### Requirement: Firestore Data Converters

The application SHALL convert between Firestore document formats and TypeScript interfaces. Timestamp fields MUST be converted to ISO 8601 strings for API compatibility.

#### Scenario: Timestamp conversion

- **Given** a document with Firestore `Timestamp` fields
- **When** the document is read from Firestore
- **Then** `createdAt` and `updatedAt` are converted to ISO 8601 strings
- **And** the data matches the expected TypeScript interface

#### Scenario: Reference population

- **Given** a service document with `categoryId` as a string reference
- **When** the service is fetched with population requested
- **Then** the category document is fetched separately
- **And** `categoryId` is replaced with the full category object

---

### Requirement: Offline Support

The application SHALL remain functional when offline using Firestore's built-in caching. Offline writes MUST be queued and synchronized when connectivity is restored.

#### Scenario: User goes offline while browsing

- **Given** the user has previously loaded data
- **When** the network connection is lost
- **Then** previously cached data remains accessible
- **And** the UI indicates offline status

#### Scenario: Offline writes are queued

- **Given** the user is offline
- **When** the user makes a data modification
- **Then** the write is queued locally
- **And** the write is synchronized when connectivity is restored

---

## Cross-References

- **Replaces:** Express.js + MongoDB backend architecture
- **Relates to:** `authentication` spec (Firebase Auth replaces custom auth)
- **Relates to:** `service-repository` spec (Firestore replaces MongoDB for services)
- **Blocks:** Cloud Functions implementation (future phase)
