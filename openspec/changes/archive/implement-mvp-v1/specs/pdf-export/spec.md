# pdf-export Specification Delta

## ADDED Requirements

### Requirement: PDF Export Endpoint

The system SHALL provide an endpoint to generate PDF reports.

#### Scenario: Export PDF

- **WHEN** `GET /api/scenarios/:id/executions/:executionId/export/pdf` is called
- **THEN** the system generates a PDF document
- **AND** returns the PDF with `Content-Type: application/pdf`
- **AND** `Content-Disposition` header sets filename

#### Scenario: Execution not found

- **WHEN** executionId does not exist
- **THEN** the system returns 404 Not Found

#### Scenario: No conclusion

- **WHEN** execution has no conclusion
- **THEN** PDF is generated with "No conclusion provided" placeholder

### Requirement: PDF Content Structure

The generated PDF SHALL contain structured scenario information.

#### Scenario: PDF header

- **WHEN** PDF is generated
- **THEN** header includes:
  - "INTACT Scenario Report" title
  - Project name and scenario title
  - Execution date and user
  - Generation timestamp

#### Scenario: Topology section

- **WHEN** PDF is generated
- **THEN** topology section includes:
  - List of services with shortName, title, version
  - Connections between services with labels
  - Infrastructure name and endpoint

#### Scenario: Deployed services section

- **WHEN** execution has deployed services
- **THEN** section lists each service with:
  - Service name and version
  - Status at time of export
  - Dashboard URL (if available)

#### Scenario: Conclusion section

- **WHEN** execution has a conclusion
- **THEN** section includes:
  - Conclusion text (formatted)
  - Author name
  - Conclusion date

### Requirement: PDF Service Module

The backend SHALL use PDFKit for PDF generation.

#### Scenario: PDFKit initialization

- **WHEN** PDF generation is requested
- **THEN** PDFKit document is created with:
  - A4 page size
  - Professional margins (72pt)
  - Font configuration

#### Scenario: PDF styling

- **WHEN** PDF content is rendered
- **THEN** consistent styling is applied:
  - Title: 24pt bold
  - Section headers: 16pt bold
  - Body text: 12pt regular
  - Metadata: 10pt muted color

#### Scenario: PDF streaming

- **WHEN** PDF is generated
- **THEN** document is streamed to response
- **AND** memory usage is minimized for large documents

### Requirement: PDF Export Button

The frontend SHALL provide a button to download PDF reports.

#### Scenario: Export button

- **WHEN** viewing an execution with conclusion
- **THEN** "Export PDF" button is visible
- **AND** clicking triggers PDF download

#### Scenario: Download handling

- **WHEN** user clicks "Export PDF"
- **THEN** loading indicator is shown
- **AND** browser download dialog appears with filename
- **AND** filename format is `{scenario-title}-{date}.pdf`

#### Scenario: Export without conclusion

- **WHEN** execution has no conclusion
- **THEN** button is still available
- **AND** tooltip says "Conclusion not added yet"
- **AND** PDF generates with placeholder text
