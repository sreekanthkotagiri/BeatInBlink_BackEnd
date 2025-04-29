import dns from 'dns';
import util from 'util';
import type { IncomingMessage, ServerResponse } from 'http';

const lookup = util.promisify(dns.lookup);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const result = await lookup('db.qrxeudjdxnpyjwvygbrl.supabase.co');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, resolved: result }));
  } catch (error: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: error.message }));
  }
}
