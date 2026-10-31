import { Router, type Response } from 'express'
import { requireAuthContext, tenantDbFor } from '../../auth/context.js'
import { idempotent, type IdempotentResult } from '../../lib/idempotency.js'
import { parseInput } from '../../lib/errors.js'
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js'
import { idParams, invoiceBody, paymentBody, refundBody, reverseBody, setFeeBody } from './billing.schemas.js'
import {
  createInvoice,
  documentPdf,
  getDefaultFee,
  getDocument,
  getLedgerEntry,
  listLedger,
  listPatientDocuments,
  processRefund,
  recordPayment,
  reverseEntry,
  setDefaultFee,
} from './billing.service.js'

export const billingRouter = Router()

/** Sends the stored or fresh answer of an idempotent request; a replay says so in a header. */
function respond(res: Response, outcome: IdempotentResult & { replayed: boolean }) {
  if (outcome.replayed) res.setHeader('Idempotent-Replay', 'true')
  res.status(outcome.status).json(outcome.body)
}

billingRouter.get('/clinic/fee', requireAnyPermission('visit.mark', 'clinic.manage'), async (req, res) => {
  res.json(await getDefaultFee(tenantDbFor(req)))
})

billingRouter.put('/clinic/fee', requirePermission('clinic.manage'), async (req, res) => {
  const body = parseInput(setFeeBody, req.body ?? {})
  res.json(await setDefaultFee(tenantDbFor(req), requireAuthContext(req), body.defaultFee, req.ip))
})

billingRouter.post('/payments', requirePermission('payment.record'), async (req, res) => {
  const body = parseInput(paymentBody, req.body ?? {})
  const db = tenantDbFor(req)
  const auth = requireAuthContext(req)
  respond(
    res,
    await idempotent(req, async () => ({
      status: 201,
      body: await recordPayment(
        db,
        auth,
        {
          patientId: body.patientId,
          amountPaise: body.amount,
          method: body.method,
          reference: body.reference,
          date: body.date,
          branchId: body.branchId,
        },
        req.ip,
      ),
    })),
  )
})

billingRouter.post('/refunds', requirePermission('refund.process'), async (req, res) => {
  const body = parseInput(refundBody, req.body ?? {})
  const db = tenantDbFor(req)
  const auth = requireAuthContext(req)
  respond(
    res,
    await idempotent(req, async () => ({
      status: 201,
      body: await processRefund(
        db,
        auth,
        {
          patientId: body.patientId,
          amountPaise: body.amount,
          method: body.method,
          reason: body.reason,
          branchId: body.branchId,
        },
        req.ip,
      ),
    })),
  )
})

billingRouter.post('/ledger-entries/:id/reverse', requirePermission('entry.reverse'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  const body = parseInput(reverseBody, req.body ?? {})
  const db = tenantDbFor(req)
  const auth = requireAuthContext(req)
  respond(
    res,
    await idempotent(req, async () => ({ status: 201, body: await reverseEntry(db, auth, id, body.reason, req.ip) })),
  )
})

billingRouter.get('/ledger-entries/:id', requirePermission('ledger.view'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  res.json(await getLedgerEntry(tenantDbFor(req), id))
})

billingRouter.get('/patients/:id/ledger', requirePermission('ledger.view'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  res.json(await listLedger(tenantDbFor(req), requireAuthContext(req), id, req.ip))
})

billingRouter.get('/patients/:id/documents', requirePermission('document.issue'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  res.json(await listPatientDocuments(tenantDbFor(req), id))
})

billingRouter.get('/documents/:id', requirePermission('document.issue'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  res.json(await getDocument(tenantDbFor(req), id))
})

billingRouter.get('/documents/:id/pdf', requirePermission('document.issue'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  const { pdf, filename } = await documentPdf(tenantDbFor(req), requireAuthContext(req), id, req.ip)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
  // A receipt holds a patient's name and payment: it must not be kept by a shared cache or the browser's history.
  res.setHeader('Cache-Control', 'no-store')
  res.send(pdf)
})

billingRouter.post('/invoices', requirePermission('document.issue'), async (req, res) => {
  const body = parseInput(invoiceBody, req.body ?? {})
  const db = tenantDbFor(req)
  const auth = requireAuthContext(req)
  respond(res, await idempotent(req, async () => ({ status: 201, body: await createInvoice(db, auth, body, req.ip) })))
})
