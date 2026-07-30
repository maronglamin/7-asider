/**
 * Print a new INTERNAL_PARTNER_WEBHOOK_SECRET (64 hex chars).
 * Set the SAME value on directPay and 7-aside, then restart both apps.
 *
 *   npm run generate:webhook-secret
 */
import crypto from 'node:crypto';

const secret = crypto.randomBytes(32).toString('hex');
console.log('New INTERNAL_PARTNER_WEBHOOK_SECRET (copy to both servers):');
console.log(secret);
console.log('');
console.log('7-aside appBackend/.env:');
console.log(`INTERNAL_PARTNER_WEBHOOK_SECRET=${secret}`);
console.log('');
console.log('directPay .env:');
console.log(`INTERNAL_PARTNER_WEBHOOK_SECRET=${secret}`);
console.log('');
console.log('Then: pm2 restart all --update-env  (on each server)');
