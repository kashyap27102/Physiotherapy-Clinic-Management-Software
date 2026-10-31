import PDFDocument from 'pdfkit'

/** Everything a printed receipt or invoice shows, already gathered and formatted by the service (BILL-006, BILL-007). */
export interface DocumentPdfData {
  docType: 'RECEIPT' | 'REVERSAL_RECEIPT' | 'INVOICE'
  docNumber: string
  /** "12 Nov 2026", India date. */
  issuedOn: string
  /** A reprint is marked so it cannot pass for the original (API-Requirements 5.6). */
  duplicate: boolean
  clinic: {
    name: string
    address: string | null
    phone: string | null
    registrationDetails: string | null
    logo: Buffer | null
  }
  branch: { name: string; address: string | null; phone: string | null }
  patient: { name: string; phone: string }
  /** Receipt and reversal receipt. */
  payment?: {
    amount: string
    methodLabel: string
    reference: string | null
    reason: string | null
    reversesNumber: string | null
  }
  /** Invoice. */
  invoice?: {
    periodLabel: string
    lines: { date: string; description: string; amount: string }[]
    total: string
    balanceLabel: string
  }
}

const TITLES = { RECEIPT: 'RECEIPT', REVERSAL_RECEIPT: 'REVERSAL RECEIPT', INVOICE: 'INVOICE' } as const

/** The default PDF fonts have no rupee sign, so amounts are written "Rs. 500.00". */
export const rupees = (amount: string) => `Rs. ${amount}`

/** Renders one A5 page for a receipt, or A4 pages for an invoice. Generated on request, never stored (API-Requirements 11). */
export function renderDocumentPdf(data: DocumentPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: data.invoice ? 'A4' : 'A5',
      margin: 40,
      info: { Title: `${TITLES[data.docType]} ${data.docNumber}` },
    })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const left = doc.page.margins.left
    const width = doc.page.width - left - doc.page.margins.right

    // Clinic header
    let textX = left
    if (data.clinic.logo) {
      try {
        doc.image(data.clinic.logo, left, 40, { fit: [56, 56] })
        textX = left + 66
      } catch {
        // An image PDFKit cannot read (for example WebP) is left out rather than failing the receipt.
      }
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(data.clinic.name, textX, 40, { width: width - (textX - left) })
    doc.font('Helvetica').fontSize(9).fillColor('#444')
    const clinicLines = [
      data.branch.name !== data.clinic.name ? data.branch.name : null,
      data.branch.address ?? data.clinic.address,
      data.branch.phone ?? data.clinic.phone,
      data.clinic.registrationDetails,
    ]
    for (const line of clinicLines) if (line) doc.text(line, textX, undefined, { width: width - (textX - left) })
    doc.fillColor('#000')

    doc.moveDown(1.2)
    const ruleY = Math.max(doc.y, 100)
    doc
      .moveTo(left, ruleY)
      .lineTo(left + width, ruleY)
      .strokeColor('#bbb')
      .stroke()

    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(TITLES[data.docType], left, ruleY + 10, { width })
    if (data.duplicate) {
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#b00020')
        .text('DUPLICATE COPY', left, ruleY + 12, { width, align: 'right' })
        .fillColor('#000')
    }

    doc.font('Helvetica').fontSize(10)
    const row = (label: string, value: string) => {
      const y = doc.y + 4
      doc.font('Helvetica').fillColor('#555').text(label, left, y, { width: 110, continued: false })
      doc
        .font('Helvetica-Bold')
        .fillColor('#000')
        .text(value, left + 115, y, { width: width - 115 })
    }
    doc.y = ruleY + 34
    row('Number', data.docNumber)
    row('Date', data.issuedOn)
    row('Patient', `${data.patient.name} (${data.patient.phone})`)

    if (data.payment) {
      const p = data.payment
      row(data.docType === 'REVERSAL_RECEIPT' ? 'Amount reversed' : 'Amount received', rupees(p.amount))
      row('Method', p.methodLabel)
      if (p.reference) row('Reference', p.reference)
      if (p.reversesNumber) row('Reverses receipt', p.reversesNumber)
      if (p.reason) row('Reason', p.reason)
    }

    if (data.invoice) {
      const inv = data.invoice
      row('Period', inv.periodLabel)
      doc.moveDown(1)
      const startY = doc.y
      doc.font('Helvetica-Bold').fontSize(10)
      doc.text('Date', left, startY, { width: 90 })
      doc.text('Description', left + 95, startY, { width: width - 95 - 90 })
      doc.text('Amount', left + width - 85, startY, { width: 85, align: 'right' })
      doc
        .moveTo(left, doc.y + 2)
        .lineTo(left + width, doc.y + 2)
        .strokeColor('#bbb')
        .stroke()
      doc.font('Helvetica').moveDown(0.4)
      for (const line of inv.lines) {
        if (doc.y > doc.page.height - 120) doc.addPage()
        const y = doc.y + 3
        doc.text(line.date, left, y, { width: 90 })
        doc.text(line.description, left + 95, y, { width: width - 95 - 90 })
        doc.text(rupees(line.amount), left + width - 85, y, { width: 85, align: 'right' })
      }
      doc.moveDown(0.8)
      doc
        .moveTo(left, doc.y)
        .lineTo(left + width, doc.y)
        .strokeColor('#bbb')
        .stroke()
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(`Total  ${rupees(inv.total)}`, left, doc.y + 6, { width, align: 'right' })
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#555')
        .text(inv.balanceLabel, left, doc.y + 4, { width, align: 'right' })
        .fillColor('#000')
    }

    doc.font('Helvetica').fontSize(8).fillColor('#777')
    doc.text('This is a computer generated document.', left, doc.page.height - 60, { width, align: 'center' })
    doc.end()
  })
}
