// ══════════════════════════════════════════════════════
//  FinanceOS — Paddle Webhook Handler
//  netlify/functions/paddle-webhook.js
// ══════════════════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL = 'arakrons@gmail.com';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, body: 'Invalid JSON' }; }

  if (payload.event_type !== 'transaction.completed') {
    return { statusCode: 200, body: 'Ignored: ' + payload.event_type };
  }

  const txn      = payload.data;
  const customer = txn.customer || {};
  const amount   = (txn.details?.totals?.total || 0) / 100;
  const currency = txn.currency_code || 'EUR';
  const email    = customer.email || 'unknown';
  const name     = customer.name  || 'Customer';
  const txnId    = txn.id || 'unknown';
  const date     = new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens' });

  // 1. Save to Supabase
  if (SUPABASE_URL && SUPABASE_KEY) {
    await fetch(`${SUPABASE_URL}/rest/v1/purchases`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        transaction_id: txnId,
        customer_email: email,
        customer_name: name,
        amount, currency,
        status: 'paid',
        license_sent: false
      })
    }).catch(e => console.error('Supabase:', e.message));
  }

  // 2. Email via Resend
  if (RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'FinanceOS <onboarding@resend.dev>',
        to: [NOTIFY_EMAIL],
        subject: `🎉 Νέα Αγορά FinanceOS — ${name}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <div style="background:#0a0b0f;padding:20px 24px;border-radius:12px;margin-bottom:20px">
            <h2 style="color:#00d4aa;margin:0">🎉 Νέα Αγορά!</h2>
            <p style="color:#8892b0;margin:6px 0 0;font-size:14px">FinanceOS License</p>
          </div>
          <div style="background:#fff;padding:20px 24px;border-radius:12px;border:1px solid #e5e7eb">
            <table style="width:100%;border-collapse:collapse;font-size:15px">
              <tr><td style="padding:10px 0;color:#666;width:130px;border-bottom:1px solid #f0f0f0">Πελάτης</td><td style="font-weight:700;border-bottom:1px solid #f0f0f0">${name}</td></tr>
              <tr><td style="padding:10px 0;color:#666;border-bottom:1px solid #f0f0f0">Email</td><td style="border-bottom:1px solid #f0f0f0"><a href="mailto:${email}" style="color:#00d4aa">${email}</a></td></tr>
              <tr><td style="padding:10px 0;color:#666;border-bottom:1px solid #f0f0f0">Ποσό</td><td style="font-weight:800;color:#00d4aa;font-size:18px;border-bottom:1px solid #f0f0f0">${amount.toFixed(2)} ${currency}</td></tr>
              <tr><td style="padding:10px 0;color:#666;border-bottom:1px solid #f0f0f0">Ημερομηνία</td><td style="border-bottom:1px solid #f0f0f0">${date}</td></tr>
              <tr><td style="padding:10px 0;color:#666">Transaction ID</td><td style="font-family:monospace;font-size:12px;color:#999">${txnId}</td></tr>
            </table>
            <div style="margin-top:20px;padding:16px;background:#f0fdf4;border-radius:8px;border-left:4px solid #00d4aa">
              <strong style="color:#065f46">⚡ Επόμενο βήμα:</strong>
              <p style="margin:6px 0 0;color:#065f46;font-size:14px">Στείλε license key στο <strong>${email}</strong> μέσα σε 2 ώρες.</p>
            </div>
            <div style="margin-top:16px;text-align:center">
              <a href="https://getfinanceos.netlify.app/keygenerator/"
                 style="display:inline-block;padding:12px 24px;background:#00d4aa;color:#000;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">
                🔑 Άνοιξε το Key Generator
              </a>
            </div>
          </div>
          <p style="text-align:center;color:#999;font-size:12px;margin-top:16px">FinanceOS · arakrons@gmail.com</p>
        </div>`
      })
    }).catch(e => console.error('Resend:', e.message));
  }

  return { statusCode: 200, body: JSON.stringify({ received: true, transaction: txnId }) };
};
