// netlify/functions/trigger-alarm.js
// Endpoint chiamato manualmente dal frontend per testare/forzare una sveglia
// POST { alarmId: '...' }

const twilio = require('twilio');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const fromNumber   = process.env.TWILIO_FROM_NUMBER;

async function sbFetch(path, method = 'GET', body) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  try {
    const { alarmId, action } = JSON.parse(event.body || '{}');
    if (!alarmId) return { statusCode: 400, body: 'alarmId required' };

    const [alarm] = await sbFetch(`alarms?select=*,drivers(name,phone)&id=eq.${alarmId}`);
    if (!alarm) return { statusCode: 404, body: 'Alarm not found' };

    const driver = alarm.drivers;
    const settings = await sbFetch('settings?select=key,value');
    const s = Object.fromEntries(settings.map(r => [r.key, r.value]));

    if (action === 'dismiss') {
      await sbFetch(`alarms?id=eq.${alarmId}`, 'PATCH', { state: 'done' });
      return { statusCode: 200, body: JSON.stringify({ ok: true, action: 'dismissed' }) };
    }

    // Test call
    await twilioClient.calls.create({
      twiml: `<Response><Say language="it-IT" voice="Polly.Bianca">Test sveglia Erika Bus per ${driver.name}. Funziona correttamente.</Say></Response>`,
      to: driver.phone,
      from: fromNumber
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true, called: driver.phone }) };
  } catch(err) {
    return { statusCode: 500, body: err.message };
  }
};
