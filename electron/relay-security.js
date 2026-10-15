const crypto = require('crypto');

function createRelayAccessToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isRelayRequestAuthorized(requestUrl, expectedToken) {
  if (typeof expectedToken !== 'string' || !expectedToken) return false;
  let suppliedToken = '';
  try {
    suppliedToken = new URL(String(requestUrl || ''), 'http://localhost').searchParams.get('token') || '';
  } catch (_) {
    return false;
  }
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

function verifyRelayUpgrade(info, callback, expectedToken) {
  if (isRelayRequestAuthorized(info && info.req && info.req.url, expectedToken)) {
    callback(true);
    return;
  }
  callback(false, 401, 'Unauthorized');
}

module.exports = { createRelayAccessToken, isRelayRequestAuthorized, verifyRelayUpgrade };