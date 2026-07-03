import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Scenario, Execution } from './api';
import { APP_NAME, ORG_NAME } from './branding';

interface ScenarioReportData {
  scenario: Scenario;
  project?: {
    shortName: string;
    title: string;
    sector: string;
    leader: string;
    involvedPartners: string[];
  };
}

export function exportScenarioToPdf(data: ScenarioReportData) {
  const { scenario, project } = data;
  const doc = new jsPDF();

  // Title
  doc.setFontSize(20);
  doc.setTextColor(33, 37, 41);
  doc.text(`${ORG_NAME} Scenario Report`, 14, 22);

  // Subtitle
  doc.setFontSize(12);
  doc.setTextColor(108, 117, 125);
  doc.text(`Generated on ${new Date().toLocaleString()}`, 14, 30);

  // Horizontal line
  doc.setDrawColor(200, 200, 200);
  doc.line(14, 35, 196, 35);

  let yPos = 45;

  // Scenario Info
  doc.setFontSize(14);
  doc.setTextColor(33, 37, 41);
  doc.text('Scenario Information', 14, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setTextColor(73, 80, 87);

  const scenarioInfo = [
    ['Title', scenario.title],
    ['Description', scenario.description || 'N/A'],
    ['Created', new Date(scenario.createdAt).toLocaleDateString()],
    ['Last Updated', new Date(scenario.updatedAt).toLocaleDateString()],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: scenarioInfo,
    theme: 'plain',
    styles: { fontSize: 10 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40 },
      1: { cellWidth: 140 },
    },
    margin: { left: 14 },
  });

  yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Project Info
  if (project) {
    doc.setFontSize(14);
    doc.setTextColor(33, 37, 41);
    doc.text('Project Information', 14, yPos);
    yPos += 8;

    const projectInfo = [
      ['Short Name', project.shortName],
      ['Title', project.title],
      ['Sector', project.sector],
      ['Leader', project.leader],
      ['Partners', project.involvedPartners.join(', ') || 'N/A'],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [],
      body: projectInfo,
      theme: 'plain',
      styles: { fontSize: 10 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 40 },
        1: { cellWidth: 140 },
      },
      margin: { left: 14 },
    });

    yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // Infrastructure
  if (scenario.infrastructureId && typeof scenario.infrastructureId === 'object') {
    const infra = scenario.infrastructureId;
    doc.setFontSize(14);
    doc.setTextColor(33, 37, 41);
    doc.text('Target Infrastructure', 14, yPos);
    yPos += 8;

    const infraInfo = [
      ['Name', infra.name],
      ['Type', infra.type],
      ['Status', infra.status],
      ['Endpoint', infra.endpoint || 'N/A'],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [],
      body: infraInfo,
      theme: 'plain',
      styles: { fontSize: 10 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 40 },
        1: { cellWidth: 140 },
      },
      margin: { left: 14 },
    });

    yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // Topology YAML (if exists and not too long)
  if (scenario.topology?.yaml && scenario.topology.yaml.trim()) {
    doc.addPage();
    yPos = 20;

    doc.setFontSize(14);
    doc.setTextColor(33, 37, 41);
    doc.text('Topology Definition (YAML)', 14, yPos);
    yPos += 8;

    doc.setFontSize(8);
    doc.setTextColor(73, 80, 87);

    const yamlLines = scenario.topology.yaml.split('\n').slice(0, 50); // Limit to 50 lines
    yamlLines.forEach((line) => {
      if (yPos > 280) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(line.substring(0, 100), 14, yPos); // Limit line length
      yPos += 4;
    });

    if (scenario.topology.yaml.split('\n').length > 50) {
      yPos += 4;
      doc.setFontSize(9);
      doc.setTextColor(108, 117, 125);
      doc.text('... (truncated for brevity)', 14, yPos);
    }
  }

  // Executions
  if (scenario.executions.length > 0) {
    doc.addPage();
    yPos = 20;

    doc.setFontSize(14);
    doc.setTextColor(33, 37, 41);
    doc.text('Execution History', 14, yPos);
    yPos += 8;

    const executionData = scenario.executions.map((exec: Execution) => [
      new Date(exec.executedAt).toLocaleString(),
      exec.executedBy,
      exec.status,
      exec.conclusion?.text?.substring(0, 50) || 'No conclusion',
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Executed By', 'Status', 'Conclusion']],
      body: executionData,
      theme: 'striped',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [66, 139, 202] },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;

    // Full conclusions
    const executionsWithConclusions = scenario.executions.filter((e: Execution) => e.conclusion);
    if (executionsWithConclusions.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(33, 37, 41);
      doc.text('Conclusions', 14, yPos);
      yPos += 8;

      executionsWithConclusions.forEach((exec: Execution) => {
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(10);
        doc.setTextColor(33, 37, 41);
        doc.text(
          `Execution on ${new Date(exec.executedAt).toLocaleString()} by ${exec.conclusion?.author}:`,
          14,
          yPos
        );
        yPos += 6;

        doc.setFontSize(9);
        doc.setTextColor(73, 80, 87);

        const conclusionLines = doc.splitTextToSize(exec.conclusion?.text || '', 180);
        conclusionLines.forEach((line: string) => {
          if (yPos > 280) {
            doc.addPage();
            yPos = 20;
          }
          doc.text(line, 14, yPos);
          yPos += 4;
        });

        yPos += 8;
      });
    }
  }

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`${APP_NAME} - Page ${i} of ${pageCount}`, 14, 290);
  }

  // Download
  const fileName = `scenario-report-${scenario.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.pdf`;
  doc.save(fileName);
}
