# Capability: Service Repository

## ADDED Requirements

### Requirement: Category Model

The system SHALL store service categories with unique identifiers.

#### Scenario: Category schema fields

- **WHEN** a category document is created
- **THEN** it contains `name` (unique), `slug` (unique), `description`, and timestamps
- **AND** both `name` and `slug` have unique indexes

#### Scenario: D2.1 categories seeded

- **WHEN** the category seed script executes
- **THEN** 10 categories from D2.1 are created:
  - Predictive Threat Intelligence
  - AI Attack-Defence Emulation
  - Automated Threat Inspection
  - Zero-Trust Distributed Computing
  - Twinning Agents
  - Dashboard & XAI
  - OSSR
  - Training
  - Orchestration
  - Message Broker

### Requirement: Service Model

The system SHALL store cybersecurity services with comprehensive D2.1 metadata.

#### Scenario: Service schema fields

- **WHEN** a service document is created
- **THEN** it contains all required fields:
  - `shortName` (unique, uppercase)
  - `title`, `provider`, `description`
  - `categoryId` (reference to Category)
  - `currentVersion`, `versions[]` (version history)
  - `type` (Software, Hardware, Software/Hardware)
  - `trl.current`, `trl.expected` (1-9)
  - `license`, `standards[]`
  - `inputs[]`, `outputs[]` (I/O specifications)
  - `interactsWith[]`, `potentialUseCases[]`
  - `repositoryTable` (INTACT_TOOLBOX or OTHER_SERVICES)
  - timestamps

#### Scenario: Version subdocument

- **WHEN** a version is added to a service
- **THEN** it contains `version`, `dockerImage`, `releaseNotes`, `releasedAt`
- **AND** versions are stored as an embedded array

#### Scenario: Indexes configured

- **WHEN** the Service model is initialized
- **THEN** indexes exist on `shortName`, `categoryId`, `repositoryTable`, `provider`

### Requirement: D2.1 Service Seed Data

The system SHALL seed all 21 services from D2.1 Tables 17-37.

#### Scenario: Services seeded

- **WHEN** the service seed script executes
- **THEN** 21 services are created including:
  - ULANCS-GAME, NETWORK-FUZZER, SPLIT, CAST
  - ORION, DATA-DIODE, MMT, ROSCO-EBPF, LLM-TM
  - FPGA-NIDS, K3CR-PROBES, DID, DIST-HSM
  - TWINNING-AGENT, PAC2200-SHADOW
  - HITL-DASHBOARD, TRUSTEE-XAI, OSSR
  - CYBERRANGE, MAESTRO, COS-BROKER
- **AND** each service has accurate provider, TRL, license, category
- **AND** each service has initial version 1.0.0

#### Scenario: Idempotent seeding

- **WHEN** the seed script runs multiple times
- **THEN** no duplicate services are created
- **AND** existing services are not modified

### Requirement: List Categories Endpoint

The system SHALL provide an endpoint to retrieve all categories.

#### Scenario: Get all categories

- **WHEN** `GET /api/categories` is called with valid authentication
- **THEN** the system returns an array of all categories
- **AND** each category includes `_id`, `name`, `slug`, `description`

### Requirement: List Services Endpoint

The system SHALL provide an endpoint to list services with filtering and pagination.

#### Scenario: Basic listing

- **WHEN** `GET /api/services` is called with valid authentication
- **THEN** the system returns services with pagination
- **AND** response includes `{ services: [...], total: number }`
- **AND** default limit is 20, maximum is 100

#### Scenario: Filter by repository table

- **WHEN** `GET /api/services?table=INTACT_TOOLBOX` is called
- **THEN** only services with `repositoryTable: INTACT_TOOLBOX` are returned

#### Scenario: Filter by category

- **WHEN** `GET /api/services?category=<categoryId>` is called
- **THEN** only services with matching `categoryId` are returned

#### Scenario: Filter by provider

- **WHEN** `GET /api/services?provider=MONT` is called
- **THEN** only services with matching `provider` are returned

#### Scenario: Search by text

- **WHEN** `GET /api/services?search=monitoring` is called
- **THEN** services matching the search term in `shortName`, `title`, or `description` are returned

#### Scenario: Pagination

- **WHEN** `GET /api/services?limit=10&skip=20` is called
- **THEN** 10 services starting from offset 20 are returned

### Requirement: Get Service Detail Endpoint

The system SHALL provide an endpoint to retrieve a single service with full details.

#### Scenario: Get service by ID

- **WHEN** `GET /api/services/:id` is called with a valid service ID
- **THEN** the system returns the complete service document
- **AND** `categoryId` is populated with category name and slug
- **AND** all version history is included

#### Scenario: Service not found

- **WHEN** `GET /api/services/:id` is called with an invalid ID
- **THEN** the system returns 404 Not Found
