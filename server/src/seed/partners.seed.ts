import { Partner } from '../models/Partner.js';
import { upsertRecord, deprecateStale } from './sync-helpers.js';

interface PartnerSeed {
  shortName: string;
  legalName: string;
  role: 'COO' | 'BEN';
  country: string;
  pic: string;
  maxGrantAmountEur: number;
}

/**
 * SECASSURED consortium partners.
 *
 * Transcribed from the "1. Partners" table of the Grant Agreement
 * GAP-101225858 (Ref. Ares(2025)4923245 - 20/06/2025), Preamble (pages 1-2)
 * and Data Sheet (pages 9-10). All 19 beneficiaries (1 coordinator + 18
 * beneficiaries) are listed below. Resolves issue #8.
 *
 * Note: the "3. Infrastructure" section of the same source document was
 * already seeded as `Service` records (`repositoryTable: 'OTHER_SERVICES'`)
 * by the catalog refresh in `services.seed.ts` (issue #7) — this seed only
 * covers the Partners table.
 */
const partnersData: PartnerSeed[] = [
  {
    shortName: 'SINTEF',
    legalName: 'SINTEF AS',
    role: 'COO',
    country: 'Norway',
    pic: '910945140',
    maxGrantAmountEur: 1076625.0,
  },
  {
    shortName: 'AALTO',
    legalName: 'AALTO KORKEAKOULUSAATIO SR',
    role: 'BEN',
    country: 'Finland',
    pic: '991256096',
    maxGrantAmountEur: 359537.5,
  },
  {
    shortName: 'Fraunhofer',
    legalName: 'FRAUNHOFER GESELLSCHAFT ZUR FÖRDERUNG DER ANGEWANDTEN FORSCHUNG EV',
    role: 'BEN',
    country: 'Germany',
    pic: '999984059',
    maxGrantAmountEur: 704900.0,
  },
  {
    shortName: 'CERTH',
    legalName: 'ETHNIKO KENTRO EREVNAS KAI TECHNOLOGIKIS ANAPTYXIS',
    role: 'BEN',
    country: 'Greece',
    pic: '998802502',
    maxGrantAmountEur: 324790.0,
  },
  {
    shortName: 'MI',
    legalName: 'MONTIMAGE EURL',
    role: 'BEN',
    country: 'France',
    pic: '999716242',
    maxGrantAmountEur: 396002.42,
  },
  {
    shortName: 'TECNALIA',
    legalName: 'FUNDACION TECNALIA RESEARCH & INNOVATION',
    role: 'BEN',
    country: 'Spain',
    pic: '999604110',
    maxGrantAmountEur: 658175.0,
  },
  {
    shortName: 'ORO',
    legalName: 'ORANGE ROMANIA SA',
    role: 'BEN',
    country: 'Romania',
    pic: '954892445',
    maxGrantAmountEur: 252000.0,
  },
  {
    shortName: 'SPS',
    legalName: 'SAFEPAY SYSTEMS SZOLGALTATO ES KERESKEDELMI KFT',
    role: 'BEN',
    country: 'Hungary',
    pic: '996480516',
    maxGrantAmountEur: 172243.75,
  },
  {
    shortName: 'NTNU',
    legalName: 'NORGES TEKNISK-NATURVITENSKAPELIGE UNIVERSITET NTNU',
    role: 'BEN',
    country: 'Norway',
    pic: '999977851',
    maxGrantAmountEur: 339562.5,
  },
  {
    shortName: 'PPC',
    legalName: 'DIMOSIA EPICHEIRISI ILEKTRISMOU ANONYMI ETAIREIA',
    role: 'BEN',
    country: 'Greece',
    pic: '999938954',
    maxGrantAmountEur: 275625.0,
  },
  {
    shortName: 'IDEKO',
    legalName: 'IDEKO S COOP',
    role: 'BEN',
    country: 'Spain',
    pic: '999546007',
    maxGrantAmountEur: 203125.0,
  },
  {
    shortName: 'ITP AERO',
    legalName: 'INDUSTRIA DE TURBO PROPULSORES S.A.U.',
    role: 'BEN',
    country: 'Spain',
    pic: '999791708',
    maxGrantAmountEur: 203437.5,
  },
  {
    shortName: 'SAVVY',
    legalName: 'SAVVY DATA SYSTEMS SL',
    role: 'BEN',
    country: 'Spain',
    pic: '920175369',
    maxGrantAmountEur: 127750.0,
  },
  {
    shortName: 'UIH',
    legalName: 'THE URBAN INSTITUTE MAGYARORSZAG ZARTKORUEN MUKODO RT',
    role: 'BEN',
    country: 'Hungary',
    pic: '892390495',
    maxGrantAmountEur: 168350.0,
  },
  {
    shortName: 'K3Y',
    legalName: 'K3Y',
    role: 'BEN',
    country: 'Bulgaria',
    pic: '905140563',
    maxGrantAmountEur: 66500.0,
  },
  {
    shortName: 'AROBS',
    legalName: 'AROBS Transilvania Software S.A.',
    role: 'BEN',
    country: 'Romania',
    pic: '875872462',
    maxGrantAmountEur: 74812.5,
  },
  {
    shortName: 'OnBT',
    legalName: 'ONBT BILISIM TEKNOLOJILERI ANONIM SIRKETI',
    role: 'BEN',
    country: 'Türkiye',
    pic: '876035713',
    maxGrantAmountEur: 58187.5,
  },
  {
    shortName: 'TELLU AS',
    legalName: 'TELLU AS',
    role: 'BEN',
    country: 'Norway',
    pic: '912359303',
    maxGrantAmountEur: 361375.0,
  },
  {
    shortName: 'AST',
    legalName: 'ASSIST SOFTWARE SRL',
    role: 'BEN',
    country: 'Romania',
    pic: '984731973',
    maxGrantAmountEur: 160956.25,
  },
];

const activePartnerShortNames = partnersData.map((p) => p.shortName);

export const seedPartners = async (): Promise<void> => {
  console.info('Seeding partners...');

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const partnerData of partnersData) {
    const desiredFields: Record<string, unknown> = { ...partnerData };
    const action = await upsertRecord(Partner, { shortName: partnerData.shortName }, desiredFields);

    if (action === 'created') {
      created++;
      console.info(`  Created partner: ${partnerData.shortName}`);
    } else if (action === 'updated') {
      updated++;
      console.info(`  Updated partner: ${partnerData.shortName}`);
    } else {
      unchanged++;
      console.info(`  Partner up to date: ${partnerData.shortName}`);
    }
  }

  const deprecatedCount = await deprecateStale(Partner, {}, 'shortName', activePartnerShortNames);
  if (deprecatedCount > 0) {
    console.info(`  Deprecated ${deprecatedCount} partners no longer in the source list`);
  }

  console.info(
    `Partners seeded successfully (${created} created, ${updated} updated, ${unchanged} unchanged, ${deprecatedCount} deprecated)`
  );
};

export { partnersData };
export type { PartnerSeed };
