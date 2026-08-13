import PDFDocument from 'pdfkit';
import path from 'path';

export interface DiplomaInput {
  recipientName: string;
  birthYear: number;
  educationUntilAge: number;
  city: string;
  mentors: string;
  directorName: string;
  issueDate: string;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

const backgroundPath = path.join(
  process.cwd(),
  'public',
  'images',
  'diplomas',
  'certificate-background.png',
);
const logoPath = path.join(
  process.cwd(),
  'public',
  'images',
  'diplomas',
  'fortuna-logo-transparent.png',
);
const fontDirectory = path.join(
  process.cwd(),
  'node_modules',
  'dejavu-fonts-ttf',
  'ttf',
);

function fontPath(weight: 400 | 700, style: 'normal' | 'italic' = 'normal'): string {
  if (weight === 700 && style === 'italic') {
    return path.join(fontDirectory, 'DejaVuSerif-BoldItalic.ttf');
  }
  if (weight === 700) {
    return path.join(fontDirectory, 'DejaVuSerif-Bold.ttf');
  }
  if (style === 'italic') {
    return path.join(fontDirectory, 'DejaVuSerif-Italic.ttf');
  }
  return path.join(fontDirectory, 'DejaVuSerif.ttf');
}

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function drawCenteredText(
  doc: PDFKit.PDFDocument,
  text: string,
  y: number,
  options: PDFKit.Mixins.TextOptions = {},
): void {
  const width = typeof options.width === 'number' ? options.width : PAGE_WIDTH - 210;
  doc.text(text, (PAGE_WIDTH - width) / 2, y, {
    width,
    align: 'center',
    ...options,
  });
}

export function createDiplomaPdf(input: DiplomaInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      compress: true,
      info: {
        Title: `Свидетельство — ${input.recipientName}`,
        Author: 'ФК «Фортуна» Минск',
        Subject: 'Свидетельство о базовом футбольном образовании',
      },
    });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc.registerFont('DiplomaRegular', fontPath(400));
    doc.registerFont('DiplomaBold', fontPath(700));
    doc.registerFont('DiplomaItalic', fontPath(400, 'italic'));

    const backgroundWidth = PAGE_HEIGHT * (2 / 3);
    doc.image(backgroundPath, (PAGE_WIDTH - backgroundWidth) / 2, 0, {
      height: PAGE_HEIGHT,
    });

    doc.image(logoPath, (PAGE_WIDTH - 124) / 2, 270, {
      width: 124,
    });

    doc.fillColor('#24247d').font('DiplomaRegular').fontSize(31);
    drawCenteredText(doc, 'СВИДЕТЕЛЬСТВО', 418, {
      width: 470,
      characterSpacing: 0.35,
      lineBreak: false,
    });

    const recipientLine = `Выдано ${input.recipientName.toUpperCase()},`;
    doc.fillColor('#27245f').font('DiplomaBold');
    let recipientFontSize = 13.5;
    while (recipientFontSize > 10.5) {
      doc.fontSize(recipientFontSize);
      if (doc.widthOfString(recipientLine) <= 350) break;
      recipientFontSize -= 0.5;
    }
    drawCenteredText(doc, recipientLine, 514, {
      width: 350,
      lineBreak: false,
    });

    const mentorParts = input.mentors.split(/\s+и\s+/);
    const mentorLines =
      mentorParts.length > 1
        ? [
            `у наставников ${mentorParts[0]} и`,
            mentorParts.slice(1).join(' и '),
          ]
        : [`у наставников ${input.mentors}`];
    const bodyLines = [
      `${input.birthYear} г.р., в том, что базовое футбольное`,
      `образование (до ${input.educationUntilAge} лет) он получил`,
      `в футбольном клубе «ФОРТУНА» (${input.city})`,
      ...mentorLines,
    ];

    doc.font('DiplomaRegular').fontSize(12.2);
    bodyLines.forEach((line, index) => {
      drawCenteredText(doc, line, 535 + index * 18, {
        width: 390,
        lineBreak: false,
      });
    });

    doc.font('DiplomaItalic').fontSize(9.2);
    drawCenteredText(doc, 'Директор ФК «ФОРТУНА» (Минск)', 647, {
      width: 390,
      lineBreak: false,
    });
    drawCenteredText(doc, `____________   ${input.directorName}`, 667, {
      width: 390,
      lineBreak: false,
    });

    doc.fillColor('#a9232c').font('DiplomaBold').fontSize(8.7);
    drawCenteredText(doc, formatDate(input.issueDate), 697, {
      width: 180,
      lineBreak: false,
    });

    doc.end();
  });
}
