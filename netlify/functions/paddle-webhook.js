// ══════════════════════════════════════════════════════
//  FinanceOS — Paddle Webhook Handler
//  Netlify Function: netlify/functions/paddle-webhook.js
//
//  Τι κάνει:
//  1. Λαμβάνει webhook από Paddle όταν γίνει αγορά
//  2. Στέλνει email ειδοποίηση σε σένα μέσω EmailJS ή SMTP
//  3. Καταγράφει την αγορά στον Supabase
//
//  SETUP:
//  - Στο Netlify dashboard → Site settings → Environment variables
//    βάλε τις παρακάτω μεταβλητές
// ══════════════════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // service role key (not anon)
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;         // το email σου π.χ. info@mycashierarakron.gr
const SENDGRID_KEY = process.env.SENDGRID_API_KEY;     // δωρεάν στο sendgrid.com (100 emails/day)

exports.handler = async (event) => {
  // Only accept POST from Paddle
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Paddle v2 webhook event types
  const eventType = payload.event_type;

  // Only process completed transactions
  if (eventType !== 'transaction.completed') {
    return { statusCode: 200, body: 'Event ignored: ' + eventType };
  }

  const txn = payload.data;
  const customer = txn.customer || {};
  const items = txn.items || [];
  const amount = txn.details?.totals?.total || 0;
  const currency = txn.currency_code || 'EUR';
  const customerEmail = customer.email || 'unknown';
  const customerName = customer.name || 'Customer';
  const txnId = txn.id || 'unknown';
  const createdAt = txn.created_at || new Date().toISOString();

  console.log(`New purchase: ${customerName} <${customerEmail}> — ${amount} ${currency}`);

  // ── 1. Log to Supabase ──
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
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
          customer_email: customerEmail,
          customer_name: customerName,
          amount: amount / 100, // Paddle sends in cents
          currency,
          status: 'paid',
          license_sent: false,
          created_at: createdAt
        })
      });
      console.log('Logged to Supabase');
    } catch (err) {
      console.error('Supabase error:', err.message);
    }
  }

  // ── 2. Send email notification to you ──
  if (SENDGRID_KEY && NOTIFY_EMAIL) {
    try {
      const emailBody = {
        personalizations: [{
          to: [{ email: NOTIFY_EMAIL }],
          subject: `🎉 New FinanceOS Purchase — ${customerName}`
        }],
        from: { email: NOTIFY_EMAIL, name: 'FinanceOS Sales' },
        content: [{
          type: 'text/html',
          value: `
            <div style="font-family:Arial,sans-serif;max-width:500px;padding:24px">
              <h2 style="color:#00d4aa">🎉 New Purchase!</h2>
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px 0;color:#666;width:140px">Customer</td><td style="font-weight:600">${customerName}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Email</td><td><a href="mailto:${customerEmail}">${customerEmail}</a></td></tr>
                <tr><td style="padding:8px 0;color:#666">Amount</td><td style="font-weight:700;color:#00d4aa">${(amount/100).toFixed(2)} ${currency}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Transaction</td><td style="font-family:monospace;font-size:12px">${txnId}</td></tr>
                <tr><td style="padding:8px 0;color:#666">Date</td><td>${new Date(createdAt).toLocaleString('el-GR')}</td></tr>
              </table>
              <div style="margin-top:24px;padding:16px;background:#f0fdf4;border-radius:8px;border-left:4px solid #00d4aa">
                <strong>Action needed:</strong> Generate license key and send to <a href="mailto:${customerEmail}">${customerEmail}</a>
              </div>
              <p style="margin-top:16px;font-size:13px;color:#999">Open your <a href="https://www.mycashierarakron.gr/keygenerator/">Key Generator</a> to create the key.</p>
            </div>
          `
        }]
      };

      await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SENDGRID_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailBody)
      });
      console.log('Email notification sent');
    } catch (err) {
      console.error('SendGrid error:', err.message);
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true, transaction: txnId })
  };
};
