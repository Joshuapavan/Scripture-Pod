const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { WebSocket, WebSocketServer } = require('ws');
const { createRelayAccessToken, isRelayRequestAuthorized, verifyRelayUpgrade } = require('../electron/relay-security');

test('relay access tokens are random, URL-safe secrets', () => {
  const first = createRelayAccessToken();
  const second = createRelayAccessToken();

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
});

test('relay requests require the exact access token', () => {
  const token = 'trusted-relay-token';

  assert.equal(isRelayRequestAuthorized('/?token=trusted-relay-token', token), true);
  assert.equal(isRelayRequestAuthorized('/?token=wrong-token', token), false);
  assert.equal(isRelayRequestAuthorized('/', token), false);
  assert.equal(isRelayRequestAuthorized('/?token=trusted-relay-token', ''), false);
});

test('websocket relay rejects unauthenticated upgrades', async (t) => {
  const token = createRelayAccessToken();
  const server = new WebSocketServer({
    host: '127.0.0.1',
    port: 0,
    verifyClient: (info, callback) => verifyRelayUpgrade(info, callback, token)
  });
  server.on('connection', (socket) => socket.close());
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const port = server.address().port;
  const attempt = (query = '') => new Promise((resolve) => {
    const client = new WebSocket(`ws://127.0.0.1:${port}/${query}`);
    let settled = false;
    const finish = (status) => {
      if (settled) return;
      settled = true;
      resolve(status);
    };
    client.once('open', () => {
      finish(101);
      client.close();
    });
    client.once('unexpected-response', (_request, response) => {
      response.resume();
      finish(response.statusCode);
    });
    client.once('error', () => finish(0));
  });

  assert.equal(await attempt(), 401);
  assert.equal(await attempt(`?token=${encodeURIComponent(token)}`), 101);
});