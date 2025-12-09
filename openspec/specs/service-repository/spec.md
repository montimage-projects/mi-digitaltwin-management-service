# service-repository Specification

## Purpose

TBD - created by archiving change implement-sprint0-poc. Update Purpose after archive.

## Requirements

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
  - `categoryId` (reference to Category, required for INTACT_TOOLBOX)
  - `sectorId` (reference to Sector, optional for OTHER_SERVICES)
  - `currentVersion`, `versions[]` (version history)
  - `type` (Software, Hardware, Software/Hardware)
  - `uiType` (web, terminal, both) - defaults to 'web'
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
- **THEN** indexes exist on `shortName`, `categoryId`, `sectorId`, `repositoryTable`, `provider`

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

#### Scenario: Filter by sector

- **WHEN** `GET /api/services?sector=<sectorId>` is called
- **THEN** only services with matching `sectorId` are returned

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

### Requirement: Sector Model

The system SHALL store NIS2 critical infrastructure sectors with unique identifiers.

#### Scenario: Sector schema fields

- **WHEN** a sector document is created
- **THEN** it contains `name` (unique), `slug` (unique), `category` ('essential' | 'important'), `description`, and timestamps
- **AND** both `name` and `slug` have unique indexes

#### Scenario: NIS2 sectors seeded

- **WHEN** the sector seed script executes
- **THEN** 18 NIS2-aligned sectors are created:
  - Energy (essential)
  - Transport (essential)
  - Banking (essential)
  - Financial market infrastructures (essential)
  - Health (essential)
  - Drinking water (essential)
  - Wastewater (essential)
  - Digital infrastructure (essential)
  - ICT service management B2B (essential)
  - Public administration (essential)
  - Space (essential)
  - Postal and courier services (important)
  - Waste management (important)
  - Manufacture, production and distribution of chemicals (important)
  - Production, processing and distribution of food (important)
  - Manufacturing (important)
  - Digital providers (important)
  - Research (important)

### Requirement: Service UI Type

The system SHALL store the UI type for each service to determine simulation display.

#### Scenario: UI type field

- **WHEN** a service document is created or updated
- **THEN** it MAY contain `uiType` with value `'web'`, `'terminal'`, or `'both'`
- **AND** `uiType` defaults to `'web'` if not specified

#### Scenario: UI type in service response

- **WHEN** `GET /api/services/:id` is called
- **THEN** the response includes `uiType` field

### Requirement: Service Sector Assignment

The system SHALL allow Critical Infrastructure Services to be assigned to NIS2 sectors.

#### Scenario: Sector field for OTHER_SERVICES

- **WHEN** a service with `repositoryTable: OTHER_SERVICES` is created
- **THEN** it MAY contain `sectorId` (reference to Sector)
- **AND** `sectorId` replaces `categoryId` for filtering Critical Infrastructure Services

#### Scenario: Filter services by sector

- **WHEN** `GET /api/services?sector=<sectorId>&table=OTHER_SERVICES` is called
- **THEN** only services with matching `sectorId` are returned

### Requirement: List Sectors Endpoint

The system SHALL provide an endpoint to retrieve all NIS2 sectors.

#### Scenario: Get all sectors

- **WHEN** `GET /api/sectors` is called with valid authentication
- **THEN** the system returns an array of all sectors
- **AND** each sector includes `_id`, `name`, `slug`, `category`, `description`

#### Scenario: Sectors sorted by category then name

- **WHEN** `GET /api/sectors` is called
- **THEN** sectors are returned sorted by `category` (essential first) then by `name`

### Requirement: Service Version Selection

The system SHALL support selecting specific service versions in topology configurations.

#### Scenario: Version field in topology YAML

- **WHEN** a topology YAML includes a service with `version` field
- **THEN** the system uses the specified version instead of `currentVersion`
- **AND** the version MUST exist in the service's `versions[]` array

#### Scenario: Default to current version

- **WHEN** a topology YAML includes a service without `version` field
- **THEN** the system uses the service's `currentVersion`

#### Scenario: Version validation on topology save

- **WHEN** a topology is saved with a service specifying a non-existent version
- **THEN** the system returns a validation warning (not error)
- **AND** the topology is still saved
